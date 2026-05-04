import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/audit-log", requireAuth(), async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);

  const rows = await db
    .select()
    .from(auditLogTable)
    .orderBy(sql`${auditLogTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(auditLogTable);

  res.json({ rows, total, limit, offset });
});

export default router;
