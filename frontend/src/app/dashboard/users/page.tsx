"use client";

import { useEffect, useState, useCallback } from "react";
import { UserPlus, Search, Ban, Key, Trash2, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/layout/header";
import { usersApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import type { GoTrueUser } from "@/types";

export default function UsersPage() {
  const [users, setUsers] = useState<GoTrueUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Dialoge
  const [createOpen, setCreateOpen] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState<GoTrueUser | null>(null);
  const [deleteOpen, setDeleteOpen] = useState<GoTrueUser | null>(null);

  // Formulare
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "authenticated" });
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { toast } = useToast();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await usersApi.list(page, 50, search);
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Benutzer erstellen
  async function handleCreate() {
    setSubmitting(true);
    try {
      await usersApi.create(newUser);
      toast({ title: "Benutzer erstellt", variant: "default" });
      setCreateOpen(false);
      setNewUser({ email: "", password: "", role: "authenticated" });
      loadUsers();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.response?.data?.error || err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // Passwort zurücksetzen
  async function handleResetPassword() {
    if (!resetPwOpen || !newPassword) return;
    setSubmitting(true);
    try {
      await usersApi.resetPassword(resetPwOpen.id, newPassword);
      toast({ title: "Passwort zurückgesetzt" });
      setResetPwOpen(null);
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "Fehler", description: err.response?.data?.error || err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // Sperren/Entsperren
  async function handleBan(user: GoTrueUser) {
    const isBanned = !!user.banned_until;
    try {
      await usersApi.ban(user.id, !isBanned);
      toast({ title: isBanned ? "Benutzer entsperrt" : "Benutzer gesperrt" });
      loadUsers();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    }
  }

  // Benutzer löschen
  async function handleDelete() {
    if (!deleteOpen) return;
    setSubmitting(true);
    try {
      await usersApi.delete(deleteOpen.id);
      toast({ title: "Benutzer gelöscht" });
      setDeleteOpen(null);
      loadUsers();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Header
        title="Benutzerverwaltung"
        subtitle={`${total} Benutzer gesamt`}
        onRefresh={loadUsers}
      >
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <UserPlus className="mr-2 h-4 w-4" /> Benutzer erstellen
        </Button>
      </Header>

      <div className="p-6 space-y-4">
        {/* Suche */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="E-Mail suchen…"
            className="pl-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* Tabelle */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erstellt</TableHead>
                  <TableHead>Letzter Login</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      Keine Benutzer gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map(user => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.role || "authenticated"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {user.email_confirmed_at ? (
                            <><CheckCircle className="h-4 w-4 text-green-500" /> <span className="text-xs">Bestätigt</span></>
                          ) : (
                            <><XCircle className="h-4 w-4 text-muted-foreground" /> <span className="text-xs">Unbestätigt</span></>
                          )}
                          {user.banned_until && (
                            <Badge variant="destructive" className="ml-1 text-xs">Gesperrt</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(user.created_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.last_sign_in_at ? formatRelativeTime(user.last_sign_in_at) : "Nie"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="icon"
                            title="Passwort zurücksetzen"
                            onClick={() => setResetPwOpen(user)}
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            title={user.banned_until ? "Entsperren" : "Sperren"}
                            onClick={() => handleBan(user)}
                          >
                            <Ban className={`h-4 w-4 ${user.banned_until ? "text-destructive" : ""}`} />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            title="Benutzer löschen"
                            onClick={() => setDeleteOpen(user)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Dialog: Benutzer erstellen */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuen Benutzer erstellen</DialogTitle>
            <DialogDescription>Erstelle einen neuen Benutzer in der Supabase Auth</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>E-Mail</Label>
              <Input type="email" placeholder="user@example.com"
                value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Passwort</Label>
              <Input type="password" placeholder="Sicheres Passwort"
                value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select value={newUser.role} onValueChange={v => setNewUser(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="authenticated">authenticated</SelectItem>
                  <SelectItem value="service_role">service_role</SelectItem>
                  <SelectItem value="anon">anon</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Passwort zurücksetzen */}
      <Dialog open={!!resetPwOpen} onOpenChange={() => setResetPwOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passwort zurücksetzen</DialogTitle>
            <DialogDescription>{resetPwOpen?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Neues Passwort</Label>
            <Input type="password" placeholder="Neues sicheres Passwort"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPwOpen(null)}>Abbrechen</Button>
            <Button onClick={handleResetPassword} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Zurücksetzen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Benutzer löschen */}
      <Dialog open={!!deleteOpen} onOpenChange={() => setDeleteOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Benutzer löschen</DialogTitle>
            <DialogDescription>
              Möchtest du <strong>{deleteOpen?.email}</strong> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
