import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

// Page provisoire : l'espace administrateur complet arrive à l'étape 9.
// Elle sert à vérifier la garde SUPER_ADMIN (2FA obligatoire, session de 8 h max).
export default async function AdminPage() {
  const session = await requireSuperAdmin();
  return (
    <main style={{ padding: "2rem", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1>Administration ORKESTRA</h1>
      <p>Connecté en tant que {session.user.email} (SUPER_ADMIN, 2FA vérifiée).</p>
      <p>
        <Link href="/admin/organizations">Gérer les entreprises clientes →</Link>
      </p>
    </main>
  );
}
