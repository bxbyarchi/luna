import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
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
 * Verify Clerk bearer tokens locally when a valid JWT key is configured,
 * avoiding an extra JWKS request for API calls from the browser.
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
    (req as Request & { auth: Record<string, unknown> }).auth = {
      userId: payload.sub,
      sessionId: (payload as Record<string, unknown>).sid as string | undefined,
      sessionClaims: payload,
    };
    return next();
  } catch {
    // Invalid/expired token — fall through; requireAuth() will return 401.
  }
  next();
});

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

// The Vite build is emitted to artifacts/m-sklad/dist/public. The API build
// runs from artifacts/api-server/dist, so resolve the sibling artifact path
// from the compiled server directory at runtime.
const frontendDist = path.resolve(import.meta.dirname, "../../m-sklad/dist/public");
app.use(express.static(frontendDist));

// SPA fallback: let React Router handle client-side routes, while preserving
// API and Clerk proxy paths for their own middleware.
app.get("/{*splat}", (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api") || req.path.startsWith(CLERK_PROXY_PATH)) {
    return next();
  }
  res.sendFile(path.join(frontendDist, "index.html"));
});

export default app;
