#!/usr/bin/env bash
# =============================================================
# Supabase Auth Platform - Installer
# =============================================================
# Verwendung: sudo bash install.sh
#
# Der Installer fragt nur das Minimum ab:
#   - Server-IP / Domain
#   - Admin-Passwort
# Alles andere (Subdomain, SSL, Cloudflare, SMTP etc.)
# wird im Dashboard-Onboarding konfiguriert.
# =============================================================

set -euo pipefail

# ─── Farben ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log_step() { echo -e "\n${BOLD}${BLUE}▶ $1${NC}"; }
log_ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_err()  { echo -e "  ${RED}✗${NC} $1"; }
log_info() { echo -e "  ${CYAN}ℹ${NC} $1"; }

# ─── Banner ──────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
cat <<'BANNER'
  ╔═══════════════════════════════════════════════╗
  ║   Supabase Auth Platform Installer v1.1       ║
  ║   Self-Hosted Authentication Dashboard        ║
  ╚═══════════════════════════════════════════════╝
BANNER
echo -e "${NC}"

# ─── Root-Check ──────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  log_warn "Nicht als Root ausgeführt. Bitte mit sudo starten."
  log_info "Empfehlung: sudo bash install.sh"
  exit 1
fi

INSTALL_DIR="${INSTALL_DIR:-$(pwd)}"
ENV_FILE="$INSTALL_DIR/.env"

# =============================================================
# SCHRITT 1: Funktionen definieren (müssen VOR Aufrufen stehen)
# =============================================================

# Prüft ob ein Befehl verfügbar ist
check_command() {
  if command -v "$1" &>/dev/null; then
    log_ok "$1 gefunden"
    return 0
  else
    return 1
  fi
}

# Installiert fehlende Abhängigkeiten
install_dependencies() {
  local deps=("$@")
  if command -v apt-get &>/dev/null; then
    apt-get update -qq
    for dep in "${deps[@]}"; do
      case "$dep" in
        docker)
          log_info "Installiere Docker…"
          curl -fsSL https://get.docker.com | sh
          systemctl enable --now docker
          log_ok "Docker installiert"
          ;;
        docker-compose-plugin)
          apt-get install -y -qq docker-compose-plugin
          log_ok "Docker Compose Plugin installiert"
          ;;
        openssl)
          apt-get install -y -qq openssl
          log_ok "openssl installiert"
          ;;
      esac
    done
  elif command -v yum &>/dev/null; then
    for dep in "${deps[@]}"; do
      case "$dep" in
        docker)
          yum install -y docker
          systemctl enable --now docker
          ;;
        openssl)
          yum install -y openssl
          ;;
      esac
    done
  else
    log_err "Paketmanager nicht erkannt (kein apt-get / yum)."
    log_info "Bitte Docker und openssl manuell installieren:"
    log_info "  https://docs.docker.com/engine/install/"
    exit 1
  fi
}

# =============================================================
# SCHRITT 2: System-Abhängigkeiten prüfen
# =============================================================
log_step "System-Abhängigkeiten prüfen"

# FIX: COMPOSE_CMD mit leerem Standardwert initialisieren
# → verhindert "unbound variable" bei set -u
COMPOSE_CMD=""
MISSING_DEPS=()

if ! check_command docker; then
  MISSING_DEPS+=("docker")
  log_err "Docker nicht installiert"
fi

# Docker Compose: v2 Plugin bevorzugt, v1 als Fallback
if docker compose version &>/dev/null 2>&1; then
  log_ok "Docker Compose v2 (Plugin) verfügbar"
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  log_ok "Docker Compose v1 (Standalone) verfügbar"
  COMPOSE_CMD="docker-compose"
else
  MISSING_DEPS+=("docker-compose-plugin")
  log_err "Docker Compose nicht installiert"
fi

if ! check_command openssl; then
  MISSING_DEPS+=("openssl")
  log_err "openssl nicht installiert"
fi

if ! check_command curl; then
  log_warn "curl nicht gefunden – wird für Docker-Installation benötigt"
  MISSING_DEPS+=("curl")
fi

