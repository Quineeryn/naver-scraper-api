// =============================
// src/cookie-harvester.ts
// =============================

import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import * as vanillaPuppeteer from "puppeteer";
import { addExtra } from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

dotenv.config();

// Use puppeteer-extra on top of vanilla puppeteer
const puppeteer = addExtra(vanillaPuppeteer as any);
puppeteer.use(StealthPlugin());

const OUT_COOKIE_TXT = path.join(process.cwd(), "session.cookie");
const OUT_COOKIE_JSON = path.join(process.cwd(), "cookies.json");

// -------- helpers --------
function envBool(name: string, def = false): boolean {
  const v = process.env[name];
  if (!v) return def;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function sanitizeCookieLine(s: string): string {
  return s
    .replace(/^cookie\s*:/i, "")          // buang "Cookie:" kalau kepaste
    .replace(/^['"]|['"]$/g, "")          // buang kutip
    .replace(/\r?\n/g, " ")               // newline -> spasi
    .replace(/\s*;\s*/g, "; ")            // rapikan separator
    .trim();
}

// Helper function to replace waitForTimeout
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function buildCookieHeaderFromCDP(
  page: import("puppeteer").Page
): Promise<{ header: string; dump: any[] }> {
  const client = await page.target().createCDPSession();
  await client.send("Network.enable");
  const all = await client.send("Network.getAllCookies");
  const cookies = (all.cookies || []).filter((c: any) =>
    (c?.domain ?? "").includes("naver.com")
  );
  const header = cookies
    .filter((c: any) => c?.name && typeof c.value === "string")
    .map((c: any) => `${c.name}=${c.value}`)
    .join("; ");
  return { header, dump: cookies };
}

// -------- config --------
const HEADLESS = envBool("HEADLESS", );
const UA = process.env.NAVER_USER_AGENT?.trim();

// allow overriding URL via --url="..."
const cliUrl = process.argv.find((a) => a.startsWith("--url="))?.split("=")[1];
const NAVER_SEARCH_URL =
  cliUrl?.trim() ||
  process.env.NAVER_REFERER?.trim() ||
  "https://search.shopping.naver.com/ns/search?query=iphone";

// Zyte proxy: ambil entri pertama dari PROXIES (kalau ada)
const RAW_PROXY = (process.env.PROXIES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)[0];

let proxyHostPort: string | undefined;
let proxyUser: string | undefined;
let proxyPass: string | undefined;

if (RAW_PROXY) {
  try {
    const u = new URL(RAW_PROXY);
    proxyHostPort = `${u.hostname}:${u.port}`;
    if (u.username) {
      proxyUser = decodeURIComponent(u.username);
      proxyPass = decodeURIComponent(u.password);
    }
  } catch (e) {
    console.warn("[harvester] Ignoring invalid PROXIES entry:", RAW_PROXY, e);
  }
}

(async function main() {
  const launchArgs: string[] = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--ignore-certificate-errors",
  "--ignore-ssl-errors", 
  "--ignore-certificate-errors-spki-list",
  "--disable-web-security",
  "--allow-running-insecure-content",
];
  if (proxyHostPort) launchArgs.push(`--proxy-server=${proxyHostPort}`);

  const browser = await puppeteer.launch({ headless: HEADLESS, args: launchArgs, ignoreHTTPSErrors: true  } as any);
  const page = await browser.newPage();

  // Auth proxy (Zyte)
  if (proxyUser) {
    await page.authenticate({ username: proxyUser!, password: proxyPass ?? "" });
  }

  if (UA) await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ referer: "https://search.shopping.naver.com/" });

  console.log("➡️  Opening:", NAVER_SEARCH_URL);
  try {
    await page.goto(NAVER_SEARCH_URL, { waitUntil: "networkidle2", timeout: 60_000 });
  } catch (error: any) {
    console.log("⚠️  Initial navigation failed, trying with different wait strategy...");
    await page.goto(NAVER_SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }

  // human-ish actions
  await delay(1200 + Math.random() * 800);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
  await delay(600 + Math.random() * 600);

  // (optional) pause for manual login when headful
  if (!HEADLESS) {
    console.log("⏳ If a login prompt appears, please log in. Press ENTER here when finished.");
    await new Promise<void>((res) => {
      process.stdin.resume();
      process.stdin.once("data", () => res());
    });
  }

  // prime token/cookies by calling the API from the page context
  try {
    const urlObj = new URL(NAVER_SEARCH_URL);
    const q = urlObj.searchParams.get("query") || "iphone";
    const apiUrl =
      `https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1&pageSize=10&query=${encodeURIComponent(q)}&searchMethod=all.basic`;
    await page.evaluate(async (api) => { try { await fetch(api, { credentials: "include" }); } catch {} }, apiUrl);
    await delay(800 + Math.random() * 600);
    await page.reload({ waitUntil: "networkidle2" });
  } catch {}

  // capture cookies (HttpOnly included)
  const { header, dump } = await buildCookieHeaderFromCDP(page);
  const cookieHeader = sanitizeCookieLine(header);

  // save
  await fs.writeFile(OUT_COOKIE_TXT, cookieHeader, "utf8");
  await fs.writeFile(OUT_COOKIE_JSON, JSON.stringify(dump, null, 2), "utf8");

  console.log("\n🍪 Cookie captured and saved:");
  console.log("  -", OUT_COOKIE_TXT);
  console.log("  -", OUT_COOKIE_JSON);
  console.log(
    "🔎 Preview:",
    cookieHeader.slice(0, 220) + (cookieHeader.length > 220 ? "..." : "")
  );

  await browser.close();
})().catch(async (err) => {
  console.error("❌ Harvester failed:", err?.message ?? err);
  try { await fs.writeFile(OUT_COOKIE_TXT, "", "utf8"); } catch {}
  process.exit(1);
});