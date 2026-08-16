#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Prepara el PC como servidor de ORis.
#
# Se ejecuta EN EL PC. Desde el iPad:
#     ssh usuario@pc 'bash -s' < pc-setup.sh
# o, si ya estás dentro de la sesión SSH, pega el bloque de una línea que
# aparece al final de esta conversación.
#
# Qué hace:
#   1. Localiza el escritorio (Windows, macOS o Linux, en español o inglés)
#   2. Clona o actualiza el repositorio ORis
#   3. Deja un fichero de prueba en el escritorio con una marca única
#   4. Informa de qué herramientas faltan para arrancar el proyecto
#
# No instala nada ni toca nada fuera de la carpeta que elijas. Es idempotente:
# ejecutarlo dos veces no rompe nada.
# ---------------------------------------------------------------------------
set -uo pipefail

REPO="https://github.com/chayanbarsa-crypto/ORis-.git"
DESTINO="${ORIS_DIR:-$HOME/ORis}"
MARCA="${ORIS_TOKEN:-sin-marca}"

echo "══════════════════════════════════════════════════"
echo "  ORis — preparación del PC"
echo "══════════════════════════════════════════════════"
echo

# --- 1. Dónde estamos ------------------------------------------------------
case "$(uname -s)" in
  Linux*)   SO="Linux" ;;
  Darwin*)  SO="macOS" ;;
  MINGW*|MSYS*|CYGWIN*) SO="Windows (entorno POSIX)" ;;
  *)        SO="$(uname -s)" ;;
esac
echo "sistema : $SO"
echo "usuario : $(whoami)@$(hostname)"
echo "home    : $HOME"

# El escritorio cambia de nombre según idioma y sistema.
ESCRITORIO=""
# ${USERPROFILE:-} con el valor por defecto: fuera de Windows no existe, y con
# `set -u` una variable sin definir aborta el script entero.
for candidato in "$HOME/Desktop" "$HOME/Escritorio" "$HOME/OneDrive/Escritorio" \
                 "$HOME/OneDrive/Desktop" "${USERPROFILE:-}/Desktop" \
                 "${USERPROFILE:-}/Escritorio"; do
  case "$candidato" in /Desktop|/Escritorio) continue ;; esac   # USERPROFILE vacío
  if [ -d "$candidato" ]; then ESCRITORIO="$candidato"; break; fi
done
if [ -z "$ESCRITORIO" ]; then
  echo "escritorio : NO ENCONTRADO — usaré \$HOME"
  ESCRITORIO="$HOME"
else
  echo "escritorio : $ESCRITORIO"
fi
echo

# --- 2. El repositorio -----------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  echo "❌ git no está instalado. Sin él no hay nada que hacer:"
  echo "   Windows -> https://git-scm.com/download/win"
  echo "   macOS   -> xcode-select --install"
  echo "   Linux   -> sudo apt install git"
  exit 1
fi

if [ -d "$DESTINO/.git" ]; then
  echo "▸ actualizando el clon en $DESTINO"
  git -C "$DESTINO" pull --ff-only 2>&1 | sed 's/^/    /'
else
  echo "▸ clonando en $DESTINO"
  git clone "$REPO" "$DESTINO" 2>&1 | sed 's/^/    /'
fi

COMMIT="$(git -C "$DESTINO" rev-parse --short HEAD 2>/dev/null || echo '?')"
FECHA="$(git -C "$DESTINO" log -1 --format=%cd --date=format:'%Y-%m-%d %H:%M' 2>/dev/null || echo '?')"
NDOCS="$(find "$DESTINO/docs" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')"
echo "    commit $COMMIT del $FECHA · $NDOCS notas en docs/"
echo

# --- 3. La prueba en el escritorio ----------------------------------------
PRUEBA="$ESCRITORIO/ORis-prueba.txt"
{
  echo "ORis — prueba de escritura en el PC"
  echo "==================================="
  echo
  echo "Marca      : $MARCA"
  echo "Escrito    : $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "Máquina    : $(whoami)@$(hostname) ($SO)"
  echo "Repositorio: $DESTINO"
  echo "Commit     : $COMMIT del $FECHA"
  echo "Notas      : $NDOCS ficheros .md en docs/"
  echo
  echo "Si estás leyendo esto en el escritorio del PC, la cadena"
  echo "GitHub -> PC funciona. La bóveda de Obsidian debe apuntar a:"
  echo "    $DESTINO/docs"
} > "$PRUEBA"
echo "▸ escrito $PRUEBA"
echo

# --- 4. Qué falta para arrancar -------------------------------------------
echo "▸ herramientas para arrancar el proyecto:"
faltan=0
if command -v node >/dev/null 2>&1; then
  V="$(node -v | tr -d 'v')"; MAYOR="${V%%.*}"
  if [ "$MAYOR" -ge 18 ]; then echo "    ✅ node $V"; else echo "    ⚠️  node $V (hace falta 18.18+)"; faltan=1; fi
else
  echo "    ❌ node — falta (nodejs.org)"; faltan=1
fi
if command -v python3 >/dev/null 2>&1; then
  echo "    ✅ $(python3 -V)"
elif command -v python >/dev/null 2>&1; then
  echo "    ✅ $(python -V 2>&1)"
else
  echo "    ❌ python 3.11+ — falta"; faltan=1
fi
if command -v psql >/dev/null 2>&1; then
  echo "    ✅ postgres cliente"
else
  echo "    ○  postgres — opcional: la BD puede ser Supabase o Neon"
fi
[ -f "$DESTINO/apps/web/.env.local" ] \
  && echo "    ✅ .env.local presente" \
  || echo "    ○  falta apps/web/.env.local (DATABASE_URL y ANTHROPIC_API_KEY)"
echo

echo "══════════════════════════════════════════════════"
echo "  Listo. Copia y pega esto en la conversación:"
echo "──────────────────────────────────────────────────"
echo "  PC: $(whoami)@$(hostname) · $SO"
echo "  repo en $DESTINO commit $COMMIT · $NDOCS notas"
echo "  prueba: $PRUEBA"
echo "  faltan herramientas: $([ $faltan -eq 0 ] && echo no || echo sí)"
echo "══════════════════════════════════════════════════"
