'use strict';

const express = require('express');
const Dockerode = require('dockerode');
const router = express.Router();

// Docker-Client über Unix-Socket
const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

/**
 * GET /docker/containers
 * Alle Container auflisten (inkl. Status)
 */
router.get('/containers', async (req, res) => {
  const containers = await docker.listContainers({ all: true });
  const result = containers.map(c => ({
    id: c.Id.substring(0, 12),
    name: c.Names[0]?.replace('/', '') || 'unbekannt',
    image: c.Image,
    status: c.Status,
    state: c.State, // running, exited, paused, ...
    created: new Date(c.Created * 1000).toISOString(),
    ports: c.Ports,
    labels: c.Labels,
  }));
  res.json(result);
});

/**
 * GET /docker/containers/:id
 * Container-Details abrufen
 */
router.get('/containers/:id', async (req, res) => {
  const container = docker.getContainer(req.params.id);
  const info = await container.inspect();
  res.json({
    id: info.Id.substring(0, 12),
    name: info.Name.replace('/', ''),
    image: info.Config.Image,
    state: info.State,
    created: info.Created,
    ports: info.NetworkSettings.Ports,
    env: info.Config.Env,
    mounts: info.Mounts,
    restartPolicy: info.HostConfig.RestartPolicy,
  });
});

/**
 * POST /docker/containers/:id/action
 * Body: { action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause' }
 */
router.post('/containers/:id/action', async (req, res) => {
  const { action } = req.body;
  const validActions = ['start', 'stop', 'restart', 'pause', 'unpause'];

  if (!validActions.includes(action)) {
    return res.status(400).json({
      error: `Ungültige Aktion. Erlaubt: ${validActions.join(', ')}`,
    });
  }

  const container = docker.getContainer(req.params.id);

  // Aktion ausführen
  switch (action) {
    case 'start':   await container.start(); break;
    case 'stop':    await container.stop({ t: 10 }); break;
    case 'restart': await container.restart({ t: 10 }); break;
    case 'pause':   await container.pause(); break;
    case 'unpause': await container.unpause(); break;
  }

  // Aktuellen Status zurückgeben
  const info = await container.inspect();
  res.json({
    message: `Aktion '${action}' erfolgreich ausgeführt`,
    state: info.State,
  });
});

/**
 * GET /docker/logs/:id
 * Container-Logs abrufen (letzte N Zeilen)
 */
router.get('/logs/:id', async (req, res) => {
  const { lines = 200, since = 0 } = req.query;
  const container = docker.getContainer(req.params.id);

  const logBuffer = await container.logs({
    stdout: true,
    stderr: true,
    tail: parseInt(lines),
    since: parseInt(since),
    timestamps: true,
  });

  // Docker Multiplexed Stream parsen
  const logs = parseDockerLogs(logBuffer);
  res.json({ logs, count: logs.length });
});

/**
 * GET /docker/stats/:id
 * Container-Ressourcen (CPU, RAM) – einmalig
 */
router.get('/stats/:id', async (req, res) => {
  const container = docker.getContainer(req.params.id);
  const stats = await container.stats({ stream: false });

  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCores = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
  const cpuPercent = (cpuDelta / systemDelta) * cpuCores * 100;

  const memUsage = stats.memory_stats.usage || 0;
  const memLimit = stats.memory_stats.limit || 1;
  const memPercent = (memUsage / memLimit) * 100;

  res.json({
    cpu_percent: parseFloat(cpuPercent.toFixed(2)),
    memory_usage_mb: parseFloat((memUsage / 1024 / 1024).toFixed(2)),
    memory_limit_mb: parseFloat((memLimit / 1024 / 1024).toFixed(2)),
    memory_percent: parseFloat(memPercent.toFixed(2)),
    network_rx_bytes: Object.values(stats.networks || {}).reduce((a, n) => a + n.rx_bytes, 0),
    network_tx_bytes: Object.values(stats.networks || {}).reduce((a, n) => a + n.tx_bytes, 0),
  });
});

/**
 * GET /docker/images
 * Alle lokalen Docker Images
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

// ─── WebSocket Log-Streaming ──────────────────────────────────
function setupLogStream(wss) {
  wss.on('connection', async (ws, req) => {
    // Container-ID aus URL extrahieren: /docker/logs/stream?id=abc123
    const url = new URL(req.url, 'http://localhost');
    const containerId = url.searchParams.get('id');

    if (!containerId) {
      ws.send(JSON.stringify({ error: 'Container-ID fehlt' }));
      ws.close();
      return;
    }

    try {
      const container = docker.getContainer(containerId);
      const stream = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        tail: 50,
        timestamps: true,
      });

      // Log-Daten an WebSocket senden
      stream.on('data', (chunk) => {
        if (ws.readyState === ws.OPEN) {
          const lines = parseDockerLogs(chunk);
          lines.forEach(line => {
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

      ws.on('close', () => {
        stream.destroy();
      });
    } catch (err) {
      ws.send(JSON.stringify({ error: err.message }));
      ws.close();
    }
  });
}

// ─── Hilfsfunktion: Docker Multiplexed Log parsen ─────────────
function parseDockerLogs(buffer) {
  const lines = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;

    // Header: 8 Bytes (1 Byte Stream-Typ, 3 Byte Padding, 4 Byte Länge)
    const streamType = buffer[offset]; // 1=stdout, 2=stderr
    const size = buffer.readUInt32BE(offset + 4);
    offset += 8;

    if (offset + size > buffer.length) break;

    const line = buffer.slice(offset, offset + size).toString('utf8').trim();
    if (line) {
      lines.push({
        stream: streamType === 2 ? 'stderr' : 'stdout',
        text: line,
      });
    }
    offset += size;
  }

  // Fallback: Wenn Parsing fehlschlägt, als Plain-Text behandeln
  if (lines.length === 0) {
    const text = buffer.toString('utf8').trim();
    if (text) lines.push({ stream: 'stdout', text });
  }

  return lines;
}

module.exports = router;
module.exports.setupLogStream = setupLogStream;
