'use strict';

require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');
const http = require('http');

const adminAuth = require('./middleware/adminAuth');
const usersRouter = require('./routes/users');
const dockerRouter = require('./routes/docker');
const domainsRouter = require('./routes/domains');
const sslRouter = require('./routes/ssl');
const tunnelRouter = require('./routes/tunnel');
const envRouter = require('./routes/env');
const onboardingRouter = require('./routes/onboarding');

const app = express();
const server = http.createServer(app);

// ─── Startup-Guards ──────────────────────────────────────────
const REQUIRED_ENV = ['ADMIN_JWT_SECRET', 'GOTRUE_OPERATOR_TOKEN', 'GOTRUE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[FATAL] Umgebungsvariable ${key} fehlt – Server startet nicht.`);
    process.exit(1);
  }
}

// ─── Security Middleware ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'wss:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// FIX: CORS nur auf erlaubte Origins beschränken, kein Wildcard in Production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Kein Origin = server-to-server oder curl (immer erlauben)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) {
      // Nur im dev-Modus alles erlauben
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      return callback(new Error(`CORS: Kein ALLOWED_ORIGINS gesetzt. Origin: ${origin}`));
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin nicht erlaubt: ${origin}`));
  },
  credentials: true,
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '256kb' })); // FIX: kleineres Limit (war 1MB)
app.set('trust proxy', 1); // Nginx sitzt davor

// Globales Rate Limiting (alle Routen)
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 Minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen – bitte warte eine Minute.' },
});
app.use(globalLimiter);

// Strengeres Rate Limiting für Login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true, // Nur fehlgeschlagene Logins zählen
  message: { error: 'Zu viele Login-Versuche. Bitte warte 15 Minuten.' },
});

// Rate Limiting für schreibende ENV-Ops (Schutz vor brute-force secret rotation)
const envWriteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { error: 'Zu viele Konfigurationsänderungen. Bitte warte 5 Minuten.' },
});

// ─── Health Check (öffentlich) ────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Auth Endpoints ───────────────────────────────────────────
app.post('/auth/login', loginLimiter, require('./routes/auth').login);
app.post('/auth/logout', adminAuth, require('./routes/auth').logout);
app.get('/auth/me', adminAuth, require('./routes/auth').me);

// ─── Geschützte API Routen ────────────────────────────────────
app.use('/users', adminAuth, usersRouter);
app.use('/docker', adminAuth, dockerRouter);
app.use('/domains', adminAuth, domainsRouter);
app.use('/ssl', adminAuth, sslRouter);
app.use('/tunnel', adminAuth, tunnelRouter);
app.use('/env', adminAuth, envWriteLimiter, envRouter);
app.use('/onboarding', adminAuth, onboardingRouter);

// ─── WebSocket: JWT-Auth erfolgt in docker.js setupLogStream ──
const wss = new WebSocketServer({ server, path: '/docker/logs/stream' });
require('./routes/docker').setupLogStream(wss);

// ─── Globale Fehlerbehandlung ─────────────────────────────────
app.use((err, req, res, next) => {
  // CORS-Fehler → 403
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }
  console.error('[ERROR]', err.message);
  const status = err.status || 500;
  // Im Production-Modus keinen Stack-Trace zurückgeben
  res.status(status).json({
    error: err.message || 'Interner Serverfehler',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ─── Server starten ───────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Backend API läuft auf Port ${PORT}`);
  console.log(`✓ GoTrue URL: ${process.env.GOTRUE_URL}`);
  console.log(`✓ Umgebung: ${process.env.NODE_ENV}`);
  console.log(`✓ CORS Origins: ${allowedOrigins.join(', ') || '(alle – nur dev)'}`);
});

module.exports = { app, server };
