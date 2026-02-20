'use strict';

const jwt = require('jsonwebtoken');

/**
 * Middleware: Prüft, ob ein gültiges Admin-JWT im Authorization-Header vorliegt.
 * Token wird beim Login erzeugt (POST /auth/login).
 */
module.exports = function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht autorisiert – kein Token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    req.admin = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token abgelaufen – bitte neu einloggen' });
    }
    return res.status(401).json({ error: 'Ungültiges Token' });
  }
};
