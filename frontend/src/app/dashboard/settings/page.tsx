"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Settings, Save, RefreshCw, Eye, EyeOff, RotateCw,
  Loader2, AlertTriangle, CheckCircle, Code, List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { envApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

// ─── Typen ──────────────────────────────────────────────────
interface EnvEntry {
  type: "var" | "separator";
  key?: string;
  value?: string;
  comment?: string;
  isSecret?: boolean;
  isReadonly?: boolean;
  hasValue?: boolean;
  text?: string; // für separators
}

// Gruppenbezeichnungen für Abschnitts-Trenner
function getSectionLabel(text: string): string {
  if (text?.includes("Domain")) return "Domain-Konfiguration";
  if (text?.includes("PostgreSQL")) return "Datenbank";
  if (text?.includes("GoTrue")) return "GoTrue / Auth";
  if (text?.includes("Backend")) return "Backend API";
  if (text?.includes("Frontend")) return "Frontend";
  if (text?.includes("Cloudflare")) return "Cloudflare Tunnel";
  if (text?.includes("Nginx")) return "Nginx / SSL";
  if (text?.includes("Docker")) return "Docker";
  return "";
}

// ─── Secret-Input ─────────────────────────────────────────────
function SecretInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || "••••••••••••"}
        disabled={disabled}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        title={show ? "Verbergen" : "Anzeigen"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────
export default function SettingsPage() {
  const [entries, setEntries] = useState<EnvEntry[]>([]);
  const [rawContent, setRawContent] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({}); // key → neuer Wert
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [restartResult, setRestartResult] = useState<string | null>(null);
  const { toast } = useToast();

  const loadEnv = useCallback(async () => {
    setLoading(true);
    setEdits({});
    try {
      const [formRes, rawRes] = await Promise.all([
        envApi.get(),
        envApi.getRaw(),
      ]);
      setEntries(formRes.data.entries || []);
      setRawContent(rawRes.data.content || "");
    } catch (err: any) {
      toast({ title: "Fehler beim Laden", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadEnv(); }, [loadEnv]);

  // Wert eines Felds setzen
  function setEdit(key: string, value: string) {
    setEdits(prev => ({ ...prev, [key]: value }));
  }

  // Formularmodus speichern
  async function handleSaveForm() {
    const updates = Object.entries(edits)
      .filter(([_, v]) => v !== undefined)
      .map(([key, value]) => ({ key, value }));

    if (updates.length === 0) {
      toast({ title: "Keine Änderungen" });
      return;
    }

    setSaving(true);
    try {
      const { data } = await envApi.update(updates);
      toast({
        title: "Einstellungen gespeichert",
        description: `${data.updated.length} Variable(n) aktualisiert. ${data.restart_recommended ? "Neustart empfohlen." : ""}`,
      });
      setEdits({});
      loadEnv();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.response?.data?.error || err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // Raw-Modus speichern
  async function handleSaveRaw() {
    setSaving(true);
    try {
      await envApi.updateRaw(rawContent);
      toast({ title: ".env gespeichert", description: "Neustart empfohlen." });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.response?.data?.error || err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // Container neu starten
  async function handleRestart() {
    setRestarting(true);
    setRestartResult(null);
    try {
      const { data } = await envApi.restartServices();
      setRestartResult(data.message);
      toast({ title: data.success ? "Neustart erfolgreich" : "Neustart fehlgeschlagen", description: data.message });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setRestarting(false);
    }
  }

  // Geänderte Felder zählen
  const changesCount = Object.keys(edits).length;

  // Entries in Gruppen aufteilen
  const groups: Array<{ label: string; items: EnvEntry[] }> = [];
  let currentGroup: { label: string; items: EnvEntry[] } = { label: "", items: [] };

  for (const entry of entries) {
    if (entry.type === "separator") {
      const label = getSectionLabel(entry.text || "");
      if (label) {
        if (currentGroup.items.length > 0) groups.push(currentGroup);
        currentGroup = { label, items: [] };
      }
    } else if (entry.type === "var" && entry.key) {
      currentGroup.items.push(entry);
    }
  }
  if (currentGroup.items.length > 0) groups.push(currentGroup);

  return (
    <div>
      <Header
        title="Einstellungen"
        subtitle=".env Konfiguration des gesamten Stacks"
        onRefresh={loadEnv}
      >
        {/* Modus-Umschalter */}
        <div className="flex rounded-md border">
          <button
            onClick={() => setMode("form")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-l-md transition-colors ${mode === "form" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            <List className="h-3.5 w-3.5" /> Formular
          </button>
          <button
            onClick={() => setMode("raw")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-r-md border-l transition-colors ${mode === "raw" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            <Code className="h-3.5 w-3.5" /> Raw
          </button>
        </div>

        {mode === "form" ? (
          <Button onClick={handleSaveForm} disabled={saving || changesCount === 0} size="sm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Speichern {changesCount > 0 && `(${changesCount})`}
          </Button>
        ) : (
          <Button onClick={handleSaveRaw} disabled={saving} size="sm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Raw speichern
          </Button>
        )}

        <Button
          variant="outline" size="sm"
          onClick={handleRestart}
          disabled={restarting}
          title="Alle Container neu starten (damit ENV-Änderungen wirksam werden)"
        >
          {restarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
          Neustart
        </Button>
      </Header>

      <div className="p-6 space-y-4">

        {/* Hinweis-Banner */}
        <div className="flex items-start gap-3 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Wichtig:</strong> Änderungen an der .env werden sofort gespeichert,
            aber erst nach einem <strong>Container-Neustart</strong> vollständig wirksam.
            Secrets (Passwörter, Tokens) werden maskiert dargestellt und nur bei expliziter Eingabe überschrieben.
          </div>
        </div>

        {/* Neustart-Ergebnis */}
        {restartResult && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle className="h-4 w-4" />
            {restartResult}
          </div>
        )}

        {/* ── FORMULAR-MODUS ─────────────────────────────────────── */}
        {mode === "form" && (
          loading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-40 rounded-lg bg-muted" />)}
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group, gi) => (
                <Card key={gi}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{group.label || "Allgemein"}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {group.items.map(entry => {
                      if (!entry.key) return null;
                      const currentValue = edits[entry.key] ?? "";
                      const isDirty = edits[entry.key] !== undefined;

                      return (
                        <div key={entry.key} className="grid grid-cols-[1fr_2fr] gap-4 items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <Label className="font-mono text-xs">{entry.key}</Label>
                              {entry.isSecret && (
                                <Badge variant="secondary" className="text-xs px-1 py-0">Secret</Badge>
                              )}
                              {entry.isReadonly && (
                                <Badge variant="outline" className="text-xs px-1 py-0">Readonly</Badge>
                              )}
                              {isDirty && (
                                <div className="h-1.5 w-1.5 rounded-full bg-primary" title="Geändert" />
                              )}
                            </div>
                            {entry.comment && (
                              <p className="text-xs text-muted-foreground mt-1">{entry.comment}</p>
                            )}
                          </div>
                          <div>
                            {entry.isReadonly ? (
                              <Input
                                value={entry.value || ""}
                                disabled
                                className="font-mono text-xs opacity-60"
                              />
                            ) : entry.isSecret ? (
                              <SecretInput
                                value={currentValue}
                                onChange={v => setEdit(entry.key!, v)}
                                placeholder={entry.hasValue ? "Leer lassen = unverändert" : "Secret eingeben…"}
                              />
                            ) : (
                              <Input
                                value={isDirty ? currentValue : (entry.value || "")}
                                onChange={e => setEdit(entry.key!, e.target.value)}
                                className="font-mono text-xs"
                                placeholder={entry.value ? undefined : "(leer)"}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}

        {/* ── RAW-MODUS ──────────────────────────────────────────── */}
        {mode === "raw" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Code className="h-4 w-4" /> .env Rohdatei
              </CardTitle>
              <CardDescription>
                Direkte Bearbeitung der .env-Datei. Secrets werden als{" "}
                <code className="bg-muted px-1 rounded text-xs">***HIDDEN***</code> maskiert.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                className="w-full h-[calc(100vh-380px)] min-h-[400px] rounded-md border bg-zinc-950 text-green-300 font-mono text-xs p-4 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                value={rawContent}
                onChange={e => setRawContent(e.target.value)}
                spellCheck={false}
                placeholder="Wird geladen…"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Felder mit <code className="bg-muted px-1 rounded">***HIDDEN***</code> können nicht gespeichert werden – entferne den Marker und gib den echten Wert ein.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
