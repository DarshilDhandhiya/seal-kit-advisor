# Setup guide (step by step)

Requirements: **Node.js 20 or 22**, npm, a free **MongoDB Atlas** account. Nothing else (OCR language data ships inside `node_modules`; no Meta account needed for the simulator).

## 1. Create the MongoDB Atlas database (≈5 min)
1. cloud.mongodb.com → create a free **M0** cluster.
2. **Database Access** → *Add New Database User* → username + password (Read and write to any database). Avoid `@ : /` in the password, or URL-encode it.
3. **Network Access** → *Add IP Address* → your IP (or `0.0.0.0/0` for a throw-away demo).
4. **Database** → *Connect* → *Drivers* → copy the `mongodb+srv://…` string. Replace `<password>`.

## 2. Configure the backend
```bash
cd backend
cp .env.example .env
openssl rand -hex 32        # paste as JWT_SECRET
openssl rand -hex 32        # paste as MEDIA_ENCRYPTION_KEY
```
Edit `backend/.env`: set `MONGODB_URI`, `JWT_SECRET`, `MEDIA_ENCRYPTION_KEY`. Leave `WHATSAPP_*` empty for now.

## 3. Install, seed, run
```bash
cd backend
npm install
npm run seed            # exact Appendix A dataset; safe to re-run (idempotent). Add -- --reset to wipe first
npm run dev             # API on http://localhost:4000

# second terminal
cd frontend
npm install
npm run dev             # UI on http://localhost:5173
```
- **Customer simulator:** http://localhost:5173/
- **Operator console:** http://localhost:5173/admin → `admin@demo.local` / `Admin@12345` (read-only-ish staff: `staff@demo.local` / `Staff@12345`)

## 4. Single-process mode (what you deploy)
```bash
cd frontend && npm run build
cd ../backend && npm run build && npm start     # serves API + built UI on http://localhost:4000
```

## 5. Try it (2 minutes)
1. Simulator → *Sample plates* → click `01_DEMO-BHL-0001_clear` → bot reads the serial → **Yes, correct** → *Choose assembly* → **Boom cylinder** → kit `DK-BHL-A-BOOM`.
2. *Quick messages* → try *Unknown serial*, *Out-of-stock machine*, *Human*, *हिन्दी में बात करें*.
3. Operator console → Conversations (OCR text, photo, delivery status), Tickets (resolve), Leads (Export CSV), Fitments (verify requires evidence), Audit trail.

## 6. Tests and evidence
```bash
cd backend
npm run typecheck
npm test                                            # unit tests (no DB needed)
TEST_MONGODB_URI="mongodb+srv://…/sealkit_test" npm test   # + integration tests; DB name must contain "test", it is WIPED
npm run demo:cases                                  # runs the 10 demo cases, writes docs/ACCEPTANCE_REPORT.md
```
UI screenshots/recording: `docs/evidence/` (regenerate: `npm i -D playwright`, then `node docs/evidence/capture.mjs` with the server running and freshly seeded).

## 7. Real WhatsApp (optional)
Follow `docs/META_SETUP_CHECKLIST.md`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `MongooseServerSelectionError` | Atlas IP allowlist, or wrong user/password (URL-encode special chars) |
| `JWT_SECRET must be at least 16 characters` | Set it in `backend/.env` |
| First OCR slow (~2–5 s) | Tesseract worker warm-up; later calls are faster |
| Login fails after changing `ADMIN_PASSWORD` | Demo users are created on first start; edit the user in Atlas or run `npm run seed -- --reset` |
| 429 in simulator | `DEMO_RATE_LIMIT` (requests/min/IP) |
