/**
 * One-time script to create the first admin developer profile.
 * Run with: npx tsx scripts/seed-admin.ts
 *
 * Prerequisites:
 *  1. Create the user in Clerk Dashboard first to get their clerk_user_id.
 *  2. Run `pnpm db:push` to ensure tables exist.
 *  3. Set DATABASE_URL in .env or .env.local at the repo root.
 */

import * as readline from "readline";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { getDb, developerProfiles } from "../src/index.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

async function main() {
  console.log("\n═══════════════════════════════════════");
  console.log("  PMSecAI — Admin Profile Seed Script  ");
  console.log("═══════════════════════════════════════\n");
  console.log("Note: Create the user in Clerk Dashboard first, then enter their Clerk User ID below.\n");

  const clerkUserId = (await ask("Clerk User ID (e.g. user_xxxxxxxx): ")).trim();
  const name = (await ask("Full name: ")).trim();
  const email = (await ask("Email: ")).trim();
  const zohoEmail = (await ask("Zoho email (or press Enter to skip): ")).trim() || null;
  const vsCodeIdentity = (await ask(`VS Code identity [${name} <${email}>]: `)).trim() || `${name} <${email}>`;

  rl.close();

  if (!clerkUserId || !name || !email) {
    console.error("\n✗ Clerk User ID, name, and email are required.");
    process.exit(1);
  }

  const db = getDb();

  const [existing] = await db
    .select()
    .from(developerProfiles)
    .where((t: { clerkUserId: { equals: (v: string) => unknown } }) => t.clerkUserId.equals(clerkUserId));

  if (existing) {
    console.error(`\n✗ A developer profile for Clerk user ${clerkUserId} already exists.`);
    process.exit(1);
  }

  await db.insert(developerProfiles).values({
    clerkUserId,
    name,
    email,
    role: "admin",
    zohoEmail,
    vsCodeIdentity,
  });

  console.log(`\n✓ Admin profile created for ${name} <${email}>`);
  console.log("  You can now sign in to the web app with your Clerk account.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
