#!/usr/bin/env bash
# =============================================================
# FlowApp — Setup inicial de recursos Cloudflare
# Ejecutar una sola vez: bash scripts/setup.sh
# Requiere: wrangler instalado y autenticado (wrangler login)
# =============================================================
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${CYAN}[flowapp]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }

cd "$(dirname "$0")/../backend"

log "Creando base de datos D1..."
DB_OUTPUT=$(wrangler d1 create flowapp-db 2>&1)
DB_ID=$(echo "$DB_OUTPUT" | grep -oP 'database_id = "\K[^"]+' || true)
if [ -z "$DB_ID" ]; then
  warn "D1 ya existe o hubo un error. Buscando ID existente..."
  DB_ID=$(wrangler d1 list --json 2>/dev/null | grep -oP '"flowapp-db"[^}]+"id":"\K[^"]+' || echo "MANUAL")
fi
ok "D1 ID: $DB_ID"

log "Creando bucket R2..."
wrangler r2 bucket create flowapp-files 2>/dev/null || warn "R2 ya existe"
ok "R2: flowapp-files"

log "Creando namespace KV..."
KV_OUTPUT=$(wrangler kv:namespace create KV 2>&1)
KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id = "\K[^"]+' || true)
if [ -z "$KV_ID" ]; then
  warn "KV ya existe. Buscando ID..."
  KV_ID=$(wrangler kv:namespace list --json 2>/dev/null | grep -oP '"title":"flowapp[^"]*KV[^}]+"id":"\K[^"]+' | head -1 || echo "MANUAL")
fi
ok "KV ID: $KV_ID"

log "Actualizando wrangler.toml con los IDs generados..."
sed -i "s/REPLACE_AFTER_CREATE/$DB_ID/g" wrangler.toml 2>/dev/null || \
  perl -i -pe "s/REPLACE_AFTER_CREATE/$DB_ID/g" wrangler.toml
# KV tiene dos ocurrencias (dev y prod)
python3 -c "
import re, sys
content = open('wrangler.toml').read()
# Reemplaza solo la primera aparición de KV id por el id real
count = [0]
def repl(m):
    count[0] += 1
    return f'id      = \"{sys.argv[1]}\"'
result = re.sub(r'id      = \"REPLACE_AFTER_CREATE\"', repl, content)
open('wrangler.toml', 'w').write(result)
" "$KV_ID" 2>/dev/null || warn "Actualiza wrangler.toml manualmente con KV_ID=$KV_ID"
ok "wrangler.toml actualizado"

log "Aplicando schema SQL en D1 (dev)..."
wrangler d1 execute flowapp-db --file=src/db/schema.sql
ok "Schema aplicado"

log "Configurando secretos del Worker..."
echo ""
warn "Ahora debes configurar los secretos. Ejecuta estos comandos:"
echo ""
echo "  wrangler secret put TOKEN_SECRET"
echo "  → Pega una clave aleatoria de 48+ chars (genera con: openssl rand -base64 48)"
echo ""
echo "  wrangler secret put ENTRA_CLIENT_SECRET"
echo "  → Pega el client secret de tu Azure App Registration"
echo ""

log "Creando archivo .env para el frontend..."
cat > ../frontend/.env.local << EOF
VITE_API_URL=https://flowapp.$(wrangler whoami 2>/dev/null | grep -oP 'subdomain: \K\S+' || echo 'tu-usuario').workers.dev
VITE_ENTRA_CLIENT_ID=66130291-fc50-43f1-943c-6818dac1ba99
VITE_ENTRA_TENANT_ID=480bd49c-6f89-4faa-b39e-c7728d95d130
VITE_ENTRA_SCOPE=api://66130291-fc50-43f1-943c-6818dac1ba99/basedeconocimiento
EOF
ok "frontend/.env.local creado"

echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup completado.${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo ""
echo "Próximos pasos:"
echo "  1. Configura los secretos (TOKEN_SECRET, ENTRA_CLIENT_SECRET)"
echo "  2. cd backend && npm install && npm run dev"
echo "  3. cd frontend && npm install && npm run dev"
echo "  4. Configura los GitHub Secrets para el CI/CD:"
echo "     CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID"
echo "     VITE_API_URL, VITE_ENTRA_CLIENT_ID, VITE_ENTRA_TENANT_ID, VITE_ENTRA_SCOPE"
echo ""
