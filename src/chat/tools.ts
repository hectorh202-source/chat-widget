import { callDashboardTool, type BusinessWidgetConfig } from "../dashboardClient";
import type { AnthropicToolDefinition } from "./anthropicClient";

// ---------------------------------------------------------------------------
// Tool schemas exposed to Claude. Identical to the dashboard's, but here the
// executor POSTs to the dashboard's ServiceTitan tool webhooks over HTTP
// instead of calling the functions in-process.
// ---------------------------------------------------------------------------

const lookupCustomerTool: AnthropicToolDefinition = {
  name: "lookup_customer",
  description:
    "Look up an existing customer by phone number in ServiceTitan. Call this as soon as the visitor gives a phone number, to greet returning customers by name and pre-fill their address/history. Returns whether they were found plus name/address/email/equipment age when available.",
  input_schema: {
    type: "object",
    properties: { phone: { type: "string", description: "The visitor's phone number, any format." } },
    required: ["phone"],
  },
};

const checkAvailabilityTool: AnthropicToolDefinition = {
  name: "check_availability",
  description:
    "Check appointment availability for a date range before offering the visitor specific times. Call this once you know roughly when they'd like service and (if relevant) which service category. Returns bookable time slots to offer — never invent times; only offer slots this returns.",
  input_schema: {
    type: "object",
    properties: {
      startDate: { type: "string", description: "Start of the window, ISO 8601 (e.g. 2026-07-21T00:00:00Z)." },
      endDate: { type: "string", description: "End of the window, ISO 8601. Max 14 days after start." },
      serviceCategory: { type: "string", description: "Optional service category name (e.g. 'Plumbing', 'HVAC')." },
    },
    required: ["startDate", "endDate"],
  },
};

const leadFieldProperties = {
  phone: { type: "string", description: "Visitor's phone number." },
  name: { type: "string", description: "Visitor's full name." },
  street: { type: "string", description: "Service address street." },
  city: { type: "string", description: "Service address city." },
  state: { type: "string", description: "Service address state." },
  zip: { type: "string", description: "Service address ZIP." },
  issueDescription: { type: "string", description: "What the visitor needs done, in their words." },
  preferredTiming: { type: "string", description: "Optional: when they'd like service." },
  equipmentAge: { type: "string", description: "Optional: age of the relevant equipment, if asked/known." },
  isEmergency: { type: "boolean", description: "True if the visitor indicated this is an emergency." },
  serviceCategory: { type: "string", description: "Optional service category name if the business uses them." },
} as const;

const leadRequired = ["phone", "name", "street", "city", "state", "zip", "issueDescription"];

const createLeadTool: AnthropicToolDefinition = {
  name: "create_lead",
  description:
    "Forward the visitor as a lead for staff to follow up and schedule. Call this once you have their name, phone, service address, and a description of what they need — and either the business doesn't book directly, or you don't have a specific confirmed appointment slot. Always prefer this over losing the visitor's info.",
  input_schema: { type: "object", properties: { ...leadFieldProperties }, required: leadRequired },
};

const bookJobTool: AnthropicToolDefinition = {
  name: "book_job",
  description:
    "Book a real appointment in ServiceTitan. Call this ONLY when the visitor has explicitly confirmed one specific time slot that check_availability returned, and you have their name, phone, and service address. Pass selectedStart/selectedEnd copied exactly from the chosen slot. For emergencies this is automatically routed to a lead instead.",
  input_schema: {
    type: "object",
    properties: {
      ...leadFieldProperties,
      selectedStart: { type: "string", description: "Chosen slot start, copied exactly from check_availability." },
      selectedEnd: { type: "string", description: "Chosen slot end, copied exactly from check_availability." },
    },
    required: [...leadRequired, "selectedStart", "selectedEnd"],
  },
};

export function chatToolDefinitions(bookingMode: "lead" | "job"): AnthropicToolDefinition[] {
  const tools = [lookupCustomerTool, checkAvailabilityTool, createLeadTool];
  if (bookingMode === "job") tools.push(bookJobTool);
  return tools;
}

// ---------------------------------------------------------------------------
// Execution (over HTTP to the dashboard)
// ---------------------------------------------------------------------------

export interface ResolutionLead {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  message?: string;
}

export interface ChatResolution {
  kind: "lead" | "job";
  success: boolean;
  servicetitanJobId: string | null;
  servicetitanLeadId: string | null;
  lead: ResolutionLead;
}

export interface ChatToolResult {
  content: string;
  capturedVisitor?: { name?: string; phone?: string; email?: string };
  resolution?: ChatResolution;
}

