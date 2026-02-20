"use client";

import { useEffect, useState } from "react";
import { Globe, CheckCircle, XCircle, Save, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { domainsApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import type { DomainConfig } from "@/types";

export default function DomainsPage() {
  const [config, setConfig] = useState<DomainConfig | null>(null);
  const [form, setForm] = useState({ domain: "", auth_subdomain: "", dashboard_subdomain: "" });
  const [validation, setValidation] = useState<{ [key: string]: { valid: boolean; addresses?: string[] } }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [nginxConfig, setNginxConfig] = useState("");
  const [editingNginx, setEditingNginx] = useState(false);
  const { toast } = useToast();

  async function loadData() {
    setLoading(true);
    try {
      const [domRes, nginxRes] = await Promise.all([
        domainsApi.get(),
        domainsApi.getNginxConfig(),
      ]);
      setConfig(domRes.data);
      setForm({
        domain: domRes.data.domain || "",
        auth_subdomain: domRes.data.auth_subdomain || "",
        dashboard_subdomain: domRes.data.dashboard_subdomain || "",
      });
      setNginxConfig(nginxRes.data.content || "");
    } catch (err: any) {
      toast({ title: "Fehler beim Laden", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleValidate(domain: string, key: string) {
    if (!domain) return;
    setValidating(key);
    try {
      const { data } = await domainsApi.validate(domain);
      setValidation(v => ({ ...v, [key]: { valid: data.valid, addresses: data.addresses } }));
    } finally {
      setValidating(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await domainsApi.update(form);
      toast({ title: "Domain-Konfiguration gespeichert", description: "Nginx-Neustart erforderlich." });
      loadData();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.response?.data?.error || err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNginx() {
    setSaving(true);
    try {
      await domainsApi.updateNginxConfig(nginxConfig);
      toast({ title: "Nginx-Konfiguration gespeichert" });
      setEditingNginx(false);
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const domains = [
    { key: "domain", label: "Haupt-Domain", placeholder: "yourdomain.com", value: form.domain, prefix: "" },
    { key: "auth_subdomain", label: "Auth-Subdomain (GoTrue)", placeholder: "auth.yourdomain.com", value: form.auth_subdomain, prefix: "" },
    { key: "dashboard_subdomain", label: "Dashboard-Subdomain", placeholder: "dashboard.yourdomain.com", value: form.dashboard_subdomain, prefix: "" },
  ];

  return (
    <div>
      <Header title="Domain-Verwaltung" subtitle="Konfiguriere Domains und Nginx" onRefresh={loadData}>
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Speichern
        </Button>
      </Header>

      <div className="p-6 space-y-6">
        {/* Domain Konfiguration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" /> Domain-Einstellungen
            </CardTitle>
            <CardDescription>
              Konfiguriere deine Domains. DNS-Records müssen auf deinen Server zeigen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <div className="animate-pulse space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-16 rounded bg-muted" />)}
              </div>
            ) : (
              domains.map(({ key, label, placeholder, value }) => (
                <div key={key} className="space-y-2">
                  <Label>{label}</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder={placeholder}
                      value={value}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    />
                    <Button
                      variant="outline" size="sm"
                      onClick={() => handleValidate(value, key)}
                      disabled={!value || validating === key}
                    >
                      {validating === key ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "DNS prüfen"
                      )}
                    </Button>
                  </div>
                  {validation[key] && (
                    <div className="flex items-center gap-2 text-sm">
                      {validation[key].valid ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-green-700">Erreichbar: {validation[key].addresses?.join(", ")}</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-destructive" />
                          <span className="text-destructive">DNS nicht auflösbar – prüfe deinen A-Record</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* DNS Hinweise */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">DNS-Konfiguration Hinweise</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Richte folgende DNS-Records bei deinem Provider ein:</p>
              <div className="rounded-md bg-muted font-mono p-4 text-xs space-y-1">
                <div className="grid grid-cols-4 gap-2 font-semibold text-foreground border-b pb-1 mb-2">
                  <span>Typ</span><span>Name</span><span>Wert</span><span>TTL</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <span>A</span><span>{form.domain || "yourdomain.com"}</span><span>DEINE_SERVER_IP</span><span>300</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <span>A</span><span>{form.auth_subdomain || "auth.yourdomain.com"}</span><span>DEINE_SERVER_IP</span><span>300</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <span>A</span><span>{form.dashboard_subdomain || "dashboard.yourdomain.com"}</span><span>DEINE_SERVER_IP</span><span>300</span>
                </div>
              </div>
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-yellow-800">
                <strong>Firewall:</strong> Port 80 (HTTP) und 443 (HTTPS) müssen für Let's Encrypt und den Webserver geöffnet sein.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nginx Konfiguration */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Nginx-Konfiguration (Experten)</CardTitle>
              <CardDescription>Direkte Bearbeitung der Nginx-Konfiguration</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditingNginx(e => !e)}>
              {editingNginx ? "Abbrechen" : "Bearbeiten"}
            </Button>
          </CardHeader>
          {editingNginx && (
            <CardContent className="space-y-3">
              <textarea
                className="w-full h-64 rounded-md border bg-muted font-mono text-xs p-3 focus:outline-none focus:ring-2 focus:ring-ring"
                value={nginxConfig}
                onChange={e => setNginxConfig(e.target.value)}
                spellCheck={false}
              />
              <Button onClick={handleSaveNginx} disabled={saving} size="sm">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Nginx-Config speichern
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
