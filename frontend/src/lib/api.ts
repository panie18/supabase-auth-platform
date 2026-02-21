import axios from "axios";

// API-Basis-URL: Im Browser über Next.js Rewrite (→ /api/...),
// im Build über NEXT_PUBLIC_API_URL
const BASE_URL = "/api";

// Axios-Instanz mit Auth-Token
const api = axios.create({ baseURL: BASE_URL });

// Token aus localStorage automatisch anhängen
api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 → zur Login-Seite weiterleiten
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ─── Auth ────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    api.post("/auth/login", { username, password }),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
};

// ─── Docker ──────────────────────────────────────────────────
export const dockerApi = {
  listContainers: () => api.get("/docker/containers"),
  getContainer: (id: string) => api.get(`/docker/containers/${id}`),
  action: (id: string, action: string) =>
    api.post(`/docker/containers/${id}/action`, { action }),
  getLogs: (id: string, lines = 200) =>
    api.get(`/docker/logs/${id}`, { params: { lines } }),
  getStats: (id: string) => api.get(`/docker/stats/${id}`),
  listImages: () => api.get("/docker/images"),
  getSystemResources: () => api.get("/docker/system/resources"),
};

// ─── Domains ─────────────────────────────────────────────────
export const domainsApi = {
  get: () => api.get("/domains"),
  update: (data: {
    domain: string;
    auth_subdomain?: string;
    dashboard_subdomain?: string;
  }) => api.put("/domains", data),
  validate: (domain: string) => api.post("/domains/validate", { domain }),
  getNginxConfig: () => api.get("/domains/nginx-config"),
  updateNginxConfig: (content: string) =>
    api.put("/domains/nginx-config", { content }),
};

// ─── SSL ─────────────────────────────────────────────────────
export const sslApi = {
  status: () => api.get("/ssl/status"),
  request: (data: {
    domains: string[];
    email: string;
    staging?: boolean;
  }) => api.post("/ssl/request", data),
  renew: () => api.post("/ssl/renew"),
  delete: (domain: string) => api.delete(`/ssl/${domain}`),
};

// ─── Tunnel ──────────────────────────────────────────────────
export const tunnelApi = {
  status: () => api.get("/tunnel/status"),
  configure: (data: {
    token?: string;
    ingress?: object[];
    tunnel_name?: string;
  }) => api.post("/tunnel/configure", data),
  getConfig: () => api.get("/tunnel/config"),
  generateConfig: () => api.post("/tunnel/generate-config"),
  deleteConfig: () => api.delete("/tunnel/config"),
};

// ─── Onboarding ───────────────────────────────────────────────
export const onboardingApi = {
  status: () => api.get("/onboarding/status"),
  saveDomain: (data: { domain: string; auth_subdomain?: string; dashboard_subdomain?: string }) =>
    api.post("/onboarding/domain", data),
  saveSSL: (email: string) => api.post("/onboarding/ssl", { email }),
  saveTunnel: (token: string) => api.post("/onboarding/tunnel", { token }),
  skipTunnel: () => api.post("/onboarding/tunnel", { skip: true }),
  saveSMTP: (data: { host: string; port?: number; user: string; pass: string; from_email?: string }) =>
    api.post("/onboarding/smtp", data),
  skipSMTP: () => api.post("/onboarding/smtp", { skip: true }),
  complete: () => api.post("/onboarding/complete"),
};

// ─── ENV / Einstellungen ──────────────────────────────────────
export const envApi = {
  get: () => api.get("/env"),
  getRaw: () => api.get("/env/raw"),
  update: (updates: Array<{ key: string; value: string }>) =>
    api.put("/env", { updates }),
  updateRaw: (content: string) => api.put("/env/raw", { content }),
  restartServices: () => api.post("/env/restart-services"),
};

// ─── Projekte (Supabase Instanzen) ───────────────────────────
export const projectsApi = {
  list: () => api.get("/projects"),
  create: (data: { name: string; slug: string; db_password?: string; jwt_secret?: string }) => api.post("/projects", data),
  get: (id: string) => api.get(`/projects/${id}`),
  delete: (id: string) => api.delete(`/projects/${id}`),
  action: (id: string, action: "start" | "stop" | "restart") => api.post(`/projects/${id}/action`, { action }),
  getAuth: (id: string) => api.get(`/projects/${id}/auth`),
  updateAuth: (id: string, providers: any) => api.put(`/projects/${id}/auth`, { providers })
};

// ─── OAuth Konfiguration ──────────────────────────────────────
export const oauthApi = {
  get: () => api.get("/oauth"),
  update: (uri_allow_list: string) => api.put("/oauth", { uri_allow_list }),
};

export default api;
