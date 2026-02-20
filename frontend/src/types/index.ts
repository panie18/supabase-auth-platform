// ─── GoTrue Benutzer ─────────────────────────────────────────
export interface GoTrueUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  role: string;
  app_metadata: {
    provider?: string;
    [key: string]: unknown;
  };
  user_metadata: {
    [key: string]: unknown;
  };
  banned_until: string | null;
  confirmed_at: string | null;
}

export interface UsersResponse {
  users: GoTrueUser[];
  total: number;
  next_page: number | null;
}

export interface UserStats {
  total: number;
  confirmed: number;
  banned: number;
  last_week: number;
}

// ─── Docker ──────────────────────────────────────────────────
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "exited" | "paused" | "restarting" | "dead";
  created: string;
  ports: Array<{
    IP?: string;
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }>;
}

export interface ContainerStats {
  cpu_percent: number;
  memory_usage_mb: number;
  memory_limit_mb: number;
  memory_percent: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
}

export interface LogLine {
  stream: "stdout" | "stderr";
  text: string;
}

// ─── Domains ─────────────────────────────────────────────────
export interface DomainConfig {
  domain: string;
  auth_subdomain: string;
  dashboard_subdomain: string;
  site_url: string;
  nginx_configs: string[];
}

// ─── SSL ─────────────────────────────────────────────────────
export interface CertInfo {
  exists: boolean;
  domain: string;
  cert_path?: string;
  issued?: string;
  expires?: string;
  days_remaining?: number;
}

export interface SSLStatus {
  domains: CertInfo[];
  certbot_available: boolean;
  auto_renew: boolean;
}

// ─── Tunnel ──────────────────────────────────────────────────
export interface TunnelStatus {
  configured: boolean;
  token_set: boolean;
  tunnel_name: string;
  running: boolean;
  config: object | null;
  mode: "token" | "config-file";
}
