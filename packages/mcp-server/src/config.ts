import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { log } from "./logger.js";

// ─── .pmSecAI.json (per repo, committed to git) ───────────────────────────────

export interface RepoConfig {
  zohoProjectId: string;
  zohoProjectName: string;
  linkedAt: string;
}

const REPO_CONFIG_FILE = ".pmSecAI.json";

export function readRepoConfig(cwd = process.cwd()): RepoConfig | null {
  const configPath = path.join(cwd, REPO_CONFIG_FILE);
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as RepoConfig;
  } catch {
    return null;
  }
}

export function writeRepoConfig(config: RepoConfig, cwd = process.cwd()): void {
  const configPath = path.join(cwd, REPO_CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  log(`Wrote repo config to ${configPath}`);
}

// ─── Developer Identity (from env vars set in ~/.claude/settings.json) ────────

export interface DeveloperIdentity {
  name: string;
  email: string;
  vsCodeIdentity: string; // "Name <email>"
  model: string;
  webUrl: string;
  syncSecret: string;
}

export function getDeveloperIdentity(): DeveloperIdentity {
  const name = process.env.PMSECAI_DEV_NAME ?? "Unknown Developer";
  const email = process.env.PMSECAI_DEV_EMAIL ?? "unknown@example.com";
  return {
    name,
    email,
    vsCodeIdentity: `${name} <${email}>`,
    model: process.env.PMSECAI_MODEL ?? "claude-sonnet-4-6",
    webUrl: process.env.PMSECAI_WEB_URL ?? "http://localhost:3000",
    syncSecret: process.env.PMSECAI_SYNC_SECRET ?? "",
  };
}

// ─── ~/.pmsecai/ directory ────────────────────────────────────────────────────

export const PMSECAI_DIR = path.join(os.homedir(), ".pmsecai");

export function ensurePmSecAIDir(): void {
  fs.mkdirSync(PMSECAI_DIR, { recursive: true });
}

export function readLocalJson<T>(filename: string): T | null {
  const filePath = path.join(PMSECAI_DIR, filename);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeLocalJson(filename: string, data: unknown): void {
  ensurePmSecAIDir();
  const filePath = path.join(PMSECAI_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}
