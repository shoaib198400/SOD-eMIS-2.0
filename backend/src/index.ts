import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db/pool";
import { authRouter } from "./routes/auth";
import { submissionsRouter } from "./routes/submissions";
import { fieldDefsRouter } from "./routes/fieldDefs";
import { REFRESHED_TOKEN_HEADER } from "./auth";

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

// Sessions are bearer tokens (Authorization header), not cookies, so the frontend can read
// the sliding-expiry refreshed token back from a response header cross-origin.
app.use(cors({ origin: FRONTEND_ORIGIN, exposedHeaders: [REFRESHED_TOKEN_HEADER] }));
app.use(express.json());

app.get("/health", async (_req, res) => {
  let dbOk = false;
  try {
    await pool.query("select 1");
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.json({ ok: true, service: "sod-mis-backend", db: dbOk, time: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/submissions", submissionsRouter);
app.use("/api/field-defs", fieldDefsRouter);

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
