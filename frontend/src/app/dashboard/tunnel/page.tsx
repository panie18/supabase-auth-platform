"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, Save, RefreshCw, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { tunnelApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import type { TunnelStatus } from "@/types";

export default function TunnelPage() {
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState("");
  const [configYaml, setConfigYaml] = useState("");
  const [mode, setMode] = useState<"token" | "config">("token");
  const { toast } = useToast();

  async function loadData() {
    setLoading(true);
    try {
      const [statusRes, configRes] = await Promise.all([
        tunnelApi.status(),
        tunnelApi.getConfig(),
      ]);
      setStatus(statusRes.data);
      setConfigYaml(configRes.data.content || "");
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleSaveToken() {
    if (!token) return;
    setSaving(true);
    try {
      await tunnelApi.configure({ token });
      toast({ title: "Tunnel-Token gespeichert", description: "Starte den cloudflared-Container neu." });
      setToken("");
      loadData();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateConfig() {
    setGenerating(true);
    try {
      const { data } = await tunnelApi.generateConfig();
      setConfigYaml(data.yaml || "");
      toast({ title: "Standard-Konfiguration generiert" });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteConfig() {
    try {
      await tunnelApi.deleteConfig();
      toast({ title: "Tunnel-Konfiguration entfernt" });
      loadData();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div>
      <Header title="Tunnel-Verwaltung" subtitle="Cloudflare Tunnel Konfiguration" onRefresh={loadData} />

      <div className="p-6 space-y-6">
        {/* Status */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {status?.running ? (
                  <Cloud className="h-10 w-10 text-primary" />
                ) : (
                  <CloudOff className="h-10 w-10 text-muted-foreground" />
                )}
                <div>
                  <p className="font-semibold">{status?.tunnel_name || "Kein Tunnel"}</p>
                  <p className="text-sm text-muted-foreground">
                    Modus: {status?.mode || "–"} · Token: {status?.token_set ? "Gesetzt" : "Nicht gesetzt"}
                  </p>
                </div>
              </div>
              <Badge variant={status?.running ? "success" : "secondary"}>
                {status?.running ? "Online" : "Offline"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Modus-Auswahl */}
        <div className="flex gap-2">
          <Button variant={mode === "token" ? "default" : "outline"} size="sm" onClick={() => setMode("token")}>
            Token-Modus
          </Button>
          <Button variant={mode === "config" ? "default" : "outline"} size="sm" onClick={() => setMode("config")}>
            Config-Modus
          </Button>
        </div>

        {/* Token-Modus */}
        {mode === "token" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cloudflare Tunnel Token</CardTitle>
              <CardDescription>
                Erstelle einen Tunnel im Cloudflare Dashboard (Zero Trust → Networks → Tunnels),
                kopiere den Token und füge ihn hier ein.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tunnel Token</Label>
                <Input
                  type="password"
                  placeholder="eyJhbGciOiJSUzI1NiJ9..."
                  value={token}
                  onChange={e => setToken(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Token aus dem Cloudflare Dashboard: Zero Trust → Networks → Tunnels → Tunnel erstellen → Token kopieren
                </p>
              </div>
              <Button onClick={handleSaveToken} disabled={saving || !token} size="sm">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Token speichern
              </Button>

              {/* Schritt-für-Schritt Anleitung */}
              <div className="rounded-md bg-muted p-4 text-sm space-y-2">
                <p className="font-medium">Einrichtungs-Anleitung:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Gehe zu <a href="https://one.dash.cloudflare.com" target="_blank" rel="noopener" className="text-primary hover:underline">dash.cloudflare.com → Zero Trust</a></li>
                  <li>Networks → Tunnels → "Einen Tunnel erstellen"</li>
                  <li>Wähle "Cloudflared" als Connector-Typ</li>
                  <li>Gib dem Tunnel einen Namen (z.B. "supabase-auth")</li>
                  <li>Kopiere den Token und füge ihn oben ein</li>
                  <li>Konfiguriere Public Hostnames für deine Domains</li>
                  <li>Starte den cloudflared Container: <code className="bg-background px-1 rounded text-xs">docker compose --profile tunnel up -d cloudflared</code></li>
                </ol>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Config-Modus */}
        {mode === "config" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Tunnel Konfigurationsdatei</CardTitle>
                <CardDescription>config.yml für cloudflared</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleGenerateConfig} disabled={generating}>
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Standard generieren
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="w-full h-64 rounded-md border bg-muted font-mono text-xs p-3 focus:outline-none focus:ring-2 focus:ring-ring"
                value={configYaml}
                onChange={e => setConfigYaml(e.target.value)}
                spellCheck={false}
                placeholder="# config.yml wird hier angezeigt / generiert"
              />
              <p className="text-xs text-muted-foreground">
                Die Konfiguration wird in /etc/cloudflare/config.yml gespeichert.
                Credentials-Datei muss separat eingerichtet werden.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Tunnel löschen */}
        {status?.configured && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <p className="font-medium text-destructive">Tunnel-Konfiguration entfernen</p>
                <p className="text-sm text-muted-foreground">Token und Konfigurationsdatei löschen</p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleDeleteConfig}>
                Konfiguration entfernen
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
