import express from "express";
import dotenv from "dotenv";
// ⚠️ Pastikan *nama file* router kamu sesuai baris di bawah ini.
// Jika file kamu bernama "naver-routes.ts", ubah import jadi:
//   import { naverRouter } from "./routes/naver-routes.js";
import { naverRouter } from "./routes/naver-routes.js";
import { scrapeNaverApi } from "./services/scraper.service.js";
import axios from "axios";
import https from "https";
import path from "node:path";
import fs from "node:fs/promises";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? "3000");

app.disable("x-powered-by");
app.use(express.json());

// Logger SEDERHANA — taruh SEBELUM routes
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

// Helper: pick first proxy (or empty)
function pickProxy(): string | undefined {
  const list = (process.env.PROXIES ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return list[0];
}

// Helper: build axios client with proxy (no keepalive tricks)
function buildRawClient(proxyUrl?: string) {
  const cfg: any = {
    timeout: Number(process.env.UPSTREAM_TIMEOUT_MS ?? "3000"),
    maxRedirects: 0,
    validateStatus: () => true,
    // keep-alive optional (bisa dimatikan untuk debug)
    httpsAgent: new https.Agent({ keepAlive: false })
  };

  if (proxyUrl) {
    try {
      const u = new URL(proxyUrl);
      cfg.proxy = {
        host: u.hostname,
        port: Number(u.port || 80),
        protocol: u.protocol.replace(":", ""),
        auth: u.username ? { username: u.username, password: u.password } : undefined,
      };
    } catch {
      // ignore invalid proxy
    }
  } else {
    // Explicitly disable axios' proxy feature if none
    cfg.proxy = false;
  }

  return axios.create(cfg);
}

// Helper: read cookie from env or file
async function getCookieLine(): Promise<string> {
  let cookie = process.env.NAVER_COOKIE ?? "";
  if (!cookie) {
    try {
      cookie = (await fs.readFile(path.join(process.cwd(), "session.cookie"), "utf8")).trim();
    } catch {}
  }
  return cookie;
}

// 1) PROXY CONNECTIVITY CHECK
app.get("/_debug/proxy-ip", async (_req, res) => {
  const proxy = pickProxy();
  const client = buildRawClient(proxy);

  const t0 = Date.now();
  try {
    const r = await client.get("https://httpbin.org/ip");
    const tookMs = Date.now() - t0;
    return res.json({
      ok: r.status >= 200 && r.status < 400,
      status: r.status,
      tookMs,
      proxyUsed: proxy ?? null,
      body: r.data,
      hint: "If this hangs or errors, your proxy credentials/connectivity are the problem."
    });
  } catch (e: any) {
    const tookMs = Date.now() - t0;
    return res.status(500).json({
      ok: false,
      tookMs,
      proxyUsed: proxy ?? null,
      error: e?.message ?? String(e),
      code: e?.code,
      errno: e?.errno,
    });
  }
});

// 2) COOKIE PREVIEW (tetap ada)
app.get("/_debug/cookie", async (_req, res) => {
  const line = await getCookieLine();
  res.json({ length: line.length, preview: line.slice(0, 160) });
});

// 3) RAW UPSTREAM (BYPASS SEMUA HELPER)
app.get("/_debug/upstream_raw", async (req, res) => {
  const q = (req.query.query as string) || "iphone";
  const pageSize = String(req.query.pageSize ?? "5");
  const cursor = String(req.query.cursor ?? "1");
  const proxy = pickProxy();
  const client = buildRawClient(proxy);

  // default params “lengkap” agar tidak 404
  const params = new URLSearchParams({
    query: q,
    pageSize,
    cursor,
    searchMethod: "all.basic",
    listPage: "1",
    isFreshCategory: "false",
    isOriginalQuerySearch: "false",
    isCatalogDiversifyOff: "false",
    hiddenNonProductCard: "true",
    hasMore: "true",
    hasMoreAd: "true",
  });

  const url = "https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?" + params.toString();

  // headers minimal yang penting
  const cookie = await getCookieLine();
  if (!cookie) {
    return res.status(400).json({ error: "Missing cookie. Run harvester or set NAVER_COOKIE." });
  }
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9,id;q=0.8",
    cookie,
    referer: process.env.NAVER_REFERER || "https://search.shopping.naver.com/",
    "user-agent": process.env.NAVER_USER_AGENT || "Mozilla/5.0",
    "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Microsoft Edge";v="140"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    connection: "keep-alive",
  };

  const t0 = Date.now();
  try {
    const resp = await client.get(url, { headers });
    const tookMs = Date.now() - t0;
    return res.json({
      ok: resp.status >= 200 && resp.status < 400,
      status: resp.status,
      tookMs,
      proxyUsed: proxy ?? null,
      url,
      dataType: typeof resp.data,
      length: typeof resp.data === "string" ? resp.data.length : undefined,
      hint: "200–399 = OK; 403/429 = cookie/proxy throttled; 404 = add params; timeout/E... = proxy connectivity."
    });
  } catch (e: any) {
    const tookMs = Date.now() - t0;
    return res.status(500).json({
      ok: false,
      tookMs,
      proxyUsed: proxy ?? null,
      url,
      error: e?.message ?? String(e),
      code: e?.code,
      errno: e?.errno,
    });
  }
});

app.get("/_debug/upstream", async (req, res) => {
  const q = (req.query.query as string) || "iphone";
  const pageSize = (req.query.pageSize as string) || "5";
  const cursor = (req.query.cursor as string) || "1";

  const params = new URLSearchParams({
    query: q,
    pageSize,
    cursor,
    searchMethod: "all.basic",
    listPage: "1",
    isFreshCategory: "false",
    isOriginalQuerySearch: "false",
    isCatalogDiversifyOff: "false",
    hiddenNonProductCard: "true",
    hasMore: "true",
    hasMoreAd: "true",
  });

  const url =
    "https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?" +
    params.toString();

  const start = Date.now();
  try {
    const data = await scrapeNaverApi(url);
    const tookMs = Date.now() - start;
    res.json({ status: 200, tookMs, url, dataPreview: JSON.stringify(data).slice(0, 200) + "..." });
  } catch (err: any) {
    const tookMs = Date.now() - start;
    res.json({
      status: 502,
      tookMs,
      url,
      error: err?.message ?? String(err),
    });
  }
});

app.get("/_debug/cookie", async (_req, res) => {
  const fs = await import("node:fs/promises");
  let line = process.env.NAVER_COOKIE ?? "";
  if (!line) {
    try {
      line = await fs.readFile("session.cookie", "utf8");
    } catch {}
  }
  res.json({
    length: line?.length ?? 0,
    preview: (line || "").slice(0, 150),
  });
});

// Health + root info
app.get("/", (_req, res) =>
  res.type("text").send("Naver Scraper API is running. Try /naver?query=iphone")
);
app.get("/health", (_req, res) => res.json({ ok: true }));

// Mount router versi v1
app.use("/naver", naverRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

// Global error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
