"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { isAuthenticated } from "@/lib/auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Wird geladen…</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} />

      {/* Hauptbereich */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Sidebar-Toggle Button */}
        <button
          onClick={() => setSidebarCollapsed(c => !c)}
          className="absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 translate-x-[calc(var(--sidebar-w,16rem)-12px)] rounded-full border bg-background p-1 shadow-sm lg:flex"
          style={{ marginLeft: sidebarCollapsed ? "4rem" : "16rem" }}
          aria-label="Sidebar einklappen"
        >
          <svg className={`h-3 w-3 transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Seiteninhalt */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
