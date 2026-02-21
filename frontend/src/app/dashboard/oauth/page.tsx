"use client";

import { useEffect, useState, useCallback } from "react";
import { KeyRound, Save, Loader2, Plus, Trash2, RotateCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { oauthApi, envApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

export default function OAuthPage() {
  const [siteUrl, setSiteUrl] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [allowedUris, setAllowedUris] = useState<string[]>([""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const { toast } = useToast();

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await oauthApi.get();
      setSiteUrl(data.site_url || "");
      setCallbackUrl(data.callback_url || "");
      setAllowedUris(
        data.allowed_uris && data.allowed_uris.length > 0
          ? data.allowed_uris
          : [""]
      );
    } catch (err: any) {
      toast({ title: "Fehler beim Laden", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  function addUri() {
    setAllowedUris(prev => [...prev, ""]);
  }

  function removeUri(index: number) {
    setAllowedUris(prev => prev.filter((_, i) => i !== index));
  }

  function updateUri(index: number, value: string) {
    setAllowedUris(prev => prev.map((u, i) => i === index ? value : u));
  }

  async function handleSave() {
    const cleaned = allowedUris.map(u => u.trim()).filter(Boolean);
    setSaving(true);
    try {
      await oauthApi.update(cleaned.join(","));
      toast({
        title: "Gespeichert",
        description: "OAuth Callback-URLs aktualisiert. Container-Neustart empfohlen.",
      });
      loadConfig();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.response?.data?.error || err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRestart() {
    setRestarting(true);
    try {
      const { data } = await envApi.restartServices();
      toast({ title: data.success ? "Neustart erfolgreich" : "Neustart fehlgeschlagen", description: data.message });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setRestarting(false);
    }
  }

  const hasChanges = allowedUris.some(u => u.trim() !== "");

  return (
    <div>
      <Header
        title="OAuth Konfiguration"
        subtitle="Erlaubte Callback-URLs für OAuth-Provider"
        onRefresh={loadConfig}
      >
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Speichern
        </Button>
        <Button variant="outline" size="sm" onClick={handleRestart} disabled={restarting}>
          {restarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
          Neustart
        </Button>
      </Header>

      <div className="p-6 space-y-4">

        {/* GoTrue Callback-URL Info */}
        {callbackUrl && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="h-4 w-4" /> GoTrue Callback-Endpunkt
              </CardTitle>
              <CardDescription>
                Diese URL trägst du bei deinem OAuth-Provider (GitHub, Google, etc.) als Callback-URL ein.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md bg-muted px-4 py-3 font-mono text-sm select-all">
                {callbackUrl}
              </div>
              {siteUrl && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Basierend auf <code className="bg-muted px-1 rounded">GOTRUE_SITE_URL={siteUrl}</code>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Erlaubte Redirect-URLs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Erlaubte Redirect-URLs
            </CardTitle>
            <CardDescription>
              Nach dem Login darf GoTrue nur zu diesen URLs weiterleiten (<code className="bg-muted px-1 rounded text-xs">GOTRUE_URI_ALLOW_LIST</code>).
              Wildcards wie <code className="bg-muted px-1 rounded text-xs">https://myapp.com/**</code> sind erlaubt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="animate-pulse space-y-2">
                {[1, 2].map(i => <div key={i} className="h-9 rounded bg-muted" />)}
              </div>
            ) : (
              <>
                {allowedUris.map((uri, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={uri}
                      onChange={e => updateUri(index, e.target.value)}
                      placeholder="https://meine-app.com/auth/callback"
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeUri(index)}
                      disabled={allowedUris.length === 1}
                      title="Entfernen"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={addUri} className="mt-1">
                  <Plus className="mr-2 h-4 w-4" /> URL hinzufügen
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Hinweis */}
        <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Tipp:</strong> Füge hier die Redirect-URL deiner App ein, z.B.{" "}
            <code className="bg-blue-100 px-1 rounded text-xs">https://meine-app.com/auth/callback</code>.
            Nach dem Speichern muss GoTrue neu gestartet werden, damit die Änderung wirksam wird.
          </div>
        </div>

      </div>
    </div>
  );
}
