'use strict';

const express = require('express');
const axios = require('axios');
const router = express.Router();

// GoTrue Admin API Client
function gotrue() {
  return axios.create({
    baseURL: `${process.env.GOTRUE_URL}/admin`,
    headers: {
      'Authorization': `Bearer ${process.env.GOTRUE_OPERATOR_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
}

/**
 * GET /users
 * Listet alle Benutzer auf (mit Paginierung)
 */
router.get('/', async (req, res) => {
  const { page = 1, per_page = 50, query = '' } = req.query;
  const params = { page, per_page };
  if (query) params.filter = query;

  const { data } = await gotrue().get('/users', { params });
  res.json(data);
});

/**
 * GET /users/:id
 * Einzelnen Benutzer abrufen
 */
router.get('/:id', async (req, res) => {
  const { data } = await gotrue().get(`/users/${req.params.id}`);
  res.json(data);
});

/**
 * POST /users
 * Neuen Benutzer erstellen
 * Body: { email, password, role?, email_confirm? }
 */
router.post('/', async (req, res) => {
  const { email, password, role, email_confirm = true, user_metadata } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  }

  const payload = {
    email,
    password,
    email_confirm,
    ...(role && { role }),
    ...(user_metadata && { user_metadata }),
  };

  const { data } = await gotrue().post('/users', payload);
  res.status(201).json(data);
});

/**
 * PUT /users/:id
 * Benutzer aktualisieren (E-Mail, Passwort, Rolle, Metadaten)
 */
router.put('/:id', async (req, res) => {
  const { email, password, role, user_metadata, app_metadata, banned } = req.body;

  const payload = {};
  if (email !== undefined) payload.email = email;
  if (password !== undefined) payload.password = password;
  if (role !== undefined) payload.role = role;
  if (user_metadata !== undefined) payload.user_metadata = user_metadata;
  if (app_metadata !== undefined) payload.app_metadata = app_metadata;
  if (banned !== undefined) payload.banned = banned;

  const { data } = await gotrue().put(`/users/${req.params.id}`, payload);
  res.json(data);
});

/**
 * DELETE /users/:id
 * Benutzer löschen
 */
router.delete('/:id', async (req, res) => {
  await gotrue().delete(`/users/${req.params.id}`);
  res.json({ message: 'Benutzer erfolgreich gelöscht' });
});

/**
 * POST /users/:id/ban
 * Benutzer sperren/entsperren
 */
router.post('/:id/ban', async (req, res) => {
  const { banned } = req.body;
  const { data } = await gotrue().put(`/users/${req.params.id}`, { banned: !!banned });
  res.json(data);
});

/**
 * POST /users/:id/reset-password
 * Passwort zurücksetzen (E-Mail senden oder direkt setzen)
 */
router.post('/:id/reset-password', async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Neues Passwort erforderlich' });
  }
  const { data } = await gotrue().put(`/users/${req.params.id}`, { password });
  res.json({ message: 'Passwort erfolgreich zurückgesetzt', user: data });
});

/**
 * GET /users/stats/overview
 * Statistiken: Gesamtzahl, aktive, gesperrte Nutzer
 */
router.get('/stats/overview', async (req, res) => {
  const { data } = await gotrue().get('/users', { params: { per_page: 1000 } });
  const users = data.users || [];
  res.json({
    total: data.total || users.length,
    confirmed: users.filter(u => u.email_confirmed_at).length,
    banned: users.filter(u => u.banned_until).length,
    last_week: users.filter(u => {
      const created = new Date(u.created_at);
      const week_ago = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return created > week_ago;
    }).length,
  });
});

module.exports = router;
