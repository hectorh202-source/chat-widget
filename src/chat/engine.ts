import {
  createMessage,
  describeAnthropicError,
  type AnthropicMessage,
  type AnthropicContentBlock,
} from "./anthropicClient";
import { chatToolDefinitions, executeChatTool, type ChatResolution } from "./tools";
import { buildChatSystemPrompt } from "./prompt";
import { getChatConversation, updateChatTranscript, resolveChatConversation } from "../db/chatConversations";
import { postDashboardLead, type BusinessWidgetConfig } from "../dashboardClient";

const MAX_TOOL_ITERATIONS = 8;

export class ChatConversationNotFoundError extends Error {}

export interface ChatTurnResult {
  reply: string;
}

// One visitor turn: loads the persisted conversation, runs the Claude tool-use
// loop (tools call the dashboard over HTTP), persists the transcript, and on
// the first lead/booking outcome POSTs the lead + transcript to the dashboard's
// Leads inbox. `config` is passed in (the router already fetched it).
export async function runChatTurn(
  businessId: number,
  conversationId: string,
  userText: string,
  config: BusinessWidgetConfig,
): Promise<ChatTurnResult> {
  const conversation = getChatConversation(businessId, conversationId);
  if (!conversation) throw new ChatConversationNotFoundError("Conversation not found");

  const system = buildChatSystemPrompt(config.branding, config.bookingMode, config.systemPromptExtras, config.timezone);
  const tools = chatToolDefinitions(config.bookingMode);

  const messages = conversation.transcript as AnthropicMessage[];
  messages.push({ role: "user", content: userText });

  const capturedVisitor: { name?: string; phone?: string; email?: string } = {};
  let resolution: ChatResolution | undefined;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    let response;
    try {
      response = await createMessage({ apiKey: config.anthropicApiKey, model: config.model, system, messages, tools });
    } catch (error) {
      throw new Error(describeAnthropicError(error));
    }

    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "tool_use") break;

    const toolResults: AnthropicContentBlock[] = [];
    for (const call of response.content) {
      if (call.type !== "tool_use") continue;
      const result = await executeChatTool(businessId, call.name ?? "", call.input ?? {}, config);
      toolResults.push({ type: "tool_result", tool_use_id: call.id, content: result.content });
      if (result.capturedVisitor) {
        capturedVisitor.name ??= result.capturedVisitor.name;
        capturedVisitor.phone ??= result.capturedVisitor.phone;
        capturedVisitor.email ??= result.capturedVisitor.email;
      }
      if (result.resolution && !resolution) resolution = result.resolution;
    }
    messages.push({ role: "user", content: toolResults });
  }

  const reply = extractText([...messages].reverse().find((m) => m.role === "assistant"));

  updateChatTranscript(businessId, conversationId, messages, capturedVisitor);

  if (resolution && conversation.status === "active") {
    await writeInboxLead(businessId, conversationId, messages, resolution, capturedVisitor, config);
  }

  return { reply };
}

function extractText(message: AnthropicMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content.trim();
  return message.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
}

function renderTranscript(messages: AnthropicMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const speaker = m.role === "user" ? "Visitor" : "Assistant";
    if (typeof m.content === "string") {
      if (m.content.trim()) lines.push(`${speaker}: ${m.content.trim()}`);
      continue;
    }
    const text = m.content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join(" ")
      .trim();
    if (text) lines.push(`${speaker}: ${text}`);
  }
  return lines.join("\n");
}

async function writeInboxLead(
  businessId: number,
  conversationId: string,
  messages: AnthropicMessage[],
  resolution: ChatResolution,
  capturedVisitor: { name?: string; phone?: string; email?: string },
  config: BusinessWidgetConfig,
): Promise<void> {
  const booked = resolution.kind === "job" && resolution.success;
  const transcript = renderTranscript(messages);
  const lead = resolution.lead;
  const message = [lead.message, "--- Chat transcript ---\n" + transcript].filter(Boolean).join("\n\n");

  await postDashboardLead(businessId, config.leadIntakeWebhookSecret, {
    source: "website_chat",
    sourceDetail: booked ? "booked" : "lead",
    // externalId = conversationId makes a re-post idempotent (the dashboard
    // dedups on business+source+external_id) rather than creating duplicates.
    externalId: conversationId,
    name: lead.name ?? capturedVisitor.name,
    phone: lead.phone ?? capturedVisitor.phone,
    email: lead.email ?? capturedVisitor.email,
    address: lead.address,
    message,
  });

  resolveChatConversation(businessId, conversationId, booked ? "booked" : "lead", {
    servicetitanJobId: resolution.servicetitanJobId,
  });
}
