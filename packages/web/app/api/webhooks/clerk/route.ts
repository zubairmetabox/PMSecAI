/**
 * Clerk webhook — syncs user creation/deletion to developer_profiles table.
 * Configure in Clerk Dashboard → Webhooks with events: user.created, user.deleted
 * Webhook secret goes in CLERK_WEBHOOK_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { db, developerProfiles, eq } from "@/lib/db";

interface ClerkUserEvent {
  type: "user.created" | "user.deleted";
  data: {
    id: string;
    first_name?: string;
    last_name?: string;
    email_addresses?: Array<{ email_address: string; id: string }>;
    primary_email_address_id?: string;
  };
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(webhookSecret);

  let event: ClerkUserEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkUserEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const { id, first_name, last_name, email_addresses, primary_email_address_id } = event.data;
    const primaryEmail = email_addresses?.find((e) => e.id === primary_email_address_id)
      ?.email_address ?? email_addresses?.[0]?.email_address ?? "";
    const name = [first_name, last_name].filter(Boolean).join(" ") || primaryEmail;

    // Check if profile already exists (e.g. from seed-admin script)
    const [existing] = await db
      .select({ id: developerProfiles.id })
      .from(developerProfiles)
      .where(eq(developerProfiles.clerkUserId, id));

    if (!existing) {
      await db.insert(developerProfiles).values({
        clerkUserId: id,
        name,
        email: primaryEmail,
        vsCodeIdentity: `${name} <${primaryEmail}>`,
        role: "developer",
      });
    }
  }

  if (event.type === "user.deleted") {
    // Soft delete — keep historical data, just mark as deleted
    // For now we leave the profile intact; add a deleted_at column if needed
  }

  return NextResponse.json({ ok: true });
}
