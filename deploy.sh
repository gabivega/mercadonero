#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  NERO MVP — Script de deploy con verificación y rollback
#
#  Uso (desde el server):
#      /var/www/nero-mvp/deploy.sh
#
#  Qué hace, en orden:
#    1. Guarda el commit actual (para poder volver atrás)
#    2. git pull de la rama main
#    3. npm ci del backend (solo producción)
#    4. Verifica que TODOS los imports del backend resuelvan
#       (esto habría atrapado los bugs de dotenv y ethers en devDependencies)
#    5. npm ci del frontend + build
#    6. Verifica que el build haya generado index.html
#    7. pm2 reload (worker por worker: sin corte de servicio)
#    8. curl al healthcheck; si falla → ROLLBACK automático
#
#  Si cualquier paso falla, revierte el código al commit anterior.
#  ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuración ──────────────────────────────────────────────────────────
APP_DIR="/var/www/nero-mvp"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
BRANCH="main"
PM2_APP="nero-mvp"
HEALTH_URL="http://127.0.0.1:4000/health"
HEALTH_TIMEOUT=15

# Colores para leer mejor en la consola
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; NC=$'\033[0m'; BOLD=$'\033[1m'

step()  { echo -e "\n${BLUE}${BOLD}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}  ✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}  ⚠ $*${NC}"; }
fail()  { echo -e "${RED}  ✗ $*${NC}"; }

# ── Estado para rollback ───────────────────────────────────────────────────
PREVIOUS_COMMIT=""
ROLLBACK_NEEDED=false

rollback() {
  local reason="$1"
  echo ""
  echo -e "${RED}${BOLD}═══════════════════════════════════════════${NC}"
  echo -e "${RED}${BOLD}  DEPLOY FALLÓ: $reason${NC}"
  echo -e "${RED}${BOLD}═══════════════════════════════════════════${NC}"

  if [ -n "$PREVIOUS_COMMIT" ]; then
    echo -e "${YELLOW}  Revirtiendo al commit $PREVIOUS_COMMIT...${NC}"
    cd "$APP_DIR"
    git checkout --force "$PREVIOUS_COMMIT" 2>/dev/null || true

    echo -e "${YELLOW}  Reinstalando dependencias del backend...${NC}"
    cd "$BACKEND_DIR" && npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund >/dev/null 2>&1 || true

    echo -e "${YELLOW}  Reiniciando backend...${NC}"
    pm2 restart "$PM2_APP" --update-env >/dev/null 2>&1 || true
    sleep 8

    if curl -sf --max-time "$HEALTH_TIMEOUT" "$HEALTH_URL" >/dev/null 2>&1; then
      echo -e "${GREEN}  ✓ Rollback exitoso. Servicio restaurado en $PREVIOUS_COMMIT${NC}"
    else
      echo -e "${RED}  ✗ El rollback NO restauró el servicio. REVISAR MANUALMENTE.${NC}"
      echo -e "${RED}    pm2 logs $PM2_APP --lines 50${NC}"
    fi
  else
    echo -e "${RED}  No hay commit previo registrado; no se pudo revertir.${NC}"
  fi

  exit 1
}

trap 'rollback "error inesperado (línea $LINENO)"' ERR

# ══════════════════════════════════════════════════════════════════════════
echo -e "${BOLD}"
echo "════════════════════════════════════════════════"
echo "   NERO MVP — Deploy $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════"
echo -e "${NC}"

cd "$APP_DIR"

# ── 1. Guardar estado actual ───────────────────────────────────────────────
step "1/8  Guardando estado actual"
PREVIOUS_COMMIT=$(git rev-parse HEAD)
ok "Commit actual: ${PREVIOUS_COMMIT:0:7}"

# Capturamos el hash del package-lock.json del frontend ANTES del pull.
# Si tras el pull el hash no cambió, las deps ya están instaladas y nos
# podemos saltear el `npm ci` del paso 5 (se ahorran ~5 minutos).
# Si el archivo no existe (primer deploy) queda vacío y forzamos la instalación.
FRONTEND_LOCK_BEFORE=$(sha256sum "$FRONTEND_DIR/package-lock.json" 2>/dev/null | cut -d' ' -f1 || echo "")

# Solo cuentan los cambios a archivos YA versionados. Los untracked (??) se
# ignoran: pueden ser logs, el propio deploy.sh, etc. y no deben disparar
# un reset que borre trabajo sin avisar.
DIRTY=$(git status --porcelain --untracked-files=no || true)
if [ -n "$DIRTY" ]; then
  warn "Hay cambios locales sin commitear en el server. Se descartarán:"
  echo "$DIRTY" | sed 's/^/     /'
  git checkout -- . 2>/dev/null || true
fi

# ── 2. Traer código nuevo ──────────────────────────────────────────────────
step "2/8  Descargando cambios (git pull)"
git fetch origin "$BRANCH" --quiet
NEW_COMMIT=$(git rev-parse "origin/$BRANCH")

if [ "$PREVIOUS_COMMIT" = "$NEW_COMMIT" ]; then
  warn "No hay cambios nuevos. Nada para deployar."
  exit 0
fi

git reset --hard "origin/$BRANCH" --quiet
ok "Actualizado: ${PREVIOUS_COMMIT:0:7} → ${NEW_COMMIT:0:7}"
git log --oneline "$PREVIOUS_COMMIT..$NEW_COMMIT" | sed 's/^/     /'

