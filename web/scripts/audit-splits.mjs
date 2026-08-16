// AUDITORÍA 2 — ¿hay SPLITS dentro de la ventana medida, y qué hacen con los "ausentes"?
// Solo lectura. Uso: node --max-old-space-size=6144 scripts/audit-splits.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const FILAS = process.env.EVA_LARGO_FILAS || "scripts/eva-largo-filas.json";
const HOR = [30, 90, 180, 365];

const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);
const sinG = (s) => String(s).replace(/-/g, "");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const tCero = (v) => { const m = media(v); const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); return m / (sd / Math.sqrt(v.length)); };
const pct = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2)}%`;

// ── A. DETECTOR DE SPLITS: strike mediano por día, buscar saltos de ~x10 o /10 ──
console.log("═══ A. Detector de splits sobre las propias cadenas (mediana de strikes por día) ═══\n");
const porSym = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  (porSym.get(m[1]) ?? porSym.set(m[1], []).get(m[1])).push(m[2]);
}
const splits = [];
for (const [sym, dias] of porSym) {
  dias.sort();
  let prev = null, prevDia = null;
  for (const d of dias) {
    const j = JSON.parse(readFileSync(`${CDIR}/${sym}_d${d}.json`, "utf8"));
    const ks = [];
    for (const g of Object.values(j)) for (const k of Object.keys(g)) ks.push(Number(k.split("|")[0]));
    if (!ks.length) continue;
    ks.sort((a, b) => a - b);
    const med = ks[ks.length >> 1];
    if (prev != null) {
      const r = med / prev;
      if (r < 0.5 || r > 2) { splits.push({ sym, de: prevDia, a: d, medAntes: prev, medDespues: med, ratio: r }); }
    }
    prev = med; prevDia = d;
  }
}
if (!splits.length) console.log("  ninguno");
for (const s of splits) console.log(`  ${s.sym}  ${s.de} → ${s.a}   mediana de strike ${s.medAntes} → ${s.medDespues}   (x${s.ratio.toFixed(3)})`);

// ── B. Filas que CRUZAN un split ────────────────────────────────────────────
const filas = JSON.parse(readFileSync(FILAS, "utf8"));
console.log(`\n\n═══ B. Filas que cruzan un split (entrada antes, venta después) ═══\n`);
const cruza = (f, H) => {
  const m = f.h[H]; if (!m) return null;
  for (const s of splits) if (s.sym === f.ticker && ms(f.dia) < ms(s.a) && ms(m.diaSal) >= ms(s.a)) return s;
  return null;
};
console.log("horiz     n total   n cruzan   %      dif media(cruzan)   dif media(resto)   t(resto)   DIF GLOBAL → SIN CRUCE");
for (const H of HOR) {
  const con = filas.filter((f) => f.h[H]);
  if (!con.length) continue;
  const c = [], r = [];
  for (const f of con) (cruza(f, H) ? c : r).push(f.h[H].d);
  console.log(`${String(H).padStart(4)}d ${String(con.length).padStart(8)} ${String(c.length).padStart(10)} ${((c.length / con.length) * 100).toFixed(2).padStart(6)}%  ` +
    `${(c.length ? pct(media(c)) : "—").padStart(15)}   ${pct(media(r)).padStart(14)}   ${tCero(r).toFixed(2).padStart(7)}   ` +
    `${pct(media(con.map((f) => f.h[H].d)))} → ${pct(media(r))}`);
}

// ── C. Los retornos DISPARATADOS que produce el cruce ───────────────────────
console.log("\n\n═══ C. Retornos extremos (¿el strike viejo choca con uno nuevo?) ═══\n");
for (const H of HOR) {
  const con = filas.filter((f) => f.h[H]);
  if (!con.length) continue;
  const cru = con.filter((f) => cruza(f, H));
  const res = con.filter((f) => !cruza(f, H));
  const q = (arr, sel) => { const v = arr.map(sel).sort((a, b) => a - b); return v.length ? `min ${pct(v[0])} p50 ${pct(v[v.length >> 1])} max ${pct(v[v.length - 1])}` : "—"; };
  console.log(`${String(H).padStart(4)}d  CRUZAN  n=${String(cru.length).padStart(5)}  tratamiento: ${q(cru, (f) => f.h[H].t)}`);
  console.log(`        CRUZAN            control:     ${q(cru, (f) => f.h[H].c)}`);
  console.log(`        RESTO   n=${String(res.length).padStart(5)}  tratamiento: ${q(res, (f) => f.h[H].t)}`);
}

// ── D. ¿Cuántas filas que cruzan tienen d ≈ 0 exacto (todo el cubo desapareció)? ──
console.log("\n\n═══ D. Filas que cruzan: reparto de la diferencia ═══\n");
for (const H of HOR) {
  const cru = filas.filter((f) => f.h[H] && cruza(f, H));
  if (!cru.length) continue;
  const cero = cru.filter((f) => Math.abs(f.h[H].d) < 1e-9).length;
  const tMenos1 = cru.filter((f) => Math.abs(f.h[H].t + 1) < 1e-9).length;
  const grandes = cru.filter((f) => Math.abs(f.h[H].d) > 1).length;
  const ausTodoC = cru.filter((f) => f.h[H].ausentesC === f.h[H].n).length;
  console.log(`${String(H).padStart(4)}d n=${String(cru.length).padStart(5)} · d==0 exacto: ${cero} · tratamiento=−100%: ${tMenos1} · |d|>100%: ${grandes} · cubo entero ausente: ${ausTodoC}`);
}

// ── E. Ejemplos concretos del disparate ────────────────────────────────────
console.log("\n\n═══ E. 12 ejemplos de filas que cruzan el split, ordenadas por |d| ═══\n");
const ej = filas.filter((f) => f.h[180] && cruza(f, 180)).sort((a, b) => Math.abs(b.h[180].d) - Math.abs(a.h[180].d)).slice(0, 12);
for (const f of ej) {
  const m = f.h[180];
  console.log(`  ${f.ticker} ent ${f.dia} ask ${String(f.askEnt).padStart(8)} exp ${sinG(f.exp)} K ${String(f.strike).padStart(7)} ${f.right} · vender ${m.diaSal}` +
    ` → t=${pct(m.t).padStart(12)} c=${pct(m.c).padStart(10)} d=${pct(m.d).padStart(12)} (cubo ${m.n}, ausC ${m.ausentesC})`);
}

// ── F. Verificación directa en las cadenas: ¿existe el strike viejo después? ──
console.log("\n\n═══ F. Comprobación en disco: strike pre-split buscado en la cadena post-split ═══\n");
for (const s of splits) {
  const antes = JSON.parse(readFileSync(`${CDIR}/${s.sym}_d${s.de}.json`, "utf8"));
  const despues = JSON.parse(readFileSync(`${CDIR}/${s.sym}_d${s.a}.json`, "utf8"));
  const expsComunes = Object.keys(antes).filter((e) => despues[e]);
  let existe = 0, no = 0, colision = [];
  for (const e of expsComunes) {
    for (const k of Object.keys(antes[e])) {
      if (despues[e][k]) { existe++; if (colision.length < 6) colision.push({ e, k, antes: antes[e][k], despues: despues[e][k] }); }
      else no++;
    }
  }
  console.log(`  ${s.sym} ${s.de}→${s.a}: de ${existe + no} contratos del día anterior, ${no} NO existen al siguiente (${((no / (existe + no)) * 100).toFixed(1)}%), ${existe} sí "existen" (mismo strike, otro subyacente):`);
  for (const c of colision) console.log(`     exp ${c.e} ${c.k}  [bid,ask] antes ${JSON.stringify(c.antes)} → después ${JSON.stringify(c.despues)}`);
}
