// Lazy typed access to required env vars. Deliberately no module-level
// validation: contract tests import route/lib modules without a full
// environment, and Vercel only needs the vars at request time.
export type EnvKey =
  | "TELEGRAM_BOT_TOKEN"
  | "TELEGRAM_SECRET_TOKEN"
  | "ALLOWED_CHAT_ID"
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "ANTHROPIC_API_KEY"
  | "GEMINI_API_KEY";

export function env(key: EnvKey): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
