import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { newSessionToken } from "../auth";
import { requireAuth } from "../middleware/requireAuth";
import { logAudit } from "../auditLog";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { loginCode, password } = req.body as { loginCode?: string; password?: string };
  if (!loginCode || !password) {
    res.status(400).json({ ok: false, error: "loginCode and password are required" });
    return;
  }

  const result = await pool.query(
    "select id, role, location_code, zone_id, password_hash, active, is_first_login from users where login_code = $1",
    [loginCode.trim().toUpperCase()]
  );
  const user = result.rows[0];
  if (!user || !user.active) {
    res.status(401).json({ ok: false, error: "Invalid login code or password" });
    return;
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    res.status(401).json({ ok: false, error: "Invalid login code or password" });
    return;
  }

  const { token, jti } = newSessionToken({
    sub: user.id,
    role: user.role,
    locationCode: user.location_code,
    zoneId: user.zone_id,
  });

  await pool.query(
    "update users set current_session_jti = $1, current_session_started_at = now(), last_login_at = now() where id = $2",
    [jti, user.id]
  );
  await logAudit({ actorUserId: user.id, actorLocationCode: user.location_code, action: "Login" });

  res.json({
    ok: true,
    token,
    role: user.role,
    locationCode: user.location_code,
    zoneId: user.zone_id,
    isFirstLogin: user.is_first_login,
  });
});

// Matches the original app's "no self-service reset" pattern — this just files a helpdesk
// ticket for an Admin to resolve manually, rather than emailing a reset link (Phase 6 territory
// once the real email system exists). Deliberately public/unauthenticated: this is the
// forgot-password flow, so the user by definition can't log in yet.
authRouter.post("/forgot-password", async (req, res) => {
  const { loginCode, issueDesc } = req.body as { loginCode?: string; issueDesc?: string };
  if (!loginCode?.trim() || !issueDesc?.trim()) {
    res.status(400).json({ ok: false, error: "User ID and a description are required" });
    return;
  }

  const result = await pool.query("select id, location_code from users where login_code = $1", [
    loginCode.trim().toUpperCase(),
  ]);
  const user = result.rows[0];
  if (user?.location_code) {
    await pool.query(
      `insert into helpdesk_tickets (location_code, user_id, issue_type, issue_desc)
       values ($1, $2, 'Password Reset Request', $3)`,
      [user.location_code, user.id, issueDesc.trim()]
    );
    await logAudit({ actorUserId: user.id, actorLocationCode: user.location_code, action: "ForgotPassword" });
  }
  // Always return success, whether or not the login code matched — avoids confirming/denying
  // which login codes are real to an unauthenticated caller.
  res.json({ ok: true });
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  await pool.query("update users set current_session_jti = null where id = $1", [req.user!.sub]);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const result = await pool.query(
    `select u.id, u.login_code, u.role, u.location_code, u.zone_id, u.is_first_login,
            l.name as location_name, z.name as zone_name
     from users u
     left join locations l on l.code = u.location_code
     left join zones z on z.id = u.zone_id
     where u.id = $1`,
    [req.user!.sub]
  );
  const user = result.rows[0];
  res.json({
    userId: user.id,
    loginCode: user.login_code,
    role: user.role,
    locationCode: user.location_code,
    locationName: user.location_name,
    zoneId: user.zone_id,
    zoneName: user.zone_name,
    isFirstLogin: user.is_first_login,
  });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
  if (!currentPassword || !newPassword || !confirmPassword) {
    res.status(400).json({ ok: false, error: "All fields are required" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ ok: false, error: "New password must be at least 6 characters" });
    return;
  }
  if (newPassword !== confirmPassword) {
    res.status(400).json({ ok: false, error: "New password and confirmation do not match" });
    return;
  }
  if (newPassword === currentPassword) {
    res.status(400).json({ ok: false, error: "New password must differ from current password" });
    return;
  }

  const result = await pool.query("select password_hash from users where id = $1", [req.user!.sub]);
  const user = result.rows[0];
  const currentOk = await bcrypt.compare(currentPassword, user.password_hash);
  if (!currentOk) {
    res.status(400).json({ ok: false, error: "Current password is incorrect" });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query(
    "update users set password_hash = $1, is_first_login = false, last_password_change_at = now() where id = $2",
    [newHash, req.user!.sub]
  );
  res.json({ ok: true });
});
