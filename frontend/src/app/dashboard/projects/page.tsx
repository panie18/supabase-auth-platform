"use client";

import { useState, useEffect } from "react";
import { Database, Plus, Play, Square, RefreshCw, Trash2, ExternalLink, KeyRound } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { projectsApi } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Project = {
    id: string; // slug
    name: string;
    status: "running" | "stopped" | "error" | "creating";
    studio_port: number;
    api_port: number;
    db_port: number;
    created_at: string;
};

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [newProject, setNewProject] = useState({ name: "", slug: "", db_password: "", jwt_secret: "" });
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [authOpen, setAuthOpen] = useState(false);
    const [activeAuthProject, setActiveAuthProject] = useState<string | null>(null);
    const [authCallbackUrl, setAuthCallbackUrl] = useState<string>("");
    const [authConfig, setAuthConfig] = useState<{
        customDomain?: string;
        siteUrl: string;
        additionalRedirectUrls: string;
        emailPaths?: {
            confirmation: string;
            invite: string;
            recovery: string;
            emailChange: string;
        };
        github: { enabled: boolean; clientId: string; secret: string };
        google: { enabled: boolean; clientId: string; secret: string };
    } | null>(null);
    const { toast } = useToast();

    async function loadProjects() {
        setLoading(true);
        try {
            const { data } = await projectsApi.list();
            setProjects(data.projects || []);
        } catch (err: any) {
            toast({ title: "Fehler beim Laden", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadProjects(); }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setActionLoading("create");
        try {
            await projectsApi.create(newProject);
            toast({ title: "Projekt erstellt", description: "Das Supabase Projekt wird gestartet." });
            setCreateOpen(false);
            setNewProject({ name: "", slug: "", db_password: "", jwt_secret: "" });
            loadProjects();
        } catch (err: any) {
            toast({ title: "Erstellen fehlgeschlagen", description: err.response?.data?.error || err.message, variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    }

    async function handleAction(slug: string, action: "start" | "stop" | "restart") {
        setActionLoading(`${slug}-${action}`);
        try {
            await projectsApi.action(slug, action);
            toast({ title: `Aktion ${action} ausgeführt` });
            loadProjects();
        } catch (err: any) {
            toast({ title: "Aktion fehlgeschlagen", description: err.response?.data?.error || err.message, variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    }

    async function handleDelete(slug: string) {
        if (!confirm(`Soll das Projekt '${slug}' wirklich unwiderruflich gelöscht werden? ALLE DATEN GEHEN VERLOREN!`)) return;
        setActionLoading(`${slug}-delete`);
        try {
            await projectsApi.delete(slug);
            toast({ title: "Projekt gelöscht" });
            loadProjects();
        } catch (err: any) {
            toast({ title: "Löschen fehlgeschlagen", description: err.response?.data?.error || err.message, variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    }

    async function loadAuthConfig(slug: string) {
        setActionLoading(`${slug}-auth`);
        try {
            const { data } = await projectsApi.getAuth(slug);
            setAuthConfig(data.auth);
            setAuthCallbackUrl(data.callbackUrl || "");
            setActiveAuthProject(slug);
            setAuthOpen(true);
        } catch (err: any) {
            toast({ title: "Auth config fehlgeschlagen", description: err.response?.data?.error || err.message, variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    }

    async function saveAuthConfig(e: React.FormEvent) {
        e.preventDefault();
        if (!activeAuthProject || !authConfig) return;
        setActionLoading("auth-save");
        try {
            await projectsApi.updateAuth(activeAuthProject, authConfig);
            toast({ title: "Auth konfiguriert", description: "Die Anbieter wurden aktualisiert." });
            setAuthOpen(false);
        } catch (err: any) {
            toast({ title: "Fehler", description: err.response?.data?.error || err.message, variant: "destructive" });
        } finally {
            setActionLoading(null);
        }
    }

    return (
        <div className="flex flex-col h-full">
            <Header title="Supabase Projekte" subtitle="Verwalte deine isolierten Supabase-Instanzen" onRefresh={loadProjects} />
            <div className="p-6 space-y-6 flex-1 overflow-auto">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-medium">Laufende Projekte</h2>
                        <p className="text-sm text-muted-foreground">Jedes Projekt läuft in einer eigenen Container-Umgebung.</p>
                    </div>

                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button><Plus className="h-4 w-4 mr-2" /> Neues Projekt</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Neues Supabase Projekt erstellen</DialogTitle>
                                <DialogDescription>
                                    Erstellt eine komplett neue und isolierte Supabase-Umgebung inkl. Datenbank.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Titel (Anzeigename)</Label>
                                    <Input required placeholder="z.B. Marketing App" value={newProject.name} onChange={e => {
                                        const name = e.target.value;
                                        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
                                        setNewProject(prev => ({ ...prev, name, slug: prev.name ? prev.slug : slug }));
                                    }} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Slug (Projekt-ID)</Label>
                                    <Input required placeholder="marketing-app" value={newProject.slug} onChange={e => setNewProject(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} />
                                    <p className="text-xs text-muted-foreground">Nur Kleinbuchstaben, Zahlen und Bindestriche.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>DB Passwort (optional)</Label>
                                    <Input type="password" placeholder="Automatisch generieren" value={newProject.db_password} onChange={e => setNewProject(prev => ({ ...prev, db_password: e.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label>JWT Secret (optional)</Label>
                                    <Input type="password" placeholder="Automatisch generieren" value={newProject.jwt_secret} onChange={e => setNewProject(prev => ({ ...prev, jwt_secret: e.target.value }))} />
                                </div>
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
                                    <Button type="submit" disabled={actionLoading === "create"}>{actionLoading === "create" ? "Erstelle..." : "Erstellen"}</Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {loading ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {[1, 2].map(i => <Card key={i} className="animate-pulse h-64 bg-muted/50" />)}
                    </div>
                ) : projects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 mt-8 text-center border rounded-xl border-dashed">
                        <Database className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                        <h3 className="text-lg font-medium">Keine Projekte gefunden</h3>
                        <p className="text-sm text-muted-foreground mb-4">Du hast noch keine Supabase-Instanzen erstellt.</p>
                        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> Erstes Projekt anlegen</Button>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {projects.map(project => (
                            <Card key={project.id} className="flex flex-col">
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg">{project.name}</CardTitle>
                                            <CardDescription className="opacity-70 mt-1 font-mono text-xs">{project.id}</CardDescription>
                                        </div>
                                        <Badge variant={project.status === "running" ? "success" : project.status === "error" ? "destructive" : "secondary"}>
                                            {project.status === "running" ? "Online" : project.status === "creating" ? "Erstellt..." : project.status}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 text-sm space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded bg-muted p-2">
                                            <span className="text-muted-foreground text-xs block content-center">Studio / Dashboard</span>
                                            <span className="font-mono mt-1 block">Port {project.studio_port}</span>
                                        </div>
                                        <div className="rounded bg-muted p-2">
                                            <span className="text-muted-foreground text-xs block content-center">API Gateway</span>
                                            <span className="font-mono mt-1 block">Port {project.api_port}</span>
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="flex flex-col gap-3 pt-4 border-t bg-muted/20">
                                    <div className="flex w-full gap-2 justify-between">
                                        <div className="flex gap-1">
                                            {project.status === "running" ? (
                                                <>
                                                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Stoppen" onClick={() => handleAction(project.id, "stop")} disabled={actionLoading !== null}>
                                                        <Square className="h-4 w-4 text-orange-500" />
                                                    </Button>
                                                    <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Neustarten" onClick={() => handleAction(project.id, "restart")} disabled={actionLoading !== null}>
                                                        <RefreshCw className="h-4 w-4 text-blue-500" />
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Starten" onClick={() => handleAction(project.id, "start")} disabled={actionLoading !== null}>
                                                    <Play className="h-4 w-4 text-green-500" />
                                                </Button>
                                            )}
                                            <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="Auth Provider" onClick={() => loadAuthConfig(project.id)} disabled={actionLoading !== null}>
                                                <KeyRound className="h-4 w-4 text-purple-500" />
                                            </Button>
                                            <Button variant="outline" size="sm" className="h-8 w-8 p-0 hover:border-destructive hover:bg-destructive/10" title="Löschen" onClick={() => handleDelete(project.id)} disabled={actionLoading !== null}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                        {project.status === "running" && (
                                            <Button size="sm" asChild className="h-8">
                                                <a href={`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:${project.studio_port}`} target="_blank" rel="noopener noreferrer">
                                                    Studio <ExternalLink className="ml-2 h-3 w-3" />
                                                </a>
                                            </Button>
                                        )}
                                    </div>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {authConfig && (
                <Dialog open={authOpen} onOpenChange={setAuthOpen}>
                    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>OAuth Provider für '{activeAuthProject}'</DialogTitle>
                            <DialogDescription>
                                Konfiguriere externe Anmelde-Dienste. Supabase Gotrue wird nach dem Speichern automatisch neugestartet.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={saveAuthConfig} className="space-y-6">

                            {authCallbackUrl && (
                                <div className="p-3 bg-muted/50 rounded-md text-sm border mt-4">
                                    <span className="text-muted-foreground block mb-1">Deine Callback / Redirect URL für OAuth Provider:</span>
                                    <code className="bg-background px-2 py-1 rounded block font-mono select-all text-xs overflow-x-auto whitespace-pre">{authCallbackUrl}</code>
                                    <p className="text-xs text-muted-foreground mt-2">Trage diese URL bei GitHub oder Google in den jeweiligen Developer-Einstellungen als "Authorization callback URL" bzw. "Authorized redirect URI" ein.</p>
                                </div>
                            )}

                            {/* Generelle OAuth / Auth Settings */}
                            <div className="space-y-4 p-4 border rounded relative bg-muted/20">
                                <h3 className="font-semibold text-lg">Allgemeine Einstellungen</h3>
                                <div className="space-y-2">
                                    <Label>Eigene API Domain (Custom Domain)</Label>
                                    <Input
                                        placeholder="z.B. login.paulify.eu"
                                        value={authConfig.customDomain || ""}
                                        onChange={e => setAuthConfig(prev => prev ? { ...prev, customDomain: e.target.value } : prev)}
                                    />
                                    <p className="text-xs text-muted-foreground">Optional: Lässt Auth-Links und E-Mails über diese Domain laufen. Cloudflare Tunnel Route erforderlich.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Site URL (GOTRUE_SITE_URL)</Label>
                                    <Input
                                        placeholder="z.B. https://marketing.paulify.eu"
                                        value={authConfig.siteUrl}
                                        onChange={e => setAuthConfig(prev => prev ? { ...prev, siteUrl: e.target.value } : prev)}
                                    />
                                    <p className="text-xs text-muted-foreground">Die Basis-URL deiner Frontend-Anwendung (z.B. für E-Mail Redirects).</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Zusätzliche Redirect-URLs (GOTRUE_URI_ALLOW_LIST)</Label>
                                    <Input
                                        placeholder="https://marketing.paulify.eu/*, http://localhost:3000/*"
                                        value={authConfig.additionalRedirectUrls}
                                        onChange={e => setAuthConfig(prev => prev ? { ...prev, additionalRedirectUrls: e.target.value } : prev)}
                                    />
                                    <p className="text-xs text-muted-foreground">Kommagetrennte Liste der erlaubten URLs oder Wildcards, z.B. für lokale Entwicklung oder zusätzliche Domains.</p>
                                </div>
                            </div>

                            {/* E-Mail Redirects */}
                            <div className="space-y-4 p-4 border rounded relative bg-muted/20">
                                <h3 className="font-semibold text-sm">Bestätigungs-URLs (E-Mail)</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs">Registrierung (Confirmation)</Label>
                                        <Input
                                            className="h-8 text-xs"
                                            value={authConfig.emailPaths?.confirmation || ""}
                                            onChange={e => setAuthConfig(prev => prev ? { ...prev, emailPaths: { ...prev.emailPaths!, confirmation: e.target.value } } : prev)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">Passwort vergessen (Recovery)</Label>
                                        <Input
                                            className="h-8 text-xs"
                                            value={authConfig.emailPaths?.recovery || ""}
                                            onChange={e => setAuthConfig(prev => prev ? { ...prev, emailPaths: { ...prev.emailPaths!, recovery: e.target.value } } : prev)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">Einladung (Invite)</Label>
                                        <Input
                                            className="h-8 text-xs"
                                            value={authConfig.emailPaths?.invite || ""}
                                            onChange={e => setAuthConfig(prev => prev ? { ...prev, emailPaths: { ...prev.emailPaths!, invite: e.target.value } } : prev)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">E-Mail Änderung</Label>
                                        <Input
                                            className="h-8 text-xs"
                                            value={authConfig.emailPaths?.emailChange || ""}
                                            onChange={e => setAuthConfig(prev => prev ? { ...prev, emailPaths: { ...prev.emailPaths!, emailChange: e.target.value } } : prev)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Github */}
                            <div className="space-y-4 p-4 border rounded relative">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-lg flex items-center">GitHub</h3>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="github-enabled"
                                            checked={authConfig.github.enabled}
                                            onChange={(e) => setAuthConfig(prev => prev ? { ...prev, github: { ...prev.github, enabled: e.target.checked } } : prev)}
                                            className="w-4 h-4"
                                        />
                                        <Label htmlFor="github-enabled">Aktivieren</Label>
                                    </div>
                                </div>
                                {authConfig.github.enabled && (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Client ID</Label>
                                            <Input value={authConfig.github.clientId} onChange={e => setAuthConfig(prev => prev ? { ...prev, github: { ...prev.github, clientId: e.target.value } } : prev)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Secret</Label>
                                            <Input type="password" value={authConfig.github.secret} onChange={e => setAuthConfig(prev => prev ? { ...prev, github: { ...prev.github, secret: e.target.value } } : prev)} />
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Google */}
                            <div className="space-y-4 p-4 border rounded relative">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-lg flex items-center">Google</h3>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="google-enabled"
                                            checked={authConfig.google.enabled}
                                            onChange={(e) => setAuthConfig(prev => prev ? { ...prev, google: { ...prev.google, enabled: e.target.checked } } : prev)}
                                            className="w-4 h-4"
                                        />
                                        <Label htmlFor="google-enabled">Aktivieren</Label>
                                    </div>
                                </div>
                                {authConfig.google.enabled && (
                                    <>
                                        <div className="space-y-2">
                                            <Label>Client ID</Label>
                                            <Input value={authConfig.google.clientId} onChange={e => setAuthConfig(prev => prev ? { ...prev, google: { ...prev.google, clientId: e.target.value } } : prev)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Secret</Label>
                                            <Input type="password" value={authConfig.google.secret} onChange={e => setAuthConfig(prev => prev ? { ...prev, google: { ...prev.google, secret: e.target.value } } : prev)} />
                                        </div>
                                    </>
                                )}
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setAuthOpen(false)}>Abbrechen</Button>
                                <Button type="submit" disabled={actionLoading === "auth-save"}>{actionLoading === "auth-save" ? "Speichere..." : "Speichern"}</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
