import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pool } from "./db/pool";
import { authRouter } from "./routes/auth";
import { submissionsRouter } from "./routes/submissions";
import { fieldDefsRouter } from "./routes/fieldDefs";

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(cookieParser());
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
