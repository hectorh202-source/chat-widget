import { Router, type Request, type Response, type NextFunction } from "express";
import { getBusinessConfig } from "../dashboardClient";
import { generateEmbedScript } from "./embed";
import { generateWidgetApp } from "./app";
import { checkEmbedKey, signConversationToken, verifyConversationToken } from "../middleware/verifyWidgetRequest";
import { createChatConversation } from "../db/chatConversations";
import { runChatTurn, ChatConversationNotFoundError } from "../chat/engine";

// Per-IP sliding-window throttles — the load-bearing abuse control for the
// public endpoints (the embed key is public).
const WINDOW_MS = 5 * 60 * 1000;
function makeLimiter(maxPerWindow: number) {
  const hits = new Map<string, number[]>();
  return function limiter(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    hits.set(ip, recent);
    if (recent.length > maxPerWindow) {
      res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
      return;
    }
    next();
  };
}
const limitSession = makeLimiter(20);
const limitMessage = makeLimiter(120);

function parseBusinessId(req: Request): number | null {
  const id = Number(req.params.businessId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function providedKey(req: Request): string | undefined {
  const body = req.body as { key?: unknown } | undefined;
  return (
    req.header("X-Widget-Key") ??
    (typeof req.query.key === "string" ? req.query.key : undefined) ??
    (typeof body?.key === "string" ? body.key : undefined)
  );
}

export const widgetRouter = Router({ mergeParams: true });

// Public loader script. No-op when the widget is unavailable so a stale snippet
// never throws on a visitor's page.
widgetRouter.get("/embed.js", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  const businessId = parseBusinessId(req);
  const config = businessId ? await getBusinessConfig(businessId) : null;
  if (!config) {
    res.send("/* AI chat widget is not enabled for this site. */");
    return;
  }
  res.send(generateEmbedScript(config.branding));
});

// Chat UI shell (loaded inside the embed's iframe). frame-ancestors from the
// business's allowlist is the client-domain gate.
widgetRouter.get("/app", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const businessId = parseBusinessId(req);
  const config = businessId ? await getBusinessConfig(businessId) : null;
  const origins = config ? ["'self'", ...config.allowedOrigins].join(" ") : "'self'";
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      // https: so a business can point the header logo at an image hosted on
      // their own site (see chatWidget.logoUrl) — images only, no scripts.
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      `frame-ancestors ${origins}`,
    ].join("; "),
  );
  res.removeHeader("X-Frame-Options");

  if (!config) {
    res.send(
      "<!doctype html><meta charset=utf-8><body style='font:14px sans-serif;padding:16px;color:#444'>Chat is unavailable right now.</body>",
    );
    return;
  }
  const key = typeof req.query.key === "string" ? req.query.key : "";
  res.send(
    generateWidgetApp({
      apiBase: `/b/${businessId}/widget`,
      embedKey: key,
      branding: config.branding,
      quickPrompts: config.quickPrompts,
      poweredBy: config.poweredBy,
    }),
  );
});

widgetRouter.post("/session", limitSession, async (req: Request, res: Response) => {
  const businessId = parseBusinessId(req);
  const config = businessId ? await getBusinessConfig(businessId) : null;
  if (!businessId || !config) {
    res.status(503).json({ error: "Chat is not available right now." });
    return;
  }
  if (!checkEmbedKey(providedKey(req), config.embedKey)) {
    res.status(401).json({ error: "Invalid widget key" });
    return;
  }
  const conversationId = createChatConversation(businessId);
  const token = signConversationToken(conversationId, config.embedKey);
  res.json({ conversationId, token, greeting: config.branding.greeting, agentName: config.branding.agentName });
});

widgetRouter.post("/message", limitMessage, async (req: Request, res: Response) => {
  const businessId = parseBusinessId(req);
  const config = businessId ? await getBusinessConfig(businessId) : null;
  if (!businessId || !config) {
    res.status(503).json({ error: "Chat is not available right now." });
    return;
  }
  if (!checkEmbedKey(providedKey(req), config.embedKey)) {
    res.status(401).json({ error: "Invalid widget key" });
    return;
  }

  const body = req.body as { conversationId?: unknown; token?: unknown; message?: unknown };
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
  const token = typeof body.token === "string" ? body.token : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!conversationId || !token || !message) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (message.length > 4000) {
    res.status(400).json({ error: "Message too long" });
    return;
  }
  if (verifyConversationToken(token, config.embedKey) !== conversationId) {
    res.status(401).json({ error: "Invalid conversation token" });
    return;
  }

  try {
    const result = await runChatTurn(businessId, conversationId, message, config);
    res.json({ reply: result.reply });
  } catch (err) {
    if (err instanceof ChatConversationNotFoundError) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    console.error("widget message failed:", err instanceof Error ? err.message : err);
    // No em dash: this fallback goes straight to the visitor without passing
    // through engine.humanizeReply(), so it has to be clean at the source.
    res.status(502).json({
      reply: "Sorry, I ran into a problem. Please try again, or leave your name and number and we'll follow up.",
    });
  }
});
