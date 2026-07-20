// Bot commands. /start, /stats and /laatste answer synchronously (fast
// selects); /profiel and /analyse send an ack first and do the real work in
// waitUntil. All user-facing copy is Dutch, short, no emoji (hard rule 6).
import { synthesizeProfile } from "./claude";
import { processEntry } from "./analyze";
import { sendMessage } from "./telegram";
import {
  countAnalyzedEntries,
  getEntry,
  insertProfile,
  listAnalyzedEntries,
  listEntriesForStats,
  listIdeas,
  listRecentEntries,
  listRetryableEntries,
} from "./store";
import type { EntryKind, EntryStatus, IdeaTarget } from "./db";

const START_TEXT = [
  "Tastebank bewaart wat jij deelt en leert je smaak kennen.",
  "",
  "Stuur een screenshot, tekst, voice note, link of korte video.",
  "Reageer op een entry (of stuur binnen 5 minuten een voice/tekst na een",
  "screenshot of video) om er een notitie aan te hangen.",
  "",
  "/stats - aantallen per soort en laag",
  "/laatste - laatste 5 entries",
  "/ideeen - je eigen ideeën (filter: /ideeen linkedin of /ideeen conudge)",
  "/profiel - genereer je taste profile",
  "/analyse - probeer mislukte analyses opnieuw",
].join("\n");

const KIND_NL: Record<EntryKind, string> = {
  screenshot: "screenshot",
  text: "tekst",
  voice: "voice",
  link: "link",
  video: "video",
};

const STATUS_NL: Record<EntryStatus, string> = {
  captured: "wacht op analyse",
  analyzed: "geanalyseerd",
  analysis_failed: "mislukt",
};

// Media pipelines (download + transcription + analysis) are heavy; keep the
// retry batch small enough to finish inside the function budget.
const RETRY_BATCH = 3;

async function statsText(): Promise<string> {
  const rows = await listEntriesForStats();
  const isNote = (r: (typeof rows)[number]): boolean =>
    r.annotation_of !== null && !r.analysis;
  const notes = rows.filter(isNote);
  const main = rows.filter((r) => !isNote(r));
  const byKind = new Map<string, number>();
  const byLayer = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const row of main) {
    byKind.set(KIND_NL[row.kind], (byKind.get(KIND_NL[row.kind]) ?? 0) + 1);
    byStatus.set(
      STATUS_NL[row.status],
      (byStatus.get(STATUS_NL[row.status]) ?? 0) + 1,
    );
    if (row.analysis?.layer) {
      byLayer.set(
        row.analysis.layer,
        (byLayer.get(row.analysis.layer) ?? 0) + 1,
      );
    }
  }
  const byIdea = new Map<string, number>();
  for (const row of main) {
    if (row.analysis?.entry_type === "own_idea") {
      const target = row.analysis.idea_target ?? "other";
      byIdea.set(target, (byIdea.get(target) ?? 0) + 1);
    }
  }
  const fmt = (m: Map<string, number>): string =>
    m.size === 0
      ? "geen"
      : [...m.entries()].map(([k, n]) => `${k} ${n}`).join(", ");
  return [
    `Entries: ${main.length} (plus ${notes.length} notities)`,
    `Per soort: ${fmt(byKind)}`,
    `Per laag: ${fmt(byLayer)}`,
    `Eigen ideeën: ${fmt(byIdea)}`,
    `Status: ${fmt(byStatus)}`,
  ].join("\n");
}

const IDEA_TARGETS: Record<string, IdeaTarget> = {
  linkedin: "linkedin",
  conudge: "conudge",
  other: "other",
  overig: "other",
};

async function ideasText(rawTarget: string | undefined): Promise<string> {
  let target: IdeaTarget | null = null;
  if (rawTarget) {
    const mapped = IDEA_TARGETS[rawTarget.toLowerCase()];
    if (!mapped) {
      return "Onbekend filter. Gebruik /ideeen, /ideeen linkedin, /ideeen conudge of /ideeen overig.";
    }
    target = mapped;
  }
  const ideas = await listIdeas(target, 15);
  if (ideas.length === 0) {
    return target
      ? `Nog geen ideeën met label ${target}.`
      : "Nog geen eigen ideeën vastgelegd. Spreek of typ je ingeving naar de bot, met erbij voor wie het is (LinkedIn of Conudge).";
  }
  return ideas
    .map((e, i) => {
      const label = e.analysis?.idea_target ?? "other";
      const summary = e.analysis?.one_line_summary ?? "(geen samenvatting)";
      return `${i + 1}. [${label}] ${summary}`;
    })
    .join("\n");
}

