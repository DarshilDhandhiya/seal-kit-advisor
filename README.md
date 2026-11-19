# Seal-Kit Advisor — WhatsApp seal-kit assistant (Assignment 02)

MERN-style stack in TypeScript: **Node 22 + Express 5 + MongoDB (Atlas) + React/Vite**. A customer sends a photo of a machine plate (or types a serial) on WhatsApp; the bot OCRs it (Tesseract.js), asks for confirmation, asks which hydraulic assembly is leaking, and a **deterministic rules engine** recommends a seal kit — or hands off to staff. **All machines, kits and fitments are fictional DEMO data.**

- Browser simulator (`/`) runs the *same* backend workflow as the WhatsApp webhook.
- Operator console (`/admin`) for kits, fitments, stock, tickets, leads (CSV), conversations with OCR/photo, audit trail.
- English + Hindi (bonus).

→ **Start with [SETUP_GUIDE.md](SETUP_GUIDE.md).**

## Quick start
```bash
cd backend && cp .env.example .env     # set MONGODB_URI (Atlas), JWT_SECRET
npm install && npm run seed && npm run dev
cd ../frontend && npm install && npm run dev   # http://localhost:5173
```
Demo logins: `admin@demo.local / Admin@12345`, `staff@demo.local / Staff@12345`.

## Repo layout
```
backend/   src/{routes,services,models,lib,scripts}, test/, data/seed.json, fixtures/plates, public/demo
frontend/  React simulator + operator console
docs/      openapi.yaml, DESIGN_NOTE.md, META_SETUP_CHECKLIST.md, ACCEPTANCE_REPORT.md, webhook-samples/, evidence/
```

## Scripts (backend)
`dev`, `build`, `start`, `seed` (idempotent; `-- --reset`), `fixtures` (regenerate plates/kit images), `demo:cases` (10 cases → `docs/ACCEPTANCE_REPORT.md`), `replay:webhook`, `fake:graph`, `test`, `typecheck`.

## Requirement map
| Requirement | Where |
|---|---|
| Webhook GET verify / POST, HMAC signature, idempotent, media by id, limits, retention, send+retries+delivery log | `routes/webhook.ts`, `services/whatsappClient.ts`, `delivery.ts`, `media.ts` |
| Simulator on same workflow | `routes/demo.ts` → `services/bot.ts` |
| OCR adapter; never a verdict | `services/ocr.ts` |
| Rules engine (exact serial + assembly + verified active fitment) | `services/fitment.ts` |
| Persisted states + reset/handoff | `services/stateMachine.ts`, `bot.ts`, `models/Conversation.ts` |
| Collections/indexes | `models/*` (unique compound index on fitments, unique `messageId`) |
| Endpoints, admin-only | `routes/*.ts`, `docs/openapi.yaml` |
| Admin features (search, OCR/photo/history, edit, resolve, verify w/ evidence, CSV, audit) | `routes/admin.ts`, `frontend/src/pages/admin` |
| Seed Appendix A dataset | `data/seed.json`, `scripts/seed.ts` |
| Fixtures (readable/blurred/cropped plates, product placeholders) | `fixtures/`, `scripts/generateFixtures.ts` |
| 10 demo cases w/ expected reply + state | `docs/ACCEPTANCE_REPORT.md`, `test/acceptance.test.ts` |
| Meta checklist + sample payloads + replay | `docs/META_SETUP_CHECKLIST.md`, `docs/webhook-samples/` |
| Tests (serial normalization, precedence, missing/duplicate fits, idempotency, permissions, transitions) | `backend/test/` |
| Design note, retention/encryption, deployment, estimate, walkthrough | `docs/DESIGN_NOTE.md` |

## Security
No secrets in the repo (`.env` ignored; `.env.example` only). Helmet, CORS allowlist, rate limits, zod validation, bcrypt, JWT, CSV formula-injection escaping, encrypted media.
