#!/usr/bin/env bash
# =============================================================
# Supabase Auth Platform – Reset & Neustart
# Löscht Container, Images und Volumes AUSSER:
#   - .env (System-Einstellungen bleiben erhalten)
#   - postgres-data Volume (Nutzerdaten bleiben erhalten)
# =============================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log_step() { echo -e "\n${BOLD}${BLUE}▶ $1${NC}"; }
log_ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_info() { echo -e "  ${CYAN}ℹ${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Docker Compose Befehl ermitteln
if docker compose version &>/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose &>/dev/null; then
  DC="docker-compose"
else
  echo -e "${RED}✗ Docker Compose nicht gefunden${NC}"; exit 1
fi

echo -e "${BOLD}${CYAN}"
cat <<'BANNER'
  ╔═════════════════════════════════════════╗
  ║   Supabase Auth Platform – Reset        ║
  ╚═════════════════════════════════════════╝
BANNER
echo -e "${NC}"

# ─── Was wird gelöscht? ───────────────────────────────────────
echo -e "  ${YELLOW}Folgendes wird gelöscht:${NC}"
echo -e "  • Alle Container dieser Plattform"
echo -e "  • Alle Docker-Images dieser Plattform"
echo -e "  • Volumes: certbot-certs, certbot-webroot, nginx-logs"
echo ""
echo -e "  ${GREEN}Folgendes bleibt erhalten:${NC}"
echo -e "  • .env (deine Einstellungen)"
echo -e "  • postgres-data Volume (Nutzerdaten)"
echo ""

# Nur löschen wenn --force oder interaktive Bestätigung
FORCE=false
KEEP_DB=true

for arg in "$@"; do
  case $arg in
    --force|-f)   FORCE=true ;;
    --wipe-db)    KEEP_DB=false ;;
    --help|-h)
      echo "Verwendung: $0 [--force] [--wipe-db]"
      echo "  --force     Keine Bestätigung erforderlich"
      echo "  --wipe-db   Auch Datenbank-Volume löschen (alle Nutzer weg!)"
      exit 0
      ;;
  esac
done

if [[ "$FORCE" != "true" ]]; then
  if [[ "$KEEP_DB" == "false" ]]; then
    echo -e "  ${RED}⚠ ACHTUNG: --wipe-db löscht ALLE Nutzerdaten!${NC}"
  fi
  read -rp "  Wirklich zurücksetzen? [j/N] " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[jJyY]$ ]]; then
    echo "Abgebrochen."
    exit 0
  fi
fi

# ─── Schritt 1: Container stoppen und entfernen ───────────────
log_step "Container stoppen"
$DC down --remove-orphans 2>/dev/null || true
log_ok "Container gestoppt"

# ─── Schritt 2: Images löschen ───────────────────────────────
log_step "Docker Images löschen"
PROJECT="${COMPOSE_PROJECT_NAME:-supabase-auth}"
for img in $(docker images --filter "label=com.docker.compose.project=${PROJECT}" -q 2>/dev/null); do
  docker rmi -f "$img" 2>/dev/null && log_ok "Image entfernt: $img" || true
done
# Auch selbst gebaute Images nach Namen entfernen
for name in "${PROJECT}-frontend" "${PROJECT}-backend" "supabase-auth-frontend" "supabase-auth-backend"; do
  if docker image inspect "$name" &>/dev/null 2>&1; then
    docker rmi -f "$name" 2>/dev/null && log_ok "Image entfernt: $name" || true
  fi
done
log_ok "Images bereinigt"

# ─── Schritt 3: Volumes löschen (außer postgres-data) ────────
log_step "Volumes bereinigen"
VOLS_TO_DELETE=("${PROJECT}_certbot-certs" "${PROJECT}_certbot-webroot" "${PROJECT}_nginx-logs")
if [[ "$KEEP_DB" == "false" ]]; then
  VOLS_TO_DELETE+=("${PROJECT}_postgres-data")
  log_warn "Datenbank-Volume wird auch gelöscht!"
else
  log_info "postgres-data bleibt erhalten"
fi

for vol in "${VOLS_TO_DELETE[@]}"; do
  if docker volume inspect "$vol" &>/dev/null 2>&1; then
    docker volume rm "$vol" 2>/dev/null && log_ok "Volume entfernt: $vol" || true
  fi
done
log_ok "Volumes bereinigt"

# ─── Schritt 4: Nginx conf.d leeren ──────────────────────────
log_step "Nginx-Konfiguration zurücksetzen"
if [[ -d "./nginx/conf.d" ]]; then
  rm -f ./nginx/conf.d/*.conf 2>/dev/null || true
  log_ok "nginx/conf.d geleert"
fi

# ─── Schritt 5: Neu bauen & starten ──────────────────────────
log_step "Neu bauen"
$DC build --no-cache
log_ok "Build abgeschlossen"

log_step "Services starten"
$DC up -d
log_ok "Services gestartet"

# ─── Status anzeigen ─────────────────────────────────────────
echo ""
log_step "Status"
$DC ps

# IP ermitteln
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "  ${BOLD}Dashboard erreichbar unter:${NC}"
echo -e "  ${CYAN}http://${SERVER_IP}${NC}       (Port 80 via Nginx)"
echo -e "  ${CYAN}http://${SERVER_IP}:3000${NC}  (Port 3000 direkt)"
echo ""
echo -e "  ${GREEN}✓ Reset abgeschlossen!${NC}"
