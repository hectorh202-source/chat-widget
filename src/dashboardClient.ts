import axios from "axios";
import { env } from "./config/env";

// This service holds no per-business config of its own — it fetches everything
// from the dashboard at runtime and talks back to the dashboard's existing
// webhooks. This module is the entire integration surface.

export interface WidgetBranding {
  agentName: string;
  accentColor: string;
  greeting: string;
}

export interface BusinessWidgetConfig {
  anthropicApiKey: string;
  model: string;
  branding: WidgetBranding;
  systemPromptExtras: string;
  allowedOrigins: string[];
  embedKey: string;
  bookingMode: "lead" | "job";
  timezone: string;
  // Secrets the service uses to authenticate its calls back to the dashboard.
  toolWebhookSecret: string;
  leadIntakeWebhookSecret: string;
}

interface CacheEntry {
  config: BusinessWidgetConfig | null;
  at: number;
}
const cache = new Map<number, CacheEntry>();
const TTL_MS = 60_000;

function normalize(data: unknown): BusinessWidgetConfig | null {
  const d = data as Record<string, unknown>;
  // The dashboard returns { enabled: false } when the widget is off or has no
  // Anthropic key — treat that (and anything missing the key) as "unavailable".
  if (!d || d.enabled !== true || typeof d.anthropicApiKey !== "string" || !d.anthropicApiKey) return null;
  const branding = (d.branding as Record<string, unknown>) ?? {};
  return {
    anthropicApiKey: d.anthropicApiKey,
    model: typeof d.model === "string" ? d.model : "claude-opus-4-8",
    branding: {
      agentName: typeof branding.agentName === "string" ? branding.agentName : "Assistant",
      accentColor: typeof branding.accentColor === "string" ? branding.accentColor : "#2563eb",
      greeting: typeof branding.greeting === "string" ? branding.greeting : "Hi! How can I help?",
    },
    systemPromptExtras: typeof d.systemPromptExtras === "string" ? d.systemPromptExtras : "",
    allowedOrigins: Array.isArray(d.allowedOrigins) ? d.allowedOrigins.filter((o): o is string => typeof o === "string") : [],
    embedKey: typeof d.embedKey === "string" ? d.embedKey : "",
    bookingMode: d.bookingMode === "job" ? "job" : "lead",
    timezone: typeof d.timezone === "string" ? d.timezone : "America/New_York",
    toolWebhookSecret: typeof d.toolWebhookSecret === "string" ? d.toolWebhookSecret : "",
    leadIntakeWebhookSecret: typeof d.leadIntakeWebhookSecret === "string" ? d.leadIntakeWebhookSecret : "",
  };
}

// null = widget unavailable for this business (disabled, unknown, or the
// dashboard couldn't be reached and nothing is cached). Cached briefly so a
// burst of turns doesn't hammer the dashboard; a stale entry is served if the
// dashboard is momentarily unreachable.
export async function getBusinessConfig(businessId: number): Promise<BusinessWidgetConfig | null> {
  const cached = cache.get(businessId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.config;
  try {
    const res = await axios.get(`${env.DASHBOARD_URL}/api/widget-service/businesses/${businessId}/config`, {
      headers: { "X-Widget-Service-Secret": env.WIDGET_SERVICE_SECRET },
      timeout: 10_000,
      validateStatus: () => true,
    });
    const config = res.status === 200 ? normalize(res.data) : null;
    cache.set(businessId, { config, at: Date.now() });
    return config;
  } catch {
    if (cached) return cached.config; // serve stale on a transient dashboard outage
    return null;
  }
}

export interface DashboardToolResult {
  status: number;
  data: unknown;
}

// POST to one of the dashboard's ServiceTitan tool webhooks (lookup-customer,
// check-availability, create-lead, book-job). validateStatus lets us handle
// non-2xx (e.g. book-job's 400 "no slot") without throwing.
export async function callDashboardTool(
  businessId: number,
  toolSecret: string,
  toolPath: string,
  body: Record<string, unknown>,
): Promise<DashboardToolResult> {
  const res = await axios.post(`${env.DASHBOARD_URL}/b/${businessId}/tools/${toolPath}`, body, {
    headers: { "X-Tool-Secret": toolSecret, "content-type": "application/json" },
    timeout: 30_000,
    validateStatus: () => true,
  });
  return { status: res.status, data: res.data };
}

// POST the finished lead + transcript to the dashboard's generic lead-intake
// webhook, which records it in the Leads inbox (source website_chat).
export async function postDashboardLead(
  businessId: number,
  leadSecret: string,
  body: Record<string, unknown>,
): Promise<void> {
  await axios.post(`${env.DASHBOARD_URL}/b/${businessId}/webhooks/leads/inbound`, body, {
    headers: { "X-Lead-Intake-Secret": leadSecret, "content-type": "application/json" },
    timeout: 15_000,
    validateStatus: () => true,
  });
}
