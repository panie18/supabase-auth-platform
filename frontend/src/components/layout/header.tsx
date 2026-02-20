"use client";

import { Bell, Menu, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuToggle?: () => void;
  onRefresh?: () => void;
  children?: React.ReactNode;
}

export function Header({ title, subtitle, onMenuToggle, onRefresh, children }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background/95 px-6 backdrop-blur">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold leading-none">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {children}
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} title="Aktualisieren">
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </header>
  );
}
