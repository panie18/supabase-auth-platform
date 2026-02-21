'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const dotenv = require('dotenv');

const PROJECTS_DIR = path.join('/app', 'projects');

// Stellt sicher, dass das Verzeichnis existiert
function ensureProjectsDir() {
    if (!fs.existsSync(PROJECTS_DIR)) {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }
}

// Hilfsfunktion: Führt Shell-Befehle als Promise aus
function runCmd(command, cwd) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env };
        delete env.POSTGRES_HOST; // Verhindert, dass Docker-Compose vom Host alte Werte übernimmt (Kollision mit Supabase-Templates)

        exec(command, { cwd, env }, (error, stdout, stderr) => {
            if (error) return reject(new Error(stderr || error.message));
            resolve(stdout);
        });
    });
}

// Download und Vorbereitung des offiziellen Supabase Docker-Templates
async function ensureTemplate() {
    ensureProjectsDir();
    const templateDir = path.join(PROJECTS_DIR, '.template');

    if (!fs.existsSync(templateDir) || !fs.existsSync(path.join(templateDir, 'docker-compose.yml'))) {
        console.log('[Projects] Lade Supabase Docker Template herunter...');
        // Lade das aktuelle supabase/docker Repo herunter
        const tmpZip = path.join(PROJECTS_DIR, 'supabase-docker.tar.gz');
        await runCmd(`curl -L https://github.com/supabase/supabase/archive/refs/heads/master.tar.gz -o ${tmpZip}`, PROJECTS_DIR);
        await runCmd(`tar -xzf ${tmpZip}`, PROJECTS_DIR);
        await runCmd(`mv supabase-master/docker ${templateDir}`, PROJECTS_DIR);
        await runCmd(`rm -rf supabase-master ${tmpZip}`, PROJECTS_DIR);
        console.log('[Projects] Template erfolgreich geladen.');
    }
    return templateDir;
}

// Generiert ein sicheres zufälliges Passwort
function generatePassword(length = 32) {
    return crypto.randomBytes(length).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
}

// Findet freie Ports ab einer Start-Nummer
async function findFreePorts(startPort, count) {
    // Zur Vereinfachung zählen wir hoch, eine echte Implementierung würde netstat nutzen
    const projects = getProjectsList();
    let maxStudio = 54320;
    let maxApi = 8000;
    let maxDb = 5432;

    projects.forEach(p => {
        if (p.studio_port >= maxStudio) maxStudio = p.studio_port + 1;
        if (p.api_port >= maxApi) maxApi = p.api_port + 1;
        if (p.db_port >= maxDb) maxDb = p.db_port + 1;
    });

    return {
        studio_port: maxStudio > 54320 ? maxStudio : startPort.studio,
        api_port: maxApi > 8000 ? maxApi : startPort.api,
        db_port: maxDb > 5432 ? maxDb : startPort.db
    };
}

function getProjectsList() {
    ensureProjectsDir();
    const projects = [];
    const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });

    for (const dir of dirs) {
        if (dir.isDirectory() && !dir.name.startsWith('.')) {
            const configPath = path.join(PROJECTS_DIR, dir.name, 'project.json');
            if (fs.existsSync(configPath)) {
                try {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    projects.push(config);
                } catch (e) {
                    console.error(e);
                }
            }
        }
    }
    return projects;
}

async function getProjectStatus(slug) {
    try {
        const stdout = await runCmd(`docker compose --project-name supabase-${slug} ps --format json`, path.join(PROJECTS_DIR, slug));
        // ps --format json gibt pro Container eine Zeile JSON aus
        const lines = stdout.trim().split('\n').filter(Boolean);
        if (lines.length === 0) return 'stopped';
        const containers = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        const allRunning = containers.every(c => (c.State || c.status || '').includes('running'));
        const anyRunning = containers.some(c => (c.State || c.status || '').includes('running'));
        if (allRunning) return 'running';
        if (anyRunning) return 'running';
        return 'stopped';
    } catch (e) {
        return 'error';
    }
}

/**
 * GET /projects
 */
router.get('/', async (req, res) => {
    const projects = getProjectsList();

    // Status für alle abfragen
    for (const p of projects) {
        p.status = await getProjectStatus(p.id);
    }

    res.json({ projects });
});

/**
 * POST /projects
 */
