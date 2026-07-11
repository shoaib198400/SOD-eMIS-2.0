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

// Sessions travel as a bearer token (Authorization header), not a cookie. The frontend and
// backend live on different top-level domains (Cloudflare + Render, no shared custom domain),
// and browsers increasingly block or partition cookies set across different sites even with
// SameSite=None; a token the frontend explicitly stores and attaches sidesteps that entirely.

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

export const REFRESHED_TOKEN_HEADER = "x-refreshed-token";
