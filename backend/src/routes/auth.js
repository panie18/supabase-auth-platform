'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_PASSWORD_PLAIN = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const JWT_EXPIRES_IN = '8h';

// Startup-Guard: JWT_SECRET muss gesetzt sein
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[FATAL] ADMIN_JWT_SECRET fehlt oder zu kurz (min. 32 Zeichen)!');
  process.exit(1);
}

/**
 * Timing-sicherer String-Vergleich (verhindert Timing-Angriffe auf Plaintext-Passwörter).
 * Nutzt crypto.timingSafeEqual damit die Laufzeit nicht vom Inhalt abhängt.
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Längenunterschied – trotzdem timing-safe weiterrechnen, dann ablehnen
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /auth/login
 */
async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  }

  // Benutzername timing-safe prüfen
  if (!timingSafeEqual(username, ADMIN_USERNAME)) {
    // Absichtliche Verzögerung verhindert User-Enumeration
    await bcrypt.hash('dummy', 10);
    return res.status(401).json({ error: 'Ungültige Zugangsdaten' });
  }

  let passwordOk = false;

  if (ADMIN_PASSWORD_HASH) {
    // bcrypt-Hash bevorzugt (sicher)
    passwordOk = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  } else if (ADMIN_PASSWORD_PLAIN) {
    // FIX: Kein mehr einfacher === Vergleich – bcrypt.compare gegen gehashten Wert
    // Beim ersten Login on-the-fly hashen und vergleichen (timing-sicher via bcrypt)
    const tempHash = await bcrypt.hash(ADMIN_PASSWORD_PLAIN, 10);
    passwordOk = await bcrypt.compare(password, tempHash);
  } else {
    console.error('[ERROR] Weder ADMIN_PASSWORD_HASH noch ADMIN_PASSWORD gesetzt!');
    return res.status(500).json({ error: 'Server-Konfigurationsfehler' });
  }

  if (!passwordOk) {
    return res.status(401).json({ error: 'Ungültige Zugangsdaten' });
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
  );

  res.json({ token, expiresIn: JWT_EXPIRES_IN, username, role: 'admin' });
}

function logout(req, res) {
  res.json({ message: 'Erfolgreich abgemeldet' });
}

function me(req, res) {
  res.json({ username: req.admin.username, role: req.admin.role });
}

module.exports = { login, logout, me };
