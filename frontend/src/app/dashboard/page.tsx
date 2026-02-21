"use client";

import { useEffect, useState } from "react";
import { Users, ShieldCheck, Container, Cloud, TrendingUp, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/layout/header";
import { dockerApi, sslApi, tunnelApi } from "@/lib/api";
import type { ContainerInfo, SSLStatus, TunnelStatus } from "@/types";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  badge?: { label: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" };
}

function StatCard({ title, value, description, icon: Icon, badge }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold">{value}</div>
          {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [systemResources, setSystemResources] = useState<any>(null);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [ssl, setSsl] = useState<SSLStatus | null>(null);
  const [tunnel, setTunnel] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [statsRes, containersRes, sslRes, tunnelRes] = await Promise.allSettled([
        dockerApi.getSystemResources(),
        dockerApi.listContainers(),
        sslApi.status(),
        tunnelApi.status(),
      ]);
      if (statsRes.status === "fulfilled") setSystemResources(statsRes.value.data);
      if (containersRes.status === "fulfilled") setContainers(containersRes.value.data);
      if (sslRes.status === "fulfilled") setSsl(sslRes.value.data);
      if (tunnelRes.status === "fulfilled") setTunnel(tunnelRes.value.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const runningContainers = containers.filter(c => c.state === "running").length;
  const sslValid = ssl?.domains.filter(d => d.exists && (d.days_remaining ?? 0) > 7).length ?? 0;
  const sslExpiring = ssl?.domains.filter(d => d.exists && (d.days_remaining ?? 0) <= 7).length ?? 0;

  return (
    <div>
      <Header title="Übersicht" subtitle="Supabase Auth Platform Dashboard" onRefresh={loadData} />
      <div className="p-6 space-y-6">

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Host System"
            value={loading ? "–" : `${systemResources?.cpu_percent ?? 0} % CPU`}
            description={`${systemResources?.memory_used_mb ?? 0} MB RAM`}
            icon={Activity}
            badge={{ label: `${systemResources?.memory_percent ?? 0}% RAM Out of ${systemResources?.memory_total_mb ?? 0}MB`, variant: "secondary" }}
          />
          <StatCard
            title="Container"
            value={loading ? "–" : `${runningContainers}/${containers.length}`}
            description="laufend / gesamt"
            icon={Container}
            badge={{
              label: runningContainers === containers.length ? "Alle aktiv" : "Prüfen",
              variant: runningContainers === containers.length ? "success" : "warning",
            }}
          />
          <StatCard
            title="SSL-Zertifikate"
            value={loading ? "–" : `${sslValid} / ${ssl?.domains.length ?? 0}`}
            description={sslExpiring > 0 ? `${sslExpiring} läuft bald ab` : "Alle gültig"}
            icon={ShieldCheck}
            badge={{
              label: sslExpiring > 0 ? "Ablaufend" : "Gültig",
              variant: sslExpiring > 0 ? "warning" : "success",
            }}
          />
          <StatCard
            title="Tunnel"
            value={loading ? "–" : (tunnel?.running ? "Aktiv" : "Inaktiv")}
            description={tunnel?.tunnel_name || "Nicht konfiguriert"}
            icon={Cloud}
            badge={{
              label: tunnel?.running ? "Online" : "Offline",
              variant: tunnel?.running ? "success" : "secondary",
            }}
          />
        </div>

        {/* Container Status */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Container Status</CardTitle>
              <CardDescription>Alle Docker-Container im Überblick</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-8 rounded bg-muted" />)}
                  </div>
                ) : containers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Container gefunden</p>
                ) : (
                  containers.map(c => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${c.state === "running" ? "bg-green-500" : "bg-red-400"}`} />
                        <span className="text-sm font-medium">{c.name}</span>
                      </div>
                      <Badge variant={c.state === "running" ? "success" : "secondary"} className="text-xs">
                        {c.state}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* SSL Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SSL-Zertifikate</CardTitle>
              <CardDescription>Let's Encrypt Zertifikate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {loading ? (
                  <div className="animate-pulse space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-8 rounded bg-muted" />)}
                  </div>
                ) : !ssl?.domains.length ? (
                  <p className="text-sm text-muted-foreground">Keine SSL-Konfiguration</p>
                ) : (
                  ssl.domains.map(cert => (
                    <div key={cert.domain} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span className="text-sm font-medium truncate">{cert.domain}</span>
                      <Badge
                        variant={cert.exists ? (cert.days_remaining! > 14 ? "success" : "warning") : "secondary"}
                        className="text-xs shrink-0"
                      >
                        {cert.exists ? `${cert.days_remaining}d` : "Kein Cert"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Systemstatus
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">Load Average</p>
                <p className="text-xl font-bold">{systemResources?.loadavg ? `[${systemResources.loadavg.map((l: any) => l.toFixed(2)).join(', ')}]` : "–"}</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">Tunnel-Modus</p>
                <p className="text-xl font-bold">{tunnel?.mode ?? "–"}</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">Certbot</p>
                <p className="text-xl font-bold">{ssl?.certbot_available ? "Verfügbar" : "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
