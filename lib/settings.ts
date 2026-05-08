import fs from "fs";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), ".photo-viewer.json");

export interface Settings {
  folder: string;
}

export function getSettings(): Settings {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) as Partial<Settings>;
    return { folder: typeof parsed.folder === "string" ? parsed.folder : "" };
  } catch {
    return { folder: "" };
  }
}

export function saveSettings(settings: Settings): void {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}
