import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

const isProduction = process.env.NODE_ENV === "production";

// Vite's local dev server. Never used in production — allowedOrigins below
// only includes these when NODE_ENV !== "production".
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function parseAllowedOrigins(): string[] {
  const fromEnv = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return isProduction ? fromEnv : [...fromEnv, ...DEV_ORIGINS];
}

const allowedOrigins = parseAllowedOrigins();

/**
 * api-server serves the built frontend itself (see app.ts), so the browser
 * app always calls the API same-origin in production — same-origin requests
 * never carry an Origin header the browser expects CORS to police, so this
 * allowlist only ever matters for: local dev (separate Vite port) and any
 * other legitimate cross-origin caller we explicitly add via
 * CORS_ALLOWED_ORIGINS. Everything else is rejected.
 */
export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin "${origin}" is not allowed`));
  },
  credentials: true,
});

export const helmetMiddleware = helmet({
  // api-server also serves the built SPA from this same origin. A strict
  // default CSP needs per-asset hashes/nonces for Vite's hashed bundle and
  // allowances for Clerk's embedded widgets — worth doing properly rather
  // than shipping a CSP that either breaks the app or is too loose to help.
  // Tracked for a follow-up pass; every other helmet protection (HSTS,
  // nosniff, frameguard, referrer-policy, etc.) is on by default here.
  contentSecurityPolicy: false,
});

/** Prefer the authenticated user as the rate-limit key once known — several
 * cashier tablets at the same venue share one public IP (NAT), and keying
 * by IP alone would let one tablet's burst traffic throttle every other
 * tablet at that location. Falls back to IP for anonymous requests, where a
 * per-account key doesn't exist yet. */
function keyByUserThenIp(req: Request): string {
  const auth = (req as Request & { auth?: { userId?: string } }).auth;
  if (auth?.userId) return auth.userId;
  // ipKeyGenerator normalizes IPv6 addresses to a /64 prefix — a raw address
  // would let one client cycle through its subnet to dodge the limit.
  return req.ip ? ipKeyGenerator(req.ip) : "unknown";
}

/** Baseline limiter for all /api traffic. Generous on purpose: this exists to
 * catch runaway clients/bugs and basic abuse, not to throttle normal kassa
 * traffic from 40-45 tablets. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserThenIp,
  message: { error: "Слишком много запросов. Попробуйте через минуту." },
});

/** Strict limiter for privilege-granting writes: minting/deleting user
 * accounts, changing roles, seeding demo data. These are rare, admin-only
 * actions — nobody legitimate needs to hit them dozens of times a minute,
 * and they're the closest thing this API has to an account-takeover
 * surface (there's no local password-login endpoint; Clerk's hosted UI
 * handles that entirely client-side). Keyed by IP: an attacker attempting
 * this doesn't have a legitimate userId yet to key on, and the legitimate
 * callers here are a handful of admins, never a shared venue tablet IP. */
export const sensitiveActionLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток. Попробуйте позже." },
});
