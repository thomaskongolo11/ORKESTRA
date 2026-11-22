"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { cn } from "@/lib/utils";

export function SignOutButton({ variant = "outline", className }: { variant?: "outline" | "ghost" | "default"; className?: string }) {
  const [loading, setLoading] = useState(false);
  async function signOut() {
    setLoading(true);
    await authClient.signOut();
    window.location.assign("/login?reason=signed-out");
  }
  return (
    <Button type="button" variant={variant} onClick={signOut} loading={loading} className={cn("w-full", className)}>
      {!loading && <LogOut />}
      Se déconnecter
    </Button>
  );
}
