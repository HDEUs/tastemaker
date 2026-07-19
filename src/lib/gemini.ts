// Audio transcription via Gemini. Model choice: docs/decisions.md (2.0 Flash
// is EOL, checked live 2026-07-19). Voice notes go inline; video goes through
// the Files API because inline base64 breaks the ~20 MB request cap.
import { GoogleGenAI } from "@google/genai";
import { env } from "./env";

export const GEMINI_MODEL = "gemini-3.5-flash";

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: env("GEMINI_API_KEY") });
  return client;
}

const TRANSCRIBE_PROMPT =
  "Transcribe the spoken audio verbatim. Output only the transcript text, " +
  "no commentary, no timestamps. The speaker is Dutch and may mix in English.";

export async function transcribeInline(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const res = await ai().models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: Buffer.from(bytes).toString("base64"),
            },
          },
          { text: TRANSCRIBE_PROMPT },
        ],
      },
    ],
  });
  return res.text?.trim() ?? "";
}

export async function transcribeViaFilesApi(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  // Copy into a plain ArrayBuffer: Blob refuses Uint8Array<ArrayBufferLike>
  // under strict TS, and a copy also detaches us from any larger backing
  // buffer.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const uploaded = await ai().files.upload({
    file: new Blob([buffer], { type: mimeType }),
    config: { mimeType },
  });
  const name = uploaded.name;
  if (!name) {
    throw new Error("Gemini upload returned no file name");
  }
  let file = uploaded;
  const deadline = Date.now() + 30_000;
  while (file.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    file = await ai().files.get({ name });
  }
  try {
    if (file.state !== "ACTIVE" || !file.uri) {
      throw new Error(`Gemini file not ready (state: ${String(file.state)})`);
    }
    const res = await ai().models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri: file.uri, mimeType } },
            { text: TRANSCRIBE_PROMPT },
          ],
        },
      ],
    });
    return res.text?.trim() ?? "";
  } finally {
    await ai()
      .files.delete({ name })
      .catch(() => undefined);
  }
}
