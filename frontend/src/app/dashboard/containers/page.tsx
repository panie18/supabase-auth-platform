"use client";

import { useEffect, useState, useCallback } from "react";
import { Play, Square, RotateCw, Pause, Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Header } from "@/components/layout/header";
import { dockerApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { formatRelativeTime, formatBytes } from "@/lib/utils";
import type { ContainerInfo, ContainerStats } from "@/types";
import Link from "next/link";

function StateBadge({ state }: { state: string }) {
  const variant =
    state === "running" ? "success" :
    state === "paused" ? "warning" :
    state === "restarting" ? "default" : "secondary";
  return <Badge variant={variant}>{state}</Badge>;
}

export default function ContainersPage() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [stats, setStats] = useState<{ [id: string]: ContainerStats }>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const loadContainers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await dockerApi.listContainers();
      setContainers(data);
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  async function loadStats(containers: ContainerInfo[]) {
    const running = containers.filter(c => c.state === "running");
    const results = await Promise.allSettled(
      running.map(c => dockerApi.getStats(c.id).then(r => ({ id: c.id, stats: r.data })))
    );
    const newStats: typeof stats = {};
    results.forEach(r => {
      if (r.status === "fulfilled") newStats[r.value.id] = r.value.stats;
    });
    setStats(newStats);
  }

  useEffect(() => {
    loadContainers();
  }, [loadContainers]);

  useEffect(() => {
    if (containers.length > 0) loadStats(containers);
  }, [containers]);

  async function handleAction(id: string, action: string) {
    setActionLoading(`${id}-${action}`);
    try {
      const { data } = await dockerApi.action(id, action);
      toast({ title: `${action} ausgeführt`, description: `Container-Status: ${data.state?.Status}` });
      loadContainers();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.response?.data?.error || err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  function isLoading(id: string, action: string) {
    return actionLoading === `${id}-${action}`;
  }

  return (
    <div>
      <Header
        title="Container-Verwaltung"
        subtitle={`${containers.filter(c => c.state === "running").length} von ${containers.length} Container laufen`}
        onRefresh={loadContainers}
      />

      <div className="p-6 space-y-4">
        {/* Statistik */}
        <div className="grid gap-3 sm:grid-cols-4">
          {["running", "paused", "restarting", "exited"].map(state => (
            <Card key={state}>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground capitalize">{state}</p>
                <p className="text-2xl font-bold">
                  {containers.filter(c => c.state === state).length}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Container-Tabelle */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alle Container</CardTitle>
            <CardDescription>Docker Container des Supabase Auth Stacks</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>RAM</TableHead>
                  <TableHead>Erstellt</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : containers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Keine Container gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  containers.map(c => {
                    const s = stats[c.id];
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{c.id}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {c.image}
                        </TableCell>
                        <TableCell>
                          <StateBadge state={c.state} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {s ? `${s.cpu_percent.toFixed(1)}%` : "–"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {s ? `${s.memory_usage_mb.toFixed(0)} MB` : "–"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatRelativeTime(c.created)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {c.state !== "running" && (
                              <Button variant="ghost" size="icon" title="Starten"
                                onClick={() => handleAction(c.id, "start")}
                                disabled={!!actionLoading}>
                                {isLoading(c.id, "start") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 text-green-600" />}
                              </Button>
                            )}
                            {c.state === "running" && (
                              <>
                                <Button variant="ghost" size="icon" title="Stoppen"
                                  onClick={() => handleAction(c.id, "stop")}
                                  disabled={!!actionLoading}>
                                  {isLoading(c.id, "stop") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 text-red-500" />}
                                </Button>
                                <Button variant="ghost" size="icon" title="Pausieren"
                                  onClick={() => handleAction(c.id, "pause")}
                                  disabled={!!actionLoading}>
                                  {isLoading(c.id, "pause") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                                </Button>
                              </>
                            )}
                            {c.state === "paused" && (
                              <Button variant="ghost" size="icon" title="Fortsetzen"
                                onClick={() => handleAction(c.id, "unpause")}
                                disabled={!!actionLoading}>
                                <Play className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" title="Neustarten"
                              onClick={() => handleAction(c.id, "restart")}
                              disabled={!!actionLoading}>
                              {isLoading(c.id, "restart") ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                            </Button>
                            <Link href={`/dashboard/logs?container=${c.id}&name=${c.name}`}>
                              <Button variant="ghost" size="icon" title="Logs anzeigen">
                                <Activity className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
