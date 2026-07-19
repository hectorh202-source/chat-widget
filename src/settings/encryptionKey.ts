import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env";

const keyPath = path.join(path.dirname(env.DATABASE_PATH), ".encryption.key");

// Master key protecting stored chat conversations at rest. Preferred source:
// ENCRYPTION_KEY from the environment. Falls back to a local key file
// co-located with the DB (with a loud warning) so the service still runs
// unconfigured — a fresh key file only matters here for conversation history,
// not shared credentials (those live in the dashboard).
function loadOrCreateKey(): Buffer {
  if (env.ENCRYPTION_KEY) {
    return Buffer.from(env.ENCRYPTION_KEY, "hex");
  }

  console.warn(
    "\n[SECURITY WARNING] No ENCRYPTION_KEY set. Falling back to the encryption key file at " +
      `${keyPath}, stored alongside the database — a backup of that directory exposes both the ` +
      "encrypted conversations and the key. Set ENCRYPTION_KEY in the environment for production.\n",
  );

  const dir = path.dirname(keyPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

export const encryptionKey = loadOrCreateKey();
