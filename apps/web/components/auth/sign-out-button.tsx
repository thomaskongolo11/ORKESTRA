"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export function SignOutButton({ variant = "outline" }: { variant?: "outline" | "ghost" | "default" }) {
  const [loading, setLoading] = useState(false);
  async function signOut() {
    setLoading(true);
    await authClient.signOut();
    window.location.assign("/login?reason=signed-out");
  }
  return (
    <Button type="button" variant={variant} onClick={signOut} loading={loading} className="w-full">
      {!loading && <LogOut />}
      Se déconnecter
    </Button>
  );
}
