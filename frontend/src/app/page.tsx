"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { onboardingApi } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    onboardingApi.status()
      .then((res) => {
        if (res.data.done) {
          router.replace("/dashboard");
        } else {
          router.replace("/onboarding");
        }
      })
      .catch(() => {
        // If status check fails, go to dashboard (backwards compat)
        router.replace("/dashboard");
      });
  }, [router]);
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Wird geladen…</div>
    </div>
  );
}
