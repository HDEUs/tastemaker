// Registers the Telegram webhook for a deployed Tastebank instance.
// Usage:  node scripts/set-webhook.mjs https://MYAPP.vercel.app
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_SECRET_TOKEN from the environment
// (or from .env.local when run in the project root).
import { readFileSync, existsSync } from "node:fs";

function loadDotEnvLocal() {
  if (!existsSync(".env.local")) {
    return;
  }
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

loadDotEnvLocal();

const base = process.argv[2];
if (!base || !/^https:\/\//.test(base)) {
  console.error("Gebruik: node scripts/set-webhook.mjs https://MYAPP.vercel.app");
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_SECRET_TOKEN;
if (!token || !secret) {
  console.error(
    "TELEGRAM_BOT_TOKEN en TELEGRAM_SECRET_TOKEN moeten gezet zijn " +
      "(env of .env.local).",
  );
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/telegram`;
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  }),
});
const json = await res.json();
if (!json.ok) {
  console.error("setWebhook mislukt:", JSON.stringify(json));
  process.exit(1);
}
console.log(`Webhook geregistreerd op ${url}`);
