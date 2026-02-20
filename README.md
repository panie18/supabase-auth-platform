# Supabase Auth Platform

Self-Hosted Supabase Authentication Platform mit modernem Admin-Dashboard.

## Schnellstart

```bash
# 1. Repository klonen / Dateien herunterladen
cd supabase-auth-platform

# 2. Installer ausführen (interaktiv)
sudo bash install.sh
```

Der Installer:
- Prüft Docker & Docker Compose
- Fragt Domain, Admin-Zugangsdaten und optionale Features ab
- Generiert alle Secrets automatisch
- Startet alle Container
- Richtet optional SSL (Let's Encrypt) und Cloudflare Tunnel ein

---

## Projektstruktur

```
supabase-auth-platform/
├── install.sh              # Vollautomatischer Installer
├── docker-compose.yml      # Alle Services
├── .env.example            # ENV-Template
├── .env                    # Deine Konfiguration (wird generiert)
├── nginx/
│   ├── templates/          # Nginx-Templates (mit SSL)
│   └── conf.d/             # Aktive Nginx-Configs
├── postgres/
│   └── init.sql            # DB-Initialisierung
├── backend/                # Node.js Management API
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── middleware/
│       │   └── adminAuth.js
│       └── routes/
│           ├── auth.js         # Login/Logout
│           ├── users.js        # Benutzerverwaltung (GoTrue)
│           ├── docker.js       # Container-Management
│           ├── domains.js      # Domain/Nginx-Config
│           ├── ssl.js          # SSL-Zertifikate (Certbot)
│           └── tunnel.js       # Cloudflare Tunnel
└── frontend/               # Next.js Dashboard
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── app/
        │   ├── login/          # Admin-Login
        │   └── dashboard/
        │       ├── page.tsx        # Übersicht
        │       ├── users/          # Benutzerverwaltung
        │       ├── domains/        # Domain-Config
        │       ├── ssl/            # SSL-Status
        │       ├── tunnel/         # Cloudflare Tunnel
        │       ├── containers/     # Docker Container
        │       └── logs/           # Log-Viewer
        ├── components/
        │   ├── ui/             # ShadCN Komponenten
        │   └── layout/         # Sidebar, Header
        ├── lib/
        │   ├── api.ts          # API-Client
        │   ├── auth.ts         # JWT-Auth
        │   └── utils.ts        # Hilfsfunktionen
        └── types/index.ts      # TypeScript Types
```

---

## Services

| Service | Port (intern) | Beschreibung |
|---------|--------------|--------------|
| `postgres` | 5432 | PostgreSQL Datenbank |
| `gotrue` | 9999 | Supabase Auth (GoTrue) |
| `backend` | 4000 | Management API (Node.js) |
| `frontend` | 3000 | Admin Dashboard (Next.js) |
| `nginx` | 80, 443 | Reverse Proxy |
| `cloudflared` | – | Cloudflare Tunnel (optional) |
| `certbot` | – | SSL-Zertifikate (on-demand) |

---

## DNS-Konfiguration

Richte bei deinem DNS-Provider folgende A-Records ein:

```
A  yourdomain.com          → DEINE_SERVER_IP
A  auth.yourdomain.com     → DEINE_SERVER_IP
A  dashboard.yourdomain.com → DEINE_SERVER_IP
```

---

## Manuelle Installation (ohne Installer)

```bash
# 1. .env erstellen
cp .env.example .env
nano .env  # Werte anpassen

# 2. Container starten
docker compose up -d

# 3. SSL anfordern (optional)
docker compose --profile ssl run certbot

# 4. Cloudflare Tunnel (optional)
docker compose --profile tunnel up -d cloudflared
```

---

## Nützliche Befehle

```bash
# Alle Container sehen
docker compose ps

# Logs eines Services
docker compose logs -f gotrue
docker compose logs -f backend
docker compose logs -f nginx

# Container neu starten
docker compose restart nginx

# Alles stoppen
docker compose down

# Alles stoppen und Volumes löschen (ACHTUNG: Daten gehen verloren!)
docker compose down -v

# SSL erneuern
docker compose --profile ssl run certbot renew
docker compose restart nginx
```

---

## GoTrue API Endpunkte

Die Auth-API ist unter `https://auth.yourdomain.com` erreichbar:

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| POST | `/auth/v1/signup` | Benutzer registrieren |
| POST | `/auth/v1/token?grant_type=password` | Login |
| POST | `/auth/v1/logout` | Abmelden |
| GET | `/auth/v1/user` | Aktueller Benutzer |
| PUT | `/auth/v1/user` | Benutzer aktualisieren |

---

## Sicherheitshinweise

- Die `.env`-Datei enthält alle Secrets – **nie committen!**
- `JWT_SECRET` und `OPERATOR_TOKEN` sind automatisch generiert
- Das Dashboard ist nur für Admins zugänglich (JWT-geschützt)
- Nginx Rate-Limiting schützt vor Brute-Force-Angriffen
- Der Docker-Socket ist read-only eingehängt

---

## Lizenz

MIT License
