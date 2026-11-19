import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { toCsv } from '../lib/csv.js';
import { requireAuth, requireRole, signToken } from '../middleware/auth.js';
import { Assembly, AuditLog, Conversation, Fitment, Kit, Lead, Machine, Message, ReviewTicket, User, TICKET_REASONS } from '../models/index.js';
import { audit } from '../services/audit.js';
import { sendStaffMessage } from '../services/delivery.js';
import { deleteMediaFile, purgeExpiredMedia, readMedia } from '../services/media.js';
import { snapshot } from './demo.js';

export const adminRouter = Router();

/* ------------------------------------------------------------------ helpers */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const param = (req: Request, k: string) => String(req.params[k] ?? '');
const actor = (req: Request) => req.user!.email;
const pageQ = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) });
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const paged = (page: number, limit: number, total: number) => ({ page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });

/* ------------------------------------------------------------------ auth */
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts, try again later' } } });
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

adminRouter.post('/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH); // constant-ish time
  if (!user || !ok || user.status !== 'active') throw unauthorized('Invalid email or password');
  const u = { id: String(user._id), email: user.email, role: user.role as 'admin' | 'staff' };
  res.json({ token: signToken(u), user: { email: u.email, role: u.role, name: user.name } });
});

// Everything below requires a valid token.
adminRouter.use(requireAuth);
const adminOnly = requireRole('admin');

adminRouter.get('/me', (req, res) => res.json({ user: req.user }));

adminRouter.get('/stats', async (_req, res) => {
  const [openTickets, newLeads, conversations, messages, kits, machines, fitments, lowStock] = await Promise.all([
    ReviewTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    Lead.countDocuments({ status: 'new' }),
    Conversation.countDocuments(),
    Message.countDocuments(),
    Kit.countDocuments(),
    Machine.countDocuments(),
    Fitment.countDocuments(),
    Kit.find({ active: true, stock: { $lte: 3 } }).select('sku name stock').sort({ stock: 1 }).limit(10).lean(),
  ]);
  const byState = await Conversation.aggregate([{ $group: { _id: '$state', n: { $sum: 1 } } }]);
  res.json({ openTickets, newLeads, conversations, messages, kits, machines, fitments, lowStock, byState: Object.fromEntries(byState.map((s) => [s._id, s.n])) });
});

adminRouter.get('/assemblies', async (_req, res) => res.json({ items: await Assembly.find().sort({ code: 1 }).lean() }));

/* ------------------------------------------------------------------ machines */
const machineBody = z.object({
  serial: z.string().regex(/^DEMO-[A-Z]{2,10}-\d{4}$/, 'Serial must look like DEMO-BHL-0001'),
  model: z.string().min(1).max(40),
  family: z.string().min(2).max(10),
  variant: z.string().min(1).max(10),
  year: z.number().int().min(1990).max(2100),
  status: z.enum(['active', 'inactive']).default('active'),
  notes: z.string().max(500).default(''),
});

adminRouter.get('/machines', async (req, res) => {
  const { page, limit } = pageQ.parse(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const filter = q ? { $or: [{ serial: { $regex: esc(q), $options: 'i' } }, { model: { $regex: esc(q), $options: 'i' } }] } : {};
  const [items, total] = await Promise.all([Machine.find(filter).sort({ serial: 1 }).skip((page - 1) * limit).limit(limit).lean(), Machine.countDocuments(filter)]);
  res.json({ items, ...paged(page, limit, total) });
});

adminRouter.post('/machines', adminOnly, async (req, res) => {
  const body = machineBody.parse(req.body);
  if (await Machine.exists({ serial: body.serial })) throw conflict('Serial already exists');
  const doc = await Machine.create(body);
  await audit('machine', doc.serial, 'create', null, doc.toObject(), actor(req));
  res.status(201).json(doc);
});

adminRouter.patch('/machines/:serial', adminOnly, async (req, res) => {
  const body = machineBody.omit({ serial: true }).partial().parse(req.body);
  const before = await Machine.findOne({ serial: param(req, 'serial').toUpperCase() });
  if (!before) throw notFound('Machine not found');
  const snap = before.toObject();
  before.set(body);
  await before.save();
  await audit('machine', before.serial, 'update', snap, before.toObject(), actor(req));
  res.json(before);
});

/* ------------------------------------------------------------------ kits */
const kitBody = z.object({
  sku: z.string().regex(/^[A-Za-z0-9-]{3,40}$/, 'SKU: letters, digits and dashes (3-40)'),
  name: z.string().min(2).max(120),
  assemblyCode: z.string().min(2).max(20),
  demoPriceINR: z.number().min(0).max(10_000_000),
  stock: z.number().int().min(0).max(1_000_000),
  imageUrl: z.string().max(500).default(''),
  description: z.string().max(1000).default(''),
  active: z.boolean().default(true),
});

adminRouter.get('/kits', async (req, res) => {
  const { page, limit } = pageQ.parse(req.query);
  const f: Record<string, unknown> = {};
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) f.$or = [{ sku: { $regex: esc(q), $options: 'i' } }, { name: { $regex: esc(q), $options: 'i' } }];
  if (typeof req.query.assemblyCode === 'string' && req.query.assemblyCode) f.assemblyCode = req.query.assemblyCode.toUpperCase();
  if (typeof req.query.active === 'string') f.active = bool.parse(req.query.active);
  const [items, total] = await Promise.all([Kit.find(f).sort({ sku: 1 }).skip((page - 1) * limit).limit(limit).lean(), Kit.countDocuments(f)]);
  res.json({ items, ...paged(page, limit, total) });
});

