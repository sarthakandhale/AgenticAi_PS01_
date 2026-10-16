import "dotenv/config";

const requiredWhenSet = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const maxFollowupsPerDay = Number(process.env.MAX_FOLLOWUPS_PER_DAY || 5);
if (requiredWhenSet.some((key) => process.env[key]) &&
    requiredWhenSet.some((key) => !process.env[key])) {
  throw new Error("Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or leave both empty.");
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
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  maxFollowupsPerDay,
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
};

export function requireConfigured(value, name) {
  if (!value) {
    throw new Error(`${name} is not configured. Set ${name} in backend/.env.`);
  }
}
