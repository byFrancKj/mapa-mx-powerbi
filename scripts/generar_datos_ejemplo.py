"""
Genera los datos de ejemplo (100 % ficticios) de la carpeta ejemplo/.

    python scripts/generar_datos_ejemplo.py

Simula:
  * Tres cadenas con formatos de origen distintos, para mostrar cómo se adaptan
    al modelo estándar:
      - Cadena A: venta por tienda (ID de tienda -> se mapea en ejemplo/config/mapeo_ubicaciones.csv)
      - Cadena B: venta por nombre de estado escrito "como venga" (se resuelve con alias)
      - Cadena C: venta por clave municipal INEGI
  * Nielsen: venta mensual por región Nielsen (fuente independiente de las cadenas).

Los UPC usan el prefijo 200 (rango de circulación restringida de GS1) para no
coincidir con productos reales. Semilla fija: el resultado es reproducible.
"""
from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "ejemplo"
rng = np.random.default_rng(20261022)

CATALOGOS = RAIZ / "puente-inegi" / "catalogos"
geo = pd.read_csv(CATALOGOS / "dim_geo.csv", dtype={"CVE_ENT": str})
# Las regiones son parte del ejemplo, no del catálogo INEGI.
geo = geo.merge(pd.read_csv(SALIDA / "config" / "regiones_estado.csv", dtype=str), on="CVE_ENT", how="left")
mun = pd.read_csv(CATALOGOS / "dim_municipio.csv", dtype={"CVEGEO": str, "CVE_ENT": str, "CVE_MUN": str})
mun = mun[mun["CVE_MUN"] != "000"]

# ----------------------------------------------------------------- productos
def ean13(base12: str) -> str:
    s = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(base12))
    return base12 + str((10 - s % 10) % 10)

productos = [
    # descripcion, marca, categoria, fabricante, precio
    ("Agua mineral 600 ml", "Aurora", "Bebidas", "Fabricante Norte", 14.5),
    ("Refresco cola 2 L", "Brisa", "Bebidas", "Fabricante Sur", 38.0),
    ("Jugo de naranja 1 L", "Aurora", "Bebidas", "Fabricante Norte", 32.0),
    ("Bebida isotónica 1 L", "Cumbre", "Bebidas", "Fabricante Sur", 27.5),
    ("Papas sal 170 g", "Delta", "Botanas", "Fabricante Norte", 45.0),
    ("Cacahuate japonés 200 g", "Delta", "Botanas", "Fabricante Norte", 29.0),
    ("Tostadas horneadas 300 g", "Cumbre", "Botanas", "Fabricante Sur", 36.0),
    ("Palomitas microondas 3 pzas", "Brisa", "Botanas", "Fabricante Sur", 33.5),
    ("Shampoo 750 ml", "Lumen", "Cuidado personal", "Fabricante Centro", 89.0),
    ("Jabón de tocador 3 pzas", "Lumen", "Cuidado personal", "Fabricante Centro", 52.0),
    ("Desodorante aerosol 150 ml", "Vértice", "Cuidado personal", "Fabricante Centro", 64.0),
    ("Crema corporal 400 ml", "Vértice", "Cuidado personal", "Fabricante Centro", 78.0),
]
dim_producto = pd.DataFrame(
    [
        {
            "UPC": ean13(f"200{(i + 1) * 7919:09d}"),
            "DESCRIPCION": d,
            "MARCA": m,
            "CATEGORIA": c,
            "FABRICANTE": f,
            "PRECIO_REF": p,
        }
        for i, (d, m, c, f, p) in enumerate(productos)
    ]
)

# ---------------------------------------------------------------- calendario
semanas = pd.date_range("2024-10-07", "2026-09-28", freq="W-MON")
meses = pd.date_range("2024-10-01", "2026-09-01", freq="MS")

# --------------------------------------------- demanda de mercado (estado x mes x upc)
regiones = sorted(geo["REGION_NIELSEN"].unique())
categorias = sorted(dim_producto["CATEGORIA"].unique())
afinidad = {(r, c): rng.lognormal(0, 0.18) for r in regiones for c in categorias}
crec_region = {r: rng.uniform(0.01, 0.10) for r in regiones}  # crecimiento anual del mercado
estacionalidad = {
    "Bebidas": lambda m: 1 + 0.22 * np.sin((m - 2) / 12 * 2 * np.pi),  # pico en primavera-verano
    "Botanas": lambda m: 1 + 0.12 * (m == 12) + 0.06 * np.sin(m / 12 * 2 * np.pi),
    "Cuidado personal": lambda m: 1 + 0.15 * (m == 12) + 0.08 * (m == 5),
}
pc_base = dict(zip(dim_producto["UPC"], rng.uniform(0.6, 2.4, len(dim_producto))))  # pesos/hab/mes

