#!/usr/bin/env bash
# =============================================================
# Supabase Auth Platform - Vollautomatischer Installer
# =============================================================
# Verwendung: sudo bash install.sh
# Das Skript installiert und konfiguriert die gesamte
# Supabase Auth Platform mit einem einzigen Befehl.
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
cat <<'EOF'
  ╔═══════════════════════════════════════════════╗
  ║   Supabase Auth Platform Installer v1.0       ║
  ║   Self-Hosted Authentication Dashboard        ║
  ╚═══════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# ─── Root-Check ──────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  log_warn "Nicht als Root ausgeführt. Manche Schritte könnten fehlschlagen."
  log_info "Empfehlung: sudo bash install.sh"
fi

# ─── Konfiguration (Voreinstellungen) ────────────────────────
INSTALL_DIR="${INSTALL_DIR:-$(pwd)}"
ENV_FILE="$INSTALL_DIR/.env"
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"

# =============================================================
# SCHRITT 1: System-Abhängigkeiten prüfen
# =============================================================
log_step "System-Abhängigkeiten prüfen"

check_command() {
  if command -v "$1" &>/dev/null; then
    log_ok "$1 gefunden: $(command -v "$1")"
    return 0
  else
    return 1
  fi
}

MISSING_DEPS=()

# Docker prüfen
if ! check_command docker; then
  MISSING_DEPS+=("docker")
  log_err "Docker nicht installiert"
fi

# Docker Compose prüfen (v2 Plugin oder v1 standalone)
if docker compose version &>/dev/null 2>&1; then
  log_ok "Docker Compose v2 (Plugin) verfügbar"
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  log_ok "Docker Compose v1 (Standalone) verfügbar"
  COMPOSE_CMD="docker-compose"
else
  MISSING_DEPS+=("docker-compose")
  log_err "Docker Compose nicht installiert"
fi

# Curl prüfen
if ! check_command curl; then
  log_warn "curl nicht installiert – einige Prüfungen werden übersprungen"
fi

# OpenSSL prüfen (für Secrets)
if ! check_command openssl; then
  MISSING_DEPS+=("openssl")
  log_err "openssl nicht installiert"
fi

# Fehlende Abhängigkeiten installieren?
if [[ ${#MISSING_DEPS[@]} -gt 0 ]]; then
  echo ""
  log_err "Fehlende Abhängigkeiten: ${MISSING_DEPS[*]}"
  echo ""
  read -rp "  Soll der Installer versuchen, diese automatisch zu installieren? (j/N): " auto_install
  if [[ "${auto_install,,}" == "j" ]]; then
    install_dependencies "${MISSING_DEPS[@]}"
  else
    echo ""
    log_err "Installation abgebrochen. Bitte installiere die fehlenden Abhängigkeiten manuell."
    echo ""
    echo "  Docker:  https://docs.docker.com/engine/install/"
    echo "  Compose: https://docs.docker.com/compose/install/"
    exit 1
  fi
fi

# Hilfsfunktion: Abhängigkeiten installieren
install_dependencies() {
  local deps=("$@")
  if command -v apt-get &>/dev/null; then
    # Debian/Ubuntu
    apt-get update -qq
    for dep in "${deps[@]}"; do
      case "$dep" in
        docker)
          curl -fsSL https://get.docker.com | sh
          systemctl enable --now docker
          ;;
        docker-compose)
          apt-get install -y docker-compose-plugin
          ;;
        openssl)
          apt-get install -y openssl
          ;;
      esac
    done
  elif command -v yum &>/dev/null; then
    # CentOS/RHEL
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
    log_err "Paketmanager nicht erkannt. Bitte manuell installieren."
    exit 1
  fi
}

log_ok "Alle Abhängigkeiten vorhanden"

# =============================================================
# SCHRITT 2: Konfiguration abfragen
# =============================================================
log_step "Konfiguration"

echo ""
echo -e "  ${BOLD}Domain-Konfiguration${NC}"
echo "  ─────────────────────────────────────────"

read -rp "  Deine Haupt-Domain (z.B. example.com): " USER_DOMAIN
if [[ -z "$USER_DOMAIN" ]]; then
  log_err "Domain ist erforderlich!"
  exit 1
