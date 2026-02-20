'use strict';

const express = require('express');
const Dockerode = require('dockerode');
const jwt = require('jsonwebtoken');
const router = express.Router();

const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

// FIX: Container-ID nur alphanumerisch + max 64 Zeichen erlauben
const CONTAINER_ID_RE = /^[a-zA-Z0-9_.-]{1,64}$/;
function validateContainerId(id) {
  if (!id || !CONTAINER_ID_RE.test(id)) {
    const err = new Error('Ungültige Container-ID');
    err.status = 400;
    throw err;
  }
}

/**
 * GET /docker/containers
 */
router.get('/containers', async (req, res) => {
  const containers = await docker.listContainers({ all: true });
  const result = containers.map(c => ({
    id: c.Id.substring(0, 12),
    name: c.Names[0]?.replace('/', '') || 'unbekannt',
    image: c.Image,
    status: c.Status,
    state: c.State,
    created: new Date(c.Created * 1000).toISOString(),
    ports: c.Ports,
    // Labels nur wenn nicht-sensitiv (kein docker-compose secrets etc.)
    labels: Object.fromEntries(
      Object.entries(c.Labels || {}).filter(([k]) => !k.includes('secret') && !k.includes('password'))
    ),
  }));
  res.json(result);
});

/**
 * GET /docker/containers/:id
 * FIX: Env-Variablen werden NICHT zurückgegeben (könnten Secrets enthalten)
 */
router.get('/containers/:id', async (req, res) => {
  validateContainerId(req.params.id);
  const container = docker.getContainer(req.params.id);
  const info = await container.inspect();
  res.json({
    id: info.Id.substring(0, 12),
    name: info.Name.replace('/', ''),
    image: info.Config.Image,
    state: info.State,
    created: info.Created,
    ports: info.NetworkSettings.Ports,
    // FIX: env wurde entfernt – enthält ggf. Secrets wie JWT_SECRET, DB_PASS etc.
    // env: info.Config.Env,  ← ABSICHTLICH AUSKOMMENTIERT
    mounts: info.Mounts.map(m => ({
      type: m.Type,
      source: m.Source,
      destination: m.Destination,
      mode: m.Mode,
    })),
    restartPolicy: info.HostConfig.RestartPolicy,
  });
});

/**
 * POST /docker/containers/:id/action
 */
router.post('/containers/:id/action', async (req, res) => {
  validateContainerId(req.params.id);
  const { action } = req.body;
  const validActions = ['start', 'stop', 'restart', 'pause', 'unpause'];

  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `Ungültige Aktion. Erlaubt: ${validActions.join(', ')}` });
  }

  const container = docker.getContainer(req.params.id);
  switch (action) {
    case 'start':   await container.start(); break;
    case 'stop':    await container.stop({ t: 10 }); break;
    case 'restart': await container.restart({ t: 10 }); break;
    case 'pause':   await container.pause(); break;
    case 'unpause': await container.unpause(); break;
  }

  const info = await container.inspect();
  res.json({ message: `Aktion '${action}' erfolgreich ausgeführt`, state: info.State });
});

/**
 * GET /docker/logs/:id
 */
router.get('/logs/:id', async (req, res) => {
  validateContainerId(req.params.id);
  const lines = Math.min(parseInt(req.query.lines as string || '200', 10), 2000); // max 2000
  const since = Math.max(0, parseInt(req.query.since as string || '0', 10));
  const container = docker.getContainer(req.params.id);

  const logBuffer = await container.logs({
    stdout: true, stderr: true,
    tail: lines, since, timestamps: true,
  });

  res.json({ logs: parseDockerLogs(logBuffer), count: lines });
});

/**
 * GET /docker/stats/:id
 */
router.get('/stats/:id', async (req, res) => {
  validateContainerId(req.params.id);
  const container = docker.getContainer(req.params.id);
  const stats = await container.stats({ stream: false });

  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCores = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCores * 100 : 0;

  const memUsage = stats.memory_stats.usage || 0;
  const memLimit = stats.memory_stats.limit || 1;

  res.json({
    cpu_percent: parseFloat(cpuPercent.toFixed(2)),
    memory_usage_mb: parseFloat((memUsage / 1024 / 1024).toFixed(2)),
    memory_limit_mb: parseFloat((memLimit / 1024 / 1024).toFixed(2)),
    memory_percent: parseFloat(((memUsage / memLimit) * 100).toFixed(2)),
    network_rx_bytes: Object.values(stats.networks || {}).reduce((a: number, n: any) => a + n.rx_bytes, 0),
    network_tx_bytes: Object.values(stats.networks || {}).reduce((a: number, n: any) => a + n.tx_bytes, 0),
  });
});

/**
 * GET /docker/images
 */
router.get('/images', async (req, res) => {
  const images = await docker.listImages();
  res.json(images.map(img => ({
    id: img.Id.substring(7, 19),
    tags: img.RepoTags || [],
    size_mb: parseFloat((img.Size / 1024 / 1024).toFixed(2)),
    created: new Date(img.Created * 1000).toISOString(),
  })));
});

// ─── WebSocket Log-Streaming MIT JWT-Auth ─────────────────────
// FIX: Token wird aus Query-Parameter ?token= gelesen und validiert,
// da Browser-WebSocket keine Custom-Header unterstützt.
function setupLogStream(wss) {
  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const containerId = url.searchParams.get('id');
    const token = url.searchParams.get('token');

    // FIX: JWT-Authentifizierung für WebSocket
    if (!token) {
      ws.send(JSON.stringify({ error: 'Nicht autorisiert – kein Token' }));
      ws.close(4001, 'Unauthorized');
      return;
    }
    try {
      jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    } catch {
      ws.send(JSON.stringify({ error: 'Ungültiges oder abgelaufenes Token' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Container-ID validieren
    try {
      validateContainerId(containerId);
    } catch {
      ws.send(JSON.stringify({ error: 'Ungültige Container-ID' }));
      ws.close(4000, 'Bad Request');
      return;
    }

    try {
      const container = docker.getContainer(containerId);
      const stream = await container.logs({
        stdout: true, stderr: true, follow: true, tail: 50, timestamps: true,
      });

      stream.on('data', (chunk) => {
        if (ws.readyState === ws.OPEN) {
          parseDockerLogs(chunk).forEach(line => {
            ws.send(JSON.stringify({ log: line }));
          });
        }
      });

      stream.on('end', () => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ event: 'stream_ended' }));
          ws.close();
        }
      });

      ws.on('close', () => stream.destroy());
    } catch (err: any) {
      ws.send(JSON.stringify({ error: err.message }));
      ws.close();
    }
  });
}

function parseDockerLogs(buffer) {
  const lines = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const streamType = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    offset += 8;
    if (offset + size > buffer.length) break;
    const line = buffer.slice(offset, offset + size).toString('utf8').trim();
    if (line) lines.push({ stream: streamType === 2 ? 'stderr' : 'stdout', text: line });
    offset += size;
  }
  if (lines.length === 0) {
    const text = buffer.toString('utf8').trim();
    if (text) lines.push({ stream: 'stdout', text });
  }
  return lines;
}

module.exports = router;
module.exports.setupLogStream = setupLogStream;
