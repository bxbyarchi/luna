import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Set before any test file (and therefore app.ts / lib/db) is imported —
    // a real DB connection is never opened by these tests, but lib/db throws
    // at import time if DATABASE_URL is unset, and Clerk's verifyToken() call
    // needs a (fake, here) CLERK_SECRET_KEY to exist so it can run and fail
    // closed rather than throw.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test_unused",
      // A publishable key is, by design, not a secret (Clerk embeds it in every
      // frontend bundle) — this is the actual publishable key for this app's
      // dev Clerk instance, already public via .replit's git history pre-cleanup.
      // The Clerk SDK validates its *shape* at middleware-init time even when
      // no request ever uses it, so a well-formed value is needed here just to
      // let clerkMiddleware() initialize — these tests never authenticate.
      CLERK_PUBLISHABLE_KEY: "pk_test_ZGlyZWN0LXJpbmd0YWlsLTE0LmNsZXJrLmFjY291bnRzLmRldiQ",
      CLERK_SECRET_KEY: "sk_test_unused_in_these_tests",
    },
  },
});
