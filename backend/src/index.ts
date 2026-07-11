import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "sod-mis-backend", time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
