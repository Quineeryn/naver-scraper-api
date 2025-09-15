import axios, { type RawAxiosRequestHeaders } from "axios";
import * as https from "https";
import { URL } from "url";
import { promises as fs } from "fs";
import path from "path";
import { TTLCache } from "../utils/cache.js";
import { Semaphore } from "../utils/semaphore.js";
import { CircuitBreaker } from "../utils/circuitBreaker.js";
import { getRandomUserAgent, getRandomReferer } from "../utils/userAgent.js";
import { randomDelay, sleep } from "../utils/delay.js";
import { getRandomProxy } from "../utils/proxy.js";

const COOKIE_FILE_PATH = path.join(process.cwd(), "session.cookie");

const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS);
const CONC_UPSTREAM = Number(process.env.CONC_UPSTREAM);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS);
const MAX_RETRIES = Number(process.env.UPSTREAM_MAX_RETRIES);
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS);
const CB_FAIL_THRESHOLD = Number(process.env.CB_FAIL_THRESHOLD);
const CB_OPEN_MS = Number(process.env.CB_OPEN_MS);
const RAND_DELAY_MIN_MS = Number(process.env.RAND_DELAY_MIN_MS);
const RAND_DELAY_MAX_MS = Number(process.env.RAND_DELAY_MAX_MS);

// Keep-alive agent biar koneksi reusable
const httpsAgent = new https.Agent({ 
  keepAlive: true, 
  maxSockets: CONC_UPSTREAM 
});

// Semaphore (bulkhead)
const sem = new Semaphore(CONC_UPSTREAM);

// Circuit breaker
const cb = new CircuitBreaker(CB_FAIL_THRESHOLD, CB_OPEN_MS);

// TTL cache
const cache = new TTLCache<string, any>(CACHE_TTL_MS);

const backoff = (attempt: number) => {
  const base = RETRY_BASE_MS * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.random() * 200;
  return base + jitter;
};

async function readCookie(): Promise<string> {
  // NAVER_COOKIE dari .env menang, jika kosong fallback ke file
  if (process.env.NAVER_COOKIE) return process.env.NAVER_COOKIE.trim();
  
  try {
    const cookie = await fs.readFile(COOKIE_FILE_PATH, "utf-8");
    return cookie.trim();
  } catch {
    throw new Error(`Cookie missing. Please run cookie-harvester.ts to create ${COOKIE_FILE_PATH}`);
  }
}

async function buildHeaders(): Promise<RawAxiosRequestHeaders> {
  const cookie = await readCookie();
  const ua = process.env.NAVER_USER_AGENT?.trim() || getRandomUserAgent();
  const referer = process.env.NAVER_REFERER?.trim() || getRandomReferer();
  
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9,id;q=0.8",
    cookie,
    referer,
    "user-agent": ua,
    "sec-ch-ua": '"Chromium";v="120", "Not=A?Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    connection: "keep-alive",
  };
}

function buildAxiosClient(proxyUrl?: string) {
  const base: any = {
    timeout: UPSTREAM_TIMEOUT_MS,
    httpsAgent,
    validateStatus: () => true,
  };

  if (proxyUrl) {
    const p = new URL(proxyUrl);
    base.proxy = {
      host: p.hostname,
      port: Number(p.port),
      protocol: p.protocol.replace(":", ""),
      auth: p.username 
        ? { username: p.username, password: p.password } 
        : undefined,
    };
  }

  return axios.create(base);
}

export async function scrapeNaverApi(targetUrl: string): Promise<any> {
  const cached = cache.get(targetUrl);
  if (cached !== undefined) return cached;

  if (!cb.canAttempt()) {
    throw new Error("Circuit open: upstream tidak stabil, coba lagi sebentar.");
  }

  await sem.acquire();

  try {
    let lastErr: any;

    // Random delay untuk SEMUA request (bukan hanya retry)
    await randomDelay(RAND_DELAY_MIN_MS, RAND_DELAY_MAX_MS);

    for (let attempt = 1; attempt <= Math.max(1, MAX_RETRIES + 1); attempt++) {
      const proxy = getRandomProxy();
      const client = buildAxiosClient(proxy);
      const headers = await buildHeaders();

      try {
        if (attempt > 1) {
          console.log(`🔁 Retry ${attempt - 1} | proxy=${proxy ?? "none"}`);
        }

        const res = await client.get(targetUrl, { headers });
        const ok = res.status >= 200 && res.status < 400;

        if (!ok) {
          lastErr = new Error(`Bad status ${res.status}`);
          if (attempt <= MAX_RETRIES) {
            await sleep(backoff(attempt));
            continue;
          }
          cb.onFailure();
          throw lastErr;
        }

        cache.set(targetUrl, res.data);
        cb.onSuccess();
        return res.data;
      } catch (e: any) {
        lastErr = e;
        if (attempt <= MAX_RETRIES) {
          await sleep(backoff(attempt));
          continue;
        }
        cb.onFailure();
        throw lastErr;
      }
    }

    throw lastErr ?? new Error("Unknown upstream error");
  } finally {
    sem.release();
  }
}