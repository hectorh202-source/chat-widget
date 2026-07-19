import crypto from "node:crypto";

// The public embed key ships in the client-site snippet, so it's not a secret —
// it just rejects stray/unkeyed hits and gives the operator a rotation lever.
// Compared constant-time. The real client-domain gate is the frame-ancestors
// CSP on the app page; real abuse control is the rate limiter.
export function checkEmbedKey(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Per-conversation bearer token issued at /session and required on /message,
// HMAC'd with a per-conversation secret. Since this service has no per-business
// secret of its own, the HMAC key is derived from the business's embed key +
// conversation id — good enough to bind a message stream to a conversation this
// service created (the conversation id itself is the unguessable part).
// Format: "<conversationId>.<hex-hmac>".
export function signConversationToken(conversationId: string, secret: string): string {
  const mac = crypto.createHmac("sha256", secret).update(conversationId).digest("hex");
  return `${conversationId}.${mac}`;
}

export function verifyConversationToken(token: string, secret: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const conversationId = token.slice(0, idx);
  const expected = signConversationToken(conversationId, secret);
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) return null;
  return conversationId;
}
