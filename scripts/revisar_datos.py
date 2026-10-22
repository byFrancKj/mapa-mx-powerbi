"""
Revisa que en git no entren datos privados. Lo usan el gancho pre-commit y el CI.
Solo usa la biblioteca estándar de Python.

    python scripts/revisar_datos.py            # todos los archivos versionados
    python scripts/revisar_datos.py --staged   # lo preparado para el próximo commit

Reglas:
  * Nada dentro de privado/ (salvo privado/LEEME.md).
  * Archivos de datos (.csv, .xlsx, .parquet, .pbix…) solo en las carpetas de datos
    públicos o ficticios: ejemplo/, puente-inegi/, geo/ y visual/src/geo/.
  * Proyectos de Power BI (.pbip) solo en ejemplo/powerbi/.
  * Nada de credenciales (.env, .pem, .key…) ni archivos de más de 10 MB.
Si un archivo de datos es legítimo y va en otra carpeta, agrega la carpeta a PERMITIDAS.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path, PurePosixPath

RAIZ = Path(__file__).resolve().parents[1]

PERMITIDAS = ("ejemplo/", "puente-inegi/", "geo/", "visual/src/geo/")
DATOS = {".csv", ".tsv", ".txt", ".xlsx", ".xlsm", ".xls", ".xlsb", ".parquet", ".feather", ".pbix", ".pbit",
         ".abf", ".db", ".sqlite", ".accdb", ".mdb", ".zip", ".7z"}
CREDENCIALES = {".env", ".pem", ".key", ".pfx", ".p12"}
LIMITE_MB = 10

args = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
args.add_argument("--staged", action="store_true", help="revisar solo lo preparado para el próximo commit")
args = args.parse_args()

comando = ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"] if args.staged else ["git", "ls-files"]
archivos = subprocess.run(comando, cwd=RAIZ, capture_output=True, text=True, check=True).stdout.splitlines()

problemas: list[str] = []
for nombre in archivos:
    ruta = PurePosixPath(nombre)
    ext = ruta.suffix.lower()
    if nombre.startswith("privado/") and nombre != "privado/LEEME.md":
        problemas.append(f"{nombre}: privado/ nunca se sube.")
    elif ext in CREDENCIALES or ruta.name.startswith(".env"):
        problemas.append(f"{nombre}: parece un archivo de credenciales.")
    elif ext in DATOS and not nombre.startswith(PERMITIDAS) and ruta.name not in {"requirements.txt", "LICENSE.txt"}:
        problemas.append(f"{nombre}: archivo de datos fuera de {', '.join(PERMITIDAS)}.")
    elif (ext == ".pbip" or any(p.endswith((".SemanticModel", ".Report", ".Dataset")) for p in ruta.parts)) \
            and not nombre.startswith("ejemplo/powerbi/"):
        problemas.append(f"{nombre}: los reportes de Power BI solo van en ejemplo/powerbi/ (los tuyos, en privado/).")
    archivo = RAIZ / nombre
    if archivo.is_file() and archivo.stat().st_size > LIMITE_MB * 1024 * 1024:
        problemas.append(f"{nombre}: pesa más de {LIMITE_MB} MB.")

if problemas:
    print("Archivos que no deberían ir en el repositorio:")
    for p in problemas:
        print(f"  ✗ {p}")
    print("\nMuévelos a privado/ (git lo ignora) o, si son públicos o ficticios, a una carpeta permitida.")
    sys.exit(1)
print(f"Sin datos privados: {len(archivos)} archivo(s) revisado(s).")
