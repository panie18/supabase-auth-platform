"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ScrollText, Download, Trash2, Pause, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/layout/header";
import { dockerApi } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import type { ContainerInfo, LogLine } from "@/types";

function LogViewer() {
  const searchParams = useSearchParams();
  const initialContainer = searchParams.get("container") || "";
  const initialName = searchParams.get("name") || "";

  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [selectedId, setSelectedId] = useState(initialContainer);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lineCount, setLineCount] = useState(200);
  const [filter, setFilter] = useState("");

  const logRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    dockerApi.listContainers().then(({ data }) => setContainers(data));
    if (initialContainer) loadLogs(initialContainer);
  }, []);

  async function loadLogs(id: string) {
    setLoading(true);
    setLines([]);
    try {
      const { data } = await dockerApi.getLogs(id, lineCount);
      setLines(data.logs || []);
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  function startStream(id: string) {
    if (wsRef.current) wsRef.current.close();

    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/docker/logs/stream?id=${id}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStreaming(true);
    ws.onmessage = (e) => {
      if (paused) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.log) {
          setLines(prev => [...prev.slice(-2000), msg.log]); // Max 2000 Zeilen
          scrollToBottom();
        }
        if (msg.event === "stream_ended") stopStream();
      } catch {}
    };
    ws.onclose = () => setStreaming(false);
    ws.onerror = () => {
      setStreaming(false);
      toast({ title: "WebSocket-Fehler", description: "Live-Streaming nicht verfügbar", variant: "destructive" });
    };
  }

  function stopStream() {
    wsRef.current?.close();
    wsRef.current = null;
    setStreaming(false);
  }

  useEffect(() => () => stopStream(), []);

  function scrollToBottom() {
    setTimeout(() => {
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    }, 50);
  }

  function handleContainerChange(id: string) {
    stopStream();
    setSelectedId(id);
    setLines([]);
    loadLogs(id);
  }

  function downloadLogs() {
    const text = lines.map(l => l.text).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredLines = filter
    ? lines.filter(l => l.text.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  const selectedName = containers.find(c => c.id === selectedId)?.name || initialName || selectedId;

  return (
    <div>
      <Header
        title="Log-Viewer"
        subtitle={selectedName ? `Container: ${selectedName}` : "Wähle einen Container"}
        onRefresh={() => selectedId && loadLogs(selectedId)}
      >
        <Button variant="outline" size="sm" onClick={downloadLogs} disabled={!lines.length}>
          <Download className="mr-2 h-4 w-4" /> Download
        </Button>
        {!streaming ? (
          <Button size="sm" onClick={() => startStream(selectedId)} disabled={!selectedId}>
            <Play className="mr-2 h-4 w-4" /> Live
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={stopStream}>
            <Pause className="mr-2 h-4 w-4" /> Stop
          </Button>
        )}
      </Header>

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={selectedId} onValueChange={handleContainerChange}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Container wählen…" />
            </SelectTrigger>
            <SelectContent>
              {containers.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${c.state === "running" ? "bg-green-500" : "bg-gray-400"}`} />
                    {c.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={lineCount.toString()} onValueChange={v => setLineCount(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[50, 100, 200, 500, 1000].map(n => (
                <SelectItem key={n} value={n.toString()}>{n} Zeilen</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Filtern…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />

          <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
            {streaming && (
              <Badge variant="default" className="animate-pulse">● Live</Badge>
            )}
            <span>{filteredLines.length} Zeilen</span>
            {filter && <Button variant="ghost" size="sm" onClick={() => setFilter("")}><Trash2 className="h-3 w-3" /></Button>}
          </div>
        </div>

        {/* Log Output */}
        <Card>
          <CardContent className="p-0">
            <div
              ref={logRef}
              className="log-viewer h-[calc(100vh-280px)] overflow-y-auto bg-zinc-950 rounded-md p-4 font-mono text-xs"
            >
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                </div>
              ) : !selectedId ? (
                <p className="text-zinc-500 text-center mt-8">Wähle einen Container aus der Liste oben</p>
              ) : filteredLines.length === 0 ? (
                <p className="text-zinc-500">Keine Log-Einträge {filter ? "gefunden" : "vorhanden"}</p>
              ) : (
                filteredLines.map((line, i) => (
                  <div key={i} className={`leading-5 ${line.stream === "stderr" ? "text-red-400" : "text-green-300"}`}>
                    {line.text}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <LogViewer />
    </Suspense>
  );
}
