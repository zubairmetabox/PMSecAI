# PMSecAI — Implementation Plan v1

## Context

MetaBox Technology's dev team uses Claude Code in VS Code to build client projects. The Ops Manager creates a stub project in Zoho Projects, and developers need to: create the full task structure (Phases > Tasks > Subtasks), track time per task, and log AI costs per task. This is currently all manual. PMSecAI automates it by wiring Claude Code directly to Zoho Projects via a local MCP server, while a companion web app provides visibility into AI spend and team productivity.

**Zoho plan**: Premium (not Enterprise) — custom fields unavailable. Token/cost/model data will be written as a structured comment on the Zoho task, while Neon DB is the authoritative store.

---

## Architecture Overview

```
VS Code + Claude Code
  └─ MCP Server (local Node.js process, StdioTransport)
       ├─ Zoho Projects REST API  ──────────────────► Zoho (.com US)
       ├─ Claude Code Stop Hook (port 37849) ─────── token accumulation
       └─ Cloud Sync (REST POST) ──────────────────► Next.js API on Vercel
                                                           └─ Neon PostgreSQL
Web App (Next.js + Tailwind on Vercel)
  └─ Reads from Neon DB to display dashboards
```

**Two packages in a monorepo:**
- `packages/mcp-server` — TypeScript, runs locally on each dev's machine
- `packages/web` — Next.js 14 App Router, deployed on Vercel

---

## Monorepo Setup

**Root:** `c:/dev/PMSecAI/`
- `package.json` — npm workspaces: `["packages/*"]`
- `tsconfig.base.json` — shared TS config (`ES2022`, `NodeNext`, `strict`)
- `turbo.json` — build pipeline
- `.gitignore` — covers `node_modules`, `.env`, `.env.local`, `dist`, `.next`, `*.zoho-token.json`

**Shared DB package:** `packages/db/`
- `@pmsecai/db` — Drizzle ORM schema + Neon client, imported by both packages

---

## Database Schema (`packages/db/src/schema.ts`)

Tables (Drizzle + Neon PostgreSQL):

| Table | Key Columns |
|---|---|
| `users` | id, name, email, role (admin/developer), invited_by |
| `developer_profiles` | user_id, zoho_email, vs_code_identity, claude_model |
| `projects` | zoho_project_id, name, repo_path, repo_name |
| `phases` | project_id, zoho_tasklist_id, name, order |
| `tasks` | phase_id, zoho_task_id, name, status, assigned_to, started_at, completed_at |
| `subtasks` | task_id, zoho_subtask_id, name, status |
| `work_sessions` | task_id, user_id, started_at, ended_at, tokens_in, tokens_out, cost_usd, model |
| `non_zoho_work` | user_id, description, started_at, ended_at, total_tokens, cost_usd, model |

Add `password_hash` column to `users` (web-only, for NextAuth Credentials).

Seed script: `packages/db/scripts/seed-admin.ts` — creates first admin user via CLI prompt (bootstrap problem since no self-registration).

---

## MCP Server (`packages/mcp-server/`)

### Stack
- `@modelcontextprotocol/sdk` (StdioServerTransport)
- `@anthropic-ai/sdk` (for plan parsing in `create_tasks_from_plan`)
- `axios` (Zoho API calls)
- `express` (OAuth callback server + token receiver on port 37849)
- `open` (browser launch for OAuth)
- `zod` (tool argument validation)

### File Structure

```
src/
├── index.ts                    # Entry: Server + StdioTransport + startTokenReceiver()
├── config.ts                   # Reads .pmSecAI.json from CWD; reads dev identity from env
├── state.ts                    # In-memory + file-persisted session state
├── tools/
│   ├── link-project.ts         # Fuzzy-match Zoho project → write .pmSecAI.json
│   ├── get-project-status.ts   # Read Zoho phases/tasks → markdown summary for Claude
│   ├── create-tasks-from-plan.ts # Claude parses plan → create Zoho Phases/Tasks/Subtasks
│   ├── start-task.ts           # Start wall-clock timer + reset token accumulator
│   ├── complete-task.ts        # Mark done on Zoho + log time + log tokens/cost as comment
│   ├── log-non-zoho-work.ts    # Save to Neon only (no Zoho)
│   └── get-session-stats.ts    # Return current accumulated tokens/cost/elapsed time
├── zoho/
│   ├── auth.ts                 # OAuth 2.0: browser flow, token storage in ~/.pmsecai/
│   ├── client.ts               # Axios instance with refresh interceptor
│   ├── projects.ts             # GET /portals/, GET /projects/
│   ├── tasks.ts                # CRUD tasks, subtasks, tasklists, time logs
│   └── token-data.ts           # Write token comment (fallback since not Enterprise)
├── hooks/
│   └── token-receiver.ts       # Express on :37849; accumulates tokens from Stop hook
└── sync/
    └── cloud-sync.ts           # POST to web app /api/sync with PMSECAI_SYNC_SECRET
```

