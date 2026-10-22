"""
Implementación de referencia (en pandas) de las medidas DAX del ejemplo.

Sirve para dos cosas:
  1. Publicar valores esperados (ejemplo/valores_esperados.csv) para que puedas
     comprobar que tu modelo en Power BI da los mismos números con los datos de
     ejemplo.
  2. Dejar en .cache/vista_previa/ los valores por estado y por municipio con los
     que se dibujan las vistas previas del visual (visual/scripts/vista_previa.ts).

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
EJEMPLO = RAIZ / "ejemplo"
SALIDA = RAIZ / ".cache" / "vista_previa"
SALIDA.mkdir(parents=True, exist_ok=True)

ACTUAL = ("2026-01-01", "2026-09-30")
ANTERIOR = ("2025-01-01", "2025-09-30")

geo = pd.read_csv(RAIZ / "puente-inegi/catalogos/dim_geo.csv", dtype={"CVE_ENT": str})
geo = geo.merge(pd.read_csv(EJEMPLO / "config/regiones_estado.csv", dtype=str), on="CVE_ENT", how="left")
alias = pd.read_csv(RAIZ / "puente-inegi/alias_estados.csv", dtype=str).drop_duplicates("ALIAS")
mapeo = pd.read_csv(EJEMPLO / "config/mapeo_ubicaciones.csv", dtype=str, keep_default_na=False)


def normalizar(t: str) -> str:
    """Equivale a Funciones[Normalizar] de Power Query."""
    t = unicodedata.normalize("NFKD", str(t).upper())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^A-Z0-9]+", " ", t)
    return " ".join(t.split())


def resolver(tipo: str, norm: str, m_ent: str, m_geo: str, a_ent: str) -> tuple[str | None, str | None]:
    """Equivale a Funciones[ResolverUbicaciones]: el mapeo manda; si no, según el tipo de ubicación."""
    en_mapeo = bool(m_ent or m_geo)
    dig = norm if norm.isdigit() else None
    if en_mapeo:
        geo_ = m_geo.zfill(5) if m_geo else None
        ent = m_ent.zfill(2) if m_ent else (geo_[:2] if geo_ else None)
    else:
        geo_ = dig.zfill(5) if tipo in ("auto", "municipio") and dig and 4 <= len(dig) <= 5 else None
        if geo_:
            ent = geo_[:2]
        elif tipo in ("auto", "estado") and a_ent:
            ent = a_ent.zfill(2)
        elif tipo in ("auto", "estado", "municipio") and dig and len(dig) <= 2:
            ent = dig.zfill(2)
        else:
            ent = None
    return ent, (geo_ or (ent + "000" if ent else None))


# ------------------------------------------------- cadenas al formato estándar
a = pd.read_csv(EJEMPLO / "cadenas/cadena_a_tiendas.csv", dtype={"UPC": str, "ID_TIENDA": str})
a = a.assign(CADENA="Cadena A", TIPO="tienda").rename(columns={"ID_TIENDA": "UBICACION"})
b = pd.read_csv(EJEMPLO / "cadenas/cadena_b_estados.csv", dtype={"CODIGO_BARRAS": str})
b = b.rename(columns={"SEMANA": "FECHA", "ESTADO": "UBICACION", "CODIGO_BARRAS": "UPC", "PIEZAS": "UNIDADES", "VENTA_NETA": "VENTAS"})
b = b.assign(CADENA="Cadena B", TIPO="estado")
c = pd.read_csv(EJEMPLO / "cadenas/cadena_c_municipios.csv", dtype={"UPC": str, "CLAVE_MUN": str})
c = c.rename(columns={"CLAVE_MUN": "UBICACION", "IMPORTE": "VENTAS"}).assign(CADENA="Cadena C", TIPO="municipio")
cad = pd.concat([a, b, c], ignore_index=True)

# Resolución de ubicaciones sobre valores únicos (igual que en Power Query)
u = cad[["CADENA", "UBICACION", "TIPO"]].drop_duplicates()
u["NORM"] = u["UBICACION"].map(normalizar)
mapeo["NORM"] = mapeo["UBICACION"].map(normalizar)
m = mapeo.drop_duplicates(["CADENA", "NORM"]).set_index(["CADENA", "NORM"])[["CVE_ENT", "CVEGEO"]]
al = alias.set_index("ALIAS")["CVE_ENT"]
claves = [
    resolver(
        r.TIPO, r.NORM,
        m["CVE_ENT"].get((r.CADENA, r.NORM), ""), m["CVEGEO"].get((r.CADENA, r.NORM), ""),
        al.get(r.NORM, ""),
    )
    for r in u.itertuples()
]
u["CVE_ENT"] = [k[0] for k in claves]
u["CVEGEO"] = [k[1] for k in claves]
sin = u[u["CVE_ENT"].isna()]
assert sin.empty, f"Ubicaciones sin resolver: {sin.head()}"
cad = cad.merge(u[["CADENA", "UBICACION", "CVE_ENT", "CVEGEO"]], on=["CADENA", "UBICACION"])
cad["FECHA"] = pd.to_datetime(cad["FECHA"])

nie = pd.read_csv(EJEMPLO / "nielsen/nielsen_regiones.csv", dtype={"UPC": str})
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
    return v, n_est


v, n_est = por_estado(ACTUAL)
v0, n_est0 = por_estado(ANTERIOR)

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

# ---------------------------------------------- datos para las vistas previas
filas = json.loads(df.to_json(orient="records", force_ascii=False))
(SALIDA / "estados.json").write_text(json.dumps(filas, ensure_ascii=False), encoding="utf-8")
# Venta por municipio (solo las cadenas con detalle municipal; XX000 = sin municipio)
mun = en(cad, ACTUAL)
mun = mun[~mun["CVEGEO"].str.endswith("000")].groupby("CVEGEO", as_index=False)["VENTAS"].sum()
(SALIDA / "municipios.json").write_text(mun.to_json(orient="records", force_ascii=False), encoding="utf-8")

# ------------------------------------------------------ valores esperados
esperado = df[[
    "CVE_ENT", "ESTADO", "REGION_NIELSEN", "Ventas Cadenas", "Ventas Nielsen Estimada", "% Mix Cadenas",
    "% Mix Nielsen", "Índice Cadenas vs Nielsen", "Índice per cápita Cadenas", "Crec % Cadenas", "Crec % Nielsen",
]].round(6)
esperado.to_csv(EJEMPLO / "valores_esperados.csv", index=False, encoding="utf-8", lineterminator="\n")
print("Vista previa: .cache/vista_previa/estados.json y municipios.json")
print("Valores esperados: ejemplo/valores_esperados.csv")
print(df[["ESTADO", "Ventas Cadenas", "Índice Cadenas vs Nielsen", "Crec % Cadenas"]].head(5).to_string(index=False))