async function latestText(): Promise<string> {
  const entries = await listRecentEntries(5);
  if (entries.length === 0) {
    return "Nog geen entries.";
  }
  return entries
    .map((e, i) => {
      const summary =
        e.analysis?.one_line_summary ??
        (e.annotation_of
          ? "(notitie bij een andere entry)"
          : e.status === "analysis_failed"
            ? "(analyse mislukt, /analyse om opnieuw te proberen)"
            : "(analyse loopt nog)");
      return `${i + 1}. [${KIND_NL[e.kind]}] ${summary}`;
    })
    .join("\n");
}

async function generateProfile(chatId: number): Promise<void> {
  try {
    const entries = await listAnalyzedEntries();
    if (entries.length === 0) {
      await sendMessage(chatId, "Nog geen geanalyseerde entries");
      return;
    }
    const profileMd = await synthesizeProfile(entries);
    await insertProfile(entries.length, profileMd);
    await sendMessage(chatId, profileMd);
  } catch (err) {
    console.error(
      "[profiel] generation failed:",
      err instanceof Error ? err.message : err,
    );
    await sendMessage(
      chatId,
      "Profiel genereren is mislukt, probeer het later opnieuw.",
    ).catch(() => undefined);
  }
}

async function retryFailed(chatId: number): Promise<void> {
  try {
    const entries = await listRetryableEntries(RETRY_BATCH);
    if (entries.length === 0) {
      await sendMessage(chatId, "Geen entries om opnieuw te analyseren.");
      return;
    }
    for (const entry of entries) {
      await processEntry(entry.id);
    }
    const after = await Promise.all(entries.map((e) => getEntry(e.id)));
    const succeeded = after.filter((e) => e?.status === "analyzed").length;
    const remaining = await listRetryableEntries(1);
    const lines = [
      `Opnieuw geprobeerd: ${entries.length}, gelukt: ${succeeded}, mislukt: ${
        entries.length - succeeded
      }.`,
    ];
    if (remaining.length > 0) {
      lines.push("Er staan er nog meer klaar; stuur /analyse opnieuw.");
    }
    await sendMessage(chatId, lines.join("\n"));
  } catch (err) {
    console.error(
      "[analyse] retry run failed:",
      err instanceof Error ? err.message : err,
    );
    await sendMessage(
      chatId,
      "Opnieuw analyseren is mislukt, probeer het later nog eens.",
    ).catch(() => undefined);
  }
}

export interface CommandResult {
  // Work that must survive the response — the route passes this to waitUntil.
  background: Promise<void> | null;
}

export async function handleCommand(
  command: string,
  chatId: number,
): Promise<CommandResult> {
  const name = command.split(/[\s@]/, 1)[0];
  switch (name) {
    case "/start":
      await sendMessage(chatId, START_TEXT);
      return { background: null };
    case "/stats":
      await sendMessage(chatId, await statsText());
      return { background: null };
    case "/laatste":
      await sendMessage(chatId, await latestText());
      return { background: null };
    case "/ideeen": {
      const arg = command.trim().split(/\s+/)[1];
      await sendMessage(chatId, await ideasText(arg));
      return { background: null };
    }
    case "/profiel": {
      if ((await countAnalyzedEntries()) === 0) {
        // PRD edge case: zero analyzed entries — answer without calling Claude.
        await sendMessage(chatId, "Nog geen geanalyseerde entries");
        return { background: null };
      }
      await sendMessage(chatId, "Profiel wordt gemaakt, moment.");
      return { background: generateProfile(chatId) };
    }
    case "/analyse":
      await sendMessage(chatId, "Opnieuw analyseren gestart.");
      return { background: retryFailed(chatId) };
    default:
      await sendMessage(chatId, "Onbekend commando. Probeer /start.");
      return { background: null };
  }
}
