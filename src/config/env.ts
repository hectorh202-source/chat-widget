import "dotenv/config";

// Bootstrap infrastructure config only. Every per-business customer credential
// (Anthropic key, ServiceTitan tool secret, lead-intake secret) lives in the
// dashboard's encrypted store and is fetched at runtime — never here. The two
// values that must be present for this service to reach the dashboard are
// DASHBOARD_URL and WIDGET_SERVICE_SECRET.
export const env = {
  PORT: Number(process.env.PORT ?? 3020),
  DATABASE_PATH: process.env.DATABASE_PATH ?? "./data/widget.db",
  DASHBOARD_URL: (process.env.DASHBOARD_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  WIDGET_SERVICE_SECRET: process.env.WIDGET_SERVICE_SECRET ?? "",
  // Optional; validated to 64 hex chars if present, else undefined so the
  // encryption-key module falls back to a local key file (see encryptionKey.ts).
  ENCRYPTION_KEY:
    process.env.ENCRYPTION_KEY && /^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY)
      ? process.env.ENCRYPTION_KEY
      : undefined,
};

if (!env.WIDGET_SERVICE_SECRET) {
  console.warn("[chat-widget] WIDGET_SERVICE_SECRET is not set — config fetches from the dashboard will fail.");
}
