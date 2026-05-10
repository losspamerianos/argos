import { db } from './db';
import { auditEntries } from './db/schema';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'transition'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'session_revoked'
  | 'session_theft_detected';

export type AuditEntry = {
  actorUserId?: string | null;
  organizationId?: string | null;
  operationId?: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const UA_MAX = 512;

/**
 * Audit must never break the user-visible flow; on failure we log and continue.
 * The append-only DB triggers (migration 0002) reject UPDATE/DELETE.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditEntries).values({
      actorUserId: entry.actorUserId ?? null,
      organizationId: entry.organizationId ?? null,
      operationId: entry.operationId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
      requestId: entry.requestId ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ? entry.userAgent.slice(0, UA_MAX) : null
    });
  } catch (err) {
    console.error('audit_failed', {
      err,
      entry: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        requestId: entry.requestId
      }
    });
  }
}