filas = []
for _, e in geo.iterrows():
    ruido_estado = rng.lognormal(0, 0.12)
    for _, p in dim_producto.iterrows():
        base = e["POBLACION_2020"] * pc_base[p["UPC"]] * afinidad[(e["REGION_NIELSEN"], p["CATEGORIA"])] * ruido_estado
        for k, mes in enumerate(meses):
            t = k / 12
            valor = base * estacionalidad[p["CATEGORIA"]](mes.month) * (1 + crec_region[e["REGION_NIELSEN"]]) ** t
            filas.append((e["CVE_ENT"], e["REGION_NIELSEN"], p["UPC"], mes, valor * rng.lognormal(0, 0.04)))
mercado = pd.DataFrame(filas, columns=["CVE_ENT", "REGION_NIELSEN", "UPC", "MES", "VENTAS"])

precio = dict(zip(dim_producto["UPC"], dim_producto["PRECIO_REF"]))


def con_unidades(df: pd.DataFrame, col_ventas: str, col_upc: str, factor_precio: np.ndarray) -> pd.DataFrame:
    p = df[col_upc].map(precio).to_numpy() * factor_precio
    unidades = np.maximum(np.round(df[col_ventas].to_numpy() / p), 0).astype(int)
    df = df.assign(UNIDADES=unidades, VENTAS=np.round(unidades * p, 2))
    return df[df["UNIDADES"] > 0]


# ------------------------------------------------------------------- Nielsen
# Nielsen mide su propio universo (aquí ~55 % del mercado), agregado por región y mes.
nielsen = mercado.groupby(["MES", "REGION_NIELSEN", "UPC"], as_index=False)["VENTAS"].sum()
nielsen["VENTAS"] = nielsen["VENTAS"] * 0.55 * rng.lognormal(0, 0.03, len(nielsen))
nielsen = con_unidades(nielsen, "VENTAS", "UPC", rng.normal(1.0, 0.015, len(nielsen)))
nielsen = nielsen.rename(columns={"MES": "PERIODO"})[["PERIODO", "REGION_NIELSEN", "UPC", "UNIDADES", "VENTAS"]]


# -------------------------------------------------------------- cadenas
def venta_cadena(estados: list[str], fuerza_region: dict[str, float], crec_extra: dict[str, float], escala: float) -> pd.DataFrame:
    """Venta mensual de una cadena por estado: % del mercado que varía por estado y región."""
    m = mercado[mercado["CVE_ENT"].isin(estados)].copy()
    cuota_estado = {e: rng.lognormal(0, 0.30) for e in estados}
    t = (m["MES"].dt.year - 2024) * 12 + m["MES"].dt.month - 10
    m["VENTAS"] = (
        m["VENTAS"]
        * escala
        * m["CVE_ENT"].map(cuota_estado)
        * m["REGION_NIELSEN"].map(fuerza_region).fillna(1.0)
        * (1 + m["REGION_NIELSEN"].map(crec_extra).fillna(0.0)) ** (t / 12)
    )
    return m


def a_semanas(mensual: pd.DataFrame, llaves: list[str]) -> pd.DataFrame:
    """Reparte la venta mensual entre las semanas cuyo lunes cae en ese mes."""
    sem = pd.DataFrame({"FECHA": semanas})
    sem["MES"] = sem["FECHA"].dt.to_period("M").dt.to_timestamp()
    sem["N"] = sem.groupby("MES")["FECHA"].transform("count")
    df = mensual.merge(sem, on="MES")
    df["VENTAS"] = df["VENTAS"] / df["N"] * rng.lognormal(0, 0.08, len(df))
    return df[llaves + ["FECHA", "UPC", "VENTAS"]]


todos = geo["CVE_ENT"].tolist()

# Cadena A: nacional, por tienda.
a_mensual = venta_cadena(
    todos,
    {"Valle de México": 1.35, "Norte": 1.20, "Bajío": 1.05, "Sureste": 0.70, "Centro-Sur": 0.85},
    {"Bajío": 0.06, "Sureste": 0.08, "Valle de México": -0.02},
    escala=0.18,
)
tiendas = []
n_tiendas = np.maximum(1, np.round(geo.set_index("CVE_ENT")["POBLACION_2020"] ** 0.8 / 75000)).astype(int)
for cve, n in n_tiendas.items():
    candidatos = mun[mun["CVE_ENT"] == cve]
    elegidos = candidatos.sample(n=min(n, len(candidatos)), replace=n > len(candidatos), random_state=int(rng.integers(1e9)))
    for _, mrow in elegidos.iterrows():
        tiendas.append({"ID_TIENDA": f"A-{len(tiendas) + 1:04d}", "CVE_ENT": cve, "CVEGEO": mrow["CVEGEO"], "PESO": rng.lognormal(0, 0.35)})
