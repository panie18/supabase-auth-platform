"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Globe, ShieldCheck, Cloud, Mail, CheckCircle,
  ChevronRight, ChevronLeft, Loader2, SkipForward,
  Eye, EyeOff, Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { onboardingApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { isAuthenticated } from "@/lib/auth";
import { cn } from "@/lib/utils";

// ─── Wizard-Schritte ──────────────────────────────────────────
const STEPS = [
  { id: "domain",  label: "Domain",         icon: Globe,       skippable: false },
  { id: "ssl",     label: "SSL / HTTPS",    icon: ShieldCheck, skippable: true  },
  { id: "tunnel",  label: "Cloudflare",     icon: Cloud,       skippable: true  },
  { id: "smtp",    label: "E-Mail / SMTP",  icon: Mail,        skippable: true  },
  { id: "done",    label: "Fertig",         icon: CheckCircle, skippable: false },
] as const;

type StepId = typeof STEPS[number]["id"];

// ─── Step-Indikator ───────────────────────────────────────────
function StepBar({ current, completed }: { current: number; completed: Set<string> }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.slice(0, -1).map((step, i) => {
        const Icon = step.icon;
        const isDone = completed.has(step.id);
        const isActive = i === current;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all",
              isDone ? "border-primary bg-primary text-primary-foreground" :
              isActive ? "border-primary bg-background text-primary" :
              "border-muted bg-muted text-muted-foreground"
            )}>
              {isDone ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <span className={cn(
              "ml-2 text-xs font-medium hidden sm:block",
              isActive ? "text-primary" : isDone ? "text-primary/70" : "text-muted-foreground"
            )}>
              {step.label}
            </span>
            {i < STEPS.length - 2 && (
              <div className={cn(
                "flex-1 h-0.5 mx-3 transition-all",
                isDone ? "bg-primary" : "bg-muted"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Schritt 1: Domain ────────────────────────────────────────
function DomainStep({ onNext }: { onNext: () => void }) {
  const [domain, setDomain] = useState("");
  const [authSub, setAuthSub] = useState("");
  const [dashSub, setDashSub] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const { toast } = useToast();

  function handleDomainChange(val: string) {
    setDomain(val);
    if (!autoFilled || authSub === `auth.${domain}`) {
      setAuthSub(`auth.${val}`);
      setDashSub(`dashboard.${val}`);
      setAutoFilled(true);
    }
  }

  async function handleSave() {
    if (!domain) return;
    setLoading(true);
    try {
      await onboardingApi.saveDomain({
        domain, auth_subdomain: authSub, dashboard_subdomain: dashSub,
      });
      toast({ title: "Domain gespeichert" });
      onNext();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.response?.data?.error || err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Domain konfigurieren</h2>
        <p className="text-muted-foreground mt-1">
          Welche Domain soll für deine Auth-Plattform verwendet werden?
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Haupt-Domain</Label>
          <Input
            placeholder="example.com"
            value={domain}
            onChange={e => handleDomainChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Deine Root-Domain. DNS A-Record muss auf diesen Server zeigen.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Auth-API Subdomain</Label>
          <Input
            placeholder="auth.example.com"
            value={authSub}
            onChange={e => { setAuthSub(e.target.value); setAutoFilled(false); }}
          />
          <p className="text-xs text-muted-foreground">
            GoTrue Auth-API – Deine App verbindet sich hier
          </p>
        </div>

        <div className="space-y-2">
          <Label>Dashboard-Subdomain</Label>
          <Input
            placeholder="dashboard.example.com"
            value={dashSub}
            onChange={e => { setDashSub(e.target.value); setAutoFilled(false); }}
          />
          <p className="text-xs text-muted-foreground">
            Admin-Dashboard – nur du greifst hier zu
          </p>
        </div>
      </div>

      {/* DNS-Hinweis */}
      <div className="rounded-md bg-muted p-4 text-xs font-mono space-y-1">
        <p className="text-muted-foreground font-sans mb-2 font-medium">DNS A-Records einrichten:</p>
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-4">
          <span className="text-primary">A</span>
          <span>{domain || "example.com"}</span>
          <span className="text-yellow-600">DEINE_IP</span>
          <span className="text-primary">A</span>
          <span>{authSub || "auth.example.com"}</span>
          <span className="text-yellow-600">DEINE_IP</span>
          <span className="text-primary">A</span>
          <span>{dashSub || "dashboard.example.com"}</span>
          <span className="text-yellow-600">DEINE_IP</span>
        </div>
      </div>

      <Button onClick={handleSave} disabled={!domain || loading} className="w-full">
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Weiter <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Schritt 2: SSL ───────────────────────────────────────────
function SSLStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; hint?: string } | null>(null);
  const { toast } = useToast();

  async function handleRequest() {
    if (!email) return;
    setLoading(true);
    setResult(null);
    try {
      const { data } = await onboardingApi.saveSSL(email);
      setResult(data);
      if (data.ssl_active) toast({ title: "SSL-Zertifikat ausgestellt!" });
      else toast({ title: "E-Mail gespeichert", description: data.message });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">SSL / HTTPS einrichten</h2>
        <p className="text-muted-foreground mt-1">
          Kostenlose Let's Encrypt Zertifikate für alle deine Domains.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>E-Mail-Adresse (für Certbot)</Label>
          <Input
            type="email"
            placeholder="admin@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Let's Encrypt schickt Ablauf-Warnungen an diese Adresse
          </p>
        </div>

        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          <strong>Voraussetzung:</strong> DNS-Records müssen bereits auf deinen Server zeigen.
          Wenn nicht, kannst du SSL überspringen und später im Dashboard einrichten.
        </div>

        {result && (
          <div className={cn(
            "rounded-md p-3 text-sm",
            result.success ? "bg-green-50 text-green-800 border border-green-200" :
            "bg-muted text-muted-foreground border"
          )}>
            <p className="font-medium">{result.message}</p>
            {result.hint && <p className="mt-1 text-xs">{result.hint}</p>}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onSkip} className="flex-1">
          <SkipForward className="mr-2 h-4 w-4" /> Überspringen
        </Button>
        <Button onClick={handleRequest} disabled={!email || loading} className="flex-1">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          Zertifikat anfordern
        </Button>
      </div>
      {result && (
        <Button onClick={onNext} variant="ghost" className="w-full">
          Weiter <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// ─── Schritt 3: Cloudflare Tunnel ────────────────────────────
function TunnelStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSave() {
    if (!token) return;
    setLoading(true);
    try {
      await onboardingApi.saveTunnel(token);
      toast({ title: "Tunnel-Token gespeichert" });
      onNext();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Cloudflare Tunnel</h2>
        <p className="text-muted-foreground mt-1">
          Mit Cloudflare Tunnel brauchst du keine offenen Ports oder öffentliche IP.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-md bg-muted p-4 text-sm space-y-2">
          <p className="font-medium">So bekommst du deinen Tunnel-Token:</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Gehe zu <span className="font-mono text-xs bg-background px-1 rounded">dash.cloudflare.com → Zero Trust → Networks → Tunnels</span></li>
            <li>Klicke <strong>"Einen Tunnel erstellen"</strong> → Typ: Cloudflared</li>
            <li>Gib dem Tunnel einen Namen (z.B. "supabase-auth")</li>
            <li>Kopiere den angezeigten Token</li>
            <li>Konfiguriere Public Hostnames für deine Subdomains</li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label>Tunnel Token</Label>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              placeholder="eyJhbGciOiJSUzI1NiJ9..."
              value={token}
              onChange={e => setToken(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onSkip} className="flex-1">
          <SkipForward className="mr-2 h-4 w-4" /> Überspringen
        </Button>
        <Button onClick={handleSave} disabled={!token || loading} className="flex-1">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cloud className="mr-2 h-4 w-4" />}
          Token speichern
        </Button>
      </div>
    </div>
  );
}

// ─── Schritt 4: SMTP ─────────────────────────────────────────
function SMTPStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [form, setForm] = useState({ host: "", port: "587", user: "", pass: "", from: "" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const presets = [
    { name: "Gmail",    host: "smtp.gmail.com",    port: "587" },
    { name: "Outlook",  host: "smtp.office365.com", port: "587" },
    { name: "Mailgun",  host: "smtp.mailgun.org",   port: "587" },
    { name: "Hetzner",  host: "mail.your-server.de", port: "587" },
  ];

  async function handleSave() {
    setLoading(true);
    try {
      await onboardingApi.saveSMTP({
        host: form.host, port: Number(form.port),
        user: form.user, pass: form.pass, from_email: form.from || form.user,
      });
      toast({ title: "SMTP konfiguriert" });
      onNext();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSkip() {
    await onboardingApi.skipSMTP();
    toast({ title: "SMTP übersprungen – Benutzer werden automatisch bestätigt" });
    onSkip();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">E-Mail / SMTP</h2>
        <p className="text-muted-foreground mt-1">
          Für Registrierungs-Bestätigungen und Passwort-Reset-Mails.
          Kann auch später konfiguriert werden.
        </p>
      </div>

      {/* Provider-Schnellauswahl */}
      <div className="flex flex-wrap gap-2">
        {presets.map(p => (
          <button
            key={p.name}
            onClick={() => setForm(f => ({ ...f, host: p.host, port: p.port }))}
            className={cn(
              "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
              form.host === p.host ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>SMTP-Host</Label>
          <Input placeholder="smtp.gmail.com" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Port</Label>
          <Input placeholder="587" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Absender-E-Mail (optional)</Label>
          <Input type="email" placeholder="noreply@example.com" value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>SMTP-Benutzername</Label>
          <Input placeholder="user@gmail.com" value={form.user} onChange={e => setForm(f => ({ ...f, user: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>SMTP-Passwort / App-Passwort</Label>
          <div className="relative">
            <Input
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              value={form.pass}
              onChange={e => setForm(f => ({ ...f, pass: e.target.value }))}
              className="pr-10"
            />
            <button type="button" onClick={() => setShowPass(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleSkip} className="flex-1">
          <SkipForward className="mr-2 h-4 w-4" /> Überspringen
        </Button>
        <Button
          onClick={handleSave}
          disabled={!form.host || !form.user || !form.pass || loading}
          className="flex-1"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          SMTP speichern
        </Button>
      </div>
    </div>
  );
}

// ─── Schritt 5: Fertig ────────────────────────────────────────
function DoneStep({ onFinish }: { onFinish: () => void }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const serverIp = typeof window !== "undefined" ? window.location.hostname : "DEINE-IP";
  const port = typeof window !== "undefined" ? window.location.port : "3000";

  async function handleFinish() {
    setLoading(true);
    try {
      await onboardingApi.complete();
      toast({ title: "Einrichtung abgeschlossen!" });
      onFinish();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle className="h-10 w-10 text-primary" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold">Einrichtung abgeschlossen!</h2>
        <p className="text-muted-foreground mt-2">
          Deine Supabase Auth Platform ist bereit.
        </p>
      </div>

      {/* Server-Info */}
      <div className="rounded-md border bg-muted/50 p-4 text-sm text-left space-y-3">
        <p className="font-semibold flex items-center gap-2">
          <Server className="h-4 w-4" /> Server-Informationen
        </p>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-xs">
          <span className="text-muted-foreground">IP-Adresse</span>
          <span className="font-semibold">{serverIp}</span>
          <span className="text-muted-foreground">Dashboard (direkt)</span>
          <span className="font-semibold">Port <span className="text-primary">{port || "3000"}</span></span>
          <span className="text-muted-foreground">Dashboard (Nginx)</span>
          <span className="font-semibold">Port <span className="text-primary">80</span> / <span className="text-primary">443</span></span>
          <span className="text-muted-foreground">Auth-API</span>
          <span className="font-semibold">Port <span className="text-primary">9999</span> (intern)</span>
        </div>
      </div>

      {/* Firewall-Hinweis */}
      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800 text-left space-y-1">
        <p className="font-semibold">Firewall – diese Ports öffnen:</p>
        <div className="font-mono space-y-0.5">
          <p>ufw allow 80/tcp    <span className="text-yellow-600"># HTTP</span></p>
          <p>ufw allow 443/tcp   <span className="text-yellow-600"># HTTPS</span></p>
          <p>ufw allow 3000/tcp  <span className="text-yellow-600"># Dashboard direkt</span></p>
          <p>ufw enable</p>
        </div>
      </div>

      <div className="rounded-md bg-muted p-4 text-sm text-left space-y-2">
        <p className="font-medium">Nächste Schritte:</p>
        <ul className="space-y-1 text-muted-foreground">
          <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" /> Erste Benutzer unter <strong>Benutzer</strong> anlegen</li>
          <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" /> Auth-API einbinden: <code className="bg-background px-1 rounded text-xs">http://{serverIp}:9999/auth/v1/signup</code></li>
          <li className="flex items-center gap-2"><CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" /> Container-Status unter <strong>Container</strong> prüfen</li>
        </ul>
      </div>

      <Button onClick={handleFinish} disabled={loading} size="lg" className="w-full">
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Zum Dashboard
      </Button>
    </div>
  );
}

// ─── Haupt-Wizard ─────────────────────────────────────────────
export default function OnboardingPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthenticated()) { router.replace("/login"); return; }
    // Onboarding-Status prüfen
    onboardingApi.status().then(({ data }) => {
      if (data.done) router.replace("/dashboard");
      // Bereits erledigte Schritte markieren
      const done = new Set<string>();
      if (data.steps?.domain) done.add("domain");
      if (data.steps?.ssl) done.add("ssl");
      if (data.steps?.tunnel) done.add("tunnel");
      if (data.steps?.smtp) done.add("smtp");
      setCompleted(done);
    }).catch(() => {
      // Backend nicht erreichbar → trotzdem anzeigen
    }).finally(() => setChecking(false));
  }, [router]);

  function markDone(stepId: string) {
    setCompleted(prev => new Set([...prev, stepId]));
  }

  function goNext() {
    const currentId = STEPS[stepIndex].id;
    markDone(currentId);
    setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setStepIndex(i => Math.max(i - 1, 0));
  }

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentStep = STEPS[stepIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg mb-3">
            SA
          </div>
          <h1 className="text-xl font-bold">Supabase Auth Platform</h1>
          <p className="text-sm text-muted-foreground">Einrichtungsassistent</p>
        </div>

        {/* Schritt-Anzeige */}
        <StepBar current={stepIndex} completed={completed} />

        {/* Schritt-Inhalt */}
        <Card>
          <CardContent className="p-8">
            {currentStep.id === "domain"  && <DomainStep onNext={goNext} />}
            {currentStep.id === "ssl"     && <SSLStep    onNext={goNext} onSkip={goNext} />}
            {currentStep.id === "tunnel"  && <TunnelStep onNext={goNext} onSkip={goNext} />}
            {currentStep.id === "smtp"    && <SMTPStep   onNext={goNext} onSkip={goNext} />}
            {currentStep.id === "done"    && <DoneStep   onFinish={() => router.replace("/dashboard")} />}
          </CardContent>
        </Card>

        {/* Zurück-Button */}
        {stepIndex > 0 && stepIndex < STEPS.length - 1 && (
          <button
            onClick={goBack}
            className="mt-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto"
          >
            <ChevronLeft className="h-4 w-4" /> Zurück
          </button>
        )}

        {/* Schritt-Zähler */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Schritt {stepIndex + 1} von {STEPS.length}
        </p>
      </div>
    </div>
  );
}
