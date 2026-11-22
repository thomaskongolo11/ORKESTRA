import Link from "next/link";
import { requireOrgContext } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

// Page provisoire : le tableau de bord complet arrive à l'étape 5.
// Elle sert à vérifier la garde d'organisation (appartenance relue en base).
export default async function OverviewPage() {
  const { session, role } = await requireOrgContext();
  return (
    <main style={{ padding: "2rem", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1>Overview</h1>
      <p>
        Connecté en tant que {session.user.email} — rôle : {role}.
      </p>
      {role === "CLIENT_ADMIN" && (
        <p>
          <Link href="/settings/team">Gérer l&apos;équipe →</Link>
        </p>
      )}
    </main>
  );
}
