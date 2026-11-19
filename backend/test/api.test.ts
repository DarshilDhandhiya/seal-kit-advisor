import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AuditLog, Conversation, Fitment, Kit, Lead, Message, ReviewTicket } from '../src/models/index.js';
import { purgeExpiredMedia, saveMedia } from '../src/services/media.js';
import { hasDb, setupDb, teardownDb } from './db.js';
import { plate } from './helpers.js';

const d = hasDb ? describe : describe.skip;

d('admin API — authentication, permissions, validation, audit', () => {
  const app = createApp();
  let admin = '';
  let staff = '';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    await setupDb();
    admin = (await request(app).post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'AdminPass#123' })).body.token;
    staff = (await request(app).post('/api/admin/auth/login').send({ email: 'staff@test.local', password: 'StaffPass#123' })).body.token;
  });
  afterAll(teardownDb);

  it('health endpoint works and reports db', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.db).toBe('connected');
  });

  it('login: wrong password / unknown user rejected with 401, tokens issued otherwise', async () => {
    expect((await request(app).post('/api/admin/auth/login').send({ email: 'admin@test.local', password: 'nope' })).status).toBe(401);
    expect((await request(app).post('/api/admin/auth/login').send({ email: 'ghost@test.local', password: 'x' })).status).toBe(401);
    expect((await request(app).post('/api/admin/auth/login').send({ email: 'not-an-email', password: 'x' })).status).toBe(400);
    expect(admin).toBeTruthy();
    expect(staff).toBeTruthy();
  });

  it('EVERY admin endpoint rejects missing / invalid tokens', async () => {
    const paths = ['/machines', '/kits', '/fitments', '/tickets', '/leads', '/leads/export.csv', '/conversations', '/audit', '/stats', '/assemblies', '/me'];
    for (const p of paths) {
      expect((await request(app).get(`/api/admin${p}`)).status, p).toBe(401);
      expect((await request(app).get(`/api/admin${p}`).set(auth('garbage.token.here'))).status, p).toBe(401);
    }
  });

  it('staff can read but cannot change the catalogue; admin can', async () => {
    expect((await request(app).get('/api/admin/kits').set(auth(staff))).status).toBe(200);
    const body = { sku: 'DK-TEST-1', name: 'Test kit', assemblyCode: 'BOOM', demoPriceINR: 100, stock: 3 };
    expect((await request(app).post('/api/admin/kits').set(auth(staff)).send(body)).status).toBe(403);
    expect((await request(app).patch('/api/admin/kits/DK-BHL-A-BOOM').set(auth(staff)).send({ stock: 1 })).status).toBe(403);
    expect((await request(app).delete('/api/admin/kits/DK-BHL-A-BOOM').set(auth(staff))).status).toBe(403);
    expect((await request(app).post('/api/admin/fitments').set(auth(staff)).send({})).status).toBe(403);
    const ok = await request(app).post('/api/admin/kits').set(auth(admin)).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.sku).toBe('DK-TEST-1');
  });

  it('kit CRUD validates input and writes an audit trail', async () => {
    expect((await request(app).post('/api/admin/kits').set(auth(admin)).send({ sku: 'x', name: '', assemblyCode: 'BOOM', demoPriceINR: -1, stock: 1.5 })).status).toBe(400);
    expect((await request(app).post('/api/admin/kits').set(auth(admin)).send({ sku: 'DK-TEST-2', name: 'Bad asm', assemblyCode: 'WHEEL', demoPriceINR: 1, stock: 1 })).status).toBe(400);
    expect((await request(app).post('/api/admin/kits').set(auth(admin)).send({ sku: 'DK-TEST-1', name: 'dup', assemblyCode: 'BOOM', demoPriceINR: 1, stock: 1 })).status).toBe(409);
    const upd = await request(app).patch('/api/admin/kits/DK-TEST-1').set(auth(admin)).send({ stock: 9, demoPriceINR: 123 });
    expect(upd.status).toBe(200);
    expect(upd.body.stock).toBe(9);
    const log = await AuditLog.find({ entity: 'kit', entityId: 'DK-TEST-1' }).sort({ at: 1 }).lean();
    expect(log.map((l) => l.action)).toEqual(['create', 'update']);
    expect((log[1].before as any).stock).toBe(3);
    expect((log[1].after as any).stock).toBe(9);
    expect(log[1].actor).toBe('admin@test.local');
    expect((await request(app).delete('/api/admin/kits/DK-TEST-1').set(auth(admin))).status).toBe(200);
    expect((await request(app).get('/api/admin/kits/DK-TEST-1').set(auth(admin))).status).toBe(404);
  });

  it('cannot delete a kit that fitments reference', async () => {
    const r = await request(app).delete('/api/admin/kits/DK-BHL-A-BOOM').set(auth(admin));
    expect(r.status).toBe(409);
    expect(await Kit.exists({ sku: 'DK-BHL-A-BOOM' })).toBeTruthy();
  });

  it('fitments: "verified" requires evidence; references and assembly consistency are enforced; duplicates rejected', async () => {
    const f = '/api/admin/fitments';
    const base = { machineSerial: 'DEMO-EXC-0005', assemblyCode: 'DIPPER', kitSku: 'DK-BHL-A-DIP' };
    // kit DK-BHL-A-DIP is a DIPPER kit; EXC-0005 exists -> allowed structurally
    const noEvidence = await request(app).post(f).set(auth(admin)).send({ ...base, verified: true, evidenceSource: '' });
    expect(noEvidence.status).toBe(400);
    expect(JSON.stringify(noEvidence.body)).toMatch(/evidenceSource/);
    expect((await request(app).post(f).set(auth(admin)).send({ ...base, machineSerial: 'DEMO-NOPE-0001' })).status).toBe(400);
    expect((await request(app).post(f).set(auth(admin)).send({ ...base, assemblyCode: 'BOOM' })).status).toBe(400); // kit belongs to DIPPER
    const created = await request(app).post(f).set(auth(admin)).send({ ...base, verified: false });
    expect(created.status).toBe(201);
    expect((await request(app).post(f).set(auth(admin)).send({ ...base })).status).toBe(409);
    // verify it with evidence
    const patch = await request(app).patch(`${f}/${created.body._id}`).set(auth(admin)).send({ verified: true, evidenceSource: 'Supplier catalogue p.14' });
    expect(patch.status).toBe(200);
    expect(patch.body.verified).toBe(true);
    // unverify, then try to verify w/o evidence again
    const bad = await request(app).patch(`${f}/${created.body._id}`).set(auth(admin)).send({ evidenceSource: '' });
    expect(bad.status).toBe(400);
    const log = await AuditLog.find({ entity: 'fitment', entityId: created.body._id }).lean();
    expect(log.length).toBe(2);
    expect((await request(app).delete(`${f}/${created.body._id}`).set(auth(admin))).status).toBe(200);
    expect(await Fitment.countDocuments({ machineSerial: 'DEMO-EXC-0005', assemblyCode: 'DIPPER' })).toBe(0);
  });

  it('machines: search by serial', async () => {
    const r = await request(app).get('/api/admin/machines?q=exc-000').set(auth(staff));
    expect(r.body.items.map((m: any) => m.serial)).toEqual(['DEMO-EXC-0005', 'DEMO-EXC-0006', 'DEMO-EXC-0007', 'DEMO-EXC-0008']);
    expect((await request(app).get('/api/admin/machines?q=.*').set(auth(staff))).body.total).toBe(0); // regex is escaped
  });

  it('tickets & leads: staff may triage; resolving needs a resolution; CSV export is injection-safe', async () => {
    const conv = await Conversation.create({ waId: 'sim-apitest01', channel: 'simulator', state: 'human_review' });
    const t = await ReviewTicket.create({ ref: 'TKT-API001', reason: 'no_fitment', conversationId: conv._id, waId: conv.waId, machineSerial: 'DEMO-EXC-0008' });
    const noRes = await request(app).patch(`/api/admin/tickets/${t._id}`).set(auth(staff)).send({ status: 'resolved' });
    expect(noRes.status).toBe(400);
    const ok = await request(app).patch(`/api/admin/tickets/${t._id}`).set(auth(staff)).send({ status: 'resolved', resolution: 'Supplier confirmed kit', assignedTo: 'staff@test.local', notes: 'called' });
    expect(ok.status).toBe(200);
    expect((await Conversation.findById(conv._id))?.state).toBe('closed'); // released from human review
    expect((await request(app).get('/api/admin/tickets?status=resolved').set(auth(staff))).body.items.length).toBeGreaterThan(0);

    await Lead.create({ ref: 'QR-CSV001', customerName: '=HYPERLINK("http://evil")', phone: '+919999900002', city: 'Pune, MH', consent: true, consentAt: new Date(), suggestedSku: 'DK-BHL-A-BOOM' });
    const csv = await request(app).get('/api/admin/leads/export.csv').set(auth(staff));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain("'=HYPERLINK");
    expect(csv.text).toContain('"Pune, MH"');
    expect(csv.text.split('\r\n')[0]).toContain('customerName');
  });

  it('conversation search by serial, history with OCR + media metadata; media is auth-only and retention purges it', async () => {
    const conv = await Conversation.create({ waId: 'sim-apitest02', channel: 'simulator', confirmedSerial: 'DEMO-BHL-0004' });
    const saved = await saveMedia(plate('04_DEMO-BHL-0004_clear.png'), 'image/png');
    const msg = await Message.create({
      conversationId: conv._id, waId: conv.waId, direction: 'in', messageId: 'api-test-img-1', type: 'image',
      media: { mime: saved.mime, size: saved.size, sha256: saved.sha256, file: saved.file, expiresAt: new Date(Date.now() - 1000) },
      ocr: { provider: 'test', rawText: 'DEMO-BHL-0004', confidence: 90, candidates: ['DEMO-BHL-0004'], outcome: 'confirm', imageHash: saved.sha256 },
    });
    const found = await request(app).get('/api/admin/conversations?q=demo-bhl-0004').set(auth(staff));
    expect(found.body.items.map((c: any) => c.waId)).toContain('sim-apitest02');
    const detail = await request(app).get(`/api/admin/conversations/${conv._id}`).set(auth(staff));
    expect(detail.body.messages[0].ocr.candidates).toEqual(['DEMO-BHL-0004']);
    expect(detail.body.messages[0].media.available).toBe(true);
    // encrypted at rest
    const onDisk = fs.readFileSync(path.resolve(process.env.MEDIA_DIR!, saved.file));
    expect(onDisk.includes(plate('04_DEMO-BHL-0004_clear.png').subarray(0, 64))).toBe(false);
    expect((await request(app).get(`/api/admin/messages/${msg._id}/media`)).status).toBe(401);
    const img = await request(app).get(`/api/admin/messages/${msg._id}/media`).set(auth(staff)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(img.status).toBe(200);
    expect((img.body as Buffer).equals(plate('04_DEMO-BHL-0004_clear.png'))).toBe(true);
    // retention: expired => file removed, metadata kept
    expect(await purgeExpiredMedia()).toBe(1);
    expect(fs.existsSync(path.resolve(process.env.MEDIA_DIR!, saved.file))).toBe(false);
    expect((await request(app).get(`/api/admin/messages/${msg._id}/media`).set(auth(staff))).status).toBe(404);
    const after = await Message.findById(msg._id).lean();
    expect(after?.media?.sha256).toBe(saved.sha256);
    // only admin may delete a conversation (customer deletion request)
    expect((await request(app).delete(`/api/admin/conversations/${conv._id}`).set(auth(staff))).status).toBe(403);
    expect((await request(app).delete(`/api/admin/conversations/${conv._id}`).set(auth(admin))).status).toBe(200);
    expect(await Message.countDocuments({ conversationId: conv._id })).toBe(0);
  });

  it('simulator API: validates waId, persists, and cannot impersonate a WhatsApp number', async () => {
    expect((await request(app).post('/api/demo/messages').field('waId', '919999900001').field('text', 'hi')).status).toBe(400);
    expect((await request(app).post('/api/demo/messages').field('waId', 'sim-apitest03')).status).toBe(400); // nothing to send
    const r = await request(app).post('/api/demo/messages').field('waId', 'sim-apitest03').field('text', 'DEMO-BHL-0001');
    expect(r.status).toBe(200);
    expect(r.body.conversation.state).toBe('awaiting_serial_confirmation');
    expect(r.body.replies[0].kind).toBe('buttons');
    const hist = await request(app).get('/api/demo/conversations/sim-apitest03');
    expect(hist.body.messages.length).toBe(2);
    const bad = await request(app).post('/api/demo/messages').field('waId', 'sim-apitest03').attach('image', Buffer.from('not an image at all, really'), 'x.png');
    expect(bad.status).toBe(200);
    expect(bad.body.replies[0].text).toMatch(/JPEG, PNG or WEBP/);
  });
});
