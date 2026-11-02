import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { requireGrantedRole } from "../middleware/rbac";

/**
 * requireGrantedRole() is the router-wide gate in routes/index.ts that keeps
 * freshly signed-up ("pending") accounts out of every route below
 * health/auth/onboarding. The DB lookup is mocked — only the gate's decision
 * is under test here; route-auth-coverage.test.ts covers the no-session 401s.
 */

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@workspace/db", () => ({
  db: { query: { usersTable: { findFirst: (...args: unknown[]) => findFirst(...args) } } },
  usersTable: { clerkUserId: "clerk_user_id" },
}));

function makeApp(clerkUserId?: string): Express {
  const app = express();
  app.use((req, _res, next) => {
    if (clerkUserId) (req as express.Request & { auth?: { userId?: string } }).auth = { userId: clerkUserId };
    next();
  });
  app.use(requireGrantedRole());
  app.get("/items", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

beforeEach(() => {
  findFirst.mockReset();
});

describe("requireGrantedRole", () => {
  it("lets requests without a session through, so the route's own requireAuth() answers", async () => {
    const res = await request(makeApp()).get("/items");
    expect(res.status).toBe(200);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("blocks a pending account with 403", async () => {
    findFirst.mockResolvedValue({ clerkUserId: "user_new", role: "pending" });
    const res = await request(makeApp("user_new")).get("/items");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Доступ ещё не выдан — обратитесь к администратору");
  });

  it("blocks an unknown role with 403", async () => {
    findFirst.mockResolvedValue({ clerkUserId: "user_x", role: "toString" });
    const res = await request(makeApp("user_x")).get("/items");
    expect(res.status).toBe(403);
  });

  it("blocks a signed-in account that has no users row yet", async () => {
    findFirst.mockResolvedValue(undefined);
    const res = await request(makeApp("user_ghost")).get("/items");
    expect(res.status).toBe(403);
  });

  for (const role of ["super_admin", "warehouse_chief", "manager", "accountant", "warehouse", "location_admin", "cashier"]) {
    it(`lets a granted role through: ${role}`, async () => {
      findFirst.mockResolvedValue({ clerkUserId: "user_ok", role });
      const res = await request(makeApp("user_ok")).get("/items");
      expect(res.status).toBe(200);
    });
  }

  it("opens up as soon as an administrator grants a role", async () => {
    const app = makeApp("user_new");
    findFirst.mockResolvedValueOnce({ clerkUserId: "user_new", role: "pending" });
    expect((await request(app).get("/items")).status).toBe(403);
    findFirst.mockResolvedValueOnce({ clerkUserId: "user_new", role: "warehouse" });
    expect((await request(app).get("/items")).status).toBe(200);
  });
});
