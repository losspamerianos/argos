import { db } from './db';
import { auditEntries } from './db/schema';

export async function audit(entry: {
  actorUserId?: string | null;
  operationId?: string | null;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'transition' | 'login' | 'logout';
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}): Promise<void> {
  await db.insert(auditEntries).values({
    actorUserId: entry.actorUserId ?? null,
    operationId: entry.operationId ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null
  });
}
