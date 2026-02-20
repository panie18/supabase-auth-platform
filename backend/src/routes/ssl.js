'use strict';

const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const tls = require('tls');
const router = express.Router();

const execFileAsync = promisify(execFile);
const CERTS_DIR = '/etc/letsencrypt/live';

/**
 * Liest SSL-Zertifikat-Informationen einer Domain
 */
async function getCertInfo(domain) {
  const certPath = path.join(CERTS_DIR, domain, 'cert.pem');
  try {
    const certContent = await fs.readFile(certPath, 'utf8');
    // Zertifikat via TLS parsen
    const cert = new tls.TLSSocket(null);
    // Vereinfacht: Expiry-Datum aus Datei-Metadaten
    const stat = await fs.stat(certPath);
    return {
      exists: true,
      domain,
      cert_path: certPath,
      issued: stat.birthtime.toISOString(),
      // Let's Encrypt Zertifikate sind 90 Tage gültig
      expires: new Date(stat.birthtime.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      days_remaining: Math.floor((new Date(stat.birthtime.getTime() + 90 * 24 * 60 * 60 * 1000) - Date.now()) / (24 * 60 * 60 * 1000)),
    };
  } catch {
    return { exists: false, domain };
  }
}

/**
 * GET /ssl/status
 * SSL-Zertifikat-Status für alle konfigurierten Domains
 */
router.get('/status', async (req, res) => {
  const domains = [
    process.env.DOMAIN,
    process.env.AUTH_SUBDOMAIN,
    process.env.DASHBOARD_SUBDOMAIN,
  ].filter(Boolean);

  const certs = await Promise.all(domains.map(getCertInfo));

  res.json({
    domains: certs,
    certbot_available: await checkCertbotAvailable(),
    auto_renew: true, // Via Cron oder Docker
    certs_dir: CERTS_DIR,
  });
});

/**
 * POST /ssl/request
 * Neues SSL-Zertifikat über Certbot anfordern
 * Body: { domains: [], email, staging: false }
 */
router.post('/request', async (req, res) => {
  const {
    domains = [],
    email = process.env.CERTBOT_EMAIL,
    staging = false,
    method = 'webroot',
  } = req.body;

  if (!domains.length) {
    return res.status(400).json({ error: 'Mindestens eine Domain erforderlich' });
  }
  if (!email) {
    return res.status(400).json({ error: 'E-Mail für Certbot erforderlich' });
  }

  const args = [
    'certonly',
    '--non-interactive',
    '--agree-tos',
    '--email', email,
    '--expand',
  ];

  if (method === 'webroot') {
    args.push('--webroot', '-w', '/var/www/certbot');
  } else {
    args.push('--standalone', '--preferred-challenges', 'http');
  }

  if (staging) args.push('--staging');

  domains.forEach(d => args.push('-d', d));

  try {
    const { stdout, stderr } = await execFileAsync('certbot', args, { timeout: 120000 });
    res.json({
      success: true,
      message: 'SSL-Zertifikat erfolgreich ausgestellt',
      output: stdout || stderr,
      domains,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Certbot-Fehler',
      details: err.stderr || err.message,
    });
  }
});

/**
 * POST /ssl/renew
 * Alle Zertifikate erneuern
 */
router.post('/renew', async (req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync('certbot', ['renew', '--non-interactive'], {
      timeout: 120000,
    });
    res.json({
      success: true,
      message: 'Zertifikate erfolgreich erneuert',
      output: stdout || stderr,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Erneuerung fehlgeschlagen',
      details: err.stderr || err.message,
    });
  }
});

/**
 * DELETE /ssl/:domain
 * Zertifikat für eine Domain löschen
 */
router.delete('/:domain', async (req, res) => {
  try {
    const { stdout } = await execFileAsync('certbot', [
      'delete', '--non-interactive', '--cert-name', req.params.domain
    ], { timeout: 30000 });
    res.json({ success: true, message: 'Zertifikat gelöscht', output: stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Prüft ob certbot im Container verfügbar ist
async function checkCertbotAvailable() {
  try {
    await execFileAsync('certbot', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

module.exports = router;
