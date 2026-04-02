/**
 * Zoho portal (account) discovery.
 * Every Zoho Projects API URL requires a portal ID.
 * We fetch it once and cache it in ~/.pmsecai/zoho-portal.json.
 */

import { zohoApi } from "./client.js";
import { readLocalJson, writeLocalJson } from "../config.js";
import { log } from "../logger.js";

interface ZohoPortal {
  id: string;
  name: string;
}

interface PortalCache {
  portalId: string;
  portalName: string;
}

const PORTAL_CACHE_FILE = "zoho-portal.json";

let cachedPortalId: string | null = null;

export async function getPortalId(): Promise<string> {
  if (cachedPortalId) return cachedPortalId;

  const cached = readLocalJson<PortalCache>(PORTAL_CACHE_FILE);
  if (cached?.portalId) {
    cachedPortalId = cached.portalId;
    return cachedPortalId;
  }

  log("Fetching Zoho portals...");
  const resp = await zohoApi.get<{ portals: ZohoPortal[] }>("/portals/");
  const portals = resp.data.portals;

  if (!portals || portals.length === 0) {
    throw new Error("No Zoho portals found for this account.");
  }

  if (portals.length > 1) {
    // Use the first portal; in the future we could prompt the user to select
    log(`Multiple portals found (${portals.map((p) => p.name).join(", ")}). Using "${portals[0].name}".`, "warn");
  }

  const portal = portals[0];
  writeLocalJson(PORTAL_CACHE_FILE, { portalId: portal.id, portalName: portal.name } satisfies PortalCache);
  cachedPortalId = portal.id;
  log(`Using portal: ${portal.name} (${portal.id})`);
  return cachedPortalId;
}
