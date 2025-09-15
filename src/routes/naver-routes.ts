import { Router, type Request, type Response } from "express";
import { scrapeNaverApi } from "../services/scraper.service.js";

export const naverRouter = Router();

const NAVER_BASE =
  "https://search.shopping.naver.com/ns/v1/search/paged-composite-cards";

const DEFAULT_PARAMS: Record<string, string> = {
  searchMethod: "all.basic",
  listPage: "1",
  isFreshCategory: "false",
  isOriginalQuerySearch: "false",
  isCatalogDiversifyOff: "false",
  hiddenNonProductCard: "true",
  hasMore: "true",
  hasMoreAd: "true",
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const decodeMaybe = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

function buildFromQuery(qRaw: string, pageSizeRaw?: string, cursorRaw?: string) {
  const query = norm(qRaw);
  const pageSize = clamp(parseInt(pageSizeRaw ?? "50", 10) || 50, 1, 80);
  const cursor = clamp(parseInt(cursorRaw ?? "1", 10) || 1, 1, 1_000_000);
  const params = new URLSearchParams({ query, pageSize: String(pageSize), cursor: String(cursor), ...DEFAULT_PARAMS });
  return { targetUrl: `${NAVER_BASE}?${params.toString()}`, query };
}

function buildFromUrl(urlRaw: string) {
  const u = new URL(decodeMaybe(urlRaw.trim()));
  if (!u.href.startsWith(NAVER_BASE)) {
    throw new Error(`Unsupported upstream URL. Allowed: ${NAVER_BASE}; got: ${u.origin}${u.pathname}`);
  }
  for (const [k, v] of Object.entries(DEFAULT_PARAMS)) {
    if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  }
  const query = u.searchParams.get("query") ?? "";
  return { targetUrl: u.toString(), query };
}

// GET /v1/naver
naverRouter.get("/", async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const urlRaw = typeof req.query.url === "string" ? req.query.url : "";
    const qRaw   = typeof req.query.query === "string" ? req.query.query : "";

    if (!urlRaw && !qRaw) {
      return res.status(400).json({
        error: "Provide either 'query' or 'url'.",
        examples: [
          "/v1/naver?query=iphone",
          "/v1/naver?url=" + encodeURIComponent(`${NAVER_BASE}?cursor=1&pageSize=50&query=iphone&searchMethod=all.basic`),
        ],
      });
    }

    const { targetUrl, query } = urlRaw
      ? buildFromUrl(urlRaw)
      : buildFromQuery(qRaw, req.query.pageSize as string, req.query.cursor as string);

    // panggil scraper (sementara kita pakai stub di service)
    const data = await scrapeNaverApi(targetUrl);
    const took = Date.now() - start;
    if (Math.random() < 0.2) console.log(`✅ 200 | q="${query}" | ${took}ms`);
    return res.json(data);
  } catch (err: any) {
    const took = Date.now() - start;
    console.error(`❌ 502 | ${err?.message ?? err} | ${took}ms`);
    return res.status(502).json({ error: "Failed to fetch from upstream.", details: err?.message ?? String(err) });
  }
});

// GET /v1/naver/_debug/resolve (tanpa pukul upstream)
naverRouter.get("/_debug/resolve", (req, res) => {
  try {
    const urlRaw = typeof req.query.url === "string" ? req.query.url : "";
    const qRaw   = typeof req.query.query === "string" ? req.query.query : "";
    const result = urlRaw
      ? buildFromUrl(urlRaw)
      : buildFromQuery(qRaw, req.query.pageSize as string, req.query.cursor as string);
    return res.json({ ok: true, ...result });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message ?? String(e) });
  }
});
