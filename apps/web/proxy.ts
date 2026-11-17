/**
 * Proxy Next.js 16 (anciennement middleware).
 *
 * Redirection RAPIDE uniquement : sans cookie de session, les pages protégées
 * renvoient vers /login. La présence d'un cookie ne prouve rien (il peut être
 * expiré, révoqué ou falsifié) : la vraie vérification est faite côté serveur
 * par les gardes (lib/auth/guards.ts) dans chaque page, action et route API.
 */
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/admin",
  "/overview",
  "/agents",
  "/tasks",
  "/reports",
  "/integrations",
  "/settings",
  "/notifications",
  "/two-factor/setup",
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!isProtected) return NextResponse.next();

  const sessionCookie = getSessionCookie(request, { cookiePrefix: "orkestra" });
  if (sessionCookie) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
