/**
 * In-memory session state for the current VS Code session.
 * Persisted to ~/.pmsecai/session-state.json on every mutation
 * so token counts survive VS Code restarts.
 */

import { readLocalJson, writeLocalJson } from "./config.js";
import { log } from "./logger.js";

interface SessionState {
  activeTaskId: string | null;
  activeTaskName: string | null;
  activeZohoTaskId: string | null;
  taskStartedAt: string | null; // ISO string
  accumulatedTokensIn: number;
  accumulatedTokensOut: number;
  lastModel: string | null;
  // PMSecAI's own internal token usage (separate accumulator)
  systemTokensIn: number;
  systemTokensOut: number;
}

const STATE_FILE = "session-state.json";

const DEFAULT_STATE: SessionState = {
  activeTaskId: null,
  activeTaskName: null,
  activeZohoTaskId: null,
  taskStartedAt: null,
  accumulatedTokensIn: 0,
  accumulatedTokensOut: 0,
  lastModel: null,
  systemTokensIn: 0,
  systemTokensOut: 0,
};

// Load persisted state or fall back to defaults
function loadState(): SessionState {
  return readLocalJson<SessionState>(STATE_FILE) ?? { ...DEFAULT_STATE };
}

function persist(s: SessionState): void {
  try {
    writeLocalJson(STATE_FILE, s);
  } catch (err) {
    log(`Failed to persist session state: ${err}`, "warn");
  }
}

// Singleton mutable state object
export const state: SessionState = loadState();

export function startTask(taskId: string, taskName: string, zohoTaskId: string): void {
  state.activeTaskId = taskId;
  state.activeTaskName = taskName;
  state.activeZohoTaskId = zohoTaskId;
  state.taskStartedAt = new Date().toISOString();
  state.accumulatedTokensIn = 0;
  state.accumulatedTokensOut = 0;
  state.lastModel = null;
  persist(state);
  log(`Task started: ${taskName} (${taskId})`);
}

export function addDeveloperTokens(tokensIn: number, tokensOut: number, model?: string): void {
  state.accumulatedTokensIn += tokensIn;
  state.accumulatedTokensOut += tokensOut;
  if (model) state.lastModel = model;
  persist(state);
}

export function addSystemTokens(tokensIn: number, tokensOut: number): void {
  state.systemTokensIn += tokensIn;
  state.systemTokensOut += tokensOut;
  persist(state);
}

export function resetTask(): void {
  state.activeTaskId = null;
  state.activeTaskName = null;
  state.activeZohoTaskId = null;
  state.taskStartedAt = null;
  state.accumulatedTokensIn = 0;
  state.accumulatedTokensOut = 0;
  state.lastModel = null;
  persist(state);
  log("Task state reset.");
}

export function getElapsedSeconds(): number | null {
  if (!state.taskStartedAt) return null;
  return Math.floor((Date.now() - new Date(state.taskStartedAt).getTime()) / 1000);
}
