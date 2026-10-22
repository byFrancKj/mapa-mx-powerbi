#!/usr/bin/env bash
# Publica el repositorio en GitHub de forma segura. Necesita el CLI de GitHub con
# la sesión iniciada:  brew install gh && gh auth login
#
#   bash scripts/publicar.sh                      # repositorio público mapa-mx-powerbi
#   bash scripts/publicar.sh --privado            # repositorio privado
#   bash scripts/publicar.sh --nombre=otro-nombre
#   bash scripts/publicar.sh --si                 # sin preguntas
#
# En orden:
#   1. Revisa que no haya datos privados ni cambios sin commit, y que todo cuadre.
#   2. Cambia el autor de los commits locales por tu dirección privada de GitHub
#      (ID+usuario@users.noreply.github.com), para no publicar tu correo. Solo si
#      el historial todavía no se ha subido.
#   3. Completa autor y URLs del visual (visual/pbiviz.json) y los enlaces de la
#      documentación.
#   4. Crea el repositorio y sube main y las etiquetas.
#   5. Activa escaneo de secretos con bloqueo, Dependabot, reporte privado de
#      vulnerabilidades y protección de main.
#   6. Espera al CI y, si pasa, publica la versión del visual (release con SHA-256
#      y atestación de origen).
set -euo pipefail

REPO_NOMBRE="mapa-mx-powerbi"
VISIBILIDAD="public"
SI=0
for arg in "$@"; do
    case "$arg" in
        --privado) VISIBILIDAD="private" ;;
        --si) SI=1 ;;
        --nombre=*) REPO_NOMBRE="${arg#--nombre=}" ;;
        *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
    esac
done

