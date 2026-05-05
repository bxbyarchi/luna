import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware, verifyToken } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import { initTelegramBot } from "./lib/telegramBot";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Bearer-token verifier middleware.
 *
 * Root cause of the persistent 401: Clerk's clerkMiddleware() authenticates
 * browsers in dev mode by checking the __clerk_db_jwt cookie, which it sets
 * on the Clerk dev-instance domain (clerk.direct-ringtail-14.clerk.accounts.dev).
 * That domain is unreachable from the Replit server due to a TLS handshake
 * failure — so token verification via JWKS always fails, returning:
 *   x-clerk-auth-reason: dev-browser-missing
 *
 * Fix: before clerkMiddleware() runs, intercept requests that carry an
 * Authorization: Bearer header, verify the JWT offline using CLERK_JWT_KEY
 * (the RSA public key fetched from api.clerk.com/v1/jwks), and attach a
 * compatible req.auth object. This path never calls the failing JWKS URL.
 */
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next();

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
      jwtKey: process.env.CLERK_JWT_KEY ?? undefined,
    });
    // Attach auth object compatible with req.auth?.userId pattern used in routes
    (req as Request & { auth: Record<string, unknown> }).auth = {
      userId: payload.sub,
      sessionId: (payload as Record<string, unknown>).sid,
      sessionClaims: payload,
    };
    return next();
  } catch {
    // Invalid/expired token — fall through; requireAuth() will return 401
  }
  next();
});

// Only run clerkMiddleware when our Bearer verifier didn't already set req.auth.
// If we run clerkMiddleware unconditionally, it will overwrite the auth object
// we just set above (it always calls authenticateRequest() regardless).
const _clerkMw = clerkMiddleware();
app.use((req: Request, res: Response, next: NextFunction) => {
  if ((req as Request & { auth?: { userId?: string } }).auth?.userId) {
    return next();
  }
  _clerkMw(req, res, next);
});

app.use("/api", router);

const telegramWebhook = initTelegramBot();
if (telegramWebhook) {
  app.use("/api", telegramWebhook);
}

export default app;
