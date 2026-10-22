"""
Revisa que configuración, catálogos, geometrías y especificaciones de Deneb
sean coherentes entre sí. Solo usa la biblioteca estándar de Python.

    python scripts/validar.py

Úsalo después de editar config/ (regiones, alias, mapeo de ubicaciones) o de
regenerar la geometría. Sale con código 1 si encuentra errores.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
errores: list[str] = []
avisos: list[str] = []


def leer(ruta: str) -> list[dict]:
    with open(RAIZ / ruta, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def error(msg: str) -> None:
    errores.append(msg)


def objetos_topo(ruta: str) -> dict:
    with open(RAIZ / ruta, encoding="utf-8") as f:
        return json.load(f)["objects"]


# ------------------------------------------------------------- config
estados = leer("config/estados.csv")
claves = [e["CVE_ENT"] for e in estados]
if claves != [f"{i:02d}" for i in range(1, 33)]:
    error("config/estados.csv debe tener las claves 01 a 32 en orden.")
for e in estados:
    if not e["POBLACION_2020"].isdigit():
        error(f"Población no numérica para {e['CVE_ENT']}.")

orden = {r["REGION_NIELSEN"] for r in leer("config/regiones_orden.csv")}
reg_est = leer("config/regiones_estado.csv")
if sorted(r["CVE_ENT"] for r in reg_est) != claves:
    error("config/regiones_estado.csv debe asignar región a las 32 entidades, una vez cada una.")
for r in reg_est:
    if not r["REGION_NIELSEN"].strip():
        error(f"Estado {r['CVE_ENT']} sin región Nielsen.")
    elif r["REGION_NIELSEN"] not in orden:
        avisos.append(f"La región '{r['REGION_NIELSEN']}' no está en config/regiones_orden.csv (se ordenará al final).")

alias = leer("config/alias_estados.csv")
vistos: dict[str, str] = {}
for a in alias:
    if a["CVE_ENT"] not in claves:
        error(f"Alias '{a['ALIAS']}' apunta a una clave inexistente: {a['CVE_ENT']}.")
    if not re.fullmatch(r"[A-Z0-9]+( [A-Z0-9]+)*", a["ALIAS"]):
        error(f"Alias '{a['ALIAS']}' no está normalizado (mayúsculas, sin acentos ni puntuación).")
    if a["ALIAS"] in vistos and vistos[a["ALIAS"]] != a["CVE_ENT"]:
        error(f"Alias duplicado con claves distintas: '{a['ALIAS']}'.")
    vistos[a["ALIAS"]] = a["CVE_ENT"]

# ---------------------------------------------------------- catálogos
dim_geo = leer("catalogos/dim_geo.csv")
if [g["CVE_ENT"] for g in dim_geo] != claves:
    error("catalogos/dim_geo.csv no coincide con config/estados.csv: ejecuta npm run geo.")
regiones_geo = {g["CVE_ENT"]: g["REGION_NIELSEN"] for g in dim_geo}
for r in reg_est:
    if regiones_geo.get(r["CVE_ENT"]) != r["REGION_NIELSEN"]:
        error(f"La región del estado {r['CVE_ENT']} en catalogos/ no coincide con config/: ejecuta npm run geo.")
        break

dim_mun = leer("catalogos/dim_municipio.csv")
cvegeo = [m["CVEGEO"] for m in dim_mun]
if len(cvegeo) != len(set(cvegeo)):
    error("catalogos/dim_municipio.csv tiene CVEGEO repetidos.")
cvegeo_set = set(cvegeo)
for c in claves:
    if f"{c}000" not in cvegeo_set:
        error(f"Falta el municipio comodín {c}000 en dim_municipio.csv.")

for o in leer("config/regiones_municipio.csv"):
    if o["CVEGEO"] not in cvegeo_set:
        error(f"config/regiones_municipio.csv: el municipio {o['CVEGEO']} no existe.")

for m in leer("config/mapeo_ubicaciones.csv"):
    if m["CVE_ENT"] and m["CVE_ENT"].zfill(2) not in claves:
        error(f"mapeo_ubicaciones: {m['CADENA']} / {m['UBICACION']} tiene CVE_ENT inválida ({m['CVE_ENT']}).")
    if m["CVEGEO"]:
        g = m["CVEGEO"].zfill(5)
        if g not in cvegeo_set:
            error(f"mapeo_ubicaciones: {m['CADENA']} / {m['UBICACION']} tiene CVEGEO inexistente ({m['CVEGEO']}).")
        elif m["CVE_ENT"] and g[:2] != m["CVE_ENT"].zfill(2):
            error(f"mapeo_ubicaciones: {m['CADENA']} / {m['UBICACION']}: CVEGEO {g} no pertenece al estado {m['CVE_ENT']}.")

# -------------------------------------------------------- geometrías
est_topo = objetos_topo("geo/estados/mx_estados.topojson")["estados"]["geometries"]
if sorted(g["properties"]["CVE_ENT"] for g in est_topo) != claves:
    error("geo/estados/mx_estados.topojson no tiene exactamente las 32 entidades.")

reg_topo = objetos_topo("geo/regiones/mx_regiones.topojson")["regiones"]["geometries"]
if {g["properties"]["REGION_NIELSEN"] for g in reg_topo} != {r["REGION_NIELSEN"] for r in reg_est} | {
    o["REGION_NIELSEN"] for o in leer("config/regiones_municipio.csv")
}:
    error("Las regiones de geo/regiones no coinciden con config/: ejecuta npm run geo.")

mun_topo = objetos_topo("geo/municipios/mx_municipios.topojson")["municipios"]["geometries"]
mun_geo = {g["properties"]["CVEGEO"] for g in mun_topo}
if mun_geo != {c for c in cvegeo if not c.endswith("000")}:
    error("Los municipios de geo/ no coinciden con catalogos/dim_municipio.csv.")

# ------------------------------------------------------------ Deneb
requeridos = {
    "deneb/mapa_estados.json": ["CVE_ENT", "ESTADO", "Valor Mapa", "Valor Mapa Texto", "Config Mapa"],
    "deneb/mapa_bivariado.json": ["CVE_ENT", "ESTADO", "Valor Mapa", "Valor Mapa 2", "Config Mapa", "Config Mapa 2"],
    "deneb/comparativo_regiones.json": ["REGION_NIELSEN", "Comparar Cadenas", "Comparar Nielsen", "Config Comparación"],
    "deneb/municipios/mapa_municipios_15.json": ["CVEGEO", "MUNICIPIO", "Valor Mapa", "Config Mapa"],
}
for ruta, campos in requeridos.items():
    try:
        texto = (RAIZ / ruta).read_text(encoding="utf-8")
        spec = json.loads(texto)
    except (OSError, json.JSONDecodeError) as e:
        error(f"{ruta}: {e}")
        continue
    if spec.get("data", {}).get("name") != "dataset":
        error(f"{ruta}: debe leer los datos de Power BI desde 'dataset'.")
    for c in campos:
        if c not in texto:
            error(f"{ruta}: no usa el campo '{c}'.")
    for nombre, valor in spec.get("datasets", {}).items():
        if not isinstance(valor, dict) or valor.get("type") != "Topology":
            error(f"{ruta}: el dataset '{nombre}' no contiene un TopoJSON.")

# ----------------------------------------------------- datos de ejemplo
if (RAIZ / "ejemplo/nielsen/nielsen_regiones.csv").exists():
    regiones = {r["REGION_NIELSEN"] for r in leer("catalogos/dim_region.csv")}
    upcs = {p["UPC"].lstrip("0") for p in leer("ejemplo/dim_producto.csv")}
    with open(RAIZ / "ejemplo/nielsen/nielsen_regiones.csv", encoding="utf-8") as f:
        for i, r in enumerate(csv.DictReader(f)):
            if r["REGION_NIELSEN"] not in regiones:
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
print("Todo en orden: configuración, catálogos, geometrías y especificaciones de Deneb coinciden.")
