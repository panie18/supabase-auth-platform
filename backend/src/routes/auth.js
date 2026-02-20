'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Admin-Zugangsdaten aus ENV (werden beim Install gesetzt)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // bcrypt-Hash
const ADMIN_PASSWORD_PLAIN = process.env.ADMIN_PASSWORD;     // Fallback für Entwicklung
const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const JWT_EXPIRES_IN = '8h';

/**
 * POST /auth/login
 * Body: { username, password }
 * Gibt JWT zurück bei Erfolg
 */
async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
  }

  // Benutzernamen prüfen
  if (username !== ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Ungültige Zugangsdaten' });
  }

  // Passwort prüfen (Hash bevorzugt, Fallback auf plaintext für einfaches Setup)
  let passwordOk = false;
  if (ADMIN_PASSWORD_HASH) {
    passwordOk = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  } else if (ADMIN_PASSWORD_PLAIN) {
    passwordOk = password === ADMIN_PASSWORD_PLAIN;
  }

  if (!passwordOk) {
    return res.status(401).json({ error: 'Ungültige Zugangsdaten' });
  }

  // JWT ausstellen
  const token = jwt.sign(
    { username, role: 'admin' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.json({
    token,
    expiresIn: JWT_EXPIRES_IN,
    username,
    role: 'admin',
  });
}

/**
 * POST /auth/logout
 * (Stateless JWT – Client löscht Token)
 */
function logout(req, res) {
  res.json({ message: 'Erfolgreich abgemeldet' });
}

/**
 * GET /auth/me
 * Gibt aktuellen Admin-Nutzer zurück
 */
function me(req, res) {
  res.json({ username: req.admin.username, role: req.admin.role });
}

module.exports = { login, logout, me };
