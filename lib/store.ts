import { promises as fs } from "fs";
import path from "path";
import { PROFILE_SEED } from "./seed";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PROFILE_PATH = path.join(DATA_DIR, "profile.md");
const HISTORY_PATH = path.join(DATA_DIR, "history.json");
const HISTORY_CAP = 200;

export type HistoryEntry = {
  id: string;
  at: string; // ISO timestamp
  mode: "build" | "roast";
  engine: string; // claude tier id
  idea: string;
  output: string;
};

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function getProfile(): Promise<string> {
  await ensureDir();
  try {
    return await fs.readFile(PROFILE_PATH, "utf8");
  } catch {
    await fs.writeFile(PROFILE_PATH, PROFILE_SEED, "utf8");
    return PROFILE_SEED;
  }
}

export async function saveProfile(text: string): Promise<void> {
  await ensureDir();
  await fs.writeFile(PROFILE_PATH, text, "utf8");
}

export async function listHistory(): Promise<HistoryEntry[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Backfill entries written before `mode` existed.
    return parsed.map((e) => ({ mode: "build", ...e }));
  } catch {
    return [];
  }
}

async function writeHistory(list: HistoryEntry[]): Promise<void> {
  await fs.writeFile(
    HISTORY_PATH,
    JSON.stringify(list.slice(0, HISTORY_CAP), null, 2),
    "utf8"
  );
}

export async function addHistory(
  entry: Omit<HistoryEntry, "id" | "at">
): Promise<HistoryEntry> {
  const full: HistoryEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...entry,
  };
  const list = await listHistory();
  list.unshift(full);
  await writeHistory(list);
  return full;
}

/** Upserts the output of an in-progress entry — used by roast mode, which
 * grows across many turns instead of finishing in one shot. */
export async function updateHistory(
  id: string,
  patch: { output: string }
): Promise<void> {
  const list = await listHistory();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], output: patch.output };
  await writeHistory(list);
}

export async function removeHistory(id: string): Promise<void> {
  const list = await listHistory();
  await writeHistory(list.filter((e) => e.id !== id));
}
