import fs from "fs";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), ".photo-viewer.json");

export interface Settings {
  folder: string;
}

let cachedSettings: Settings | null = null;
let writeQueue = Promise.resolve();

function normalizeSettings(parsed: Partial<Settings>): Settings {
  return { folder: typeof parsed.folder === "string" ? parsed.folder : "" };
}

export function getSettings(): Settings {
  if (cachedSettings) return cachedSettings;
  try {
    cachedSettings = normalizeSettings(JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) as Partial<Settings>);
  } catch {
    cachedSettings = { folder: "" };
  }
  return cachedSettings;
}

export async function getSettingsAsync(): Promise<Settings> {
  if (cachedSettings) return cachedSettings;
  try {
    cachedSettings = normalizeSettings(JSON.parse(await fs.promises.readFile(SETTINGS_PATH, "utf8")) as Partial<Settings>);
  } catch {
    cachedSettings = { folder: "" };
  }
  return cachedSettings;
}

export function saveSettings(settings: Settings): void {
  cachedSettings = settings;
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}

export async function saveSettingsAsync(settings: Settings): Promise<void> {
  cachedSettings = settings;
  writeQueue = writeQueue.then(() => fs.promises.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8"));
  await writeQueue;
}
