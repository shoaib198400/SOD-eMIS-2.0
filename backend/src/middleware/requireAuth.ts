import { Request, Response, NextFunction } from "express";
import { pool } from "../db/pool";
import { SESSION_COOKIE_NAME, cookieOptions, signSessionToken, verifySessionToken, SessionPayload } from "../auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
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

  // Sliding expiry: reissue a cookie for the SAME session (same jti), just a fresh expiry.
  // claims comes from jwt.verify(), which includes exp/iat — strip those before re-signing,
  // since jsonwebtoken rejects a payload that already has exp when expiresIn is also passed.
  const { sub, role, locationCode, zoneId, jti } = claims;
  res.cookie(SESSION_COOKIE_NAME, signSessionToken({ sub, role, locationCode, zoneId, jti }), cookieOptions);

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
