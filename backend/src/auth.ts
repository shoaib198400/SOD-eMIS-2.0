import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET as string;
const SESSION_MINUTES = 30;

export interface SessionPayload {
  sub: number;
  role: "Maker" | "Checker" | "Zone" | "Admin" | "Viewer";
  locationCode: string | null;
  zoneId: number | null;
  jti: string;
}

export function newSessionToken(payload: Omit<SessionPayload, "jti">): { token: string; jti: string } {
  const jti = randomUUID();
  return { token: signSessionToken({ ...payload, jti }), jti };
}

// Re-signs a token for the same session (same jti) with a fresh expiry — used to slide the
// inactivity timeout forward without touching current_session_jti in the database.
export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${SESSION_MINUTES}m` });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "sod_mis_session";

// Cross-origin (Cloudflare frontend -> Render backend) requires SameSite=None + Secure in
// production, which in turn requires HTTPS. Local dev runs both sides on plain http://localhost,
// where a Secure cookie would silently never be sent, so relax to Lax/insecure there.
const isProd = process.env.NODE_ENV === "production";

export const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  maxAge: SESSION_MINUTES * 60 * 1000,
};