adminRouter.get('/kits/:sku', async (req, res) => {
  const k = await Kit.findOne({ sku: param(req, 'sku').toUpperCase() }).lean();
  if (!k) throw notFound('Kit not found');
  res.json(k);
});

adminRouter.post('/kits', adminOnly, async (req, res) => {
  const body = kitBody.parse(req.body);
  body.sku = body.sku.toUpperCase();
  body.assemblyCode = body.assemblyCode.toUpperCase();
  if (!(await Assembly.exists({ code: body.assemblyCode }))) throw badRequest(`Unknown assembly code ${body.assemblyCode}`);
  if (await Kit.exists({ sku: body.sku })) throw conflict('SKU already exists');
  const doc = await Kit.create(body);
  await audit('kit', doc.sku, 'create', null, doc.toObject(), actor(req));
  res.status(201).json(doc);
});

adminRouter.patch('/kits/:sku', adminOnly, async (req, res) => {
  const body = kitBody.omit({ sku: true }).partial().parse(req.body);
  const doc = await Kit.findOne({ sku: param(req, 'sku').toUpperCase() });
  if (!doc) throw notFound('Kit not found');
  if (body.assemblyCode) {
    body.assemblyCode = body.assemblyCode.toUpperCase();
    if (!(await Assembly.exists({ code: body.assemblyCode }))) throw badRequest(`Unknown assembly code ${body.assemblyCode}`);
    if (body.assemblyCode !== doc.assemblyCode && (await Fitment.exists({ kitSku: doc.sku }))) {
      throw conflict('Kit is referenced by fitments; remove or move them before changing its assembly');
    }
  }
  const before = doc.toObject();
  doc.set(body);
  await doc.save();
  await audit('kit', doc.sku, 'update', before, doc.toObject(), actor(req));
  res.json(doc);
});

adminRouter.delete('/kits/:sku', adminOnly, async (req, res) => {
  const doc = await Kit.findOne({ sku: param(req, 'sku').toUpperCase() });
  if (!doc) throw notFound('Kit not found');
  const used = await Fitment.countDocuments({ kitSku: doc.sku });
  if (used > 0) throw conflict(`Kit is used by ${used} fitment(s). Deactivate it instead (active=false) or delete the fitments first.`);
  await doc.deleteOne();
  await audit('kit', doc.sku, 'delete', doc.toObject(), null, actor(req));
  res.json({ deleted: true });
});

/* ------------------------------------------------------------------ fitments */
const fitmentBody = z
  .object({
    machineSerial: z.string().min(5).max(40),
    assemblyCode: z.string().min(2).max(20),
    kitSku: z.string().min(3).max(40),
    evidenceSource: z.string().max(300).default(''),
    verified: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.verified && v.evidenceSource.trim().length < 3) {
      ctx.addIssue({ code: 'custom', path: ['evidenceSource'], message: 'A fitment can only be marked verified when evidenceSource is provided' });
    }
  });

