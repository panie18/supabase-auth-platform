'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const NGINX_CONF_DIR = process.env.NGINX_CONF_DIR || '/etc/nginx-managed/conf.d';
const ENV_FILE = '/app/.env';

/**
 * GET /domains
 * Aktuelle Domain-Konfiguration abrufen
 */
router.get('/', async (req, res) => {
  const domain = process.env.DOMAIN || '';
  const authSubdomain = process.env.AUTH_SUBDOMAIN || '';
  const dashboardSubdomain = process.env.DASHBOARD_SUBDOMAIN || '';
  const siteUrl = process.env.GOTRUE_SITE_URL || '';

  // Nginx-Konfigurationsdateien einlesen
  let nginxConfigs = [];
  try {
    const files = await fs.readdir(NGINX_CONF_DIR);
    nginxConfigs = files.filter(f => f.endsWith('.conf'));
  } catch {
    // Verzeichnis existiert nicht (noch kein Custom-Config)
  }

  res.json({
    domain,
    auth_subdomain: authSubdomain,
    dashboard_subdomain: dashboardSubdomain,
    site_url: siteUrl,
    nginx_configs: nginxConfigs,
  });
});

/**
 * PUT /domains
 * Domain-Konfiguration aktualisieren
 * Body: { domain, auth_subdomain, dashboard_subdomain }
 */
router.put('/', async (req, res) => {
  const { domain, auth_subdomain, dashboard_subdomain } = req.body;

  if (!domain) {
    return res.status(400).json({ error: 'Domain ist erforderlich' });
  }

  // ENV-Datei aktualisieren
  try {
    let envContent = await fs.readFile(ENV_FILE, 'utf8');

    const updates = {
      DOMAIN: domain,
      AUTH_SUBDOMAIN: auth_subdomain || `auth.${domain}`,
      DASHBOARD_SUBDOMAIN: dashboard_subdomain || `dashboard.${domain}`,
      GOTRUE_SITE_URL: `https://${domain}`,
      GOTRUE_API_EXTERNAL_URL: `https://${auth_subdomain || `auth.${domain}`}`,
      NEXT_PUBLIC_API_URL: `https://${dashboard_subdomain || `dashboard.${domain}`}/api`,
    };

    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
      process.env[key] = value; // Auch im aktuellen Prozess aktualisieren
    }

    await fs.writeFile(ENV_FILE, envContent);
  } catch (err) {
    console.warn('Konnte .env nicht aktualisieren:', err.message);
  }

  res.json({
    message: 'Domain-Konfiguration aktualisiert. Nginx-Neustart erforderlich.',
    domain,
    auth_subdomain: auth_subdomain || `auth.${domain}`,
    dashboard_subdomain: dashboard_subdomain || `dashboard.${domain}`,
    restart_required: true,
  });
});

/**
 * POST /domains/validate
 * DNS-Auflösung der Domain prüfen
 */
router.post('/validate', async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain erforderlich' });

  const { promisify } = require('util');
  const dns = require('dns');
  const resolve4 = promisify(dns.resolve4);

  try {
    const addresses = await resolve4(domain);
    res.json({ valid: true, addresses, domain });
  } catch (err) {
    res.json({ valid: false, error: err.message, domain });
  }
});

/**
 * GET /domains/nginx-config
 * Aktuelle Nginx-Konfiguration als Text abrufen
 */
router.get('/nginx-config', async (req, res) => {
  const configPath = path.join(NGINX_CONF_DIR, 'default.conf');
  try {
    const content = await fs.readFile(configPath, 'utf8');
    res.json({ content, path: configPath });
  } catch {
    res.json({ content: '# Noch keine Konfiguration vorhanden', path: configPath });
  }
});

/**
 * PUT /domains/nginx-config
 * Nginx-Konfiguration direkt bearbeiten (für Experten)
 */
router.put('/nginx-config', async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Konfigurationsinhalt erforderlich' });

  const configPath = path.join(NGINX_CONF_DIR, 'default.conf');
  await fs.mkdir(NGINX_CONF_DIR, { recursive: true });
  await fs.writeFile(configPath, content);

  res.json({ message: 'Nginx-Konfiguration gespeichert. Bitte Nginx neu starten.', path: configPath });
});

module.exports = router;
