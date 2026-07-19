import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "../config/env";

const dbDir = path.dirname(env.DATABASE_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(env.DATABASE_PATH);
db.exec("PRAGMA journal_mode = WAL");

// The service owns only conversation state. Business config + leads live in the
// dashboard. business_id is a plain column (no FK) — it's the dashboard's id,
// carried through for scoping and for the calls back to the dashboard.
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY,
    business_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    visitor_name TEXT,
    visitor_phone TEXT,
    visitor_email TEXT,
    transcript_json TEXT,
    resolved_lead_id INTEGER,
    servicetitan_job_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_chat_conversations_business ON chat_conversations(business_id, updated_at);
`);
