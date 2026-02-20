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

const app = express();
const server = http.createServer(app);

// ─── Middleware ───────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));

// Rate Limiting für Login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 10,
  message: { error: 'Zu viele Login-Versuche. Bitte warte 15 Minuten.' },
});

// ─── Health Check (öffentlich) ────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Auth Endpoints (öffentlich) ─────────────────────────────
app.post('/auth/login', loginLimiter, require('./routes/auth').login);
app.post('/auth/logout', adminAuth, require('./routes/auth').logout);
app.get('/auth/me', adminAuth, require('./routes/auth').me);

// ─── Geschützte API Routen ────────────────────────────────────
app.use('/users', adminAuth, usersRouter);
app.use('/docker', adminAuth, dockerRouter);
app.use('/domains', adminAuth, domainsRouter);
app.use('/ssl', adminAuth, sslRouter);
app.use('/tunnel', adminAuth, tunnelRouter);
app.use('/env', adminAuth, envRouter);

// ─── WebSocket für Log-Streaming ─────────────────────────────
const wss = new WebSocketServer({ server, path: '/docker/logs/stream' });
require('./routes/docker').setupLogStream(wss);

// ─── Globale Fehlerbehandlung ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message, err.stack);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Interner Serverfehler',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── Server starten ───────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Backend API läuft auf Port ${PORT}`);
  console.log(`✓ GoTrue URL: ${process.env.GOTRUE_URL}`);
  console.log(`✓ Umgebung: ${process.env.NODE_ENV}`);
});

module.exports = { app, server };
