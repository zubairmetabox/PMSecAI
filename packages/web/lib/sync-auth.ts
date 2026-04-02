/**
 * Validates the Bearer token on /api/sync requests from the MCP server.
 * This is NOT Clerk auth — it's a static shared secret for machine-to-machine calls.
 */
export function validateSyncAuth(authHeader: string | null): boolean {
  const secret = process.env.PMSECAI_SYNC_SECRET;
  if (!secret) {
    console.error("PMSECAI_SYNC_SECRET is not set — all sync requests will be rejected");
    return false;
  }
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  // Constant-time comparison to prevent timing attacks
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}
