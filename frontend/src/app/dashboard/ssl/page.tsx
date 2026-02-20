"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Shield, RefreshCw, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Header } from "@/components/layout/header";
import { sslApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";
import type { SSLStatus, CertInfo } from "@/types";

function CertCard({ cert, onDelete }: { cert: CertInfo; onDelete: (d: string) => void }) {
  const isExpiring = cert.exists && (cert.days_remaining ?? 0) <= 14;
  const isValid = cert.exists && (cert.days_remaining ?? 0) > 14;

  return (
    <div className="flex items-center justify-between rounded-md border p-4">
      <div className="flex items-center gap-3">
        {isValid ? (
          <ShieldCheck className="h-8 w-8 text-green-500" />
        ) : isExpiring ? (
          <ShieldAlert className="h-8 w-8 text-yellow-500" />
        ) : (
          <Shield className="h-8 w-8 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">{cert.domain}</p>
          {cert.exists ? (
            <p className="text-xs text-muted-foreground">
              Läuft ab: {cert.expires ? formatDate(cert.expires) : "–"} ({cert.days_remaining} Tage)
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Kein Zertifikat vorhanden</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={isValid ? "success" : isExpiring ? "warning" : "secondary"}>
          {isValid ? "Gültig" : isExpiring ? "Läuft ab" : "Kein Cert"}
        </Badge>
        {cert.exists && (
          <Button variant="ghost" size="icon" onClick={() => onDelete(cert.domain)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function SSLPage() {
  const [status, setStatus] = useState<SSLStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [output, setOutput] = useState<string | null>(null);

  const [certForm, setCertForm] = useState({
    domains: "",
    email: "",
    staging: false,
  });

  const { toast } = useToast();

  async function loadData() {
    setLoading(true);
    try {
      const { data } = await sslApi.status();
      setStatus(data);
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleRenew() {
    setRenewing(true);
    setOutput(null);
    try {
      const { data } = await sslApi.renew();
      setOutput(data.output);
      toast({ title: "Zertifikate erneuert", variant: "default" });
      loadData();
    } catch (err: any) {
      setOutput(err.response?.data?.details || err.message);
      toast({ title: "Erneuerung fehlgeschlagen", description: err.response?.data?.error, variant: "destructive" });
    } finally {
      setRenewing(false);
    }
  }

  async function handleRequest() {
    const domains = certForm.domains.split(",").map(d => d.trim()).filter(Boolean);
    if (!domains.length || !certForm.email) {
      toast({ title: "Alle Felder ausfüllen", variant: "destructive" });
      return;
    }
    setRequesting(true);
    setOutput(null);
    try {
      const { data } = await sslApi.request({ domains, email: certForm.email, staging: certForm.staging });
      setOutput(data.output);
      toast({ title: "Zertifikat ausgestellt" });
      setRequestOpen(false);
      loadData();
    } catch (err: any) {
      setOutput(err.response?.data?.details || err.message);
      toast({ title: "Fehler", description: err.response?.data?.error, variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  }

  async function handleDelete(domain: string) {
    try {
      await sslApi.delete(domain);
      toast({ title: "Zertifikat gelöscht" });
      loadData();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div>
      <Header title="SSL / HTTPS" subtitle="Let's Encrypt Zertifikat-Verwaltung" onRefresh={loadData}>
        <Button variant="outline" size="sm" onClick={handleRenew} disabled={renewing}>
          {renewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Alle erneuern
        </Button>
        <Button size="sm" onClick={() => setRequestOpen(true)} disabled={!status?.certbot_available}>
          <Plus className="mr-2 h-4 w-4" /> Neues Zertifikat
        </Button>
      </Header>

      <div className="p-6 space-y-6">
        {/* Status-Übersicht */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Certbot Status</p>
              <p className="text-lg font-semibold mt-1">
                {loading ? "–" : status?.certbot_available ? "Verfügbar" : "Nicht verfügbar"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Gültige Zertifikate</p>
              <p className="text-lg font-semibold mt-1">
                {loading ? "–" : `${status?.domains.filter(d => d.exists && (d.days_remaining ?? 0) > 14).length ?? 0} / ${status?.domains.length ?? 0}`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Auto-Erneuerung</p>
              <p className="text-lg font-semibold mt-1">
                {status?.auto_renew ? "Aktiv" : "Inaktiv"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Zertifikate Liste */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Domains & Zertifikate</CardTitle>
            <CardDescription>Let's Encrypt Zertifikate für deine Domains</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="animate-pulse space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-16 rounded bg-muted" />)}
              </div>
            ) : !status?.domains.length ? (
              <p className="text-sm text-muted-foreground">Keine Domains konfiguriert</p>
            ) : (
              status.domains.map(cert => (
                <CertCard key={cert.domain} cert={cert} onDelete={handleDelete} />
              ))
            )}
          </CardContent>
        </Card>

        {/* Certbot Output */}
        {output && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Certbot-Ausgabe</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto max-h-64">
                {output}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Anleitungs-Box */}
        {!status?.certbot_available && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <p className="text-sm text-yellow-800">
                <strong>Certbot nicht verfügbar:</strong> Certbot ist nicht im Backend-Container installiert.
                SSL-Zertifikate können mit dem Installer-Script oder manuell über den certbot-Container angefordert werden:
              </p>
              <pre className="mt-2 rounded bg-yellow-100 p-2 text-xs font-mono">
                docker compose --profile ssl run certbot
              </pre>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog: Neues Zertifikat */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues SSL-Zertifikat</DialogTitle>
            <DialogDescription>Fordere ein Let's Encrypt Zertifikat an</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Domains (kommagetrennt)</Label>
              <Input placeholder="yourdomain.com, auth.yourdomain.com"
                value={certForm.domains} onChange={e => setCertForm(f => ({ ...f, domains: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>E-Mail (für Certbot)</Label>
              <Input type="email" placeholder="admin@yourdomain.com"
                value={certForm.email} onChange={e => setCertForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="staging" checked={certForm.staging}
                onChange={e => setCertForm(f => ({ ...f, staging: e.target.checked }))} />
              <Label htmlFor="staging">Staging-Modus (für Tests)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Abbrechen</Button>
            <Button onClick={handleRequest} disabled={requesting}>
              {requesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Zertifikat anfordern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
