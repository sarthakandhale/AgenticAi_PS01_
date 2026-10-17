import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __configDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__configDir, ".env") });
dotenv.config();

const requiredWhenSet = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const maxFollowupsPerDay = Number(process.env.MAX_FOLLOWUPS_PER_DAY || 5);
const telegramMode = process.env.TELEGRAM_MODE || "polling";
if (requiredWhenSet.some((key) => process.env[key]) &&
    requiredWhenSet.some((key) => !process.env[key])) {
  throw new Error("Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or leave both empty.");
}
if (!["polling", "webhook"].includes(telegramMode)) {
  throw new Error("TELEGRAM_MODE must be either polling or webhook.");
}
if (!Number.isSafeInteger(maxFollowupsPerDay) || maxFollowupsPerDay < 1) {
  throw new Error("MAX_FOLLOWUPS_PER_DAY must be a positive integer.");
}

export const config = {
  port: Number(process.env.PORT || 3001),
  frontendOrigins: (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  coordinatorApiKey: process.env.COORDINATOR_API_KEY || "",
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramMode,
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
  telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL ||
    (process.env.RENDER_EXTERNAL_URL
      ? `${process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "")}/api/telegram/webhook`
      : ""),
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  maxFollowupsPerDay,
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    
  n8nAnalyzeUrl: process.env.N8N_ANALYZE_URL || "",
  n8nLatestUrl: process.env.N8N_LATEST_URL || "",
  n8nWebhookKey: process.env.N8N_WEBHOOK_KEY || "",

};

export function requireConfigured(value, name) {
  if (!value) {
    throw new Error(`${name} is not configured. Set ${name} in backend/.env.`);
  }
}
