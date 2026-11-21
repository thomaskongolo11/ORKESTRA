// Outils partagés par les tests d'intégration de l'authentification.
import { createHmac, randomBytes } from "node:crypto";

/** Code TOTP (RFC 6238, SHA-1, 6 chiffres, 30 s) calculé à partir d'un secret base32. */
export function totpCode(base32Secret: string, at: number = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = base32Secret.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`Caractère base32 invalide : ${char}`);
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return (binary % 1_000_000).toString().padStart(6, "0");
}

/** Extrait le secret base32 d'une URI otpauth://. */
export function secretFromTotpUri(uri: string): string {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("URI TOTP sans secret");
  return secret;
}

/** Transforme les en-têtes Set-Cookie d'une réponse en en-tête Cookie pour la requête suivante. */
export function cookieHeaderFrom(headers: Headers, previous = ""): string {
  const jar = new Map<string, string>();
  for (const part of previous.split(";").map((p) => p.trim()).filter(Boolean)) {
    const [name, ...rest] = part.split("=");
    if (name) jar.set(name, rest.join("="));
  }
  for (const cookie of headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const [name, ...rest] = (pair ?? "").split("=");
    if (!name) continue;
    const value = rest.join("=");
    if (value === "" || /max-age=0/i.test(cookie)) jar.delete(name.trim());
    else jar.set(name.trim(), value);
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

export function headersWithCookie(cookie: string): Headers {
  return new Headers({ cookie });
}

export const uniqueSuffix = () => randomBytes(4).toString("hex");

/** Adresse IP de test unique, pour isoler les compteurs de limitation entre les tests. */
export const uniqueIp = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
