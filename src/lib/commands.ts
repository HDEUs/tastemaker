// Bot commands. /start, /stats en /laatste antwoorden synchroon (snelle
// selects); /profiel en /analyse sturen eerst een ack en doen het echte werk
// in waitUntil. Alle teksten Nederlands, kort, geen emoji (hard rule 6).
import { synthesizeProfile } from "./claude";
import { processEntry } from "./analyze";
import { sendMessage } from "./telegram";
import {
  insertProfile,
  listAnalyzedEntries,
  listEntriesForStats,
  listRecentEntries,
  listRetryableEntries,
} from "./store";

const START_TEXT = [
  "Tastebank bewaart wat jij deelt en leert je smaak kennen.",
  "",
  "Stuur een screenshot, tekst, voice note, link of korte video.",
  "Reageer op een entry (of stuur binnen 5 minuten een voice/tekst na een",
  "screenshot of video) om er een notitie aan te hangen.",
  "",
  "/stats - aantallen per soort en laag",
  "/laatste - laatste 5 entries",
  "/profiel - genereer je taste profile",
  "/analyse - probeer mislukte analyses opnieuw",
].join("\n");

async function statsText(): Promise<string> {
  const rows = await listEntriesForStats();
  const byKind = new Map<string, number>();
  const byLayer = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const row of rows) {
    byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1);
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    if (row.analysis?.layer) {
      byLayer.set(row.analysis.layer, (byLayer.get(row.analysis.layer) ?? 0) + 1);
    }
  }
  const fmt = (m: Map<string, number>): string =>
    m.size === 0
      ? "geen"
      : [...m.entries()].map(([k, n]) => `${k} ${n}`).join(", ");
  return [
    `Entries: ${rows.length}`,
    `Per soort: ${fmt(byKind)}`,
    `Per laag: ${fmt(byLayer)}`,
    `Status: ${fmt(byStatus)}`,
  ].join("\n");
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
      return `${i + 1}. [${e.kind}] ${summary}`;
    })
    .join("\n");
}

async function generateProfile(chatId: number): Promise<void> {
  try {
    const entries = await listAnalyzedEntries();
    const withAnalysis = entries.filter((e) => e.analysis !== null);
    if (withAnalysis.length === 0) {
      await sendMessage(chatId, "Nog geen geanalyseerde entries");
      return;
    }
    const profileMd = await synthesizeProfile(withAnalysis);
    await insertProfile(withAnalysis.length, profileMd);
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
    const entries = await listRetryableEntries(10);
    for (const entry of entries) {
      await processEntry(entry.id);
    }
    await sendMessage(
      chatId,
      entries.length === 0
        ? "Geen entries om opnieuw te analyseren."
        : `Klaar: ${entries.length} entries opnieuw geprobeerd. Check /laatste of /stats.`,
    );
  } catch (err) {
    console.error(
      "[analyse] retry run failed:",
      err instanceof Error ? err.message : err,
    );
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
    case "/profiel": {
      const analyzed = await listAnalyzedEntries();
      if (analyzed.filter((e) => e.analysis !== null).length === 0) {
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
