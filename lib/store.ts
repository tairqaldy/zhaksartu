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
  engine: string;
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  await fs.writeFile(
    HISTORY_PATH,
    JSON.stringify(list.slice(0, HISTORY_CAP), null, 2),
    "utf8"
  );
  return full;
}

export async function removeHistory(id: string): Promise<void> {
  const list = await listHistory();
  await fs.writeFile(
    HISTORY_PATH,
    JSON.stringify(
      list.filter((e) => e.id !== id),
      null,
      2
    ),
    "utf8"
  );
}
