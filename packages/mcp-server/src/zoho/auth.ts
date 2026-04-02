/**
 * Zoho Projects OAuth 2.0 — Authorization Code flow.
 *
 * Tokens are stored in ~/.pmsecai/zoho-token.json (never in the repo).
 * Each developer runs `pmsecai-mcp --auth` once to complete the browser flow.
 * After that, access tokens are refreshed automatically.
 */

import * as http from "http";
import * as crypto from "crypto";
import axios from "axios";
import open from "open";
import { readLocalJson, writeLocalJson } from "../config.js";
import { log } from "../logger.js";

const ACCOUNTS_BASE = "https://accounts.zoho.com/oauth/v2";
const TOKEN_FILE = "zoho-token.json";
const CALLBACK_PORT = 37850;

interface ZohoTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix ms
}

function getCredentials() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = process.env.ZOHO_REDIRECT_URI ?? `http://localhost:${CALLBACK_PORT}/callback`;
  if (!clientId || !clientSecret) {
    throw new Error(
      "ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must be set in environment variables."
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export async function ensureAuthenticated(): Promise<string> {
  const tokens = readLocalJson<ZohoTokens>(TOKEN_FILE);

  if (tokens) {
    // Refresh if within 5 minutes of expiry
    if (Date.now() < tokens.expires_at - 5 * 60 * 1000) {
      return tokens.access_token;
    }
    log("Zoho access token expiring soon — refreshing...");
    return refreshToken(tokens.refresh_token);
  }

  throw new Error(
    "Not authenticated with Zoho. Run `pmsecai-mcp --auth` to complete the OAuth flow."
  );
}

async function refreshToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getCredentials();
  const resp = await axios.post<{
    access_token: string;
    expires_in: number;
    error?: string;
  }>(
    `${ACCOUNTS_BASE}/token`,
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  if (resp.data.error) {
    throw new Error(`Zoho token refresh failed: ${resp.data.error}`);
  }

  const existing = readLocalJson<ZohoTokens>(TOKEN_FILE)!;
  const updated: ZohoTokens = {
    access_token: resp.data.access_token,
    refresh_token: existing.refresh_token, // refresh token doesn't rotate
    expires_at: Date.now() + resp.data.expires_in * 1000,
  };
  writeLocalJson(TOKEN_FILE, updated);
  log("Zoho access token refreshed.");
  return updated.access_token;
}

export async function runAuthFlow(): Promise<void> {
  const { clientId, clientSecret, redirectUri } = getCredentials();
  const state = crypto.randomBytes(16).toString("hex");
  const scopes = [
    "ZohoProjects.tasks.ALL",
    "ZohoProjects.timesheets.ALL",
    "ZohoProjects.projects.READ",
  ].join(",");

  const authUrl =
    `${ACCOUNTS_BASE}/auth` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${state}` +
    `&access_type=offline`;

  // Spin up a one-shot local server to receive the callback
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);
      const returnedCode = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h2>Authentication failed: ${error}</h2><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`Zoho auth error: ${error}`));
        return;
      }

      if (!returnedCode || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h2>Invalid callback</h2><p>You can close this tab.</p>");
        server.close();
        reject(new Error("Invalid OAuth callback"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<h2 style="font-family:sans-serif;color:#16a34a">✓ PMSecAI authenticated successfully!</h2>` +
        `<p style="font-family:sans-serif">You can close this tab and return to VS Code.</p>`
      );
      server.close();
      resolve(returnedCode);
    });

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      log(`Callback server listening on http://localhost:${CALLBACK_PORT}`);
      log(`Opening browser for Zoho authorization...`);
      open(authUrl).catch(() => {
        log(`Could not open browser automatically. Please visit:\n${authUrl}`);
      });
    });

    server.on("error", reject);
  });

  // Exchange code for tokens
  const resp = await axios.post<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    error?: string;
  }>(
    `${ACCOUNTS_BASE}/token`,
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  if (resp.data.error || !resp.data.refresh_token) {
    throw new Error(`Zoho token exchange failed: ${resp.data.error ?? "No refresh token returned"}`);
  }

  writeLocalJson(TOKEN_FILE, {
    access_token: resp.data.access_token,
    refresh_token: resp.data.refresh_token,
    expires_at: Date.now() + resp.data.expires_in * 1000,
  } satisfies ZohoTokens);

  log("Zoho tokens saved to ~/.pmsecai/zoho-token.json");
}