### Key Config Files

**`.pmSecAI.json`** (in each repo root, committed to git):
```json
{ "zohoProjectId": "1234567890", "zohoProjectName": "My App", "linkedAt": "..." }
```

**`~/.pmsecai/`** (per-developer machine, never in git):
- `zoho-token.json` — Zoho OAuth tokens (access + refresh + expiry)
- `session-state.json` — persisted accumulator so tokens survive VS Code restarts
- `zoho-portal.json` — cached portal ID

**`~/.claude/settings.json`** additions per developer:
```json
{
  "mcpServers": {
    "pmsecai": {
      "command": "node",
      "args": ["/path/to/pmsecai-mcp/dist/index.js"]
    }
  },
  "hooks": {
    "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bash ~/.claude/pmsecai-hook.sh" }] }]
  },
  "env": {
    "PMSECAI_DEV_NAME": "...",
    "PMSECAI_DEV_EMAIL": "...",
    "ZOHO_CLIENT_ID": "...",
    "ZOHO_CLIENT_SECRET": "...",
    "PMSECAI_WEB_URL": "https://...",
    "PMSECAI_SYNC_SECRET": "..."
  }
}
```

**`~/.claude/pmsecai-hook.sh`** — reads Stop hook JSON from stdin, POSTs token counts to `:37849/hook/token-usage`.

> ⚠️ **CRITICAL**: All MCP server logging must go to `stderr` or a log file — never `console.log` to stdout, which would corrupt the JSON-RPC stream.

### Zoho OAuth (one-time per developer)
- Register app at https://api-console.zoho.com → "Server-based Application"
- Redirect URI: `http://localhost:37850/callback`
- Scopes: `ZohoProjects.tasks.ALL,ZohoProjects.timesheets.ALL,ZohoProjects.projects.READ`
- Share `client_id`/`client_secret` securely with all developers
- Each dev runs `node dist/index.js --auth` to complete their own OAuth flow

### Token Cost Calculation (in `complete-task.ts`)
```
costUsd = (tokensIn / 1_000_000) * INPUT_PRICE[model]
        + (tokensOut / 1_000_000) * OUTPUT_PRICE[model]
```
Prices stored as a const map. Since Zoho Premium has no custom fields, log as a task comment:
```
[PMSecAI] Tokens In: 12400 | Tokens Out: 3100 | Cost: $0.004213 | Model: claude-sonnet-4-6
```

---

## Web App (`packages/web/`)

### Stack
- Next.js 14 (App Router), Tailwind CSS
- NextAuth.js v5 with Credentials provider + DrizzleAdapter
- `@pmsecai/db` workspace reference
- Recharts (cost charts), Radix UI primitives, lucide-react

### Pages & Routes

| Route | Description |
|---|---|
| `/` | Dashboard: monthly cost, active tasks, team activity feed |
| `/projects` | Project list with status summary |
| `/projects/[id]` | Phase/task tree, per-task tokens + cost + time |
| `/tasks` | All tasks across projects |
| `/work-log` | Non-Zoho work entries |
| `/team` | Per-developer breakdown (admin only) |
| `/admin` | Invite users, manage accounts |
| `/auth/sign-in` | Login page |
| `/api/sync` | POST endpoint for MCP server (authenticated by PMSECAI_SYNC_SECRET) |
| `/api/auth/[...nextauth]` | NextAuth handlers |

### Auth
- Invite-only: admin creates invite → sends email → user sets password
- `middleware.ts` protects all routes except `/auth/*` and `/api/sync`
- `/api/sync` uses its own `PMSECAI_SYNC_SECRET` bearer check

