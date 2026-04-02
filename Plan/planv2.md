# PMSecAI — Implementation Plan v2

## Changes from v1
- Next.js 16.2.1 (latest) instead of 14
- Styling via `pnpm dlx shadcn@latest init --preset b2D0wq8p9 --template next`
- Clerk replaces NextAuth.js for authentication
- `axios@1.14.0` pinned (1.14.1 and 0.30.4 are compromised — published 2026-03-31)
- Package manager switched to **pnpm** (required by shadcn init command above)
- PMSecAI's own Claude API usage (e.g. plan parsing) is tracked separately in the web app

---

## Context

MetaBox Technology's dev team uses Claude Code in VS Code to build client projects. The Ops Manager creates a stub project in Zoho Projects, and developers need to: create the full task structure (Phases > Tasks > Subtasks), track time per task, and log AI costs per task. PMSecAI automates it by wiring Claude Code directly to Zoho Projects via a local MCP server, while a companion web app provides visibility into AI spend and team productivity.

**Zoho plan**: Premium (not Enterprise) — custom fields unavailable. Token/cost/model data will be written as a structured comment on the Zoho task, while Neon DB is the authoritative store.

---

## Architecture Overview

```
VS Code + Claude Code
  └─ MCP Server (local Node.js process, StdioTransport)
       ├─ Zoho Projects REST API  ──────────────────► Zoho (.com US)
       ├─ Claude Code Stop Hook (port 37849) ─────── token accumulation
       └─ Cloud Sync (REST POST) ──────────────────► Next.js 16.2.1 API on Vercel
                                                           └─ Neon PostgreSQL
Web App (Next.js 16.2.1 + shadcn on Vercel)
  └─ Reads from Neon DB to display dashboards
```

**Two packages in a monorepo (pnpm workspaces):**
- `packages/mcp-server` — TypeScript, runs locally on each dev's machine
- `packages/web` — Next.js 16.2.1 App Router, deployed on Vercel

---

## Monorepo Setup

**Root:** `c:/dev/PMSecAI/`
- `pnpm-workspace.yaml` — `packages: ["packages/*"]`
- `package.json` — root scripts only (no `workspaces` field — pnpm uses yaml)
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
| `developer_profiles` | id, clerk_user_id (PK from Clerk), zoho_email, vs_code_identity, claude_model |
| `projects` | zoho_project_id, name, repo_path, repo_name |
| `phases` | project_id, zoho_tasklist_id, name, order |
| `tasks` | phase_id, zoho_task_id, name, status, assigned_to (clerk_user_id), started_at, completed_at |
| `subtasks` | task_id, zoho_subtask_id, name, status |
| `work_sessions` | task_id, clerk_user_id, source, started_at, ended_at, tokens_in, tokens_out, cost_usd, model |
| `non_zoho_work` | clerk_user_id, description, started_at, ended_at, total_tokens, cost_usd, model |
| `system_usage` | clerk_user_id, operation, tokens_in, tokens_out, cost_usd, model, created_at |

> **No `users` table** — Clerk owns identity. All user data is referenced by `clerk_user_id`.

> **`work_sessions.source`** enum: `'developer'` | `'pmsecai_system'` — distinguishes developer coding sessions from PMSecAI's own Claude API calls (e.g. plan parsing). Both land in `work_sessions`; the `source` field separates them in the UI.

> **`system_usage` table** — granular log of every internal PMSecAI Claude call with the operation name (e.g. `parse_plan`, `fuzzy_match`). Rolled up into the dashboard's "PMSecAI Tool Cost" card.

---

## MCP Server (`packages/mcp-server/`)

### Stack
- `@modelcontextprotocol/sdk` (StdioServerTransport)
- `@anthropic-ai/sdk` (for plan parsing in `create_tasks_from_plan`)
- `axios@1.14.0` — **pinned, do not upgrade to 1.14.1 or 0.30.4 (compromised)**
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
├── claude/
│   └── tracked-client.ts       # Wraps @anthropic-ai/sdk; auto-syncs system_usage to cloud
└── sync/
    └── cloud-sync.ts           # POST to web app /api/sync with PMSECAI_SYNC_SECRET
```

**`claude/tracked-client.ts`** — wraps every internal Claude API call made by the MCP server (e.g. in `create_tasks_from_plan`). After each call it:
1. Records tokens + cost to `state` with `source: 'pmsecai_system'`
2. POSTs a `system_usage` entry to `/api/sync` immediately (fire-and-forget)

This ensures PMSecAI's own AI spend is visible in the web app separate from developer coding spend.

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
- **Next.js 16.2.1** (App Router, latest)
- **shadcn/ui** — initialized with: `pnpm dlx shadcn@latest init --preset b2D0wq8p9 --template next`
- **Clerk** (`@clerk/nextjs`) — auth, user management, invite system
- `@pmsecai/db` workspace reference
- Recharts (cost charts), lucide-react

### Clerk Setup
- All sign-in/sign-up/invite flows handled by Clerk (hosted UI or embedded `<SignIn>` component)
- No custom auth pages needed
- User invites managed via Clerk Dashboard or Clerk's `invitations` API
- `clerkMiddleware()` in `middleware.ts` protects all routes except `/api/sync`
- `currentUser()` / `auth()` from `@clerk/nextjs/server` used in Server Components and API routes
- `developer_profiles` table stores the `clerk_user_id` as the join key to our DB data

### Pages & Routes

| Route | Description |
|---|---|
| `/` | Dashboard: monthly cost, active tasks, PMSecAI tool cost card, team activity feed |
| `/projects` | Project list with status summary |
| `/projects/[id]` | Phase/task tree, per-task tokens + cost + time |
| `/tasks` | All tasks across projects |
| `/work-log` | Non-Zoho work entries |
| `/pmsecai-usage` | PMSecAI's own Claude API usage — operations, tokens, cost breakdown |
| `/team` | Per-developer breakdown (admin only) |
| `/admin` | User management via Clerk |
| `/api/sync` | POST endpoint for MCP server (authenticated by PMSECAI_SYNC_SECRET) |
| `/sign-in` | Clerk-handled sign-in page |

### Auth Middleware (`middleware.ts`)
```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/api/sync(.*)"]);