router.post('/', async (req, res) => {
    const { name, slug, db_password, jwt_secret } = req.body;

    if (!name || !slug || !/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ error: 'Ungültiger Name oder Slug. Slug darf nur Buchstaben, Zahlen und Bindestriche enthalten.' });
    }

    const projectDir = path.join(PROJECTS_DIR, slug);
    if (fs.existsSync(projectDir)) {
        return res.status(400).json({ error: 'Ein Projekt mit diesem Slug existiert bereits.' });
    }

    try {
        const templateDir = await ensureTemplate();

        // Kopiere Template
        await runCmd(`cp -r ${templateDir} ${projectDir}`, PROJECTS_DIR);

        // Generiere Secrets und Ports
        const ports = await findFreePorts({ studio: 54320, api: 8000, db: 5432 }, 3);
        const dbPass = db_password || generatePassword(32);
        const jwtSecret = jwt_secret || generatePassword(40);
        const anonKey = generatePassword(30);
        const serviceRoleKey = generatePassword(30);

        // Kopiere und passe .env an
        let envContent = fs.readFileSync(path.join(templateDir, '.env.example'), 'utf8');

        // Ersetze Werte
        envContent = envContent
            .replace(/POSTGRES_PASSWORD=.*/g, `POSTGRES_PASSWORD=${dbPass}`)
            .replace(/JWT_SECRET=.*/g, `JWT_SECRET=${jwtSecret}`)
            .replace(/ANON_KEY=.*/g, `ANON_KEY=${anonKey}`)
            .replace(/SERVICE_ROLE_KEY=.*/g, `SERVICE_ROLE_KEY=${serviceRoleKey}`)
            .replace(/STUDIO_PORT=.*/g, `STUDIO_PORT=${ports.studio_port}`)
            .replace(/KONG_HTTP_PORT=.*/g, `KONG_HTTP_PORT=${ports.api_port}`)
            .replace(/KONG_HTTPS_PORT=.*/g, `KONG_HTTPS_PORT=${ports.api_port + 400}`)
            .replace(/POSTGRES_PORT=.*/g, `POSTGRES_PORT=${ports.db_port}`)
            // WICHTIG: API_EXTERNAL_URL muss auf die IP/Host zeigen
            .replace(/API_EXTERNAL_URL=.*/g, `API_EXTERNAL_URL=http://\${HOST_IP:-localhost}:${ports.api_port}`)
            .replace(/SITE_URL=.*/g, `SITE_URL=http://localhost:3000`)
            // Verwende eindeutige Projekt-Namen für das Docker-Netzwerk etc. falls nötig
            .replace(/COMPOSE_PROJECT_NAME=.*/g, `COMPOSE_PROJECT_NAME=supabase-${slug}`);

        envContent += `\nSTUDIO_PORT=${ports.studio_port}\nPOOLER_PROXY_PORT_TRANSACTION=${ports.db_port + 1111}\n`;
        fs.writeFileSync(path.join(projectDir, '.env'), envContent);

        // Update docker-compose.yml so Docker Host knows absolute paths
        let dockerYmlPath = path.join(projectDir, 'docker-compose.yml');
        let dockerYml = fs.readFileSync(dockerYmlPath, 'utf8');
        const hostProjectPath = process.env.HOST_PROJECTS_DIR ? path.join(process.env.HOST_PROJECTS_DIR, slug) : projectDir;
        dockerYml = dockerYml.replace(/\.\//g, `${hostProjectPath}/`);

        // Remove fixed container_names to allow multi-tenancy (Docker Compose will auto-generate unique names)
        dockerYml = dockerYml.replace(/container_name: .*/g, '');

        // Expose studio port since new Supabase templates do not expose it by default
        dockerYml = dockerYml.replace(
            /(\s+image: supabase\/studio.*?)\n/m,
            `$1\n    ports:\n      - \${STUDIO_PORT}:3000\n`
        );

        fs.writeFileSync(dockerYmlPath, dockerYml);

        // Speichere Projekt-Metadaten
        const projectMeta = {
            id: slug,
            name,
            studio_port: ports.studio_port,
            api_port: ports.api_port,
            db_port: ports.db_port,
            created_at: new Date().toISOString()
        };
        fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(projectMeta, null, 2));

        // Erstelle Nginx-Konfiguration
        const domain = process.env.DOMAIN;
        if (domain) {
            const nginxConf = `
# Nginx Configuration for Supabase Project: ${name} (${slug})
server {
    listen 80;
    server_name api-${slug}.${domain};
    location / {
        proxy_pass http://host.docker.internal:${ports.api_port};
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
server {
    listen 80;
    server_name studio-${slug}.${domain};
    location / {
        proxy_pass http://host.docker.internal:${ports.studio_port};
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
            const nginxConfPath = path.join('/etc/nginx-managed/conf.d', `${slug}.conf`);
            try {
                fs.writeFileSync(nginxConfPath, nginxConf);
                await runCmd('docker exec auth-nginx nginx -s reload', PROJECTS_DIR).catch(() => { });
            } catch (e) {
                console.error('[Projects] Fehler beim Schreiben der Nginx-Konfiguration:', e);
            }
        }

        await runCmd(`docker compose --project-name supabase-${slug} up -d`, projectDir);

        res.json({ message: 'Projekt erfolgreich erstellt', project: projectMeta });

    } catch (error) {
        console.error(error);
        // Bei Fehler aufräumen
        if (fs.existsSync(projectDir)) {
            await runCmd(`rm -rf ${projectDir}`, PROJECTS_DIR).catch(() => { });
        }
        res.status(500).json({ error: 'Fehler beim Erstellen des Projekts: ' + error.message });
    }
});

/**
 * GET /projects/:id
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const configPath = path.join(PROJECTS_DIR, id, 'project.json');

    if (!fs.existsSync(configPath)) {
        return res.status(404).json({ error: 'Projekt nicht gefunden' });
    }

    const project = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    project.status = await getProjectStatus(id);

    res.json({ project });
});

/**
 * POST /projects/:id/action
 */
router.post('/:id/action', async (req, res) => {
    const { id } = req.params;
    const { action } = req.body;
    const projectDir = path.join(PROJECTS_DIR, id);

    if (!fs.existsSync(projectDir)) {
        return res.status(404).json({ error: 'Projekt nicht gefunden' });
    }

    const validActions = ['start', 'stop', 'restart'];
    if (!validActions.includes(action)) {
        return res.status(400).json({ error: 'Ungültige Aktion' });
    }

    try {
        let cmd = '';
        if (action === 'start') cmd = `docker compose --project-name supabase-${id} start`;
        if (action === 'stop') cmd = `docker compose --project-name supabase-${id} stop`;
        if (action === 'restart') cmd = `docker compose --project-name supabase-${id} restart`;

        await runCmd(cmd, projectDir);
        res.json({ message: `Aktion ${action} erfolgreich` });
    } catch (error) {
        res.status(500).json({ error: 'Aktion fehlgeschlagen: ' + error.message });
    }
});

/**
 * DELETE /projects/:id
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const projectDir = path.join(PROJECTS_DIR, id);

    if (!fs.existsSync(projectDir)) {
        return res.status(404).json({ error: 'Projekt nicht gefunden' });
    }

    try {
        // Container und Volumes löschen -> -v ist sehr wichtig um db_data zu clearen
        await runCmd(`docker compose --project-name supabase-${id} down -v`, projectDir).catch(() => { });

        // Ordner löschen
        await runCmd(`rm -rf ${projectDir}`, PROJECTS_DIR);

        res.json({ message: 'Projekt erfolgreich gelöscht' });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Löschen: ' + error.message });
    }
});

/**
 * GET /projects/:id/auth
 */
router.get('/:id/auth', async (req, res) => {
    const { id } = req.params;
    const envPath = path.join(PROJECTS_DIR, id, '.env');

    if (!fs.existsSync(envPath)) {
        return res.status(404).json({ error: 'Projekt nicht gefunden' });
    }

    try {
        const envConfig = dotenv.parse(fs.readFileSync(envPath));

        const authConfig = {
            customDomain: envConfig.CUSTOM_DOMAIN || '',
            siteUrl: envConfig.SITE_URL || '',
            additionalRedirectUrls: envConfig.ADDITIONAL_REDIRECT_URLS || '',
            emailPaths: {
                confirmation: envConfig.MAILER_URLPATHS_CONFIRMATION || '/auth/v1/verify',
                invite: envConfig.MAILER_URLPATHS_INVITE || '/auth/v1/verify',
                recovery: envConfig.MAILER_URLPATHS_RECOVERY || '/auth/v1/verify',
                emailChange: envConfig.MAILER_URLPATHS_EMAIL_CHANGE || '/auth/v1/verify',
            },
            github: {
                enabled: envConfig.GOTRUE_EXTERNAL_GITHUB_ENABLED === 'true',
                clientId: envConfig.GOTRUE_EXTERNAL_GITHUB_CLIENT_ID || '',
                secret: envConfig.GOTRUE_EXTERNAL_GITHUB_SECRET || '',
            },
            google: {
                enabled: envConfig.GOTRUE_EXTERNAL_GOOGLE_ENABLED === 'true',
                clientId: envConfig.GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID || '',
                secret: envConfig.GOTRUE_EXTERNAL_GOOGLE_SECRET || '',
            }
        };

        const domain = process.env.DOMAIN;
        // Dynamische Bestimmung der Callback URL für das UI
        const externalUrl = envConfig.API_EXTERNAL_URL || 'http://localhost';
        const callbackUrl = domain ? `https://api-${id}.${domain}/auth/v1/callback` : `${externalUrl}/auth/v1/callback`;

        res.json({ auth: authConfig, callbackUrl });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Lesen der Auth Config' });
    }
});

