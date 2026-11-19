/**
 * Local stand-in for the Meta Graph API so the whole WhatsApp Cloud API path can be exercised offline:
 *   - GET  /v21.0/<mediaId>            -> media metadata   (mediaId "plate-01" .. "plate-11" = fixture plates)
 *   - GET  /media/<file>               -> image bytes (requires Bearer token)
 *   - POST /v21.0/<phoneId>/messages   -> records the outbound message and returns a wamid
 *   - GET  /sent                       -> everything the bot "sent"
 * Start:  npm run fake:graph     then run the API with WHATSAPP_GRAPH_URL=http://localhost:4010
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const app = express();
app.use(express.json());
const dir = path.resolve(process.cwd(), 'fixtures/plates');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const sent: unknown[] = [];
const need = (req: express.Request, res: express.Response) => {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'missing bearer token' } });
    return false;
  }
  return true;
};

app.get('/sent', (_req, res) => res.json(sent));
app.get('/media/:file', (req, res) => {
  if (!need(req, res)) return;
  const f = files.find((x) => x === req.params.file);
  if (!f) return void res.sendStatus(404);
  res.type('image/png').send(fs.readFileSync(path.join(dir, f)));
});
app.post('/:ver/:phoneId/messages', (req, res) => {
  if (!need(req, res)) return;
  sent.push(req.body);
  const b = req.body;
  const summary = b.type === 'text' ? b.text.body : `${b.interactive?.type}: ${b.interactive?.body?.text}`;
  console.log(`→ to ${b.to}: ${String(summary).replace(/\n/g, ' / ').slice(0, 140)}`);
  res.json({ messaging_product: 'whatsapp', messages: [{ id: `wamid.FAKE_${Date.now()}_${sent.length}` }] });
});
app.get('/:ver/:mediaId', (req, res) => {
  if (!need(req, res)) return;
  const m = /^plate-(\d{1,2})$/.exec(req.params.mediaId);
  const f = m ? files.find((x) => x.startsWith(m[1].padStart(2, '0') + '_')) : undefined;
  if (!f) return void res.status(404).json({ error: { message: 'unknown media id' } });
  const size = fs.statSync(path.join(dir, f)).size;
  res.json({ id: req.params.mediaId, url: `http://localhost:${process.env.FAKE_GRAPH_PORT ?? 4010}/media/${f}`, mime_type: 'image/png', file_size: size });
});

const port = Number(process.env.FAKE_GRAPH_PORT ?? 4010);
app.listen(port, () => console.log(`Fake Graph API on :${port} (media ids plate-01..plate-11)`));
