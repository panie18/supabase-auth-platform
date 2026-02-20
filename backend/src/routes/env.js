'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

// .env liegt im Projekt-Root (wird via Volume eingehängt)
const ENV_FILE = process.env.ENV_FILE_PATH || '/app/.env';

// Felder, die im UI als "Secret" maskiert werden sollen (Wert nie im Klartext zurückgeben)
const SECRET_KEYS = [
  'POSTGRES_PASSWORD',
  'GOTRUE_JWT_SECRET',
  'GOTRUE_OPERATOR_TOKEN',
  'ADMIN_PASSWORD',
  'ADMIN_JWT_SECRET',
  'GOTRUE_SMTP_PASS',
  'CLOUDFLARE_TUNNEL_TOKEN',
];

// Felder die nicht editiert werden dürfen (intern)
const READONLY_KEYS = ['DATABASE_URL'];

/**
 * .env-Datei parsen → Array von { key, value, comment, isSecret, isReadonly }
 */
function parseEnv(content) {
  const lines = content.split('\n');
  const result = [];
  let pendingComment = '';

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Kommentarzeile oder Abschnitts-Trenner
    if (line.startsWith('#') || line.trim() === '') {
      if (line.startsWith('# ─') || line.startsWith('# =') || line.trim() === '') {
        // Abschnitts-Trenner: als group separator
        result.push({ type: 'separator', text: line });
        pendingComment = '';
      } else {
        pendingComment = line.replace(/^#\s?/, '');
      }
      continue;
    }

    // KEY=VALUE
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();

    result.push({
      type: 'var',
      key,
      value: SECRET_KEYS.includes(key) ? '' : value, // Secrets werden nicht zurückgegeben
      raw_value: value, // Interner Wert (nicht zum Client)
      comment: pendingComment,
      isSecret: SECRET_KEYS.includes(key),
      isReadonly: READONLY_KEYS.includes(key),
      hasValue: value !== '',
    });
    pendingComment = '';
  }

  return result;
}

/**
 * Array von Vars → .env-String
 */
function serializeEnv(entries, originalContent) {
  // Originaldatei als Basis nehmen und nur die geänderten Werte ersetzen
  let content = originalContent;
  for (const entry of entries) {
    if (!entry.key || entry.isReadonly) continue;
    const regex = new RegExp(`^${entry.key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${entry.key}=${entry.value}`);
    } else {
      content += `\n${entry.key}=${entry.value}`;
    }
  }
  return content;
}

/**
 * GET /env
 * Gibt geparste .env zurück (Secrets werden NICHT im Klartext geliefert)
 */
router.get('/', async (req, res) => {
  try {
    const content = await fs.readFile(ENV_FILE, 'utf8');
    const entries = parseEnv(content);

    // raw_value aus der Antwort entfernen (niemals zum Client)
    const safe = entries.map(({ raw_value, ...e }) => e);

    res.json({
      entries: safe,
      file: ENV_FILE,
      writable: true,
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.json({ entries: [], file: ENV_FILE, writable: false, error: '.env nicht gefunden' });
    }
    throw err;
  }
});

/**
 * GET /env/raw
 * Gibt die rohe .env-Datei zurück (Secrets als *** maskiert)
 */
router.get('/raw', async (req, res) => {
  try {
    let content = await fs.readFile(ENV_FILE, 'utf8');

    // Secrets in der Raw-Ausgabe maskieren
    for (const key of SECRET_KEYS) {
      content = content.replace(
        new RegExp(`^(${key}=).+$`, 'm'),
        (_, prefix) => `${prefix}***HIDDEN***`
      );
    }

    res.json({ content, file: ENV_FILE });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.json({ content: '', file: ENV_FILE, error: '.env nicht gefunden' });
    }
    throw err;
  }
});

/**
 * PUT /env
 * Einzelne oder mehrere Variablen aktualisieren
 * Body: { updates: [{ key, value }] }
 * Secrets können mit leerem Wert '' übergeben werden → werden dann NICHT überschrieben
 */
router.put('/', async (req, res) => {
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'updates-Array erforderlich' });
  }

  // Readonly-Keys filtern
  const filtered = updates.filter(u => !READONLY_KEYS.includes(u.key));

  // Aktuelle .env lesen
  let content = '';
  try {
    content = await fs.readFile(ENV_FILE, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // Jede Variable aktualisieren
  for (const { key, value } of filtered) {
    if (!key) continue;

    // Leerer Wert bei Secret → nicht überschreiben (Benutzer hat es nicht geändert)
    if (SECRET_KEYS.includes(key) && value === '') continue;

    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }

    // Auch im laufenden Prozess aktualisieren
    process.env[key] = value;
  }

  // .env schreiben
  await fs.writeFile(ENV_FILE, content, { mode: 0o600 });

  res.json({
    success: true,
    message: `${filtered.length} Variable(n) aktualisiert. Neustart für vollständige Wirkung empfohlen.`,
    updated: filtered.map(u => u.key),
    restart_recommended: true,
  });
});

/**
 * PUT /env/raw
 * Gesamte .env-Datei als Rohtext ersetzen (nur nicht-maskierte Inhalte)
 * Body: { content }
 */
router.put('/raw', async (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content erforderlich' });
  }

  // Sicherheit: Sicherstellen dass keine HIDDEN-Marker überschrieben werden
  if (content.includes('***HIDDEN***')) {
    return res.status(400).json({
      error: 'Maskierte Secret-Felder (***HIDDEN***) müssen zuerst entfernt oder befüllt werden',
    });
  }

  await fs.writeFile(ENV_FILE, content, { mode: 0o600 });

  res.json({
    success: true,
    message: '.env-Datei gespeichert. Container-Neustart für vollständige Wirkung erforderlich.',
    restart_recommended: true,
  });
});

/**
 * POST /env/restart-services
 * Startet alle Docker-Container neu (damit neue ENV-Werte aktiv werden)
 */
router.post('/restart-services', async (req, res) => {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  try {
    // docker compose restart via Docker CLI
    await execFileAsync('docker', ['compose', 'restart'], {
      cwd: path.dirname(ENV_FILE.replace('.env', '')),
      timeout: 60000,
    });
    res.json({ success: true, message: 'Alle Container neu gestartet' });
  } catch (err) {
    // Fallback: einzelne Container per Dockerode neustarten
    res.json({
      success: false,
      message: 'Automatischer Neustart fehlgeschlagen – bitte manuell neustarten',
      error: err.message,
    });
  }
});

module.exports = router;
