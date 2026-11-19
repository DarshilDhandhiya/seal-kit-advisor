# Meta WhatsApp Cloud API – setup checklist

The app works fully without Meta (browser simulator). Do this only to test on a real phone.

1. [ ] developers.facebook.com → **Create App** → type *Business* → add the **WhatsApp** product.
2. [ ] WhatsApp → **API Setup**: note the **Phone number ID** (→ `WHATSAPP_PHONE_NUMBER_ID`). Add your own phone as a test recipient and verify it.
3. [ ] Create a **System User** token (Business settings → System users → Generate token, permission `whatsapp_business_messaging`) → `WHATSAPP_ACCESS_TOKEN`. (The 24h temporary token also works for a quick test.)
4. [ ] App settings → Basic → **App Secret** → `WHATSAPP_APP_SECRET` (used to verify `X-Hub-Signature-256`).
5. [ ] Choose any random string → `WHATSAPP_VERIFY_TOKEN`.
6. [ ] Backend must be reachable over **public HTTPS**: deploy it, or locally `ngrok http 4000` / `cloudflared tunnel --url http://localhost:4000`.
7. [ ] WhatsApp → **Configuration** → Webhook: callback URL `https://<host>/api/webhooks/whatsapp`, verify token = step 5 → **Verify and save** (Meta calls `GET` with `hub.challenge`).
8. [ ] Subscribe to the **messages** webhook field.
9. [ ] Message the test number from your phone. Send a plate photo or a serial like `DEMO-BHL-0001`.
10. [ ] Check Operator console → Conversations (delivery status moves sent → delivered → read).

Notes: free-form replies only work inside the 24h customer-service window (the bot only replies to inbound messages, so this holds). Interactive buttons/lists are used and fall back to plain text if rejected.

## Safe replay without Meta
Sample payloads are in `docs/webhook-samples/`. With the server running and `ALLOW_UNSIGNED_WEBHOOKS=false`, the script signs the body with `WHATSAPP_APP_SECRET`:

```bash
cd backend
npm run replay:webhook -- ../docs/webhook-samples/text-message.json --secret "$WHATSAPP_APP_SECRET"
npm run replay:webhook -- ../docs/webhook-samples/text-message.json --secret "$WHATSAPP_APP_SECRET" --repeat 3 --same-id   # idempotency: processed once
```
Without real credentials, outbound sends fail (logged as `failed` with the Graph error); run `npm run fake:graph` (stand-in Graph API on :4010) and set `WHATSAPP_GRAPH_URL=http://localhost:4010` to exercise the full media-download + send path offline. In the fake, media ids `plate-01`…`plate-11` return the sample plates.
