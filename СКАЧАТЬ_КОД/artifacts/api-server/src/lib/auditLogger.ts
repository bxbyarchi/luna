import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";

interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: number;
  clerkUserId?: string;
  details?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogTable).values({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      clerkUserId: entry.clerkUserId ?? null,
      details: entry.details ?? null,
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