# ── 3. Dependencias del backend ────────────────────────────────────────────
step "3/8  Instalando dependencias del backend (producción)"
cd "$BACKEND_DIR"
npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -2 | sed 's/^/     /'
ok "Dependencias instaladas"

# ── 4. Verificar que los imports resuelvan ─────────────────────────────────
#  ESTE ES EL CHEQUEO CLAVE: detecta paquetes importados en runtime que
#  no están instalados (el bug clásico: dependencia en devDependencies).
step "4/8  Verificando imports del backend"
MISSING=""
IMPORTS=$(grep -rhoE "from ['\"][a-z@][^'\"]*['\"]|require\(['\"][a-z@][^'\"]*['\"]\)" \
            index.js src/ 2>/dev/null \
          | sed -E "s/.*['\"]([^'\"]+)['\"].*/\1/" \
          | grep -vE "^\.|^node:|^/|^fs$|^path$|^os$|^crypto$|^url$|^util$|^stream$|^http$|^https$|^events$|^buffer$|^child_process$|^zlib$|^net$|^tls$|^dns$|^querystring$|^assert$|^timers$|^readline$|^worker_threads$|^perf_hooks$|^string_decoder$" \
          | sed -E "s|^(@[^/]+/[^/]+).*|\1|; s|^([^@][^/]*)/.*|\1|" \
          | sort -u)

for pkg in $IMPORTS; do
  if [ ! -d "node_modules/$pkg" ]; then
    # Los paquetes nativos de Node no están en node_modules, los salteamos
    case "$pkg" in
      fs|path|os|crypto|url|util|stream|http|https|events|buffer|child_process|zlib|net|tls|dns|querystring|assert|timers|readline|worker_threads|perf_hooks|string_decoder) continue ;;
    esac
    MISSING="$MISSING $pkg"
  fi
done

if [ -n "$MISSING" ]; then
  fail "Paquetes importados en runtime pero NO instalados:$MISSING"
  fail "Solución: agregarlos a \"dependencies\" en backend/package.json"
  ROLLBACK_NEEDED=true
  rollback "dependencias faltantes:$MISSING"
fi
ok "Todos los imports resuelven correctamente"

# ── 5. Build del frontend ──────────────────────────────────────────────────
step "5/8  Instalando dependencias del frontend"
cd "$FRONTEND_DIR"
# Si el lockfile no cambió, las deps ya están correctas: nos ahorramos
# ~5 minutos de npm ci. Comparamos el hash capturado antes del pull (paso 1)
# con el actual. Si falta el hash previo (primer deploy) instalamos igual.
FRONTEND_LOCK_AFTER=$(sha256sum "$FRONTEND_DIR/package-lock.json" 2>/dev/null | cut -d' ' -f1 || echo "")
if [ -n "${FRONTEND_LOCK_BEFORE:-}" ] && [ "$FRONTEND_LOCK_AFTER" = "$FRONTEND_LOCK_BEFORE" ] && [ -d "$FRONTEND_DIR/node_modules" ]; then
  ok "package-lock.json sin cambios — se saltea npm ci"
else
  npm ci --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -2 | sed 's/^/     /'
  ok "Dependencias instaladas"
fi

step "6/8  Compilando frontend (vite build)"
NODE_OPTIONS=--max-old-space-size=2048 npx vite build 2>&1 | tail -4 | sed 's/^/     /'

if [ ! -f "$FRONTEND_DIR/dist/index.html" ]; then
  rollback "el build no generó dist/index.html"
fi
ok "Build generado ($(du -sh "$FRONTEND_DIR/dist" | cut -f1))"

# ── 6. Recargar servicios ──────────────────────────────────────────────────
step "7/8  Recargando backend (pm2)"
pm2 restart "$PM2_APP" --update-env >/dev/null 2>&1
ok "PM2 reiniciado"

systemctl reload nginx 2>/dev/null || true
ok "Nginx recargado"

# ── 7. Healthcheck ─────────────────────────────────────────────────────────
step "8/8  Verificando salud del servicio"
sleep 8

if ! curl -sf --max-time "$HEALTH_TIMEOUT" "$HEALTH_URL" >/dev/null 2>&1; then
  fail "El healthcheck falló ($HEALTH_URL)"
  echo "     Últimas líneas del log:"
  pm2 logs "$PM2_APP" --lines 20 --nostream --no-color 2>/dev/null | sed 's/^/       /'
  rollback "healthcheck falló tras el deploy"
fi
ok "Backend responde correctamente"

# Probe adicional: el frontend servido por nginx
if ! curl -skf --max-time 10 https://127.0.0.1/ -H "Host: mercadonero.com" >/dev/null 2>&1; then
  warn "El frontend no respondió por HTTPS (revisar nginx)"
else
  ok "Frontend servido por Nginx OK"
fi

# ══════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}"
echo "════════════════════════════════════════════════"
echo "   ✓ DEPLOY COMPLETADO"
echo "   ${PREVIOUS_COMMIT:0:7} → ${NEW_COMMIT:0:7}"
echo "════════════════════════════════════════════════"
echo -e "${NC}"
echo "  Para volver atrás manualmente si algo anda mal:"
echo "    cd $APP_DIR && git reset --hard $PREVIOUS_COMMIT"
echo "    cd $BACKEND_DIR && npm ci --omit=dev --legacy-peer-deps"
echo "    pm2 restart $PM2_APP"
echo ""
