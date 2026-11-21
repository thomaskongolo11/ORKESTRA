import { redirect } from "next/navigation";

// La racine aiguille vers l'espace de l'utilisateur connecté, ou vers la connexion.
export default function HomePage() {
  redirect("/auth/callback");
}
