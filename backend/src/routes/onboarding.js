'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const ENV_FILE = process.env.ENV_FILE_PATH || '/app/.env';

// Hilfsfunktion: einzelnen ENV-Wert lesen
async function getEnvValue(key) {
  try {
    const content = await fs.readFile(ENV_FILE, 'utf8');
    const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

// Hilfsfunktion: ENV-Variable schreiben
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
 * GET /onboarding/status
 * Gibt zurück ob Onboarding abgeschlossen ist + aktuelle Werte
 */
router.get('/status', async (req, res) => {
  const done = (await getEnvValue('ONBOARDING_DONE')) === 'true';
  const domain = await getEnvValue('DOMAIN');
  const authSub = await getEnvValue('AUTH_SUBDOMAIN');
  const dashSub = await getEnvValue('DASHBOARD_SUBDOMAIN');
  const sslEmail = await getEnvValue('CERTBOT_EMAIL');
  const cfToken = await getEnvValue('CLOUDFLARE_TUNNEL_TOKEN');
  const smtpHost = await getEnvValue('GOTRUE_SMTP_HOST');
  const siteUrl = await getEnvValue('GOTRUE_SITE_URL');

  // Welche Schritte sind erledigt?
  const steps = {
    domain: !!(domain && domain !== ''),
    ssl: !!(sslEmail && siteUrl?.startsWith('https')),
    tunnel: !!(cfToken && cfToken !== ''),
    smtp: !!(smtpHost && smtpHost !== ''),
  };

  res.json({
    done,
    steps,
    current: {
      domain,
      auth_subdomain: authSub,
      dashboard_subdomain: dashSub,
      ssl_email: sslEmail,
      cf_configured: !!(cfToken),
      smtp_configured: !!(smtpHost),
      site_url: siteUrl,
    },
  });
});

/**
 * POST /onboarding/domain
 * Schritt 1: Domain + Subdomains konfigurieren
 */
router.post('/domain', async (req, res) => {
  const { domain, auth_subdomain, dashboard_subdomain } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain erforderlich' });

  const authSub = auth_subdomain || `auth.${domain}`;
  const dashSub = dashboard_subdomain || `dashboard.${domain}`;

  await setEnvValue('DOMAIN', domain);
  await setEnvValue('AUTH_SUBDOMAIN', authSub);
  await setEnvValue('DASHBOARD_SUBDOMAIN', dashSub);
  await setEnvValue('GOTRUE_SITE_URL', `https://${domain}`);
  await setEnvValue('GOTRUE_API_EXTERNAL_URL', `https://${authSub}`);
  await setEnvValue('NEXT_PUBLIC_API_URL', `https://${dashSub}/api`);
  await setEnvValue('ALLOWED_ORIGINS', `https://${dashSub}`);

  res.json({
    success: true,
    message: 'Domain gespeichert',
    domain, auth_subdomain: authSub, dashboard_subdomain: dashSub,
  });
});

/**
 * POST /onboarding/ssl
 * Schritt 2: SSL / Let's Encrypt konfigurieren
 */
router.post('/ssl', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Gültige E-Mail erforderlich' });
  }

  await setEnvValue('CERTBOT_EMAIL', email);
  await setEnvValue('GOTRUE_SMTP_ADMIN_EMAIL', email);

  // Versuche Certbot anzuwerfen (optional – Domain muss bereits auf Server zeigen)
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  const domain = await getEnvValue('DOMAIN');
  const authSub = await getEnvValue('AUTH_SUBDOMAIN');
  const dashSub = await getEnvValue('DASHBOARD_SUBDOMAIN');

  try {
    const { stdout, stderr } = await execFileAsync('certbot', [
      'certonly', '--webroot', '-w', '/var/www/certbot',
      '--non-interactive', '--agree-tos', '--email', email,
      '-d', domain, '-d', authSub, '-d', dashSub,
    ], { timeout: 120000 });

    // GOTRUE_SITE_URL auf https setzen
    await setEnvValue('GOTRUE_SITE_URL', `https://${domain}`);

    res.json({
      success: true,
      message: 'SSL-Zertifikat ausgestellt! Nginx-Neustart erforderlich.',
      output: (stdout || stderr).slice(0, 1000),
      ssl_active: true,
    });
  } catch (err) {
    // Certbot nicht verfügbar oder DNS noch nicht bereit → nicht fatal
    res.json({
      success: false,
      message: 'E-Mail gespeichert. SSL-Zertifikat konnte nicht direkt ausgestellt werden.',
      hint: 'DNS-Records müssen auf den Server zeigen. Versuche es über Dashboard → SSL nochmal.',
      error: err.message,
      ssl_active: false,
    });
  }
});

/**
 * POST /onboarding/tunnel
 * Schritt 3: Cloudflare Tunnel Token setzen
 */
router.post('/tunnel', async (req, res) => {
  const { token, skip } = req.body;

  if (skip) {
    return res.json({ success: true, skipped: true, message: 'Tunnel übersprungen' });
  }

  if (!token || token.trim() === '') {
    return res.status(400).json({ error: 'Tunnel-Token erforderlich (oder skip: true)' });
  }

  await setEnvValue('CLOUDFLARE_TUNNEL_TOKEN', token.trim());

  res.json({
    success: true,
    message: 'Cloudflare Tunnel Token gespeichert.',
    hint: 'Starte den cloudflared Container: docker compose --profile tunnel up -d cloudflared',
  });
});

/**
 * POST /onboarding/smtp
 * Schritt 4: SMTP / E-Mail konfigurieren
 */
router.post('/smtp', async (req, res) => {
  const { host, port = 587, user, pass, from_email, skip } = req.body;

  if (skip) {
    await setEnvValue('GOTRUE_MAILER_AUTOCONFIRM', 'true');
    return res.json({
      success: true, skipped: true,
      message: 'SMTP übersprungen – Benutzer werden automatisch bestätigt',
    });
  }

  if (!host || !user || !pass) {
    return res.status(400).json({ error: 'SMTP-Host, Benutzer und Passwort erforderlich' });
  }

  await setEnvValue('GOTRUE_SMTP_HOST', host);
  await setEnvValue('GOTRUE_SMTP_PORT', String(port));
  await setEnvValue('GOTRUE_SMTP_USER', user);
  await setEnvValue('GOTRUE_SMTP_PASS', pass);
  await setEnvValue('GOTRUE_SMTP_ADMIN_EMAIL', from_email || user);
  await setEnvValue('GOTRUE_MAILER_AUTOCONFIRM', 'false');

  res.json({ success: true, message: 'SMTP-Konfiguration gespeichert.' });
});

/**
 * POST /onboarding/complete
 * Onboarding als abgeschlossen markieren
 */
router.post('/complete', async (req, res) => {
  await setEnvValue('ONBOARDING_DONE', 'true');
  res.json({ success: true, message: 'Onboarding abgeschlossen!' });
});

module.exports = router;
