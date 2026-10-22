"""
Implementación de referencia (en pandas) de las medidas DAX del proyecto.

Sirve para dos cosas:
  1. Generar los datos con los que se dibujan las vistas previas de docs/img/.
  2. Publicar valores esperados (docs/valores_esperados_ejemplo.csv) para que
     puedas comprobar que tu modelo en Power BI da los mismos números con los
     datos de ejemplo.

    python scripts/modelo_referencia.py

Escenario: ene–sep 2026 contra ene–sep 2025, todas las cadenas, todos los UPC.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / ".cache" / "vista_previa"
SALIDA.mkdir(parents=True, exist_ok=True)

ACTUAL = ("2026-01-01", "2026-09-30")
ANTERIOR = ("2025-01-01", "2025-09-30")

geo = pd.read_csv(RAIZ / "catalogos/dim_geo.csv", dtype={"CVE_ENT": str})
mun = pd.read_csv(RAIZ / "catalogos/dim_municipio.csv", dtype={"CVEGEO": str, "CVE_ENT": str})
alias = pd.read_csv(RAIZ / "config/alias_estados.csv", dtype=str)
mapeo = pd.read_csv(RAIZ / "config/mapeo_ubicaciones.csv", dtype=str)


def normalizar(t: str) -> str:
    """Igual que fnNormalizarTexto en Power Query."""
    t = unicodedata.normalize("NFKD", str(t).upper())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^A-Z0-9]+", " ", t)
    return " ".join(t.split())


# ------------------------------------------------- cadenas al formato estándar
a = pd.read_csv(RAIZ / "ejemplo/cadenas/cadena_a_tiendas.csv", dtype={"UPC": str, "ID_TIENDA": str})
a = a.assign(CADENA="Cadena A").rename(columns={"ID_TIENDA": "UBICACION"})
b = pd.read_csv(RAIZ / "ejemplo/cadenas/cadena_b_estados.csv", dtype={"CODIGO_BARRAS": str})
b = b.rename(columns={"SEMANA": "FECHA", "ESTADO": "UBICACION", "CODIGO_BARRAS": "UPC", "PIEZAS": "UNIDADES", "VENTA_NETA": "VENTAS"}).assign(CADENA="Cadena B")
c = pd.read_csv(RAIZ / "ejemplo/cadenas/cadena_c_municipios.csv", dtype={"UPC": str, "CLAVE_MUN": str})
c = c.rename(columns={"CLAVE_MUN": "UBICACION", "IMPORTE": "VENTAS"}).assign(CADENA="Cadena C")
cad = pd.concat([a, b, c], ignore_index=True)

# Resolución de ubicaciones sobre valores únicos (igual que en Power Query)
u = cad[["CADENA", "UBICACION"]].drop_duplicates()
u["NORM"] = u["UBICACION"].map(normalizar)
mapeo["NORM"] = mapeo["UBICACION"].map(normalizar)
u = u.merge(mapeo[["CADENA", "NORM", "CVE_ENT", "CVEGEO"]], on=["CADENA", "NORM"], how="left")
u = u.merge(alias.rename(columns={"ALIAS": "NORM", "CVE_ENT": "CVE_ALIAS"}), on="NORM", how="left")
digitos = u["NORM"].str.fullmatch(r"\d+")
u["CVEGEO"] = u["CVEGEO"].fillna(u["NORM"].where(digitos & (u["NORM"].str.len() >= 4)).str.zfill(5))
u["CVE_ENT"] = u["CVE_ENT"].fillna(u["CVE_ALIAS"]).fillna(u["CVEGEO"].str[:2])
u["CVE_ENT"] = u["CVE_ENT"].fillna(u["NORM"].where(digitos & (u["NORM"].str.len() <= 2)).str.zfill(2))
u["CVEGEO"] = u["CVEGEO"].fillna(u["CVE_ENT"] + "000")
sin = u[u["CVE_ENT"].isna()]
assert sin.empty, f"Ubicaciones sin resolver: {sin.head()}"
cad = cad.merge(u[["CADENA", "UBICACION", "CVE_ENT", "CVEGEO"]], on=["CADENA", "UBICACION"])
cad["FECHA"] = pd.to_datetime(cad["FECHA"])

nie = pd.read_csv(RAIZ / "ejemplo/nielsen/nielsen_regiones.csv", dtype={"UPC": str})
nie["FECHA"] = pd.to_datetime(nie["PERIODO"])

en = lambda df, p: df[(df["FECHA"] >= p[0]) & (df["FECHA"] <= p[1])]

# --------------------------------------------------------------- medidas
pob = geo.set_index("CVE_ENT")["POBLACION_2020"]
reg = geo.set_index("CVE_ENT")["REGION_NIELSEN"]
pob_reg = geo.groupby("REGION_NIELSEN")["POBLACION_2020"].sum()


def por_estado(periodo):
    v = en(cad, periodo).groupby("CVE_ENT")[["VENTAS", "UNIDADES"]].sum().reindex(geo["CVE_ENT"])
    n_reg = en(nie, periodo).groupby("REGION_NIELSEN")[["VENTAS", "UNIDADES"]].sum()
    n_est = pd.DataFrame(
        {k: n_reg.loc[reg, k].to_numpy() * (pob / pob_reg.loc[reg].to_numpy()).to_numpy() for k in ["VENTAS", "UNIDADES"]},
        index=geo["CVE_ENT"],
    )
    return v, n_reg, n_est


v, n_reg, n_est = por_estado(ACTUAL)
v0, n_reg0, n_est0 = por_estado(ANTERIOR)

df = geo[["CVE_ENT", "NOMBRE_CORTO", "REGION_NIELSEN"]].rename(columns={"NOMBRE_CORTO": "ESTADO"}).set_index("CVE_ENT")
df["Ventas Cadenas"] = v["VENTAS"]
df["Unidades Cadenas"] = v["UNIDADES"]
df["Ventas Nielsen Estimada"] = n_est["VENTAS"]
df["% Mix Cadenas"] = v["VENTAS"] / v["VENTAS"].sum()
df["% Mix Nielsen"] = n_est["VENTAS"] / n_est["VENTAS"].sum()
df["Brecha Mix (pp)"] = (df["% Mix Cadenas"] - df["% Mix Nielsen"]) * 100
df["Índice Cadenas vs Nielsen"] = df["% Mix Cadenas"] / df["% Mix Nielsen"] * 100
df["Ventas Cadenas por 1,000 hab"] = v["VENTAS"] / pob * 1000
df["Índice per cápita Cadenas"] = df["Ventas Cadenas por 1,000 hab"] / (v["VENTAS"].sum() / pob.sum() * 1000) * 100
df["Crec % Cadenas"] = v["VENTAS"] / v0["VENTAS"] - 1
df["Crec % Nielsen"] = n_est["VENTAS"] / n_est0["VENTAS"] - 1
df["Brecha Crec (pp)"] = (df["Crec % Cadenas"] - df["Crec % Nielsen"]) * 100
df["Precio Promedio Cadenas"] = v["VENTAS"] / v["UNIDADES"]
df["Precio Promedio Nielsen"] = n_est["VENTAS"] / n_est["UNIDADES"]
df["Índice Precio vs Nielsen"] = df["Precio Promedio Cadenas"] / df["Precio Promedio Nielsen"] * 100
df = df.reset_index()

r = n_reg[["VENTAS"]].rename(columns={"VENTAS": "Ventas Nielsen"})
r["Ventas Cadenas"] = df.groupby("REGION_NIELSEN")["Ventas Cadenas"].sum()
r["% Mix Cadenas"] = r["Ventas Cadenas"] / r["Ventas Cadenas"].sum()
r["% Mix Nielsen"] = r["Ventas Nielsen"] / r["Ventas Nielsen"].sum()
r["Crec % Cadenas"] = r["Ventas Cadenas"] / df.assign(v0=v0["VENTAS"].to_numpy()).groupby("REGION_NIELSEN")["v0"].sum() - 1
r["Crec % Nielsen"] = n_reg["VENTAS"] / n_reg0["VENTAS"] - 1
r = r.reset_index()

# ------------------------------------------------- textos y configuración
def dinero(x: float) -> str:
    if pd.isna(x):
        return ""
    if abs(x) >= 1e9:
        return f"${x / 1e9:,.1f} mil M"
    if abs(x) >= 1e6:
        return f"${x / 1e6:,.1f} M"
    return f"${x:,.0f}"


def pct(x, signo=False):
    return "" if pd.isna(x) else (f"{x:+.1%}" if signo else f"{x:.1%}")


def config(escala, centro, u1, u2, fmt, titulo):
    if escala == "divergente":
        f = fmt
        etq = [f"< {f(centro - u2)}", f"{f(centro - u2)} a {f(centro - u1)}", f"{f(centro - u1)} a {f(centro + u1)}",
               f"{f(centro + u1)} a {f(centro + u2)}", f"> {f(centro + u2)}"]
    else:
        etq = [""] * 5
    return "|".join([escala, str(centro), str(u1), str(u2), *etq, titulo])


def dataset(df, campos):
    return json.loads(df[campos].to_json(orient="records", force_ascii=False))


def guardar(nombre, filas):
    (SALIDA / f"{nombre}.json").write_text(json.dumps(filas, ensure_ascii=False), encoding="utf-8")


base = df[["CVE_ENT", "ESTADO", "REGION_NIELSEN"]].copy()
indice = base.assign(**{
    "Valor Mapa": df["Índice Cadenas vs Nielsen"],
    "Valor Mapa Texto": df["Índice Cadenas vs Nielsen"].map(lambda x: f"{x:,.0f}"),
    "Config Mapa": config("divergente", 100, 10, 30, lambda x: f"{x:,.0f}", "Índice Cadenas vs Nielsen (100 = misma distribución)"),
})
guardar("mapa_indice", dataset(indice, list(indice.columns)))

ventas = base.assign(**{
    "Valor Mapa": df["Ventas Cadenas"],
    "Valor Mapa Texto": df["Ventas Cadenas"].map(dinero),
    "Config Mapa": config("secuencial", 0, 0, 0, None, "Ventas Cadenas"),
}).dropna(subset=["Valor Mapa"])
guardar("mapa_ventas", dataset(ventas, list(ventas.columns)))

biv = base.assign(**{
    "Valor Mapa": df["Índice per cápita Cadenas"],
    "Valor Mapa Texto": df["Índice per cápita Cadenas"].map(lambda x: "" if pd.isna(x) else f"{x:,.0f}"),
    "Config Mapa": config("secuencial", 0, 0, 0, None, "Índice per cápita"),
    "Valor Mapa 2": df["Crec % Cadenas"],
    "Valor Mapa 2 Texto": df["Crec % Cadenas"].map(lambda x: pct(x, True)),
    "Config Mapa 2": config("secuencial", 0, 0, 0, None, "Crecimiento"),
}).dropna(subset=["Valor Mapa", "Valor Mapa 2"])
guardar("mapa_bivariado", dataset(biv, list(biv.columns)))

comp = pd.DataFrame({
    "REGION_NIELSEN": r["REGION_NIELSEN"],
    "Comparar Cadenas": r["% Mix Cadenas"],
    "Comparar Cadenas Texto": r["% Mix Cadenas"].map(pct),
    "Comparar Nielsen": r["% Mix Nielsen"],
    "Comparar Nielsen Texto": r["% Mix Nielsen"].map(pct),
    "Config Comparación": config("secuencial", 0, 0, 0, None, "Distribución de la venta por región (% del total)"),
})
guardar("comparativo_regiones", dataset(comp, list(comp.columns)))

# Municipios de Jalisco (Cadena A por tienda + Cadena C por municipio)
m = en(cad, ACTUAL)
m = m[(m["CVE_ENT"] == "14") & (~m["CVEGEO"].str.endswith("000"))].groupby("CVEGEO", as_index=False)["VENTAS"].sum()
m = m.merge(mun[["CVEGEO", "MUNICIPIO"]], on="CVEGEO")
m = m.assign(**{
    "Valor Mapa": m["VENTAS"],
    "Valor Mapa Texto": m["VENTAS"].map(dinero),
    "Config Mapa": config("secuencial", 0, 0, 0, None, "Ventas Cadenas"),
})
guardar("municipios_14", dataset(m, ["CVEGEO", "MUNICIPIO", "Valor Mapa", "Valor Mapa Texto", "Config Mapa"]))

# ------------------------------------------------------ valores esperados
esperado = df[[
    "CVE_ENT", "ESTADO", "REGION_NIELSEN", "Ventas Cadenas", "Ventas Nielsen Estimada", "% Mix Cadenas",
    "% Mix Nielsen", "Índice Cadenas vs Nielsen", "Índice per cápita Cadenas", "Crec % Cadenas", "Crec % Nielsen",
]].round(6)
esperado.to_csv(RAIZ / "docs" / "valores_esperados_ejemplo.csv", index=False, encoding="utf-8", lineterminator="\n")
print("Vista previa:", ", ".join(p.stem for p in sorted(SALIDA.glob("*.json"))))
print("Valores esperados: docs/valores_esperados_ejemplo.csv")
print(df[["ESTADO", "Ventas Cadenas", "Índice Cadenas vs Nielsen", "Crec % Cadenas"]].head(8).to_string(index=False))
