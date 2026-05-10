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
 * Keys that must never enter the audit log even if a caller passes them in
 * `before`/`after`. We redact instead of dropping so a future review of an
 * audit row can tell that a sensitive field existed without exposing it.
 */
const REDACT_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'token_hash',
  'tokenhash',
  'refresh_token',
  'refreshtoken',
  'access_token',
  'accesstoken',
  'authorization',
  'cookie',
  'set-cookie',
  'jwt',
  'secret',
  'api_key',
  'apikey',
  'private_key',
  'privatekey'
]);

const REDACT_DEPTH = 6;
const REDACTED = '[REDACTED]';

function redactJson(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= REDACT_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    return value.map((v) => redactJson(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = REDACTED;
    } else {
      out[k] = redactJson(v, depth + 1);
    }
  }
  return out;
}

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
      before: entry.before
        ? (redactJson(entry.before) as Record<string, unknown>)
        : null,
      after: entry.after ? (redactJson(entry.after) as Record<string, unknown>) : null,
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