async function validateFitmentRefs(f: { machineSerial: string; assemblyCode: string; kitSku: string }) {
  const [machine, assembly, kit] = await Promise.all([
    Machine.findOne({ serial: f.machineSerial }),
    Assembly.findOne({ code: f.assemblyCode }),
    Kit.findOne({ sku: f.kitSku }),
  ]);
  if (!machine) throw badRequest(`Unknown machine serial ${f.machineSerial}`);
  if (!assembly) throw badRequest(`Unknown assembly ${f.assemblyCode}`);
  if (!kit) throw badRequest(`Unknown kit ${f.kitSku}`);
  if (kit.assemblyCode !== assembly.code) throw badRequest(`Kit ${kit.sku} belongs to assembly ${kit.assemblyCode}, not ${assembly.code}`);
}
const normFit = <T extends { machineSerial?: string; assemblyCode?: string; kitSku?: string }>(b: T): T => ({
  ...b,
  ...(b.machineSerial ? { machineSerial: b.machineSerial.toUpperCase() } : {}),
  ...(b.assemblyCode ? { assemblyCode: b.assemblyCode.toUpperCase() } : {}),
  ...(b.kitSku ? { kitSku: b.kitSku.toUpperCase() } : {}),
});

adminRouter.get('/fitments', async (req, res) => {
  const { page, limit } = pageQ.parse(req.query);
  const f: Record<string, unknown> = {};
  if (typeof req.query.serial === 'string' && req.query.serial) f.machineSerial = { $regex: esc(req.query.serial.toUpperCase()) };
  if (typeof req.query.assemblyCode === 'string' && req.query.assemblyCode) f.assemblyCode = req.query.assemblyCode.toUpperCase();
  if (typeof req.query.kitSku === 'string' && req.query.kitSku) f.kitSku = req.query.kitSku.toUpperCase();
  if (typeof req.query.verified === 'string') f.verified = bool.parse(req.query.verified);
  if (typeof req.query.active === 'string') f.active = bool.parse(req.query.active);
  const [items, total] = await Promise.all([Fitment.find(f).sort({ machineSerial: 1, assemblyCode: 1 }).skip((page - 1) * limit).limit(limit).lean(), Fitment.countDocuments(f)]);
  res.json({ items, ...paged(page, limit, total) });
});

adminRouter.post('/fitments', adminOnly, async (req, res) => {
  const body = normFit(fitmentBody.parse(req.body));
  await validateFitmentRefs(body);
  if (await Fitment.exists({ machineSerial: body.machineSerial, assemblyCode: body.assemblyCode, kitSku: body.kitSku })) throw conflict('This serial + assembly + kit fitment already exists');
  const doc = await Fitment.create(body);
  await audit('fitment', String(doc._id), 'create', null, doc.toObject(), actor(req));
  res.status(201).json(doc);
});

adminRouter.patch('/fitments/:id', adminOnly, async (req, res) => {
  const doc = await Fitment.findById(param(req, 'id'));
  if (!doc) throw notFound('Fitment not found');
  const before = doc.toObject();
  const merged = normFit(fitmentBody.parse({ ...before, ...req.body, _id: undefined }));
  await validateFitmentRefs(merged);
  const clash = await Fitment.findOne({ machineSerial: merged.machineSerial, assemblyCode: merged.assemblyCode, kitSku: merged.kitSku, _id: { $ne: doc._id } });
  if (clash) throw conflict('Another fitment with this serial + assembly + kit already exists');
  doc.set(merged);
  await doc.save();
  await audit('fitment', String(doc._id), 'update', before, doc.toObject(), actor(req));
  res.json(doc);
});

adminRouter.delete('/fitments/:id', adminOnly, async (req, res) => {
  const doc = await Fitment.findById(param(req, 'id'));
  if (!doc) throw notFound('Fitment not found');
  await doc.deleteOne();
  await audit('fitment', String(doc._id), 'delete', doc.toObject(), null, actor(req));
  res.json({ deleted: true });
});

/* ------------------------------------------------------------------ tickets */
adminRouter.get('/tickets', async (req, res) => {
  const { page, limit } = pageQ.parse(req.query);
  const f: Record<string, unknown> = {};
  if (typeof req.query.status === 'string' && req.query.status) f.status = req.query.status;
  if (typeof req.query.reason === 'string' && (TICKET_REASONS as readonly string[]).includes(req.query.reason)) f.reason = req.query.reason;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) f.$or = [{ ref: { $regex: esc(q), $options: 'i' } }, { machineSerial: { $regex: esc(q), $options: 'i' } }, { waId: { $regex: esc(q) } }];
  const [items, total] = await Promise.all([ReviewTicket.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), ReviewTicket.countDocuments(f)]);
  res.json({ items, ...paged(page, limit, total) });
});