tiendas = pd.DataFrame(tiendas)
tiendas["PESO"] = tiendas["PESO"] / tiendas.groupby("CVE_ENT")["PESO"].transform("sum")
a = a_mensual.merge(tiendas, on="CVE_ENT")
a["VENTAS"] = a["VENTAS"] * a["PESO"]
a = a[rng.random(len(a)) < 0.88]  # surtido: no todas las tiendas manejan todo
a = a_semanas(a, ["ID_TIENDA"])
a = con_unidades(a, "VENTAS", "UPC", rng.normal(1.0, 0.02, len(a)))
cadena_a = a[["FECHA", "ID_TIENDA", "UPC", "UNIDADES", "VENTAS"]].sort_values(["FECHA", "ID_TIENDA", "UPC"])

# Cadena B: 20 estados, reporta el nombre del estado tal como lo captura su sistema.
estados_b = sorted(rng.choice(todos, 20, replace=False).tolist())
b = venta_cadena(estados_b, {"Occidente": 1.3, "Sureste": 1.15, "Norte": 0.8}, {"Sureste": 0.05, "Occidente": 0.03}, escala=0.12)
b = a_semanas(b, ["CVE_ENT"])
b = con_unidades(b, "VENTAS", "UPC", rng.normal(1.03, 0.02, len(b)))
nombre_como_viene = {
    "09": "CDMX", "15": "Edo. de México", "19": "Nuevo Leon", "30": "Veracruz de Ignacio de la Llave",
    "23": "QROO", "05": "COAHUILA DE ZARAGOZA", "16": "Michoacán", "22": "Querétaro Arteaga",
}
nombre_corto = geo.set_index("CVE_ENT")["NOMBRE_CORTO"].to_dict()
b["ESTADO"] = b["CVE_ENT"].map(lambda c: nombre_como_viene.get(c, nombre_corto[c].upper()))
cadena_b = (
    b.rename(columns={"FECHA": "SEMANA", "UPC": "CODIGO_BARRAS", "UNIDADES": "PIEZAS", "VENTAS": "VENTA_NETA"})
    [["SEMANA", "ESTADO", "CODIGO_BARRAS", "PIEZAS", "VENTA_NETA"]]
    .sort_values(["SEMANA", "ESTADO", "CODIGO_BARRAS"])
)

# Cadena C: regional (Bajío, Occidente y parte del Norte), por municipio INEGI.
estados_c = geo.loc[geo["REGION_NIELSEN"].isin(["Bajío", "Occidente"]), "CVE_ENT"].tolist() + ["10", "28"]
c_mensual = venta_cadena(estados_c, {"Bajío": 1.4, "Occidente": 1.1}, {"Bajío": 0.09}, escala=0.10)
mun_c = pd.concat(
    [
        g.sample(n=min(5, len(g)), random_state=int(rng.integers(1e9)))
        for _, g in mun[mun["CVE_ENT"].isin(estados_c)].groupby("CVE_ENT")
    ]
)
mun_c = mun_c.assign(PESO=rng.lognormal(0, 0.5, len(mun_c)))
mun_c["PESO"] = mun_c["PESO"] / mun_c.groupby("CVE_ENT")["PESO"].transform("sum")
c = c_mensual.merge(mun_c[["CVE_ENT", "CVEGEO", "PESO"]], on="CVE_ENT")
c["VENTAS"] = c["VENTAS"] * c["PESO"]
c = a_semanas(c, ["CVEGEO"])
c = con_unidades(c, "VENTAS", "UPC", rng.normal(0.98, 0.02, len(c)))
c["CLAVE_MUN"] = c["CVEGEO"].astype(int)  # llega como número: se pierde el cero inicial
cadena_c = (
    c.rename(columns={"VENTAS": "IMPORTE"})[["FECHA", "CLAVE_MUN", "UPC", "UNIDADES", "IMPORTE"]]
    .sort_values(["FECHA", "CLAVE_MUN", "UPC"])
)

# ---------------------------------------------------------------- escritura
def guardar(df: pd.DataFrame, ruta: Path) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    df = df.copy()
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            df[col] = df[col].dt.strftime("%Y-%m-%d")
    df.to_csv(ruta, index=False, encoding="utf-8", lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    print(f"  {ruta.relative_to(RAIZ)}  ({len(df):,} filas)")


print("Datos de ejemplo:")
guardar(dim_producto, SALIDA / "dim_producto.csv")
guardar(cadena_a, SALIDA / "cadenas" / "cadena_a_tiendas.csv")
guardar(cadena_b, SALIDA / "cadenas" / "cadena_b_estados.csv")
guardar(cadena_c, SALIDA / "cadenas" / "cadena_c_municipios.csv")
guardar(nielsen, SALIDA / "nielsen" / "nielsen_regiones.csv")

# Mapeo de ubicaciones de ejemplo: tiendas de la Cadena A -> claves INEGI.
mapeo = tiendas.assign(CADENA="Cadena A", UBICACION=tiendas["ID_TIENDA"])[["CADENA", "UBICACION", "CVE_ENT", "CVEGEO"]]
guardar(mapeo, SALIDA / "config" / "mapeo_ubicaciones.csv")
