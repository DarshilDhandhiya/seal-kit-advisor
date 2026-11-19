# Seal-Kit Advisor — WhatsApp seal-kit assistant (Assignment 02)

MERN-style stack in TypeScript: **Node 22 + Express 5 + MongoDB (Atlas) + React/Vite**. A customer sends a photo of a machine plate (or types a serial) on WhatsApp; the bot OCRs it (Tesseract.js), asks for confirmation, asks which hydraulic assembly is leaking, and a **deterministic rules engine** recommends a seal kit — or hands off to staff. **All machines, kits and fitments are fictional DEMO data.**

- Browser simulator (`/`) runs the *same* backend workflow as the WhatsApp webhook.
- Operator console (`/admin`) for kits, fitments, stock, tickets, leads (CSV), conversations with OCR/photo, audit trail.
- English + Hindi (bonus).

→ **Start with [SETUP_GUIDE.md](SETUP_GUIDE.md).**

## Screenshots

> All screens use fictional DEMO data. Images live in [`docs/evidence/`](docs/evidence/). A full screen recording of the simulator flow is in [`docs/evidence/simulator-flow.webm`](docs/evidence/simulator-flow.webm).

### Customer simulator (WhatsApp-style chat)
| Welcome | OCR reads the plate and asks to confirm |
|---|---|
| ![Welcome](docs/evidence/01-simulator-welcome.png) | ![OCR confirmation](docs/evidence/02-simulator-ocr-confirm.png) |

| Assembly list | Exact kit recommendation |
|---|---|
| ![Assembly list](docs/evidence/03-simulator-assembly-list.png) | ![Recommendation](docs/evidence/04-simulator-recommendation.png) |

| Quote request completed | Out of stock (availability not promised) |
|---|---|
| ![Quote done](docs/evidence/05-simulator-quote-done.png) | ![Out of stock](docs/evidence/06-simulator-out-of-stock.png) |

| Unknown serial → staff review ticket | Hindi reply + blurred plate |
|---|---|
| ![Unknown serial](docs/evidence/07-simulator-unknown-serial-ticket.png) | ![Hindi](docs/evidence/08-simulator-hindi-blurred.png) |

### Mobile view
<img src="docs/evidence/09-mobile-no-fitment.png" alt="Mobile: no verified fitment, ticket raised" width="320">

### Operator console
| Login | Overview |
|---|---|
| ![Login](docs/evidence/10-admin-login.png) | ![Overview](docs/evidence/11-admin-overview.png) |

| Kits (stock editing) | Fitments |
|---|---|
| ![Kits](docs/evidence/12-admin-kits.png) | ![Fitments](docs/evidence/13-admin-fitments.png) |

| Add fitment (verify needs evidence) | Review tickets |
|---|---|
| ![Fitment form](docs/evidence/14-admin-fitment-form.png) | ![Tickets](docs/evidence/15-admin-tickets.png) |

| Leads (CSV export) | Conversation with photo + OCR details |
|---|---|
| ![Leads](docs/evidence/16-admin-leads.png) | ![Conversation OCR](docs/evidence/17-admin-conversation-ocr.png) |

### Audit trail
![Audit trail](docs/evidence/18-admin-audit.png)

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