/**
 * PUT /projects/:id/auth
 */
router.put('/:id/auth', async (req, res) => {
    const { id } = req.params;
    const { providers } = req.body;
    const projectDir = path.join(PROJECTS_DIR, id);
    const envPath = path.join(projectDir, '.env');

    if (!fs.existsSync(envPath)) {
        return res.status(404).json({ error: 'Projekt nicht gefunden' });
    }

    try {
        let envContent = fs.readFileSync(envPath, 'utf8');

        // Dynamischer Callback für OAuth basiert auf der Domain, falls konfiguriert
        const domain = process.env.DOMAIN;

        // Die Domain-Logik
        const customDomain = providers?.customDomain?.trim() || '';
        let publicApiUrl = '';
        if (customDomain) {
            publicApiUrl = customDomain.startsWith('http') ? customDomain : `https://${customDomain}`;
        } else if (domain) {
            publicApiUrl = `https://api-${id}.${domain}`;
        } else {
            publicApiUrl = envContent.match(/^API_EXTERNAL_URL=(.*)$/m)?.[1] || '';
        }

        const callbackUrl = `${publicApiUrl}/auth/v1/callback`;

        const updates = {
            CUSTOM_DOMAIN: customDomain,
            API_EXTERNAL_URL: publicApiUrl,
            SITE_URL: providers?.siteUrl || envContent.match(/^SITE_URL=(.*)$/m)?.[1] || '',
            ADDITIONAL_REDIRECT_URLS: providers?.additionalRedirectUrls || envContent.match(/^ADDITIONAL_REDIRECT_URLS=(.*)$/m)?.[1] || '',

            MAILER_URLPATHS_CONFIRMATION: providers?.emailPaths?.confirmation || '/auth/v1/verify',
            MAILER_URLPATHS_INVITE: providers?.emailPaths?.invite || '/auth/v1/verify',
            MAILER_URLPATHS_RECOVERY: providers?.emailPaths?.recovery || '/auth/v1/verify',
            MAILER_URLPATHS_EMAIL_CHANGE: providers?.emailPaths?.emailChange || '/auth/v1/verify',

            GOTRUE_EXTERNAL_GITHUB_ENABLED: providers?.github?.enabled ? 'true' : 'false',
            GOTRUE_EXTERNAL_GITHUB_CLIENT_ID: providers?.github?.clientId || '',
            GOTRUE_EXTERNAL_GITHUB_SECRET: providers?.github?.secret || '',
            GOTRUE_EXTERNAL_GITHUB_REDIRECT_URI: providers?.github?.enabled ? callbackUrl : '',

            GOTRUE_EXTERNAL_GOOGLE_ENABLED: providers?.google?.enabled ? 'true' : 'false',
            GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: providers?.google?.clientId || '',
            GOTRUE_EXTERNAL_GOOGLE_SECRET: providers?.google?.secret || '',
            GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: providers?.google?.enabled ? callbackUrl : '',
        };

        for (const [key, value] of Object.entries(updates)) {
            const regex = new RegExp(`^${key}=.*`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }
        }

        fs.writeFileSync(envPath, envContent);

        // Docker restart auth (damit Gotrue neue ENV einliest)
        // Nutze up -d, damit Compose falls nötig den Container neu baut/startet
        await runCmd(`docker compose --project-name supabase-${id} up -d auth`, projectDir).catch(() => { });

        res.json({ message: 'Auth Konfiguration aktualisiert' });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Speichern: ' + error.message });
    }
});

module.exports = router;
