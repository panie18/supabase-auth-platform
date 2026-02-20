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

// ─── Benutzer ────────────────────────────────────────────────
export const usersApi = {
  list: (page = 1, perPage = 50, query = "") =>
    api.get("/users", { params: { page, per_page: perPage, query } }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: {
    email: string;
    password: string;
    role?: string;
    email_confirm?: boolean;
  }) => api.post("/users", data),
  update: (id: string, data: object) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  ban: (id: string, banned: boolean) =>
    api.post(`/users/${id}/ban`, { banned }),
  resetPassword: (id: string, password: string) =>
    api.post(`/users/${id}/reset-password`, { password }),
  stats: () => api.get("/users/stats/overview"),
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

// ─── ENV / Einstellungen ──────────────────────────────────────
export const envApi = {
  get: () => api.get("/env"),
  getRaw: () => api.get("/env/raw"),
  update: (updates: Array<{ key: string; value: string }>) =>
    api.put("/env", { updates }),
  updateRaw: (content: string) => api.put("/env/raw", { content }),
  restartServices: () => api.post("/env/restart-services"),
};

export default api;
