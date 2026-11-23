#!/usr/bin/env bash
# Corre scripts/monitor.py sobre el estado guardado en la rama "monitor" y guarda el resultado (con historial).
# Uso: bash scripts/monitor.sh corrida <proceso> [opciones de monitor.py]   |   bash scripts/monitor.sh vigilar
# Necesita GH_TOKEN (permiso contents: write) y, para mandar correos, BREVO_API_KEY.
set -uo pipefail
modo="$1"; shift
DIR="${RUNNER_TEMP:-/tmp}/rama-monitor"
URL="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
rm -rf "$DIR"
if ! git clone -q --depth=1 -b monitor "$URL" "$DIR" 2>/dev/null; then
  mkdir -p "$DIR" && git -C "$DIR" init -q -b monitor && git -C "$DIR" remote add origin "$URL"
fi
if ! python3 scripts/monitor.py "$modo" "$DIR" "$@"; then
  # si el propio monitoreo falla, igual llega un aviso (genérico)
  python3 scripts/alerta.py "el monitoreo de la actualización de precios (scripts/monitor.py)" "${ENLACE:-}"
  exit 1
fi
cd "$DIR"
git config user.name "comparasuper-bot"; git config user.email "actions@users.noreply.github.com"
git add estado.json && git commit -qm "Monitoreo $(date -u +%FT%H:%M) ($modo $*)" && git push -q origin HEAD:monitor
echo "Estado guardado en la rama monitor"
