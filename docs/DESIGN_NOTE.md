# Design note, deployment, privacy, estimate

## Architecture
```
WhatsApp ─► POST /api/webhooks/whatsapp (raw body, HMAC check, 200 fast) ─┐
Simulator ─► POST /api/demo/messages ─────────────────────────────────────┤
                                                       per-waId queue ► handleInbound()
                                                       ├ idempotent insert (unique messageId)
                                                       ├ media validate/encrypt ► OCR adapter (Tesseract.js)
                                                       ├ state machine (persisted in MongoDB)
                                                       └ resolveFitment() deterministic rules ► CatalogRepo
Replies ─► delivery.ts ─► WhatsApp Cloud API (retries/429) or simulator log
```
The same `handleInbound` runs for both channels, so the simulator exercises exactly the production workflow.

## Key decisions
- **OCR is evidence, never a verdict.** OCR yields serial *candidates*; the customer must confirm. Low confidence → ask for a clearer photo; repeated failure → staff ticket.
- **Rules engine only.** A kit is recommended only for exact confirmed serial + exact assembly + an *active, verified* fitment. Multiple kits → ask for part number / staff review. Nothing generative picks SKUs.
- **Never promise stock.** Out of stock → kit shown with "not available now" and a ticket.
- **Idempotency:** unique `messageId`; Meta retries are processed once. Status webhooks update delivery state.
- **Ordering:** in-process queue keyed by waId; webhook acks immediately.
- **Admin safety:** fitment can be marked *verified* only with evidence text; every kit/fitment/stock/ticket change writes an audit entry. Roles: admin (write) vs staff (read/tickets/replies).
- **Fictional data labelled** in every recommendation.

## Privacy / retention
Plate photos: type sniffed (PNG/JPEG/WebP), ≤5 MB, stored AES-256-GCM encrypted outside the web root, auto-deleted after `MEDIA_RETENTION_HOURS` (default 24; job every 15 min, also `POST /api/admin/retention/run`). OCR text and chat history are kept until an admin uses *Delete data* on the conversation. Phone numbers appear only in operator views. Tokens/secrets live only in env vars.

## Known limitations (honest list)
- Verified against **FerretDB** locally, not Atlas itself (same driver/wire protocol; please run the setup once on your Atlas).
- Real Meta delivery was **not tested here** (no credentials); the webhook/send paths were tested with signed sample payloads and a fake Graph API.
- Queue is in-process: a crash between webhook ack and processing loses that message (Meta may not retry after a 200). Production fix: durable queue (BullMQ/SQS) or persist-then-process.
- Single instance only (queue + retention job). Scale-out needs the durable queue.
- Hindi strings are machine-quality; have a native speaker review.
- Tesseract accuracy on real, dirty plates will be lower than on clean fixtures; thresholds are env-tunable.

## Deployment notes
Backend: Render/Railway/Fly — build `npm install && npm run build`, start `npm start`, env from `.env.example`, set `PUBLIC_BASE_URL`, `CORS_ORIGINS`. Persist `MEDIA_DIR` with a disk (or accept ephemeral storage given 24h retention). Frontend: either served by the backend (`SERVE_FRONTEND=true`, simplest) or Vercel/Netlify with `VITE_API_URL` and the origin in `CORS_ORIGINS`. Database: Atlas. Use a strong `JWT_SECRET`, change demo passwords, keep `ALLOW_UNSIGNED_WEBHOOKS=false`. No public deployment was made from this environment.

## Time estimate
Roughly 2–3 working days for an experienced developer (backend+rules+tests ≈ 1.5 d, OCR/WhatsApp ≈ 0.5 d, console UI ≈ 0.5–1 d, docs/evidence ≈ 0.5 d).

## 5–8 minute walkthrough script
1. (0:30) Architecture diagram above; DEMO data banner. 2. (1:30) Simulator: plate photo → OCR confirm → assembly → kit → quote. 3. (1:00) Typed serial; same model/different serial. 4. (1:00) Blurred/cropped plate, unknown serial, out of stock → tickets. 5. (1:00) Hindi switch. 6. (1:30) Console: OCR/photo history, resolve ticket, fitment verify-with-evidence, stock edit, audit trail, CSV export. 7. (0:45) Webhook replay (signature + idempotency). 8. (0:45) `npm test` and `demo:cases` output.

## Acceptance cases
See `docs/ACCEPTANCE_REPORT.md` (10/10, real engine output with persisted state per step).
