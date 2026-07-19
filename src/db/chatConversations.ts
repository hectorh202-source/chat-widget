import crypto from "node:crypto";
import { db } from "./index";
import { encryptField, decryptNullable } from "../lib/encryption";

// The persisted Anthropic messages array is stored opaquely (the engine owns
// its exact shape — text/tool_use/tool_result/thinking blocks). Kept as
// `unknown[]` here so this DB module never has to track Anthropic's content
// block union; chat/engine.ts casts it to the message type it builds from.
export type ChatTranscript = unknown[];

export type ChatConversationStatus = "active" | "booked" | "lead" | "abandoned";

export interface ChatConversationRecord {
  id: string;
  business_id: number;
  status: string;
  visitor_name: string | null;
  visitor_phone: string | null;
  visitor_email: string | null;
  transcript: ChatTranscript;
  resolved_lead_id: number | null;
  servicetitan_job_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatConversationRow {
  id: string;
  business_id: number;
  status: string;
  visitor_name: string | null;
  visitor_phone: string | null;
  visitor_email: string | null;
  transcript_json: string | null;
  resolved_lead_id: number | null;
  servicetitan_job_id: string | null;
  created_at: string;
  updated_at: string;
}

function decryptRow(row: ChatConversationRow): ChatConversationRecord {
  const transcriptRaw = decryptNullable(row.transcript_json);
  let transcript: ChatTranscript = [];
  if (transcriptRaw) {
    try {
      transcript = JSON.parse(transcriptRaw) as ChatTranscript;
    } catch {
      transcript = [];
    }
  }
  return {
    id: row.id,
    business_id: row.business_id,
    status: row.status,
    visitor_name: decryptNullable(row.visitor_name),
    visitor_phone: decryptNullable(row.visitor_phone),
    visitor_email: decryptNullable(row.visitor_email),
    transcript,
    resolved_lead_id: row.resolved_lead_id,
    servicetitan_job_id: row.servicetitan_job_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const insertStmt = db.prepare(
  `INSERT INTO chat_conversations (id, business_id, transcript_json) VALUES (@id, @businessId, @transcriptJson)`,
);

// Random opaque id, not an autoincrement int — it's handed to the browser and
// signed into the per-conversation token, so it must not be enumerable.
export function createChatConversation(businessId: number): string {
  const id = crypto.randomBytes(18).toString("base64url");
  insertStmt.run({ id, businessId, transcriptJson: encryptField(JSON.stringify([])) });
  return id;
}

const getStmt = db.prepare(`SELECT * FROM chat_conversations WHERE id = ? AND business_id = ?`);

export function getChatConversation(businessId: number, id: string): ChatConversationRecord | undefined {
  const row = getStmt.get(id, businessId) as ChatConversationRow | undefined;
  return row ? decryptRow(row) : undefined;
}

export interface ChatVisitorPatch {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

const updateTranscriptStmt = db.prepare(`
  UPDATE chat_conversations SET
    transcript_json = @transcriptJson,
    visitor_name = COALESCE(@visitorName, visitor_name),
    visitor_phone = COALESCE(@visitorPhone, visitor_phone),
    visitor_email = COALESCE(@visitorEmail, visitor_email),
    updated_at = datetime('now')
  WHERE id = @id AND business_id = @businessId
`);

export function updateChatTranscript(
  businessId: number,
  id: string,
  transcript: ChatTranscript,
  visitor: ChatVisitorPatch = {},
): void {
  updateTranscriptStmt.run({
    id,
    businessId,
    transcriptJson: encryptField(JSON.stringify(transcript)),
    visitorName: visitor.name != null ? encryptField(visitor.name) : null,
    visitorPhone: visitor.phone != null ? encryptField(visitor.phone) : null,
    visitorEmail: visitor.email != null ? encryptField(visitor.email) : null,
  });
}

const resolveStmt = db.prepare(`
  UPDATE chat_conversations SET
    status = @status,
    resolved_lead_id = COALESCE(@resolvedLeadId, resolved_lead_id),
    servicetitan_job_id = COALESCE(@servicetitanJobId, servicetitan_job_id),
    updated_at = datetime('now')
  WHERE id = @id AND business_id = @businessId
`);

export function resolveChatConversation(
  businessId: number,
  id: string,
  status: ChatConversationStatus,
  refs: { leadId?: number | null; servicetitanJobId?: string | null } = {},
): void {
  resolveStmt.run({
    id,
    businessId,
    status,
    resolvedLeadId: refs.leadId ?? null,
    servicetitanJobId: refs.servicetitanJobId ?? null,
  });
}