paso() { printf '\n▸ %s\n' "$1"; }
confirmar() {
    [ "$SI" = 1 ] && return 0
    local r
    read -r -p "$1 [s/N] " r
    [[ "$r" =~ ^[sS]$ ]]
}
# git con la sesión de gh como credencial, solo para este comando (no toca tu configuración global).
git_gh() { git -c credential.helper= -c 'credential.helper=!gh auth git-credential' "$@"; }
# Espera la ejecución de un workflow para un commit y falla si no pasa.
esperar_workflow() {
    local workflow="$1" commit="$2" run=""
    for _ in $(seq 1 30); do
        run=$(gh run list --repo "$REPO" --workflow "$workflow" --commit "$commit" --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
        [ -n "$run" ] && break
        sleep 4
    done
    [ -n "$run" ] || { echo "No apareció la ejecución de $workflow." >&2; return 1; }
    gh run watch "$run" --repo "$REPO" --exit-status --interval 10
}

cd "$(git rev-parse --show-toplevel)"

# ------------------------------------------------------------------ 1
paso "Requisitos"
command -v gh >/dev/null || { echo "Falta el CLI de GitHub: brew install gh && gh auth login" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Inicia sesión primero: gh auth login" >&2; exit 1; }
[ "$(git branch --show-current)" = "main" ] || { echo "Cámbiate a la rama main." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Hay cambios sin commit." >&2; exit 1; }
python3 scripts/revisar_datos.py
python3 scripts/validar.py

USUARIO=$(gh api user --jq .login)
ID=$(gh api user --jq .id)
NOMBRE=$(gh api user --jq '.name // .login')
CORREO="${ID}+${USUARIO}@users.noreply.github.com"
REPO="${USUARIO}/${REPO_NOMBRE}"
URL="https://github.com/${REPO}"
echo "Cuenta: ${USUARIO} · repositorio: ${REPO} (${VISIBILIDAD}) · autor: ${NOMBRE} <${CORREO}>"

EXISTE=0
gh repo view "$REPO" >/dev/null 2>&1 && EXISTE=1

# ------------------------------------------------------------------ 2
paso "Autoría de los commits"
OTROS=$( { git log --all --format='%ae%n%ce'; git for-each-ref refs/tags --format='%(taggeremail)' | tr -d '<>'; } \
    | grep -v '^$' | sort -u | grep -v -x -F "$CORREO" || true)
if [ -z "$OTROS" ]; then
    echo "Todo el historial ya usa ${CORREO}."
elif [ "$EXISTE" = 1 ]; then
    echo "Aviso: el repositorio ya existe y hay commits con otro correo; no se reescribe lo ya publicado." >&2
else
    echo "Correos en el historial local: $(echo "$OTROS" | tr '\n' ' ')"
    confirmar "¿Reemplazarlos por ${CORREO}? (el historial aún no se ha publicado)" || exit 1
    export NUEVO_NOMBRE="$NOMBRE" NUEVO_CORREO="$CORREO" FILTER_BRANCH_SQUELCH_WARNING=1
    git filter-branch -f --tag-name-filter cat --env-filter '
        export GIT_AUTHOR_NAME="$NUEVO_NOMBRE" GIT_AUTHOR_EMAIL="$NUEVO_CORREO"
        export GIT_COMMITTER_NAME="$NUEVO_NOMBRE" GIT_COMMITTER_EMAIL="$NUEVO_CORREO"
    ' -- --all >/dev/null
    git config user.name "$NOMBRE"
    git config user.email "$CORREO"
    # Las etiquetas anotadas conservan a quien las firmó: se recrean con la nueva identidad.
    for t in $(git for-each-ref refs/tags --format='%(objecttype) %(refname:short)' | awk '$1 == "tag" {print $2}'); do
        mensaje=$(git tag -l --format='%(contents)' "$t")
        git tag -a -f -m "$mensaje" "$t" "$t^{commit}" >/dev/null
    done
    # Sin copias del historial anterior.
    git for-each-ref --format='%(refname)' refs/original/ | while read -r ref; do git update-ref -d "$ref"; done
    git reflog expire --expire=now --all
    git gc --prune=now --quiet
    RESTO=$( { git log --all --format='%ae%n%ce'; git for-each-ref refs/tags --format='%(taggeremail)' | tr -d '<>'; } \
        | grep -v '^$' | sort -u | grep -v -x -F "$CORREO" || true)
    [ -z "$RESTO" ] || { echo "Quedaron correos sin reemplazar: $RESTO" >&2; exit 1; }
    echo "Autoría reemplazada en todo el historial."
fi

# ------------------------------------------------------------------ 3
paso "Autor y URLs del visual"
python3 - "$URL" "$NOMBRE" "$CORREO" "$REPO" <<'PY'
import json, sys
from pathlib import Path
url, nombre, correo, repo = sys.argv[1:]
p = Path("visual/pbiviz.json")
d = json.loads(p.read_text())
d["visual"]["supportUrl"] = f"{url}/issues"
d["visual"]["gitHubUrl"] = url
d["author"] = {"name": nombre, "email": correo}
p.write_text(json.dumps(d, indent=4, ensure_ascii=False) + "\n")
for archivo in ["SECURITY.md", "docs/04-desarrollo.md"]:
    f = Path(archivo)
    f.write_text(f.read_text(encoding="utf-8").replace("<usuario>/mapa-mx-powerbi", repo), encoding="utf-8")
PY
if git diff --quiet; then
    echo "Sin cambios."
else
    git commit -q -am "Datos de publicación: autor y URLs del repositorio"
    echo "Hecho (commit)."
fi

# ------------------------------------------------------------------ 4
paso "Repositorio"
if [ "$EXISTE" = 0 ]; then
    confirmar "¿Crear ${URL} como repositorio ${VISIBILIDAD}?" || exit 1
    gh repo create "$REPO" "--${VISIBILIDAD}" --disable-wiki \
        --description "Visual de Power BI: mapa de México por estado o municipio con claves INEGI. Tus datos y medidas se quedan en tu modelo." >/dev/null
    echo "Creado: ${URL}"
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "${URL}.git"
git_gh push -u origin main
git_gh push origin --tags

# ------------------------------------------------------------------ 5
paso "Seguridad del repositorio"
set +e
ok() { if [ "$1" = 0 ]; then echo "  ✓ $2"; else echo "  ✗ $2 (actívalo a mano en Settings)"; fi; }
gh api -X PUT "repos/${REPO}/vulnerability-alerts" --silent; ok $? "Alertas de Dependabot"
gh api -X PUT "repos/${REPO}/automated-security-fixes" --silent; ok $? "Actualizaciones de seguridad de Dependabot"
gh api -X PUT "repos/${REPO}/private-vulnerability-reporting" --silent; ok $? "Reporte privado de vulnerabilidades"
gh api -X PATCH "repos/${REPO}" --silent --input - <<'JSON'
{"security_and_analysis": {"secret_scanning": {"status": "enabled"}, "secret_scanning_push_protection": {"status": "enabled"}}}
JSON
ok $? "Escaneo de secretos con bloqueo al subir"
gh repo edit "$REPO" --add-topic power-bi --add-topic powerbi-custom-visual --add-topic inegi \
    --add-topic mexico --add-topic choropleth-map --add-topic topojson >/dev/null; ok $? "Temas del repositorio"
if gh api "repos/${REPO}/rulesets" --jq '.[].name' 2>/dev/null | grep -q -x "Proteger main"; then
    echo "  ✓ Protección de main (ya existía)"
else
    gh api -X POST "repos/${REPO}/rulesets" --silent --input - <<'JSON'
{
  "name": "Proteger main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
  "bypass_actors": [{"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}],
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "pull_request", "parameters": {"required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false,
      "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": false}},
    {"type": "required_status_checks", "parameters": {"strict_required_status_checks_policy": false, "required_status_checks": [
      {"context": "Sin datos privados"}, {"context": "Catálogos, geometría y ejemplo"}, {"context": "Visual"}]}}
  ]
}
JSON
    ok $? "Protección de main (pull request con CI; los administradores pueden saltarla)"
fi
set -e

# ------------------------------------------------------------------ 6
paso "CI"
esperar_workflow ci.yml "$(git rev-parse HEAD)"

VERSION=$(python3 -c "import json; print('.'.join(json.load(open('visual/pbiviz.json'))['visual']['version'].split('.')[:3]))")
ETIQUETA="v${VERSION}"
paso "Versión ${ETIQUETA} del visual"
if gh release view "$ETIQUETA" --repo "$REPO" >/dev/null 2>&1; then
    echo "El release ${ETIQUETA} ya existe."
elif confirmar "¿Publicar el release ${ETIQUETA} (el .pbiviz se compila en GitHub)?"; then
    git rev-parse -q --verify "refs/tags/${ETIQUETA}" >/dev/null || git tag -a "$ETIQUETA" -m "Mapa México (INEGI) ${VERSION}"
    git_gh push origin "$ETIQUETA"
    esperar_workflow release.yml "$(git rev-parse "${ETIQUETA}^{commit}")"
    gh release view "$ETIQUETA" --repo "$REPO" --json url,assets --jq '"Release: \(.url)\n" + ([.assets[].name] | join("\n"))'
fi

paso "Listo"
echo "Repositorio: ${URL}"
