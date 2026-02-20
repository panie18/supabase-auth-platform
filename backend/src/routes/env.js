'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const ENV_FILE = process.env.ENV_FILE_PATH || '/app/.env';

const SECRET_KEYS = [
  'POSTGRES_PASSWORD', 'GOTRUE_JWT_SECRET', 'GOTRUE_OPERATOR_TOKEN',
  'ADMIN_PASSWORD', 'ADMIN_JWT_SECRET', 'GOTRUE_SMTP_PASS', 'CLOUDFLARE_TUNNEL_TOKEN',
];
const READONLY_KEYS = ['DATABASE_URL'];

// FIX: Erlaubte Key-Namen (nur Großbuchstaben, Ziffern, Unterstrich)
const VALID_KEY_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

function validateKey(key) {
  if (!key || !VALID_KEY_RE.test(key)) {
    const err = new Error(`Ungültiger ENV-Key: "${key}" (nur A-Z, 0-9, _ erlaubt)`);
    err.status = 400;
    throw err;
  }
}

// FIX: Regex-Sonderzeichen im Key escapen bevor er in einem RegExp verwendet wird
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseEnv(content) {
  const lines = content.split('\n');
  const result = [];
  let pendingComment = '';

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('#') || line.trim() === '') {
      if (line.startsWith('# ─') || line.startsWith('# =') || line.trim() === '') {
        result.push({ type: 'separator', text: line });
        pendingComment = '';
      } else {
        pendingComment = line.replace(/^#\s?/, '');
      }
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    result.push({
      type: 'var',
      key,
      value: SECRET_KEYS.includes(key) ? '' : value,
      raw_value: value,
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
 * GET /env
 */
router.get('/', async (req, res) => {
  try {
    const content = await fs.readFile(ENV_FILE, 'utf8');
    const entries = parseEnv(content);
    const safe = entries.map(({ raw_value, ...e }) => e);
    res.json({ entries: safe, file: ENV_FILE, writable: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.json({ entries: [], file: ENV_FILE, writable: false, error: '.env nicht gefunden' });
    }
    throw err;
  }
});

/**
 * GET /env/raw  — Secrets als ***HIDDEN*** maskiert
 */
router.get('/raw', async (req, res) => {
  try {
    let content = await fs.readFile(ENV_FILE, 'utf8');
    for (const key of SECRET_KEYS) {
      content = content.replace(
        new RegExp(`^(${escapeRegex(key)}=).+$`, 'm'),
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
 * PUT /env  — Einzelne Variablen aktualisieren
 */
router.put('/', async (req, res) => {
  const { updates } = req.body;
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'updates-Array erforderlich' });
  }
  if (updates.length > 100) {
    return res.status(400).json({ error: 'Maximal 100 Updates pro Request' });
  }

  // FIX: Jeden Key validieren bevor er in Regex verwendet wird
  for (const u of updates) {
    validateKey(u.key);
  }

  const filtered = updates.filter(u => !READONLY_KEYS.includes(u.key));
  let content = '';
  try {
    content = await fs.readFile(ENV_FILE, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  for (const { key, value } of filtered) {
    if (SECRET_KEYS.includes(key) && value === '') continue;
    // FIX: escapeRegex verhindert ReDoS bei speziellen Key-Namen
    const regex = new RegExp(`^${escapeRegex(key)}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
    process.env[key] = value;
  }

  await fs.writeFile(ENV_FILE, content, { mode: 0o600 });
  res.json({
    success: true,
    message: `${filtered.length} Variable(n) aktualisiert. Neustart empfohlen.`,
    updated: filtered.map(u => u.key),
    restart_recommended: true,
  });
});

/**
 * PUT /env/raw
 */
router.put('/raw', async (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content erforderlich' });
  }
  if (content.length > 64 * 1024) {
    return res.status(400).json({ error: '.env-Datei darf maximal 64 KB groß sein' });
  }
  if (content.includes('***HIDDEN***')) {
    return res.status(400).json({
      error: 'Maskierte Secret-Felder (***HIDDEN***) müssen entfernt oder befüllt werden',
    });
  }
  await fs.writeFile(ENV_FILE, content, { mode: 0o600 });
  res.json({
    success: true,
    message: '.env gespeichert. Container-Neustart erforderlich.',
    restart_recommended: true,
  });
});

/**
 * POST /env/restart-services
 */
router.post('/restart-services', async (req, res) => {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  try {
    // FIX: Arbeitsverzeichnis sicher aus ENV_FILE ableiten
    const projectDir = path.resolve(path.dirname(ENV_FILE));
    await execFileAsync('docker', ['compose', 'restart'], {
      cwd: projectDir,
      timeout: 60000,
      env: { ...process.env, PATH: process.env.PATH },
    });
    res.json({ success: true, message: 'Alle Container neu gestartet' });
  } catch (err) {
    res.json({
      success: false,
      message: 'Automatischer Neustart fehlgeschlagen – bitte manuell neustarten',
      error: err.message,
    });
  }
});

module.exports = router;
