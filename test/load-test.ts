import axios from "axios";
import * as http from "node:http";
import * as https from "node:https";
import { performance } from "node:perf_hooks";

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m && m[1] !== undefined && m[2] !== undefined) {
  out[m[1]] = m[2];
}
    else if (a.startsWith("--")) out[a.slice(2)] = "true";
  }
  return out;
}

const args = parseArgs(process.argv);

function envStr(name: string, def: string): string {
  return (args[name.toLowerCase()] ?? process.env[name] ?? def) as string;
}

function envNum(name: string, def: number): number {
  const raw = args[name.toLowerCase()] ?? process.env[name];
  if (raw === undefined) return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

const API_BASE_URL: string = envStr("API_BASE_URL", envStr("url", "http://localhost:3030"));
const TOTAL_REQUESTS: number = envNum("TOTAL_REQUESTS", envNum("total", 1000));
const CONCURRENCY: number = envNum("CONCURRENCY", envNum("concurrency", 20));
const TIMEOUT_MS: number = envNum("TIMEOUT_MS", envNum("timeout", 30000));
const WARMUP_REQUESTS: number = envNum("WARMUP_REQUESTS", envNum("warmup", 50));
const JSON_OUT: boolean = (envStr("json", "false").toLowerCase() === "true");

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: TIMEOUT_MS,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: CONCURRENCY }),
  validateStatus: () => true,
  headers: { Connection: "keep-alive" },
});

type Result = { latencyMs: number; status: number; ok: boolean };

async function doRequest(): Promise<Result> {
  const t0 = performance.now();
  try {
    const res = await client.get("/naver", { params: { query: "iphone" } });
    const t1 = performance.now();
    const ok = res.status >= 200 && res.status < 400;
    return { latencyMs: t1 - t0, status: res.status, ok };
  } catch {
    const t1 = performance.now();
    return { latencyMs: t1 - t0, status: 0, ok: false };
  }
}

async function runPool(total: number): Promise<Result[]> {
  const results: Result[] = [];
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= total) break;
      const r = await doRequest();
      results.push(r);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
  await Promise.all(workers);
  return results;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const pp = clamp(p, 0, 1);
  const idx = clamp(Math.floor((n - 1) * pp), 0, n - 1);
  return sortedAsc[idx] ?? 0;
}

function summarize(results: Result[]) {
  const total = results.length;
  const success = results.filter(r => r.ok).length;
  const failure = total - success;
  const errorRate = (failure / total) * 100;

  const lats = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const min = lats[0] ?? 0;
  const p50 = percentile(lats, 0.50);
  const p95 = percentile(lats, 0.95);
  const p99 = percentile(lats, 0.99);
  const max = lats[lats.length - 1] ?? 0;

  const byStatus = results.reduce<Record<string, number>>((acc, r) => {
    const k = String(r.status);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return { total, success, failure, errorRate, min, p50, p95, p99, max, byStatus };
}

(async function main() {
  if (!JSON_OUT) {
    console.log("🚀 Load Test");
    console.log("------------------------------------");
    console.log(` Target API      : ${API_BASE_URL}`);
    console.log(` Total Requests  : ${TOTAL_REQUESTS}`);
    console.log(` Concurrency     : ${CONCURRENCY}`);
    console.log(` Timeout per req : ${TIMEOUT_MS} ms`);
    console.log(` Warm-up requests: ${WARMUP_REQUESTS}`);
    console.log("------------------------------------ ");
  }

  if (WARMUP_REQUESTS > 0) await runPool(WARMUP_REQUESTS);

  const t0 = performance.now();
  const results = await runPool(TOTAL_REQUESTS);
  const t1 = performance.now();

  const elapsedSec = (t1 - t0) / 1000;
  const stats = summarize(results);
  const rps = stats.success / elapsedSec;

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          elapsedSec: Number(elapsedSec.toFixed(2)),
          rps: Number(rps.toFixed(2)),
          ...stats,
        },
        null,
        2
      )
    );
  } else {
    console.log("✅ Tes selesai.");
    console.log(`⏱️ Durasi total     : ${elapsedSec.toFixed(2)} s`);
    console.log(`📈 RPS (approx)     : ${rps.toFixed(2)} req/s`);
    console.log(
      `⏳ Latency (ms)     : min=${stats.min.toFixed(2)} p50=${stats.p50.toFixed(2)} p95=${stats.p95.toFixed(2)} p99=${stats.p99.toFixed(2)} max=${stats.max.toFixed(2)}`
    );
    console.log(`📦 Hasil            : success=${stats.success}/${stats.total} | failure=${stats.failure} | errorRate=${stats.errorRate.toFixed(2)}%`);
    console.log("🔢 Distribusi kode  : ", stats.byStatus);
  }
})().catch((err) => {
  console.error("❌ Load test gagal:", err);
  process.exit(1);
});