adminRouter.get('/tickets/:id', async (req, res) => {
  const t = await ReviewTicket.findById(param(req, 'id')).lean();
  if (!t) throw notFound('Ticket not found');
  res.json(t);
});

adminRouter.patch('/tickets/:id', async (req, res) => {
  const body = z
    .object({
      status: z.enum(['open', 'in_progress', 'resolved']).optional(),
      assignedTo: z.string().max(100).optional(),
      notes: z.string().max(2000).optional(),
      resolution: z.string().max(1000).optional(),
      notifyCustomer: z.boolean().optional(),
    })
    .parse(req.body);
  const doc = await ReviewTicket.findById(param(req, 'id'));
  if (!doc) throw notFound('Ticket not found');
  const before = doc.toObject();
  const { notifyCustomer, ...fields } = body;
  doc.set(fields);
  if (fields.status === 'resolved') {
    if (!(fields.resolution ?? doc.resolution)) throw badRequest('Provide a resolution when resolving a ticket');
    doc.resolvedAt = new Date();
    // Release the conversation from human review so the customer can continue.
    const conv = await Conversation.findById(doc.conversationId);
    if (conv && conv.state === 'human_review') {
      conv.state = 'closed';
      conv.stateHistory.push({ state: 'closed', reason: `ticket ${doc.ref} resolved`, at: new Date() } as any);
      await conv.save();
    }
  }
  await doc.save();
  await audit('ticket', String(doc._id), 'update', before, doc.toObject(), actor(req));
  if (notifyCustomer && doc.conversationId && (fields.resolution ?? doc.resolution)) {
    await sendStaffMessage(String(doc.conversationId), `[${doc.ref}] ${fields.resolution ?? doc.resolution}`, actor(req));
  }
  res.json(doc);
});

/* ------------------------------------------------------------------ leads */
adminRouter.get('/leads/export.csv', async (req, res) => {
  const f: Record<string, unknown> = {};
  if (typeof req.query.status === 'string' && req.query.status) f.status = req.query.status;
  const rows = await Lead.find(f).sort({ createdAt: -1 }).lean();
  const headers = ['ref', 'createdAt', 'customerName', 'phone', 'city', 'consent', 'consentAt', 'machineSerial', 'assemblyCode', 'suggestedSku', 'status', 'notes'];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  await audit('lead', 'export', 'update', null, { count: rows.length }, actor(req));
  res.send('﻿' + toCsv(headers, rows as any));
});

adminRouter.get('/leads', async (req, res) => {
  const { page, limit } = pageQ.parse(req.query);
  const f: Record<string, unknown> = {};
  if (typeof req.query.status === 'string' && req.query.status) f.status = req.query.status;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) f.$or = [{ ref: { $regex: esc(q), $options: 'i' } }, { customerName: { $regex: esc(q), $options: 'i' } }, { city: { $regex: esc(q), $options: 'i' } }, { phone: { $regex: esc(q) } }];
  const [items, total] = await Promise.all([Lead.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Lead.countDocuments(f)]);
  res.json({ items, ...paged(page, limit, total) });
});

adminRouter.patch('/leads/:id', async (req, res) => {
  const body = z.object({ status: z.enum(['new', 'contacted', 'quoted', 'won', 'lost']).optional(), notes: z.string().max(2000).optional() }).parse(req.body);
  const doc = await Lead.findById(param(req, 'id'));
  if (!doc) throw notFound('Lead not found');
  const before = doc.toObject();
  doc.set(body);
  await doc.save();
  await audit('lead', String(doc._id), 'update', before, doc.toObject(), actor(req));
  res.json(doc);
});

adminRouter.delete('/leads/:id', adminOnly, async (req, res) => {
  const doc = await Lead.findById(param(req, 'id'));
  if (!doc) throw notFound('Lead not found');
  await doc.deleteOne();
  await audit('lead', String(doc._id), 'delete', { ref: doc.ref }, null, actor(req)); // PII not kept in the audit trail
  res.json({ deleted: true });
});

