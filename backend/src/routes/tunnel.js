'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const yaml = require('yaml');
const router = express.Router();

const execFileAsync = promisify(execFile);
const TUNNEL_CONFIG_DIR = '/etc/cloudflare';
const TUNNEL_CONFIG_FILE = path.join(TUNNEL_CONFIG_DIR, 'config.yml');

/**
 * GET /tunnel/status
 * Aktuellen Tunnel-Status abrufen
 */
router.get('/status', async (req, res) => {
  const token = process.env.CLOUDFLARE_TUNNEL_TOKEN;
  const tunnelName = process.env.CLOUDFLARE_TUNNEL_NAME;

  let config = null;
  try {
    const content = await fs.readFile(TUNNEL_CONFIG_FILE, 'utf8');
    config = yaml.parse(content);
  } catch {
    // Noch keine Konfiguration
  }

  // Prüfen ob cloudflared läuft (via Docker)
  let running = false;
  try {
    const { execSync } = require('child_process');
    const output = execSync('docker ps --filter name=auth-cloudflared --format "{{.Status}}"', { timeout: 5000 }).toString().trim();
    running = output.toLowerCase().includes('up');
  } catch {
    running = false;
  }

  res.json({
    configured: !!token,
    token_set: !!token,
    tunnel_name: tunnelName,
    running,
    config,
    mode: token ? 'token' : 'config-file',
  });
});

/**
 * POST /tunnel/configure
 * Tunnel konfigurieren
 * Body: { token?, tunnel_id?, account_tag?, tunnel_secret?, ingress: [] }
 */
router.post('/configure', async (req, res) => {
  const { token, ingress, tunnel_name } = req.body;

  if (token) {
    // Token-basierte Authentifizierung (einfachster Weg)
    await updateEnvVar('CLOUDFLARE_TUNNEL_TOKEN', token);
    await updateEnvVar('CLOUDFLARE_TUNNEL_NAME', tunnel_name || process.env.CLOUDFLARE_TUNNEL_NAME);
    process.env.CLOUDFLARE_TUNNEL_TOKEN = token;

    return res.json({
      success: true,
      message: 'Tunnel-Token gesetzt. Container neu starten um den Tunnel zu aktivieren.',
      mode: 'token',
      restart_required: true,
    });
  }

  if (ingress && Array.isArray(ingress)) {
    // Konfigurationsdatei-basiert
    const config = {
      tunnel: tunnel_name || process.env.CLOUDFLARE_TUNNEL_NAME,
      ingress: [
        ...ingress,
        // Catch-all am Ende
        { service: 'http_status:404' },
      ],
    };

    await fs.mkdir(TUNNEL_CONFIG_DIR, { recursive: true });
    await fs.writeFile(TUNNEL_CONFIG_FILE, yaml.stringify(config));

    return res.json({
      success: true,
      message: 'Tunnel-Konfiguration gespeichert.',
      config,
      restart_required: true,
    });
  }

  res.status(400).json({ error: 'Token oder Ingress-Konfiguration erforderlich' });
});

/**
 * GET /tunnel/config
 * Tunnel-Konfigurationsdatei lesen
 */
router.get('/config', async (req, res) => {
  try {
    const content = await fs.readFile(TUNNEL_CONFIG_FILE, 'utf8');
    const parsed = yaml.parse(content);
    res.json({ content, parsed });
  } catch {
    res.json({
      content: '',
      parsed: null,
      message: 'Keine Konfiguration vorhanden',
    });
  }
});

/**
 * POST /tunnel/generate-config
 * Standard-Konfiguration basierend auf .env generieren
 */
router.post('/generate-config', async (req, res) => {
  const domain = process.env.DOMAIN;
  const authSubdomain = process.env.AUTH_SUBDOMAIN;
  const dashboardSubdomain = process.env.DASHBOARD_SUBDOMAIN;

  if (!domain) {
    return res.status(400).json({ error: 'DOMAIN-Umgebungsvariable nicht gesetzt' });
  }

  const config = {
    tunnel: process.env.CLOUDFLARE_TUNNEL_NAME || 'supabase-auth-tunnel',
    ingress: [
      {
        hostname: authSubdomain || `auth.${domain}`,
        service: 'http://gotrue:9999',
        originRequest: {
          noTLSVerify: true,
        },
      },
      {
        hostname: dashboardSubdomain || `dashboard.${domain}`,
        service: 'http://nginx:80',
      },
      {
        hostname: domain,
        service: 'http://nginx:80',
      },
      { service: 'http_status:404' },
    ],
  };

  const yamlContent = yaml.stringify(config);
  await fs.mkdir(TUNNEL_CONFIG_DIR, { recursive: true });
  await fs.writeFile(TUNNEL_CONFIG_FILE, yamlContent);

  res.json({
    success: true,
    config,
    yaml: yamlContent,
    file: TUNNEL_CONFIG_FILE,
  });
});

/**
 * DELETE /tunnel/config
 * Tunnel-Konfiguration zurücksetzen
 */
router.delete('/config', async (req, res) => {
  try {
    await fs.unlink(TUNNEL_CONFIG_FILE);
    await updateEnvVar('CLOUDFLARE_TUNNEL_TOKEN', '');
    res.json({ success: true, message: 'Tunnel-Konfiguration entfernt' });
  } catch {
    res.json({ success: true, message: 'Keine Konfiguration vorhanden' });
  }
});

// Hilfsfunktion: Einzelne ENV-Variable in .env-Datei aktualisieren
async function updateEnvVar(key, value) {
  const envFile = '/app/.env';
  try {
    let content = await fs.readFile(envFile, 'utf8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
    await fs.writeFile(envFile, content);
  } catch {
    // Ignorieren wenn .env nicht schreibbar
  }
}

module.exports = router;
