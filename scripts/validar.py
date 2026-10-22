"""
Revisa que catálogos, geometrías, la geometría del visual y la configuración del
ejemplo sean coherentes entre sí. Solo usa la biblioteca estándar de Python.

    python scripts/validar.py
    python scripts/validar.py --mapeo privado/mapeo_ubicaciones.csv   # también tu mapeo real

Úsalo después de editar el puente INEGI o el ejemplo, o de regenerar la
geometría. Con --mapeo revisa tu archivo real sin que tenga que estar en el
repositorio. Sale con código 1 si encuentra errores.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
errores: list[str] = []
avisos: list[str] = []


def leer(ruta: str | Path) -> list[dict]:
    ruta = Path(ruta)
    with open(ruta if ruta.is_absolute() else RAIZ / ruta, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def error(msg: str) -> None:
    errores.append(msg)


def topo(ruta: str) -> dict:
    with open(RAIZ / ruta, encoding="utf-8") as f:
        return json.load(f)


def normalizar(t: str) -> str:
    """Igual que Funciones[Normalizar] en Power Query."""
    t = unicodedata.normalize("NFKD", t.upper())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^A-Z0-9]+", " ", t).split())


def numero(s: str) -> float | None:
    try:
        return float(s)
    except ValueError:
        return None


args = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
args.add_argument("--mapeo", action="append", default=[], help="CSV de mapeo adicional a revisar (puede repetirse)")
args = args.parse_args()

# ------------------------------------------------------------ puente INEGI
estados = leer("puente-inegi/estados.csv")
claves = [e["CVE_ENT"] for e in estados]
if claves != [f"{i:02d}" for i in range(1, 33)]:
    error("puente-inegi/estados.csv debe tener las claves 01 a 32 en orden.")
for e in estados:
    if not e["POBLACION_2020"].isdigit():
        error(f"Población no numérica para {e['CVE_ENT']}.")

vistos: dict[str, str] = {}
for a in leer("puente-inegi/alias_estados.csv"):
    if a["CVE_ENT"] not in claves:
        error(f"Alias '{a['ALIAS']}' apunta a una clave inexistente: {a['CVE_ENT']} (usa dos dígitos: 01-32).")
    if a["ALIAS"] != normalizar(a["ALIAS"]):
        error(f"Alias '{a['ALIAS']}' no está normalizado (mayúsculas, sin acentos ni puntuación).")
    if a["ALIAS"] in vistos:
        error(f"Alias repetido: '{a['ALIAS']}'.")
    vistos[a["ALIAS"]] = a["CVE_ENT"]

dim_geo = leer("puente-inegi/catalogos/dim_geo.csv")
if [g["CVE_ENT"] for g in dim_geo] != claves:
    error("puente-inegi/catalogos/dim_geo.csv no coincide con puente-inegi/estados.csv: ejecuta npm run geo.")

dim_mun = leer("puente-inegi/catalogos/dim_municipio.csv")
columnas_mun = ["CVEGEO", "CVE_ENT", "CVE_MUN", "MUNICIPIO", "LON", "LAT"]
if dim_mun and list(dim_mun[0].keys()) != columnas_mun:
    error(f"dim_municipio.csv debe tener las columnas {columnas_mun}.")
cvegeo = [m["CVEGEO"] for m in dim_mun]
if len(cvegeo) != len(set(cvegeo)):
    error("dim_municipio.csv tiene CVEGEO repetidos.")
cvegeo_set = set(cvegeo)
for m in dim_mun:
    if not re.fullmatch(r"\d{5}", m["CVEGEO"]) or m["CVEGEO"][:2] != m["CVE_ENT"] or m["CVEGEO"][2:] != m["CVE_MUN"]:
        error(f"dim_municipio.csv: claves inconsistentes en {m['CVEGEO']}.")
    lon, lat = numero(m["LON"]), numero(m["LAT"])
    if lon is None or lat is None or not (-119 < lon < -86 and 14 < lat < 33):
        error(f"dim_municipio.csv: coordenadas inválidas en {m['CVEGEO']} ({m['LON']}, {m['LAT']}).")
for c in claves:
    if f"{c}000" not in cvegeo_set:
        error(f"Falta el municipio comodín {c}000 en dim_municipio.csv.")

# -------------------------------------------------------- geometrías
est_topo = topo("geo/estados/mx_estados.topojson")
est_geoms = est_topo["objects"]["estados"]["geometries"]
if sorted(g["properties"]["CVE_ENT"] for g in est_geoms) != claves:
    error("geo/estados/mx_estados.topojson no tiene exactamente las 32 entidades.")
if any(not g["properties"].get("NOMBRE_CORTO") for g in est_geoms):
    error("geo/estados/mx_estados.topojson: hay estados sin NOMBRE_CORTO.")

mun_geo = {g["properties"]["CVEGEO"] for g in topo("geo/municipios/mx_municipios.topojson")["objects"]["municipios"]["geometries"]}
if mun_geo != {c for c in cvegeo if not c.endswith("000")}:
    error("Los municipios de geo/ no coinciden con dim_municipio.csv: ejecuta npm run geo.")

# ------------------------------------------- geometría empaquetada en el visual
if topo("visual/src/geo/estados.json") != est_topo:
    error("visual/src/geo/estados.json no es igual a geo/estados/mx_estados.topojson: ejecuta npm run geo.")


# ------------------------------------------------------------- mapeos
def validar_mapeo(ruta: str | Path) -> None:
    filas = leer(ruta)
    faltan = {"CADENA", "UBICACION", "CVE_ENT", "CVEGEO"} - set(filas[0].keys() if filas else [])
    if faltan:
        error(f"{ruta}: faltan columnas {sorted(faltan)}.")
        return
    grupos: dict[tuple[str, str], list[str]] = defaultdict(list)
    for m in filas:
        grupos[(m["CADENA"], normalizar(m["UBICACION"]))].append(m["UBICACION"])
        ent, geo = m["CVE_ENT"].strip(), m["CVEGEO"].strip()
        if not ent and not geo:
            error(f"{ruta}: {m['CADENA']} / {m['UBICACION']} no tiene CVE_ENT ni CVEGEO.")
        if ent and ent.zfill(2) not in claves:
            error(f"{ruta}: {m['CADENA']} / {m['UBICACION']} tiene CVE_ENT inválida ({ent}).")
        if geo:
            g = geo.zfill(5)
            if g not in cvegeo_set:
                error(f"{ruta}: {m['CADENA']} / {m['UBICACION']} tiene CVEGEO inexistente ({geo}).")
            elif ent and g[:2] != ent.zfill(2):
                error(f"{ruta}: {m['CADENA']} / {m['UBICACION']}: CVEGEO {g} no pertenece al estado {ent}.")
    for (cadena, _), ubicaciones in grupos.items():
        if len(ubicaciones) > 1:
            error(f"{ruta}: ubicación repetida para {cadena}: {' / '.join(ubicaciones)} (duplicaría ventas).")


validar_mapeo("ejemplo/config/mapeo_ubicaciones.csv")
for extra in args.mapeo:
    if Path(extra).exists():
        validar_mapeo(Path(extra).resolve())
    else:
        error(f"No encontré el mapeo {extra}.")

# ------------------------------------------------------------- ejemplo
orden = {r["REGION_NIELSEN"] for r in leer("ejemplo/config/regiones_orden.csv")}
reg_est = leer("ejemplo/config/regiones_estado.csv")
if sorted(r["CVE_ENT"] for r in reg_est) != claves:
    error("ejemplo/config/regiones_estado.csv debe asignar región a las 32 entidades, una vez cada una.")
for r in reg_est:
    if not r["REGION_NIELSEN"].strip():
        error(f"Estado {r['CVE_ENT']} sin región en el ejemplo.")
    elif r["REGION_NIELSEN"] not in orden:
        error(f"La región '{r['REGION_NIELSEN']}' no está en ejemplo/config/regiones_orden.csv.")

if (RAIZ / "ejemplo/nielsen/nielsen_regiones.csv").exists():
    upcs = {p["UPC"].lstrip("0") for p in leer("ejemplo/dim_producto.csv")}
    with open(RAIZ / "ejemplo/nielsen/nielsen_regiones.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["REGION_NIELSEN"] not in orden:
                error(f"Nielsen de ejemplo: región desconocida '{r['REGION_NIELSEN']}'.")
                break
            if r["UPC"].lstrip("0") not in upcs:
                error(f"Nielsen de ejemplo: UPC sin catálogo {r['UPC']}.")
                break

# ---------------------------------------------------------- resultado
for a in avisos:
    print(f"aviso: {a}")
if errores:
    for e in errores:
        print(f"ERROR: {e}")
    print(f"\n{len(errores)} error(es).")
    sys.exit(1)
print("Todo en orden: catálogos, geometrías, visual y ejemplo coinciden.")
