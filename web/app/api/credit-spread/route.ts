// GET /api/credit-spread — sirve el ledger del forward-test (paper) + estadísticas.
// Fuente: Redis en vivo (forward:ledger, lo que actualiza el cron de Railway) con
// fallback al JSON semilla committeado. 100% papel — no ejecuta nada.

import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Redis from "ioredis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Trade {
  id: string; ticker: string; entryDate: string; entryMs: number;
  dte: number; sigma: number; dir: 1 | -1; type: "put" | "call";
  spot: number; rv: number; shortK: number; longK: number; width: number;
  credit: number; netCredit: number; expiryMs: number; expiryDate: string;
  evaComp: number; victorComp: number;
  status: "open" | "closed";
  exitDate?: string; exitSpot?: number; retOnRisk?: number; pnlPerSpread?: number;
}

const REDIS_KEY = process.env.FWD_REDIS_KEY || "forward:ledger";

async function loadFromRedis(): Promise<Trade[] | null> {
  if (!process.env.REDIS_URL) return null;
  let redis: Redis | null = null;
  try {
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2500, lazyConnect: true });
    await redis.connect();
    const raw = await redis.get(REDIS_KEY);
    return raw ? (JSON.parse(raw) as Trade[]) : null;
  } catch {
    return null; // Redis no disponible o key vacía → caemos al archivo
  } finally {
    try { await redis?.quit(); } catch { /* noop */ }
  }
}

function loadFromFile(): Trade[] {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "data/forward/ledger.json"), "utf8")) as Trade[];
  } catch {
    return [];
  }
}

function stat(v: number[]) {
  if (!v.length) return { n: 0, win: null as number | null, mean: null as number | null, median: null as number | null };
  const s = [...v].sort((a, b) => a - b);
  return {
    n: s.length,
    win: Math.round((s.filter((x) => x > 0).length / s.length) * 100),
    mean: Math.round((s.reduce((a, x) => a + x, 0) / s.length) * 10) / 10,
    median: Math.round(s[Math.floor(s.length / 2)] * 10) / 10,
  };
}

export async function GET() {
  const redisLedger = await loadFromRedis();
  const source = redisLedger ? "redis" : "file";
  const ledger = redisLedger ?? loadFromFile();

  const open = ledger.filter((t) => t.status === "open");
  const closed = ledger.filter((t) => t.status === "closed");
  const closedRet = closed.map((t) => t.retOnRisk).filter((x): x is number => x != null);

  // El FILTRO de EVA: Top⅓ vs Bottom⅓ por convicción, sobre las cerradas.
  const k = Math.max(1, Math.floor(closed.length / 3));
  const byEva = [...closed].sort((a, b) => a.evaComp - b.evaComp);
  const topEva = byEva.slice(closed.length - k).map((t) => t.retOnRisk).filter((x): x is number => x != null);
  const botEva = byEva.slice(0, k).map((t) => t.retOnRisk).filter((x): x is number => x != null);

  // Por celda (plazo @ distancia).
  const cellKeys = Array.from(new Set(ledger.map((t) => `${t.dte}@${t.sigma}`)));
  const cells = cellKeys.map((key) => {
    const [dte, sigma] = key.split("@").map(Number);
    const cc = closed.filter((t) => t.dte === dte && t.sigma === sigma);
    return { key, dte, sigma, stat: stat(cc.map((t) => t.retOnRisk).filter((x): x is number => x != null)) };
  }).sort((a, b) => a.dte - b.dte || a.sigma - b.sigma);

  const trades = [...ledger]
    .sort((a, b) => (a.status === b.status ? b.entryMs - a.entryMs : a.status === "open" ? -1 : 1))
    .map((t) => ({
      id: t.id, ticker: t.ticker, entryDate: t.entryDate, dte: t.dte, sigma: t.sigma,
      dir: t.dir, type: t.type, evaComp: t.evaComp, status: t.status,
      expiryDate: t.expiryDate, retOnRisk: t.retOnRisk ?? null, exitDate: t.exitDate ?? null,
      shortK: t.shortK, longK: t.longK, spot: t.spot, netCredit: t.netCredit, width: t.width,
    }));

  return NextResponse.json({
    source,
    counts: { total: ledger.length, open: open.length, closed: closed.length },
    overall: stat(closedRet),
    filter: { top: stat(topEva), bottom: stat(botEva) },
    cells,
    trades,
  });
}