### `/api/sync` Endpoint
Accepts `{ type, payload }` where type is one of: `project`, `task`, `session`, `non_zoho_work`. Uses `db.insert(...).onConflictDoUpdate(...)` for safe upserts. Requires `Authorization: Bearer {PMSECAI_SYNC_SECRET}` header.

---

## Key Workflows

### 1. Repo Linking (first time in a new project)
1. Dev opens VS Code in repo, starts chatting with Claude
2. Claude calls `link_project("My App")` (or dev says "I'm working on My App")
3. MCP server fetches Zoho projects, fuzzy-matches, confirms with dev
4. Writes `.pmSecAI.json` to repo root
5. Syncs project to Neon DB
6. Claude confirms: "Linked to Zoho project #1234 — My App"

### 2. Planning → Task Creation
1. Dev and Claude plan the project in free-form conversation
2. Dev says: "Now create the tasks on Zoho"
3. Claude calls `create_tasks_from_plan(fullPlanText)`
4. MCP makes a Claude API call to parse plan into structured JSON (Phases > Tasks > Subtasks)
5. MCP creates tasklists → tasks → subtasks on Zoho (200ms delay between calls)
6. Syncs all to Neon DB
7. Claude returns summary of what was created

### 3. Task Completion
1. Dev says: "The auth middleware task is done"
2. Claude calls `complete_task("auth middleware")`
3. MCP resolves task by fuzzy name match
4. Marks complete on Zoho (`status=closed`)
5. Logs wall-clock time to Zoho time log (`started_at` → `now`)
6. Posts `[PMSecAI]` comment with tokens/cost/model to Zoho task
7. Inserts `work_session` row to Neon DB
8. Resets session state
9. Claude reports: "Task marked complete. Time: 2h 15m. Cost: $0.0042"

### 4. Non-Zoho Work
1. Dev works without a linked project
2. Claude calls `log_non_zoho_work("R&D on authentication patterns")`
3. MCP inserts to `non_zoho_work` table in Neon only

---

## Implementation Order

1. Root monorepo (`package.json`, `tsconfig.base.json`, `turbo.json`)
2. `packages/db` — schema + Drizzle client + drizzle.config.ts
3. Run `drizzle-kit push` → create tables in Neon
4. `packages/mcp-server` — Zoho auth + client (most risky, validate OAuth first)
5. `packages/mcp-server` — config + state
6. `packages/mcp-server` — all 7 tools
7. `packages/mcp-server` — token receiver + cloud sync
8. Test MCP server with MCP Inspector tool
9. `packages/web` — NextAuth + DB schema additions
10. `packages/web` — `/api/sync` endpoints
11. `packages/web` — all pages
12. Configure hooks on lead dev machine + end-to-end test
13. Deploy web app to Vercel + push DB migrations
14. Write `scripts/setup-dev.sh` onboarding script
15. Onboard rest of team

---

## Verification

**MCP Server:**
- Run `npx @modelcontextprotocol/inspector node dist/index.js` to test all tools interactively
- Test `link_project` → verify `.pmSecAI.json` created and Zoho project found
- Test `create_tasks_from_plan` with sample plan → verify tasks appear in Zoho
- Test `complete_task` → verify Zoho task closed, time log added, comment with token data
- Verify token receiver: manually POST to `:37849/hook/token-usage`, check `get_session_stats()`

**Web App:**
- Seed admin user → login → invite a test user → login as test user
- Verify `/api/sync` accepts POST from MCP with sync secret, rejects without
- After task completion, verify data appears in `/projects/[id]` view
- Check mobile responsiveness in Chrome DevTools

**End-to-end:**
- Open VS Code in a test repo → link to Zoho → plan a mini project → create tasks → start a task → do some Claude work → say "task done" → verify Zoho + Neon + web app all updated consistently

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Stop hook payload schema unknown | Log full payload to `~/.pmsecai/hook-debug.log` on first run; build receiver after inspecting real payload |
| stdout corruption on MCP server | Redirect all `console.*` to stderr at startup; never use `process.stdout.write` |
| Zoho portal ID (multi-portal users) | Cache in `~/.pmsecai/zoho-portal.json`; prompt to select if multiple found |
| Token loss on VS Code restart | Flush accumulator to `~/.pmsecai/session-state.json` on every hook call |
| Zoho rate limits (task creation) | 200ms delay between task API calls + retry-with-backoff in Axios interceptor |
| First admin user bootstrap | `packages/db/scripts/seed-admin.ts` CLI seed script |
