# SOD eMIS 2.0

Rewrite of the HPCL SOD MIS app (originally Streamlit + Google Sheets) as a React frontend + Node/Express backend + Postgres (Supabase) database.

- `frontend/` — React + Vite + TypeScript, deployed on Cloudflare (Workers static assets)
- `backend/` — Node.js + Express + TypeScript, deployed on Render

See the original app's reference-only source for business logic being ported over; nothing in this repo touches that source.
