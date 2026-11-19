import { AuditLog } from '../models/index.js';

const plain = (v: unknown) => (v == null ? null : JSON.parse(JSON.stringify(v)));

/** Append-only change trail for catalogue / ticket / lead edits. */
export async function audit(entity: string, entityId: string, action: 'create' | 'update' | 'delete', before: unknown, after: unknown, actor: string) {
  await AuditLog.create({ entity, entityId, action, before: plain(before), after: plain(after), actor });
}
