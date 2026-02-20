'use strict';

const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const execFileAsync = promisify(execFile);
const CERTS_DIR = '/etc/letsencrypt/live';

// FIX: Domain-Format validieren – verhindert Command-Injection und Path-Traversal
// Erlaubt: a-z, 0-9, Bindestriche, Punkte. Keine ../ etc.
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
function validateDomain(domain) {
  if (!domain || !DOMAIN_RE.test(domain) || domain.includes('..')) {
    const err = new Error(`Ungültiges Domain-Format: "${domain}"`);
    err.status = 400;
    throw err;
  }
}

function validateEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('Ungültige E-Mail-Adresse');
    err.status = 400;
    throw err;
  }
}

async function getCertInfo(domain) {
  validateDomain(domain);
  // FIX: path.join + Validierung verhindert Path-Traversal
  const safeDomain = path.basename(domain); // extra Sicherheit gegen ../
  const certPath = path.join(CERTS_DIR, safeDomain, 'cert.pem');

  try {
    const stat = await fs.stat(certPath);
    const expires = new Date(stat.birthtime.getTime() + 90 * 24 * 60 * 60 * 1000);
    return {
      exists: true,
      domain,
      cert_path: certPath,
      issued: stat.birthtime.toISOString(),
      expires: expires.toISOString(),
      days_remaining: Math.floor((expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    };
  } catch {
    return { exists: false, domain };
  }
}

/**
 * GET /ssl/status
 */
router.get('/status', async (req, res) => {
  const domains = [
    process.env.DOMAIN,
    process.env.AUTH_SUBDOMAIN,
    process.env.DASHBOARD_SUBDOMAIN,
  ].filter(Boolean);

  const certs = await Promise.all(
    domains.map(d => {
      try { return getCertInfo(d); }
      catch { return { exists: false, domain: d }; }
    })
  );

  res.json({
    domains: certs,
    certbot_available: await checkCertbotAvailable(),
    auto_renew: true,
    certs_dir: CERTS_DIR,
  });
});

/**
 * POST /ssl/request
 */
router.post('/request', async (req, res) => {
  const { domains = [], email = process.env.CERTBOT_EMAIL, staging = false, method = 'webroot' } = req.body;

  if (!Array.isArray(domains) || !domains.length) {
    return res.status(400).json({ error: 'Mindestens eine Domain erforderlich' });
  }
  if (domains.length > 10) {
    return res.status(400).json({ error: 'Maximal 10 Domains pro Anfrage' });
  }

  // FIX: Alle Domains und Email validieren vor Weitergabe an certbot
  try {
    domains.forEach(validateDomain);
    validateEmail(email);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  if (!['webroot', 'standalone'].includes(method)) {
    return res.status(400).json({ error: 'Ungültige Methode. Erlaubt: webroot, standalone' });
  }

  const args = ['certonly', '--non-interactive', '--agree-tos', '--email', email, '--expand'];
  if (method === 'webroot') {
    args.push('--webroot', '-w', '/var/www/certbot');
  } else {
    args.push('--standalone', '--preferred-challenges', 'http');
  }
  if (staging) args.push('--staging');
  domains.forEach(d => args.push('-d', d));

  try {
    const { stdout, stderr } = await execFileAsync('certbot', args, { timeout: 120000 });
    res.json({ success: true, message: 'SSL-Zertifikat erfolgreich ausgestellt', output: stdout || stderr, domains });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Certbot-Fehler', details: err.stderr || err.message });
  }
});

/**
 * POST /ssl/renew
 */
router.post('/renew', async (req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync('certbot', ['renew', '--non-interactive'], { timeout: 120000 });
    res.json({ success: true, message: 'Zertifikate erfolgreich erneuert', output: stdout || stderr });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Erneuerung fehlgeschlagen', details: err.stderr || err.message });
  }
});

/**
 * DELETE /ssl/:domain
 * FIX: Domain wird validiert bevor sie an certbot übergeben wird
 */
router.delete('/:domain', async (req, res) => {
  const { domain } = req.params;
  try {
    validateDomain(domain);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const { stdout } = await execFileAsync('certbot', [
      'delete', '--non-interactive', '--cert-name', domain
    ], { timeout: 30000 });
    res.json({ success: true, message: 'Zertifikat gelöscht', output: stdout });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function checkCertbotAvailable() {
  try { await execFileAsync('certbot', ['--version'], { timeout: 5000 }); return true; }
  catch { return false; }
}

module.exports = router;
