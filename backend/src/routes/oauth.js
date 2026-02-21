'use strict';

const express = require('express');
const fs = require('fs').promises;
const router = express.Router();

const ENV_FILE = process.env.ENV_FILE_PATH || '/app/.env';

async function getEnvValue(key) {
  try {
    const content = await fs.readFile(ENV_FILE, 'utf8');
    const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

async function setEnvValue(key, value) {
  let content = '';
  try { content = await fs.readFile(ENV_FILE, 'utf8'); } catch {}
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  await fs.writeFile(ENV_FILE, content, { mode: 0o600 });
  process.env[key] = value;
}

/**
 * GET /oauth
 * Aktuelle OAuth-Konfiguration lesen
 */
router.get('/', async (req, res) => {
  const siteUrl = await getEnvValue('GOTRUE_SITE_URL');
  const allowList = await getEnvValue('GOTRUE_URI_ALLOW_LIST');

  res.json({
    site_url: siteUrl,
    callback_url: siteUrl ? `${siteUrl}/auth/v1/callback` : '',
    uri_allow_list: allowList,
    // Für die Anzeige: als Array aufteilen
    allowed_uris: allowList
      ? allowList.split(',').map(u => u.trim()).filter(Boolean)
      : [],
  });
});

/**
 * PUT /oauth
 * OAuth Callback-URLs konfigurieren
 */
router.put('/', async (req, res) => {
  const { uri_allow_list } = req.body;

  if (typeof uri_allow_list !== 'string') {
    return res.status(400).json({ error: 'uri_allow_list (String) erforderlich' });
  }

  // Bereinigen: Leerzeichen entfernen, leere Einträge filtern
  const cleaned = uri_allow_list
    .split(',')
    .map(u => u.trim())
    .filter(Boolean)
    .join(',');

  await setEnvValue('GOTRUE_URI_ALLOW_LIST', cleaned);

  res.json({
    success: true,
    message: 'OAuth Callback-URLs gespeichert. Container-Neustart empfohlen.',
    uri_allow_list: cleaned,
    restart_recommended: true,
  });
});

module.exports = router;