# Fehlende Dependencies installieren
if [[ ${#MISSING_DEPS[@]} -gt 0 ]]; then
  echo ""
  log_warn "Fehlende Abhängigkeiten: ${MISSING_DEPS[*]}"
  read -rp "  Automatisch installieren? (J/n): " auto_install
  if [[ "${auto_install,,}" != "n" ]]; then
    install_dependencies "${MISSING_DEPS[@]}"
    # Nach Installation erneut prüfen
    if docker compose version &>/dev/null 2>&1; then
      COMPOSE_CMD="docker compose"
    elif command -v docker-compose &>/dev/null; then
      COMPOSE_CMD="docker-compose"
    fi
  else
    log_err "Bitte die Abhängigkeiten manuell installieren und erneut starten."
    exit 1
  fi
fi

# Sicherstellen dass COMPOSE_CMD jetzt gesetzt ist
if [[ -z "$COMPOSE_CMD" ]]; then
  log_err "Docker Compose nicht gefunden – kann nicht fortfahren."
  exit 1
fi

log_ok "Alle Abhängigkeiten vorhanden"
log_info "Docker Compose Befehl: ${COMPOSE_CMD}"

# =============================================================
# SCHRITT 3: Minimale Konfiguration abfragen
# (Alles Weitere im Dashboard-Onboarding konfigurieren!)
# =============================================================
log_step "Minimale Konfiguration"
echo ""
echo -e "  ${CYAN}Tipp: Domain, Subdomain, SSL, Cloudflare & SMTP${NC}"
echo -e "  ${CYAN}werden nach dem Start im Dashboard-Onboarding${NC}"
echo -e "  ${CYAN}bequem per Klick konfiguriert.${NC}"
echo ""
echo "  ─────────────────────────────────────────────"

# Server-IP automatisch ermitteln
SERVER_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
log_info "Erkannte Server-IP: ${SERVER_IP}"

read -rp "  Deine Domain (z.B. example.com, Enter für IP-Modus): " USER_DOMAIN
USER_DOMAIN="${USER_DOMAIN:-$SERVER_IP}"

echo ""
echo -e "  ${BOLD}Admin-Login für das Dashboard${NC}"
echo "  ─────────────────────────────────────────────"

read -rp "  Admin-Benutzername [admin]: " ADMIN_USER
ADMIN_USER="${ADMIN_USER:-admin}"

while true; do
  read -rsp "  Admin-Passwort (min. 12 Zeichen): " ADMIN_PASS
  echo ""
  if [[ ${#ADMIN_PASS} -ge 12 ]]; then
    break
  fi
  log_warn "Passwort zu kurz – mindestens 12 Zeichen!"
done

# Standard-Subdomains ableiten
AUTH_SUB="auth.${USER_DOMAIN}"
DASH_SUB="dashboard.${USER_DOMAIN}"

# Bei IP-Modus: Subdomains können nicht funktionieren → Port-Modus
IS_IP=false
if [[ "$USER_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  IS_IP=true
  AUTH_SUB="${USER_DOMAIN}"
  DASH_SUB="${USER_DOMAIN}"
  log_info "IP-Modus erkannt – Dashboard läuft auf http://${USER_DOMAIN}:80"
fi

# =============================================================
# SCHRITT 4: Secrets generieren
# =============================================================
log_step "Sichere Secrets generieren"

JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)
OPERATOR_TOKEN=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
ADMIN_JWT_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
PG_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)

log_ok "JWT_SECRET generiert"
log_ok "OPERATOR_TOKEN generiert"
log_ok "ADMIN_JWT_SECRET generiert"
log_ok "PostgreSQL-Passwort generiert"

# =============================================================
# SCHRITT 5: .env Datei erstellen
# =============================================================
log_step ".env Datei erstellen"

cat > "$ENV_FILE" <<ENV
# =============================================================
# Supabase Auth Platform – Konfiguration
# Generiert am: $(date)
# ONBOARDING_DONE=false  ← wird vom Dashboard auf true gesetzt
# =============================================================

# ─── Onboarding-Status ────────────────────────────────────────
# false = Dashboard zeigt Einrichtungsassistenten
ONBOARDING_DONE=false

# ─── Domain ──────────────────────────────────────────────────
DOMAIN=${USER_DOMAIN}
AUTH_SUBDOMAIN=${AUTH_SUB}
DASHBOARD_SUBDOMAIN=${DASH_SUB}

# ─── PostgreSQL ───────────────────────────────────────────────
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=supabase_auth
POSTGRES_USER=supabase
POSTGRES_PASSWORD=${PG_PASS}
DATABASE_URL=postgres://supabase:${PG_PASS}@postgres:5432/supabase_auth

# ─── GoTrue (Supabase Auth) ──────────────────────────────────
GOTRUE_JWT_SECRET=${JWT_SECRET}
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_JWT_AUD=authenticated
GOTRUE_OPERATOR_TOKEN=${OPERATOR_TOKEN}
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_SITE_URL=http://${USER_DOMAIN}
GOTRUE_API_EXTERNAL_URL=http://${AUTH_SUB}

# E-Mail – im Dashboard konfigurieren
GOTRUE_SMTP_HOST=
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=
GOTRUE_SMTP_PASS=
GOTRUE_SMTP_ADMIN_EMAIL=noreply@${USER_DOMAIN}
GOTRUE_MAILER_AUTOCONFIRM=true

# ─── Backend API ──────────────────────────────────────────────
BACKEND_PORT=4000
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
GOTRUE_URL=http://gotrue:9999
ALLOWED_ORIGINS=http://${DASH_SUB},https://${DASH_SUB}

# ─── Frontend ─────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=/api
FRONTEND_PORT=3000

# ─── Cloudflare Tunnel – im Dashboard konfigurieren ──────────
CLOUDFLARE_TUNNEL_TOKEN=
CLOUDFLARE_TUNNEL_NAME=supabase-auth-tunnel

# ─── Nginx ────────────────────────────────────────────────────
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
CERTBOT_EMAIL=

# ─── Auto-Updates (Watchtower) ────────────────────────────────
WATCHTOWER_SLACK_WEBHOOK=

# ─── Docker ───────────────────────────────────────────────────
COMPOSE_PROJECT_NAME=supabase-auth
ENV

chmod 660 "$ENV_FILE"
log_ok ".env erstellt: $ENV_FILE"

# =============================================================
# SCHRITT 6: Nginx HTTP-Konfiguration erstellen
# =============================================================
log_step "Nginx-Basiskonfiguration"
mkdir -p "$INSTALL_DIR/nginx/conf.d" "$INSTALL_DIR/cloudflare"

cat > "$INSTALL_DIR/nginx/conf.d/default.conf" <<'NGINX'
# HTTP-Basiskonfiguration (SSL wird im Dashboard konfiguriert)
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

server {
    listen 80 default_server;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://backend:4000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name ~^auth\.;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        limit_req zone=auth burst=20 nodelay;
        proxy_pass http://gotrue:9999;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

log_ok "Nginx-Konfiguration erstellt"

# =============================================================
# SCHRITT 7: Docker Container bauen und starten
# =============================================================
log_step "Docker Container bauen und starten"

cd "$INSTALL_DIR"

log_info "Docker Images werden gebaut (2–5 Minuten)…"
$COMPOSE_CMD build --no-cache

log_info "PostgreSQL starten und warten…"
$COMPOSE_CMD up -d postgres

for i in {1..30}; do
  if $COMPOSE_CMD exec -T postgres pg_isready -U supabase &>/dev/null; then
    log_ok "PostgreSQL bereit"
    break
  fi
  if [[ $i -eq 30 ]]; then
    log_err "PostgreSQL startet nicht!"
    $COMPOSE_CMD logs postgres
    exit 1
  fi
  sleep 2
done

log_info "GoTrue starten und warten…"
$COMPOSE_CMD up -d gotrue
sleep 5

for i in {1..20}; do
  if $COMPOSE_CMD exec -T gotrue wget -qO- http://localhost:9999/health &>/dev/null; then
    log_ok "GoTrue bereit"
    break
  fi
  sleep 3
done

log_info "Backend, Frontend, Nginx starten…"
$COMPOSE_CMD up -d

log_ok "Alle Container gestartet"
echo ""
$COMPOSE_CMD ps

# =============================================================
# SCHRITT 8: Firewall (optional)
# =============================================================
log_step "Firewall-Konfiguration"

if command -v ufw &>/dev/null; then
  read -rp "  UFW-Firewall einrichten (Port 22, 80, 443)? (J/n): " setup_fw
  if [[ "${setup_fw,,}" != "n" ]]; then
    ufw allow 22/tcp comment "SSH"
    ufw allow 80/tcp comment "HTTP"
    ufw allow 443/tcp comment "HTTPS"
    ufw --force enable
    log_ok "UFW konfiguriert"
  fi
elif command -v firewall-cmd &>/dev/null; then
  read -rp "  firewalld einrichten? (J/n): " setup_fw
  if [[ "${setup_fw,,}" != "n" ]]; then
    firewall-cmd --permanent --add-service={http,https,ssh}
    firewall-cmd --reload
    log_ok "firewalld konfiguriert"
  fi
else
  log_warn "Kein Firewall-Manager – bitte Port 80 und 443 manuell öffnen"
fi

# =============================================================
# SCHRITT 9: System-Sicherheit (Debian/Ubuntu)
# =============================================================
if command -v apt-get &>/dev/null; then
  log_step "System-Sicherheit härten"

  read -rp "  Automatische Sicherheits-Updates einrichten? (J/n): " setup_unattended
  if [[ "${setup_unattended,,}" != "n" ]]; then
    apt-get install -y -qq unattended-upgrades
    echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";' > /etc/apt/apt.conf.d/20auto-upgrades
    systemctl enable --now unattended-upgrades &>/dev/null || true
    log_ok "unattended-upgrades aktiviert"
  fi

  read -rp "  Fail2ban (Brute-Force-Schutz) installieren? (J/n): " setup_f2b
  if [[ "${setup_f2b,,}" != "n" ]]; then
    apt-get install -y -qq fail2ban
    cat > /etc/fail2ban/jail.d/supabase-auth.conf <<'F2B'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
maxretry = 3

[nginx-limit-req]
enabled = true
port    = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
F2B
    systemctl enable --now fail2ban &>/dev/null || true
    log_ok "Fail2ban eingerichtet"
  fi
fi

# =============================================================
# ABSCHLUSS
# =============================================================
PROTO="http"

echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Installation abgeschlossen!${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Dashboard öffnen:${NC}"
if $IS_IP; then
  echo -e "  ${CYAN}${PROTO}://${USER_DOMAIN}${NC}  (Port 80)"
else
  echo -e "  ${CYAN}${PROTO}://${DASH_SUB}${NC}"
fi
echo ""
echo -e "  ${BOLD}Login:${NC}"
echo -e "  Benutzername: ${YELLOW}${ADMIN_USER}${NC}"
echo -e "  Passwort:     ${YELLOW}(dein gewähltes Passwort)${NC}"
echo ""
echo -e "  ${BOLD}${CYAN}Nach dem Login startet der Einrichtungsassistent:${NC}"
echo -e "  • Domain & Subdomains konfigurieren"
echo -e "  • SSL-Zertifikat beantragen"
echo -e "  • Cloudflare Tunnel einrichten"
echo -e "  • SMTP / E-Mail konfigurieren"
echo ""
echo -e "  ${BOLD}Nützliche Befehle:${NC}"
echo -e "  Logs:    ${CYAN}${COMPOSE_CMD} logs -f${NC}"
echo -e "  Status:  ${CYAN}${COMPOSE_CMD} ps${NC}"
echo -e "  Stop:    ${CYAN}${COMPOSE_CMD} down${NC}"
echo ""
echo -e "  ${RED}WICHTIG:${NC} .env enthält Secrets → sicher aufbewahren!"
echo -e "  Backup:  ${CYAN}cp ${ENV_FILE} ${ENV_FILE}.backup${NC}"
echo ""