export default clerkMiddleware((auth, req) => {
  if (!isPublic(req)) auth().protect();
});

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

### `/api/sync` Endpoint
- Accepts `{ type, payload }` — types: `project`, `task`, `session`, `non_zoho_work`, `system_usage`
- Authenticated by `Authorization: Bearer {PMSECAI_SYNC_SECRET}` (not Clerk — MCP server is a machine client)
- Uses `db.insert(...).onConflictDoUpdate(...)` for safe upserts

### `/pmsecai-usage` Page
Displays PMSecAI's own AI spend separately from developer coding spend:
- Table of `system_usage` rows: operation name, tokens in/out, cost, model, timestamp, developer
- Summary cards: total PMSecAI cost this month, most expensive operation, avg cost per plan parsed
- This answers: "How much does running PMSecAI itself cost us?"

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
4. MCP calls `tracked-client.ts` → Claude API parses plan into JSON (tokens logged as `pmsecai_system`)
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
7. Inserts `work_session` row (source: `developer`) to Neon DB
8. Resets session state
9. Claude reports: "Task marked complete. Time: 2h 15m. Cost: $0.0042"

### 4. Non-Zoho Work
1. Dev works without a linked project
2. Claude calls `log_non_zoho_work("R&D on authentication patterns")`
3. MCP inserts to `non_zoho_work` table in Neon only

---

## Implementation Order

1. Root monorepo (`pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `turbo.json`)
2. `packages/db` — schema + Drizzle client + drizzle.config.ts
3. Run `drizzle-kit push` → create tables in Neon
4. `packages/mcp-server` — Zoho auth + client (most risky, validate OAuth first)
5. `packages/mcp-server` — config + state
6. `packages/mcp-server` — `claude/tracked-client.ts` (wraps Anthropic SDK)
7. `packages/mcp-server` — all 7 tools
8. `packages/mcp-server` — token receiver + cloud sync
9. Test MCP server with MCP Inspector tool
10. `packages/web` — scaffold Next.js 16.2.1 + run shadcn init command
11. `packages/web` — Clerk setup + middleware
12. `packages/web` — `/api/sync` endpoints
13. `packages/web` — all pages (including `/pmsecai-usage`)
14. Configure hooks on lead dev machine + end-to-end test
15. Deploy web app to Vercel + push DB migrations
16. Write `scripts/setup-dev.sh` onboarding script
17. Onboard rest of team

---

## Verification

**MCP Server:**
- Run `npx @modelcontextprotocol/inspector node dist/index.js` to test all tools interactively
- Test `link_project` → verify `.pmSecAI.json` created and Zoho project found
- Test `create_tasks_from_plan` → verify tasks in Zoho AND `system_usage` row in Neon with `source: pmsecai_system`
- Test `complete_task` → verify Zoho task closed, time log added, comment with token data, `work_session` row with `source: developer`
- Verify token receiver: manually POST to `:37849/hook/token-usage`, check `get_session_stats()`

**Web App:**
- Clerk sign-in works, protected routes redirect unauthenticated users
- `/api/sync` accepts POST with sync secret, rejects without
- After task completion, data appears in `/projects/[id]`
- After plan creation, `/pmsecai-usage` shows the `parse_plan` system usage entry
- Check mobile responsiveness

**End-to-end:**
- Open VS Code in a test repo → link to Zoho → plan a mini project → create tasks → start a task → do some Claude work → say "task done" → verify Zoho + Neon + web app (developer cost + PMSecAI system cost) all updated consistently

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| axios security — 1.14.1 and 0.30.4 compromised | Pin `axios@1.14.0` in package.json; add `overrides` in root pnpm workspace to prevent transitive upgrade |
| Stop hook payload schema unknown | Log full payload to `~/.pmsecai/hook-debug.log` on first run; build receiver after inspecting real payload |
| stdout corruption on MCP server | Redirect all `console.*` to stderr at startup; never use `process.stdout.write` |
| Zoho portal ID (multi-portal users) | Cache in `~/.pmsecai/zoho-portal.json`; prompt to select if multiple found |
| Token loss on VS Code restart | Flush accumulator to `~/.pmsecai/session-state.json` on every hook call |
| Zoho rate limits (task creation) | 200ms delay between task API calls + retry-with-backoff in Axios interceptor |
| Clerk user not yet in `developer_profiles` | On first `/api/sync` call from a new dev, auto-create their profile row using the `clerk_user_id` from the payload |