/* ------------------------------------------------------------------ conversations & media */
adminRouter.get('/conversations', async (req, res) => {
  const { page, limit } = pageQ.parse(req.query);
  const f: Record<string, unknown> = {};
  if (typeof req.query.state === 'string' && req.query.state) f.state = req.query.state;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) {
    const serial = q.toUpperCase();
    const viaOcr = await Message.distinct('conversationId', { 'ocr.candidates': serial });
    f.$or = [
      { waId: { $regex: esc(q), $options: 'i' } },
      { confirmedSerial: { $regex: esc(serial) } },
      { candidateSerial: { $regex: esc(serial) } },
      { profileName: { $regex: esc(q), $options: 'i' } },
      ...(viaOcr.length ? [{ _id: { $in: viaOcr } }] : []),
    ];
  }
  const [items, total] = await Promise.all([Conversation.find(f).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Conversation.countDocuments(f)]);
  res.json({ items: items.map((c) => ({ ...snapshot(c), profileName: c.profileName, updatedAt: (c as any).updatedAt, lastInboundAt: c.lastInboundAt })), ...paged(page, limit, total) });
});

adminRouter.get('/conversations/:id', async (req, res) => {
  const conv = await Conversation.findById(param(req, 'id')).lean();
  if (!conv) throw notFound('Conversation not found');
  const [messages, tickets, leads] = await Promise.all([
    Message.find({ conversationId: conv._id }).sort({ createdAt: 1 }).lean(),
    ReviewTicket.find({ conversationId: conv._id }).sort({ createdAt: -1 }).lean(),
    Lead.find({ conversationId: conv._id }).sort({ createdAt: -1 }).lean(),
  ]);
  res.json({
    conversation: { ...snapshot(conv), profileName: conv.profileName, stateHistory: conv.stateHistory, context: conv.context },
    messages: messages.map((m) => ({
      id: String(m._id),
      messageId: m.messageId,
      direction: m.direction,
      sender: m.sender,
      type: m.type,
      text: m.text,
      payload: m.payload,
      interactiveId: m.interactiveId,
      media: m.media ? { mime: m.media.mime, size: m.media.size, sha256: m.media.sha256, expiresAt: m.media.expiresAt, deletedAt: m.media.deletedAt, available: Boolean(m.media.file) } : null,
      ocr: m.ocr ?? null,
      delivery: m.delivery ?? null,
      createdAt: (m as any).createdAt,
    })),
    tickets,
    leads,
  });
});

adminRouter.post('/conversations/:id/reply', async (req, res) => {
  const { text } = z.object({ text: z.string().min(1).max(1000) }).parse(req.body);
  const msg = await sendStaffMessage(param(req, 'id'), text, actor(req));
  if (!msg) throw notFound('Conversation not found');
  res.status(201).json(msg);
});

/** Delete a conversation and everything attached to it (customer deletion request). */
adminRouter.delete('/conversations/:id', adminOnly, async (req, res) => {
  const conv = await Conversation.findById(param(req, 'id'));
  if (!conv) throw notFound('Conversation not found');
  const msgs = await Message.find({ conversationId: conv._id, 'media.file': { $ne: null } });
  for (const m of msgs) await deleteMediaFile(m.media?.file);
  const del = await Message.deleteMany({ conversationId: conv._id });
  await ReviewTicket.updateMany({ conversationId: conv._id }, { $set: { waId: '[deleted]' } });
  await conv.deleteOne();
  await audit('conversation', String(conv._id), 'delete', { waId: '[redacted]', messages: del.deletedCount }, null, actor(req));
  res.json({ deleted: true, messages: del.deletedCount });
});

/** Decrypted plate photo; authenticated users only, every view is recorded. */
adminRouter.get('/messages/:id/media', async (req, res) => {
  const m = await Message.findById(param(req, 'id')).lean();
  if (!m?.media?.file) throw notFound('Image not available (expired or deleted)');
  const buf = await readMedia(m.media.file);
  await audit('media', String(m._id), 'update', null, { viewedBy: actor(req) }, actor(req));
  res.setHeader('Content-Type', m.media.mime ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buf);
});

adminRouter.post('/retention/run', adminOnly, async (_req, res) => {
  res.json({ purged: await purgeExpiredMedia() });
});

/* ------------------------------------------------------------------ audit trail */
adminRouter.get('/audit', async (req, res) => {
  const { page, limit } = pageQ.parse(req.query);
  const f: Record<string, unknown> = {};
  if (typeof req.query.entity === 'string' && req.query.entity) f.entity = req.query.entity;
  if (typeof req.query.entityId === 'string' && req.query.entityId) f.entityId = req.query.entityId;
  const [items, total] = await Promise.all([AuditLog.find(f).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLog.countDocuments(f)]);
  res.json({ items, ...paged(page, limit, total) });
});
