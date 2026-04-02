/**
 * Axios instance for Zoho Projects REST API.
 * - Attaches Bearer token before every request
 * - On 401: refreshes token and retries once
 * - On 429: waits and retries (rate limit)
 */

import axios, { AxiosError } from "axios";
import { ensureAuthenticated } from "./auth.js";
import { log } from "../logger.js";

export const BASE_URL = "https://projectsapi.zoho.com/restapi";

export const zohoApi = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
});

// Request interceptor: inject current access token
zohoApi.interceptors.request.use(async (config) => {
  const token = await ensureAuthenticated();
  config.headers.Authorization = `Zoho-oauthtoken ${token}`;
  return config;
});

// Response interceptor: handle 401 (re-auth once) and 429 (rate limit)
zohoApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as typeof error.config & { _retried?: boolean };

    if (error.response?.status === 401 && !config._retried) {
      config._retried = true;
      log("Zoho 401 — retrying with refreshed token", "warn");
      const token = await ensureAuthenticated();
      config.headers!.Authorization = `Zoho-oauthtoken ${token}`;
      return zohoApi(config);
    }

    if (error.response?.status === 429 && !config._retried) {
      config._retried = true;
      const retryAfter = Number(error.response.headers["retry-after"] ?? 2);
      log(`Zoho rate limit hit — waiting ${retryAfter}s`, "warn");
      await sleep(retryAfter * 1000);
      return zohoApi(config);
    }

    return Promise.reject(error);
  }
);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