function str(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function buildAddress(input: Record<string, unknown>): string | undefined {
  const parts = [str(input, "street"), str(input, "city"), str(input, "state"), str(input, "zip")].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

function buildLeadFromInput(input: Record<string, unknown>): ResolutionLead {
  const issue = str(input, "issueDescription");
  const timing = str(input, "preferredTiming");
  const message = [issue, timing ? `Preferred timing: ${timing}` : undefined].filter(Boolean).join("\n\n") || undefined;
  return { name: str(input, "name"), phone: str(input, "phone"), address: buildAddress(input), message };
}

// The lead/job webhook body. conversationId is deliberately NOT sent — the
// dashboard would build a ServiceTitan "Call Details" link from it that points
// at a phone-call page this chat has no row in.
function leadBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    phone: str(input, "phone"),
    name: str(input, "name"),
    street: str(input, "street"),
    city: str(input, "city"),
    state: str(input, "state"),
    zip: str(input, "zip"),
    issueDescription: str(input, "issueDescription"),
    preferredTiming: str(input, "preferredTiming"),
    equipmentAge: str(input, "equipmentAge"),
    isEmergency: input.isEmergency === true || input.isEmergency === "true",
    serviceCategory: str(input, "serviceCategory"),
  };
}

export async function executeChatTool(
  businessId: number,
  name: string,
  input: Record<string, unknown>,
  config: BusinessWidgetConfig,
): Promise<ChatToolResult> {
  const secret = config.toolWebhookSecret;

  switch (name) {
    case "lookup_customer": {
      const phone = str(input, "phone") ?? "";
      try {
        const { status, data } = await callDashboardTool(businessId, secret, "lookup-customer", { phone });
        const d = (status === 200 ? data : { found: false }) as { name?: string | null; email?: string | null };
        return {
          content: JSON.stringify(status === 200 ? data : { found: false }),
          capturedVisitor: { phone, name: d.name ?? undefined, email: d.email ?? undefined },
        };
      } catch {
        return { content: JSON.stringify({ found: false }), capturedVisitor: { phone } };
      }
    }

    case "check_availability": {
      try {
        const { status, data } = await callDashboardTool(businessId, secret, "check-availability", {
          startDate: str(input, "startDate"),
          endDate: str(input, "endDate"),
          serviceCategory: str(input, "serviceCategory"),
        });
        if (status === 200) return { content: JSON.stringify(data) };
        return {
          content: JSON.stringify({
            slots: [],
            note: "Availability couldn't be checked right now; offer to have a team member follow up to schedule.",
          }),
        };
      } catch {
        return { content: JSON.stringify({ slots: [], note: "A team member will confirm exact timing." }) };
      }
    }

    case "create_lead": {
      const lead = buildLeadFromInput(input);
      try {
        const { status, data } = await callDashboardTool(businessId, secret, "create-lead", leadBody(input));
        const d = (data ?? {}) as { success?: boolean; leadId?: string | null; confirmationMessage?: string };
        const succeeded = status === 200 && d.success === true;
        return {
          content: JSON.stringify({
            success: succeeded,
            confirmationMessage:
              d.confirmationMessage ??
              (succeeded
                ? "A team member will confirm your appointment shortly."
                : "Thanks, a team member will follow up with you directly."),
          }),
          capturedVisitor: { name: lead.name, phone: lead.phone },
          resolution: {
            kind: "lead",
            success: succeeded,
            servicetitanJobId: null,
            servicetitanLeadId: d.leadId ?? null,
            lead,
          },
        };
      } catch {
        return {
          content: JSON.stringify({
            success: false,
            confirmationMessage: "Thanks, a team member will follow up with you directly.",
          }),
          capturedVisitor: { name: lead.name, phone: lead.phone },
          resolution: { kind: "lead", success: false, servicetitanJobId: null, servicetitanLeadId: null, lead },
        };
      }
    }

    case "book_job": {
      const lead = buildLeadFromInput(input);
      try {
        const { status, data } = await callDashboardTool(businessId, secret, "book-job", {
          ...leadBody(input),
          selectedStart: str(input, "selectedStart"),
          selectedEnd: str(input, "selectedEnd"),
        });
        const d = (data ?? {}) as { success?: boolean; jobId?: string | null; leadId?: string | null; confirmationMessage?: string };

        // 400 = "no slot selected" — not terminal; let the model recover
        // (re-check availability or fall back to create_lead).
        if (status === 400) {
          return {
            content: JSON.stringify({
              success: false,
              needsDifferentTime: true,
              confirmationMessage: d.confirmationMessage ?? "That time isn't available, let's pick another.",
            }),
            capturedVisitor: { name: lead.name, phone: lead.phone },
          };
        }

        const booked = !!d.jobId;
        return {
          content: JSON.stringify({
            success: status === 200 && d.success === true,
            jobId: d.jobId ?? null,
            confirmationMessage:
              d.confirmationMessage ??
              (booked ? "You're all set — we've booked your appointment." : "A team member will follow up to schedule."),
          }),
          capturedVisitor: { name: lead.name, phone: lead.phone },
          resolution: {
            kind: booked ? "job" : "lead",
            success: status === 200 && d.success === true,
            servicetitanJobId: d.jobId ?? null,
            servicetitanLeadId: d.leadId ?? null,
            lead,
          },
        };
      } catch {
        return {
          content: JSON.stringify({
            success: false,
            confirmationMessage: "Thanks, a team member will follow up with you directly to schedule.",
          }),
          capturedVisitor: { name: lead.name, phone: lead.phone },
          resolution: { kind: "lead", success: false, servicetitanJobId: null, servicetitanLeadId: null, lead },
        };
      }
    }

    default:
      return { content: JSON.stringify({ error: `Unknown tool: ${name}` }) };
  }
}
