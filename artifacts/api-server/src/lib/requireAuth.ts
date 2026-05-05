import type { Request, Response, NextFunction } from "express";

/**
 * Custom requireAuth middleware that always returns 401 JSON for unauthenticated
 * requests. Unlike @clerk/express requireAuth(), this never issues a 302 redirect,
 * which is correct behavior for API endpoints consumed by a SPA.
 *
 * Works in conjunction with the Bearer-token verifier in app.ts that sets
 * req.auth.userId when a valid Clerk session JWT is present.
 */
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!(req as Request & { auth?: { userId?: string | null } }).auth?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}
