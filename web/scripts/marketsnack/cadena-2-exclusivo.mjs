// PANEL CADENA-STRIKE · paso 2 — ¿QUÉ TIENE EL SNAPSHOT QUE NO TENGA EL FEED?
// El feed que tenemos bajado lleva piso de $100k. El snapshot no tiene piso.
// Si el snapshot es MUCHO más grande, la parte exclusiva es la cinta pequeña — la que
// ningún filtro de "unusual" deja ver.
import fs from "node:fs"; import zlib from "node:zlib"; import path from "node:path"; import readline from "node:readline";

const DIA = "2026-08-19";
const DIRC = `scripts/cache-theta/marketsnack/aux/cadenas/${DIA}`;

// ── snapshot: prima por contrato
const snap = new Map();          // symbol -> {prima, ask, bid, mid, single, multi, other, vol, oi}
for (const f of fs.readdirSync(DIRC)) {
  for (const c of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIRC, f))).toString())) {
    const b = c.premium_breakdown ?? {}, l = c.legs_premium ?? {};
    snap.set(c.symbol, { prima: c.premium_traded ?? 0, ask: b.ask ?? 0, bid: b.bid ?? 0, mid: b.mid ?? 0,
      single: l.single ?? 0, multi: l.multi ?? 0, other: l.other ?? 0, vol: c.volume ?? 0, oi: c.open_interest ?? 0 });
  }
}

// ── feed: prima por contrato ese día (piso $100k)
const feed = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(`scripts/cache-theta/marketsnack/flujo-100k/${DIA}.jsonl.gz`).pipe(zlib.createGunzip()), crlfDelay: Infinity });
let nFeed = 0;
for await (const linea of rl) {
  if (!linea.trim()) continue;
  const t = JSON.parse(linea); nFeed++;
  feed.set(t.symbol, (feed.get(t.symbol) ?? 0) + (t.premium ?? 0));
}

// sólo comparamos los contratos que el snapshot cubre (25 tickers × 6 vencimientos)
let sSnap = 0, sFeed = 0, conAmbos = 0, soloSnap = 0, primaSoloSnap = 0;
for (const [sym, s] of snap) {
  if (s.prima <= 0) continue;
  sSnap += s.prima;
  const f = feed.get(sym);
  if (f) { conAmbos++; sSnap; sFeed += f; } else { soloSnap++; primaSoloSnap += s.prima; }
}
const M = (x) => "$" + (x / 1e6).toFixed(1) + "M";
console.log(`═══ SNAPSHOT vs FEED · ${DIA} · sólo los contratos que el snapshot cubre ═══\n`);
console.log(`   feed bajado ese día (piso $100k)          ${nFeed.toLocaleString("es-ES")} prints`);
console.log(`   contratos con prima en el snapshot        ${[...snap.values()].filter(s=>s.prima>0).length.toLocaleString("es-ES")}`);
console.log(`   · de ellos, TAMBIÉN en el feed            ${conAmbos.toLocaleString("es-ES")}`);
console.log(`   · SÓLO en el snapshot (ningún print ≥100k) ${soloSnap.toLocaleString("es-ES")}  →  ${M(primaSoloSnap)} de prima invisible para el feed`);
console.log(`\n   prima total snapshot   ${M(sSnap)}`);
console.log(`   prima total feed       ${M(sFeed)}   (${(100*sFeed/sSnap).toFixed(1)}% del snapshot)`);
console.log(`   ⇒ el snapshot ve ${(sSnap/Math.max(sFeed,1)).toFixed(1)}× la prima que ve el feed con piso de $100k.`);

// ── ¿y el eje de patas? el feed lo puede clasificar por trade_condition_id. ¿coinciden?
console.log(`\n═══ EL EJE DE PATAS — el snapshot ya lo trae hecho, sin piso de prima ═══`);
let tS=0,tM=0,tO=0;
for (const s of snap.values()) { tS+=s.single; tM+=s.multi; tO+=s.other; }
const tt=tS+tM+tO;
console.log(`   single ${(100*tS/tt).toFixed(1)}%  ·  multi ${(100*tM/tt).toFixed(1)}%  ·  other ${(100*tO/tt).toFixed(1)}%   (por PRIMA, todo el flujo del día)`);
console.log(`   recordatorio: en el feed ≥$100k, multi-pata era el 56,5% de los PRINTS.`);

let aA=0,aB=0,aM=0;
for (const s of snap.values()) { aA+=s.ask; aB+=s.bid; aM+=s.mid; }
const at=aA+aB+aM;
console.log(`\n═══ EL EJE DE LADO — prima al ask / bid / medio, sin piso ═══`);
console.log(`   ask ${(100*aA/at).toFixed(1)}%  ·  bid ${(100*aB/at).toFixed(1)}%  ·  mid ${(100*aM/at).toFixed(1)}%`);
