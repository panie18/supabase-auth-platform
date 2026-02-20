-- =============================================================
-- PostgreSQL Initialisierungs-SQL für GoTrue (Supabase Auth)
-- Wird beim ersten Start automatisch ausgeführt
-- =============================================================

-- GoTrue Schema erstellen (wird von GoTrue selbst migriert,
-- aber wir stellen sicher, dass die Erweiterungen vorhanden sind)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schema für GoTrue
CREATE SCHEMA IF NOT EXISTS auth;

-- Berechtigungen
GRANT ALL PRIVILEGES ON SCHEMA auth TO supabase;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO supabase;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO supabase;
