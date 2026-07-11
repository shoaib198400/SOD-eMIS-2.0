import { Request, Response, NextFunction } from "express";
import { pool } from "../db/pool";
import { REFRESHED_TOKEN_HEADER, signSessionToken, verifySessionToken, SessionPayload } from "../auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionPayload;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const result = await pool.query(
    "select current_session_jti, active from users where id = $1",
    [claims.sub]
  );
  const row = result.rows[0];
  if (!row || !row.active) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  if (row.current_session_jti !== claims.jti) {
    res.status(401).json({ error: "session_displaced", message: "Logged in elsewhere" });
    return;
  }

  // Sliding expiry: hand back a freshly-expiring token for the SAME session (same jti) on
  // every authenticated request, via a response header the frontend picks up and re-stores.
  const { sub, role, locationCode, zoneId, jti } = claims;
  res.setHeader(REFRESHED_TOKEN_HEADER, signSessionToken({ sub, role, locationCode, zoneId, jti }));

  req.user = claims;
  next();
}

export function requireRole(...roles: SessionPayload["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}
