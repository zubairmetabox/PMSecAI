import axios from "axios";
import { getDeveloperIdentity } from "../config.js";
import { log } from "../logger.js";

export async function syncToCloud(type: string, payload: unknown): Promise<void> {
  const dev = getDeveloperIdentity();
  if (!dev.syncSecret) {
    log("PMSECAI_SYNC_SECRET not set — skipping cloud sync", "warn");
    return;
  }
  if (!dev.webUrl) {
    log("PMSECAI_WEB_URL not set — skipping cloud sync", "warn");
    return;
  }

  await axios.post(
    `${dev.webUrl}/api/sync`,
    { type, payload },
    {
      headers: {
        Authorization: `Bearer ${dev.syncSecret}`,
        "Content-Type": "application/json",
      },
      timeout: 10_000,
    }
  );
}