fi

# Standard-Subdomains vorschlagen
DEFAULT_AUTH="auth.${USER_DOMAIN}"
DEFAULT_DASH="dashboard.${USER_DOMAIN}"

read -rp "  Auth-Subdomain [${DEFAULT_AUTH}]: " USER_AUTH_SUB
USER_AUTH_SUB="${USER_AUTH_SUB:-$DEFAULT_AUTH}"

read -rp "  Dashboard-Subdomain [${DEFAULT_DASH}]: " USER_DASH_SUB
USER_DASH_SUB="${USER_DASH_SUB:-$DEFAULT_DASH}"

echo ""
echo -e "  ${BOLD}Admin-Zugangsdaten${NC}"
echo "  ─────────────────────────────────────────"

read -rp "  Admin-Benutzername [admin]: " ADMIN_USER
ADMIN_USER="${ADMIN_USER:-admin}"

while true; do
  read -rsp "  Admin-Passwort (min. 12 Zeichen): " ADMIN_PASS
  echo ""
  if [[ ${#ADMIN_PASS} -ge 12 ]]; then
    break
  fi
  log_warn "Passwort zu kurz! Mindestens 12 Zeichen erforderlich."
done

echo ""
echo -e "  ${BOLD}Datenbank${NC}"
echo "  ─────────────────────────────────────────"

read -rp "  PostgreSQL Passwort (Enter = zufällig generieren): " PG_PASS
if [[ -z "$PG_PASS" ]]; then
  PG_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
  log_info "Zufälliges DB-Passwort generiert"
fi

echo ""
echo -e "  ${BOLD}E-Mail (für Certbot/SSL)${NC}"
echo "  ─────────────────────────────────────────"
read -rp "  E-Mail-Adresse für SSL-Zertifikate: " CERTBOT_MAIL

echo ""
echo -e "  ${BOLD}Optionale Features${NC}"
echo "  ─────────────────────────────────────────"
read -rp "  SSL via Let's Encrypt einrichten? (j/N): " SETUP_SSL
read -rp "  Cloudflare Tunnel konfigurieren? (j/N): " SETUP_TUNNEL

if [[ "${SETUP_TUNNEL,,}" == "j" ]]; then
  read -rp "  Cloudflare Tunnel Token (aus Cloudflare Dashboard): " CF_TOKEN
fi

# =============================================================
# SCHRITT 3: Secrets generieren
# =============================================================
log_step "Sichere Secrets generieren"

JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)
OPERATOR_TOKEN=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
ADMIN_JWT_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)

log_ok "JWT_SECRET generiert (48 Zeichen)"
log_ok "OPERATOR_TOKEN generiert (32 Zeichen)"
log_ok "ADMIN_JWT_SECRET generiert (32 Zeichen)"

# =============================================================
# SCHRITT 4: .env Datei erstellen
# =============================================================
log_step ".env Datei erstellen"

cat > "$ENV_FILE" <<ENV
# =============================================================
# Supabase Auth Platform - Konfiguration
# Generiert am: $(date)
# DIESE DATEI NICHT COMMITTEN! (enthält Secrets)
# =============================================================

# ─── Domain ──────────────────────────────────────────────────
DOMAIN=${USER_DOMAIN}
AUTH_SUBDOMAIN=${USER_AUTH_SUB}
DASHBOARD_SUBDOMAIN=${USER_DASH_SUB}

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
GOTRUE_SITE_URL=https://${USER_DOMAIN}
GOTRUE_API_EXTERNAL_URL=https://${USER_AUTH_SUB}

# E-Mail (optional, für Bestätigungs-Mails)
GOTRUE_SMTP_HOST=
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=
GOTRUE_SMTP_PASS=
GOTRUE_SMTP_ADMIN_EMAIL=${CERTBOT_MAIL:-noreply@${USER_DOMAIN}}
GOTRUE_MAILER_AUTOCONFIRM=true

# ─── Backend API ──────────────────────────────────────────────
BACKEND_PORT=4000
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
GOTRUE_URL=http://gotrue:9999
# CORS: Nur das Dashboard darf die API aufrufen
ALLOWED_ORIGINS=https://${USER_DASH_SUB}

# ─── Frontend ─────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=https://${USER_DASH_SUB}/api
FRONTEND_PORT=3000

# ─── Cloudflare Tunnel ────────────────────────────────────────
CLOUDFLARE_TUNNEL_TOKEN=${CF_TOKEN:-}
CLOUDFLARE_TUNNEL_NAME=supabase-auth-tunnel

# ─── Nginx ────────────────────────────────────────────────────
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
CERTBOT_EMAIL=${CERTBOT_MAIL}

# ─── Auto-Updates (Watchtower) ────────────────────────────────
WATCHTOWER_SLACK_WEBHOOK=

# ─── Docker ───────────────────────────────────────────────────
COMPOSE_PROJECT_NAME=supabase-auth
ENV

# Sicherheitsrechte setzen (nur root/owner darf lesen)
chmod 600 "$ENV_FILE"
log_ok ".env erstellt: $ENV_FILE"

# =============================================================
# SCHRITT 5: Nginx-Konfiguration vorbereiten
# =============================================================
log_step "Nginx-Konfiguration vorbereiten"

mkdir -p "$INSTALL_DIR/nginx/conf.d"

# Wenn noch kein SSL: HTTP-only Fallback-Config erstellen
# (wird nach SSL-Setup durch die Template-Config ersetzt)
cat > "$INSTALL_DIR/nginx/conf.d/default.conf" <<NGINX
# Temporäre HTTP-Konfiguration (bis SSL eingerichtet ist)
# Wird automatisch durch die SSL-Konfiguration ersetzt.

limit_req_zone \$binary_remote_addr zone=auth_limit:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=api_limit:10m rate=30r/s;

server {
    listen 80 default_server;
    server_name _;

    # Let's Encrypt ACME Challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Backend API
    location /api/ {
        limit_req zone=api_limit burst=50 nodelay;
        proxy_pass http://backend:4000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }

    # Dashboard Frontend
    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}

# Auth API (GoTrue) direkt auf Port 9999 intern
# Wird nach SSL-Setup via HTTPS auf ${USER_AUTH_SUB} exponiert
server {
    listen 80;
    server_name ${USER_AUTH_SUB};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        limit_req zone=auth_limit burst=20 nodelay;
        proxy_pass http://gotrue:9999;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

log_ok "Nginx HTTP-Konfiguration erstellt"

# =============================================================
# SCHRITT 6: Cloudflare-Verzeichnis erstellen
# =============================================================
mkdir -p "$INSTALL_DIR/cloudflare"

# =============================================================
# SCHRITT 7: Docker Images bauen und Container starten
# =============================================================
log_step "Docker Container bauen und starten"

cd "$INSTALL_DIR"

log_info "Docker Images werden gebaut (kann 2-5 Minuten dauern)…"
$COMPOSE_CMD build --no-cache

log_info "PostgreSQL und GoTrue starten…"
$COMPOSE_CMD up -d postgres
sleep 5

log_info "Warte auf PostgreSQL…"
for i in {1..30}; do
  if $COMPOSE_CMD exec postgres pg_isready -U supabase &>/dev/null; then
    log_ok "PostgreSQL bereit"
    break
  fi
  if [[ $i -eq 30 ]]; then
    log_err "PostgreSQL startet nicht. Logs:"
    $COMPOSE_CMD logs postgres
    exit 1
  fi
  sleep 2
done

log_info "GoTrue starten…"
$COMPOSE_CMD up -d gotrue
sleep 5

log_info "Warte auf GoTrue…"
for i in {1..30}; do
  if $COMPOSE_CMD exec gotrue wget -qO- http://localhost:9999/health &>/dev/null; then
    log_ok "GoTrue bereit"
    break
  fi
  sleep 3
done

log_info "Backend, Frontend und Nginx starten…"
$COMPOSE_CMD up -d

log_ok "Alle Container gestartet"

# Status anzeigen
echo ""
$COMPOSE_CMD ps

# =============================================================
# SCHRITT 8: SSL-Zertifikate anfordern (optional)
# =============================================================
if [[ "${SETUP_SSL,,}" == "j" ]]; then
  log_step "SSL-Zertifikate anfordern (Let's Encrypt)"

  log_info "Warte 10 Sekunden damit Nginx vollständig gestartet ist…"
  sleep 10

  log_info "DNS-Auflösung prüfen…"
  for domain in "$USER_DOMAIN" "$USER_AUTH_SUB" "$USER_DASH_SUB"; do
    if host "$domain" &>/dev/null; then
      log_ok "DNS für $domain auflösbar"
    else
      log_warn "DNS für $domain nicht auflösbar – bitte DNS-Records prüfen!"
    fi
  done

  log_info "Certbot-Zertifikate anfordern…"
  $COMPOSE_CMD run --rm \
    -v "$(pwd)/certbot-certs:/etc/letsencrypt" \
    -v "$(pwd)/certbot-webroot:/var/www/certbot" \
    certbot certonly \
      --webroot -w /var/www/certbot \
      --email "$CERTBOT_MAIL" \
      --agree-tos --no-eff-email \
      -d "$USER_DOMAIN" \
      -d "$USER_AUTH_SUB" \
      -d "$USER_DASH_SUB" || {
    log_warn "SSL-Zertifikat konnte nicht ausgestellt werden."
    log_info "Du kannst es später über das Dashboard versuchen (SSL → Neues Zertifikat)."
    log_info "DNS-Records müssen auf diesen Server zeigen, bevor SSL funktioniert."
  }

  if [[ -d "certbot-certs/live/$USER_DOMAIN" ]]; then
    log_ok "SSL-Zertifikat erfolgreich ausgestellt!"

    # Nginx SSL-Konfiguration aktivieren
    log_info "Nginx SSL-Konfiguration wird aktiviert…"
    envsubst '${DOMAIN} ${AUTH_SUBDOMAIN} ${DASHBOARD_SUBDOMAIN}' \
      < "$INSTALL_DIR/nginx/templates/default.conf.template" \
      > "$INSTALL_DIR/nginx/conf.d/default.conf"

    $COMPOSE_CMD restart nginx
    log_ok "Nginx mit SSL neu gestartet"

    # Auto-Renewal Cron einrichten
    log_info "Auto-Renewal Cron-Job einrichten…"
    CRON_JOB="0 0 * * 0 cd $INSTALL_DIR && $COMPOSE_CMD run --rm certbot renew --quiet && $COMPOSE_CMD restart nginx"
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab - || log_warn "Cron-Job konnte nicht eingerichtet werden"
    log_ok "Auto-Renewal Cron (wöchentlich) eingerichtet"
  fi
fi

# =============================================================
# SCHRITT 9: Cloudflare Tunnel starten (optional)
# =============================================================
if [[ "${SETUP_TUNNEL,,}" == "j" ]] && [[ -n "${CF_TOKEN:-}" ]]; then
  log_step "Cloudflare Tunnel starten"
  $COMPOSE_CMD --profile tunnel up -d cloudflared
  log_ok "Cloudflare Tunnel gestartet"
fi

# =============================================================
# SCHRITT 10: Firewall-Regeln setzen (optional)
# =============================================================
log_step "Firewall-Konfiguration"

if command -v ufw &>/dev/null; then
  log_info "UFW Firewall gefunden"
  read -rp "  Firewall-Regeln automatisch setzen (Port 80, 443)? (j/N): " setup_fw
  if [[ "${setup_fw,,}" == "j" ]]; then
    ufw allow 22/tcp   # SSH
    ufw allow 80/tcp   # HTTP
    ufw allow 443/tcp  # HTTPS
    ufw --force enable
    log_ok "Firewall konfiguriert (Ports 22, 80, 443 offen)"
  fi
elif command -v firewall-cmd &>/dev/null; then
  log_info "firewalld gefunden"
  read -rp "  Firewall-Regeln automatisch setzen? (j/N): " setup_fw
  if [[ "${setup_fw,,}" == "j" ]]; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    log_ok "Firewall konfiguriert"
  fi
else
  log_warn "Kein bekannter Firewall-Manager gefunden"
  log_info "Stelle sicher, dass Port 80 und 443 geöffnet sind!"
fi

# =============================================================
# SCHRITT 11: System-Sicherheit härten
# =============================================================
log_step "System-Sicherheit härten"

# ─── unattended-upgrades (automatische Sicherheits-Updates) ──
if command -v apt-get &>/dev/null; then
  read -rp "  Automatische Sicherheits-Updates einrichten (unattended-upgrades)? (J/n): " setup_unattended
  if [[ "${setup_unattended,,}" != "n" ]]; then
    apt-get install -y -qq unattended-upgrades apt-listchanges

    # Konfiguration schreiben
    cat > /etc/apt/apt.conf.d/20auto-upgrades <<'AUTOUPGRADE'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
AUTOUPGRADE

    cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'UNATTENDED'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Mail "root";
UNATTENDED

    systemctl enable --now unattended-upgrades &>/dev/null || true
    log_ok "unattended-upgrades eingerichtet (täglich, nur Security-Updates)"
  fi

  # ─── Fail2ban (Brute-Force-Schutz) ──────────────────────────
  read -rp "  Fail2ban zum Schutz vor Brute-Force-Angriffen installieren? (J/n): " setup_fail2ban
  if [[ "${setup_fail2ban,,}" != "n" ]]; then
    apt-get install -y -qq fail2ban

    # Jail-Konfiguration für SSH und Nginx
    cat > /etc/fail2ban/jail.d/supabase-auth.conf <<FAIL2BAN
[DEFAULT]
bantime  = 3600
findtime  = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port    = ssh
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
port    = http,https
logpath = /var/log/nginx/error.log
maxretry = 5

[nginx-limit-req]
enabled = true
port    = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
findtime = 60
FAIL2BAN

    systemctl enable --now fail2ban &>/dev/null || true
    systemctl restart fail2ban &>/dev/null || true
    log_ok "Fail2ban eingerichtet (SSH + Nginx geschützt)"
  fi
else
  log_warn "Überspringe unattended-upgrades/fail2ban (kein apt-get gefunden)"
  log_info "Für andere Distros: dnf-automatic (RHEL/CentOS) verwenden"
fi

# ─── SSH Hardening Hinweis ────────────────────────────────────
log_info "SSH-Sicherheitsempfehlungen:"
log_info "  • Passwort-Login deaktivieren: PasswordAuthentication no"
log_info "  • Root-Login deaktivieren: PermitRootLogin no"
log_info "  • SSH-Key statt Passwort verwenden"
log_info "  Datei: /etc/ssh/sshd_config"

# =============================================================
# ABSCHLUSS: Zusammenfassung
# =============================================================
echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Installation erfolgreich abgeschlossen!${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}URLs:${NC}"
echo -e "  Dashboard:  ${CYAN}http${[[ "${SETUP_SSL,,}" == "j" ]] && echo "s"}://${USER_DASH_SUB}${NC}"
echo -e "  Auth API:   ${CYAN}http${[[ "${SETUP_SSL,,}" == "j" ]] && echo "s"}://${USER_AUTH_SUB}${NC}"
echo ""
echo -e "  ${BOLD}Login-Daten:${NC}"
echo -e "  Benutzername: ${YELLOW}${ADMIN_USER}${NC}"
echo -e "  Passwort:     ${YELLOW}(dein gewähltes Passwort)${NC}"
echo ""
echo -e "  ${BOLD}Nächste Schritte:${NC}"
echo -e "  1. DNS-Records einrichten (A-Records → Server-IP)"
echo -e "  2. Dashboard öffnen und erste Benutzer anlegen"
echo -e "  3. SSL-Zertifikate im Dashboard beantragen"
echo -e "  4. SMTP für E-Mail-Bestätigung konfigurieren"
echo ""
echo -e "  ${BOLD}Nützliche Befehle:${NC}"
echo -e "  Logs:      ${CYAN}$COMPOSE_CMD logs -f${NC}"
echo -e "  Status:    ${CYAN}$COMPOSE_CMD ps${NC}"
echo -e "  Stoppen:   ${CYAN}$COMPOSE_CMD down${NC}"
echo -e "  Starten:   ${CYAN}$COMPOSE_CMD up -d${NC}"
echo ""
echo -e "  ${RED}WICHTIG:${NC} Die .env-Datei enthält Secrets!"
echo -e "  Backup erstellen: ${CYAN}cp $ENV_FILE $ENV_FILE.backup${NC}"
echo ""
