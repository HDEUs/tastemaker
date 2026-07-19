// Claude analysis + profile synthesis. Model per docs/decisions.md; the
// analysis system prompt lives in docs/prompts/analysis-system-prompt.md and
// is read from disk (next.config.ts traces it into the serverless bundle).
// Prompt changes are code changes (Protocol 8): edit the md file, never here.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import path from "path";
import { env } from "./env";
import type { Analysis, Entry, EntryKind } from "./db";

// Central model source (review checklist 13): a swap is a one-liner here.
export function getModel(): string {
  return "claude-sonnet-4-6";
}

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  return client;
}

let cachedPrompt: string | null = null;

export function analysisSystemPrompt(): string {
  cachedPrompt ??= readFileSync(
    path.join(process.cwd(), "docs/prompts/analysis-system-prompt.md"),
    "utf8",
  );
  return cachedPrompt;
}

// Second line of defense after the prompt contract: never persist model
// output without shape/enum validation ("trust AI output blind" is on the
// anti-pattern list).
export function validateAnalysis(value: unknown): Analysis {
  if (typeof value !== "object" || value === null) {
    throw new Error("analysis is not an object");
  }
  const v = value as Record<string, unknown>;
  const str = (key: string): string => {
    const s = v[key];
    if (typeof s !== "string" || s.trim().length === 0) {
      throw new Error(`analysis.${key} is missing or empty`);
    }
    return s;
  };
  const tags = v.topic_tags;
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.some((t) => typeof t !== "string")
  ) {
    throw new Error("analysis.topic_tags is not a string array");
  }
  const layer = str("layer");
  if (layer !== "form_inspiration" && layer !== "topic_relevant") {
    throw new Error(`analysis.layer has invalid value: ${layer}`);
  }
  return {
    format_type: str("format_type"),
    hook_style: str("hook_style"),
    tone: str("tone"),
    topic_tags: tags as string[],
    why_it_works: str("why_it_works"),
    layer,
    one_line_summary: str("one_line_summary"),
  };
}

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

export interface AnalysisInput {
  kind: EntryKind;
  rawText: string | null;
  transcript: string | null;
  sourceUrl: string | null;
  imageBase64: string | null;
  annotations: string[];
}

// Hard length cap on prompt input (security-stance): a single forwarded
// wall of text or runaway transcript must not blow up token spend.
function cap(text: string, max = 8000): string {
  return text.length > max ? `${text.slice(0, max)}\n[afgekapt]` : text;
}

export async function analyzeEntry(input: AnalysisInput): Promise<Analysis> {
  const parts: string[] = [`Entry kind: ${input.kind}`];
  if (input.sourceUrl) {
    parts.push(`Shared URL (stored, never fetched): ${cap(input.sourceUrl, 500)}`);
  }
  if (input.rawText) {
    parts.push(`User text/caption:\n${cap(input.rawText)}`);
  }
  if (input.transcript) {
    parts.push(`Transcript:\n${cap(input.transcript)}`);
  }
  if (input.annotations.length > 0) {
    parts.push(
      `User annotations on this entry:\n- ${input.annotations
        .map((a) => cap(a, 4000))
        .join("\n- ")}`,
    );
  }
  parts.push(
    "Analyze this entry now. Return ONLY the raw JSON object, " +
      "no markdown fences, no prose.",
  );

  const content: Anthropic.ContentBlockParam[] = [];
  if (input.imageBase64) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: input.imageBase64,
      },
    });
  }
  content.push({ type: "text", text: parts.join("\n\n") });

  const response = await anthropic().messages.create({
    model: getModel(),
    max_tokens: 2048,
    system: analysisSystemPrompt(),
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason !== "end_turn") {
    throw new Error(
      `analysis stopped early: ${response.stop_reason ?? "unknown"}`,
    );
  }
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("analysis returned no text block");
  }
  return validateAnalysis(extractJson(block.text));
}

const PROFILE_SYSTEM =
  "Je bent de synthese-engine van Tastebank, het prive smaakprofiel-systeem " +
  "van een gebruiker (Christiaan, B2B marketing/AI-positionering). Je krijgt " +
  "alle geanalyseerde entries als abstracte principes (nooit bronteksten). " +
  "Schrijf EEN beknopt Nederlands markdown-profiel van zijn contentsmaak: " +
  "welke hooks hem pakken, toon die hem aanspreekt, formats die terugkomen, " +
  "terugkerende themas, en wat opvallend afwezig is (voorzichtig formuleren " +
  "- afwezigheid is een zwak signaal). Gebruik korte kopjes. Alleen " +
  "abstracte principes; citeer of parafraseer nooit bronmateriaal.";

export async function synthesizeProfile(entries: Entry[]): Promise<string> {
  const lines = entries.map((e) =>
    JSON.stringify({ kind: e.kind, analysis: e.analysis }),
  );
  const response = await anthropic().messages.create({
    model: getModel(),
    max_tokens: 4096,
    system: PROFILE_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Hier zijn ${entries.length} geanalyseerde entries, een JSON per ` +
          `regel:\n\n${lines.join("\n")}\n\nSchrijf nu het taste profile.`,
      },
    ],
  });
  if (response.stop_reason !== "end_turn") {
    // Never persist or send a truncated/refused profile.
    throw new Error(
      `profile synthesis stopped early: ${response.stop_reason ?? "unknown"}`,
    );
  }
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("profile synthesis returned no text block");
  }
  const profile = block.text.trim();
  if (profile.length === 0) {
    throw new Error("profile synthesis returned empty text");
  }
  return profile;
}
