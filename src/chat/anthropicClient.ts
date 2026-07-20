import axios from "axios";

// Plain axios against the Messages API (no SDK), same as the dashboard.
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicResponse {
  id: string;
  model: string;
  stop_reason: string | null;
  content: AnthropicContentBlock[];
}

export interface CreateMessageOptions {
  apiKey: string;
  model: string;
  system: string;
  messages: AnthropicMessage[];
  tools: AnthropicToolDefinition[];
  maxTokens?: number;
}

// Adaptive thinking and output_config.effort are Claude 4.6-and-later
// features. Older models (Haiku 4.5) reject both with a 400, so the request
// body has to be built per model rather than assumed — sending the Opus shape
// to every model is what made every non-Opus selection error out.
function supportsAdaptiveThinking(model: string): boolean {
  return !model.startsWith("claude-haiku-4-5");
}

export async function createMessage(opts: CreateMessageOptions): Promise<AnthropicResponse> {
  const response = await axios.post<AnthropicResponse>(
    ANTHROPIC_MESSAGES_URL,
    {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      messages: opts.messages,
      tools: opts.tools,
      // Adaptive thinking + low effort keeps a website-chat turn snappy and
      // cheap; thinking is internal (never shown), echoed back via the
      // persisted transcript. On models without it, plain no-thinking is the
      // right fallback anyway — those are the "fastest / cheapest" tier.
      ...(supportsAdaptiveThinking(opts.model)
        ? { thinking: { type: "adaptive" }, output_config: { effort: "low" } }
        : {}),
    },
    {
      headers: {
        "x-api-key": opts.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      timeout: 60_000,
    },
  );
  return response.data;
}

export function describeAnthropicError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: { message?: string } } | undefined;
    return data?.error?.message ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
