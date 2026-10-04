import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import routesRouter from "../routes";

/**
 * Walks every route actually registered on routesRouter (the same router
 * app.ts mounts at /api) and asserts it answers 401 without a bearer token.
 *
 * This intentionally does NOT hand-maintain a list of routes — if someone
 * adds a new route tomorrow and forgets requireAuth(), this test catches it
 * automatically instead of silently staying green.
 */

let app: Express;

beforeAll(async () => {
  ({ default: app } = await import("../app"));
});

// Exact method+path pairs that are public by design.
const PUBLIC_ROUTES: Array<{ method: string; path: string }> = [
  { method: "GET", path: "/healthz" },
];

// Path prefixes that are public by design (see storage.ts: public-objects is
// an explicitly unauthenticated bucket, separate from the private one).
const PUBLIC_PREFIXES = ["/storage/public-objects/"];

type RouteEntry = { method: string; path: string };

function collectRoutes(stack: unknown): RouteEntry[] {
  const out: RouteEntry[] = [];
  for (const layer of stack as Array<{
    route?: { path: string; methods: Record<string, boolean> };
    handle?: { stack?: unknown };
  }>) {
    const { route } = layer;
    if (route) {
      const methods = Object.keys(route.methods).filter((m) => route.methods[m]);
      for (const method of methods) out.push({ method: method.toUpperCase(), path: route.path });
    } else if (layer.handle?.stack) {
      out.push(...collectRoutes(layer.handle.stack));
    }
  }
  return out;
}

/** Express 5 route patterns use :name and *name — substitute dummy values so
 * the request actually matches the route instead of 404ing on the literal. */
function fillParams(path: string): string {
  return path.replace(/\*[A-Za-z0-9_]+/g, "placeholder").replace(/:[A-Za-z0-9_]+/g, "1");
}

function isPublic(route: RouteEntry): boolean {
  if (PUBLIC_ROUTES.some((r) => r.method === route.method && r.path === route.path)) return true;
  if (PUBLIC_PREFIXES.some((p) => route.path.startsWith(p))) return true;
  return false;
}

const allRoutes = collectRoutes((routesRouter as unknown as { stack: unknown }).stack);
const protectedRoutes = allRoutes.filter((r) => !isPublic(r));

describe("every API route requires authentication (no bearer token → 401)", () => {
  it("discovered a realistic number of routes — guards against this test silently becoming a no-op", () => {
    expect(allRoutes.length).toBeGreaterThan(50);
    expect(protectedRoutes.length).toBeGreaterThan(50);
  });

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} -> 401`, async () => {
      const url = "/api" + fillParams(path);
      const agent = request(app) as unknown as Record<string, (url: string) => request.Test>;
      const res = await agent[method.toLowerCase()](url).send({});
      expect(
        res.status,
        `expected 401 (unauthenticated), got ${res.status} for ${method} ${url}. ` +
          `Body: ${JSON.stringify(res.body)}. If this route is meant to be public, add it to ` +
          `PUBLIC_ROUTES/PUBLIC_PREFIXES in this test deliberately — don't just delete the case.`,
      ).toBe(401);
    });
  }
});

describe("explicitly public endpoints stay reachable without a token", () => {
  it("GET /api/healthz does not require auth", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).not.toBe(401);
  });

  it("GET /api/storage/public-objects/* does not require auth (404s on a missing file, not 401)", async () => {
    const res = await request(app).get("/api/storage/public-objects/does-not-exist.png");
    expect(res.status).not.toBe(401);
  });
});
