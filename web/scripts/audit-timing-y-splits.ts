// AUDITORIA 4 (solo lectura). Dos fallos silenciosos sobre eva-largo-filas.json:
//   1) timingScore(f.ts + "Z"): ¿es `ts` hora ET o UTC? Si es ET, el "+Z" la corre 4-5 horas.
//   2) Splits: filas cuya ventana cruza el 10:1 de NVDA (2024-06-10) en el fichero YA GENERADO.
// Uso: npx tsx scripts/audit-timing-y-splits.ts
import { readFileSync } from "node:fs";
import {
  volumeScore, timingScore, repetitionScore, spreadScore, dominanceScore,
  executionLevel, executionScore, orderSizeScore,
} from "../lib/flow";
import { EVA_WEIGHTS } from "../lib/scorecardEva";

const filas: any[] = JSON.parse(readFileSync(process.env.EVA_LARGO_FILAS || "scripts/eva-largo-filas.json", "utf8"));
const media = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const sd = (x: number[]) => { const m = media(x); return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1)); };
const t1 = (x: number[]) => media(x) / (sd(x) / Math.sqrt(x.length));
const pct = (v: number) => (v * 100).toFixed(2) + "%";

// ── 1. ¿ES `ts` HORA ET? ─────────────────────────────────────────────────────
console.log("=== 1. LA HORA ===");
const horas = filas.map((f) => Number(String(f.ts).slice(11, 13)));
const min = Math.min(...horas), max = Math.max(...horas);
console.log(`  rango horario literal de ts: ${min}h .. ${max}h`);
console.log(`  si ts fuera UTC, la sesion 09:30-16:00 ET apareceria como 13h..20h (EDT) o 14h..21h (EST)`);
console.log(`  si ts es ET, aparece como 9h..15h  -> observado: ${min}h..${max}h  => ts es ${min <= 10 && max <= 16 ? "HORA ET (el sufijo Z es un BUG)" : "UTC"}`);
// primeros/ultimos minutos del dia
const hm = filas.map((f) => String(f.ts).slice(11, 16)).sort();
console.log(`  minimo hh:mm = ${hm[0]} · maximo hh:mm = ${hm[hm.length - 1]}`);

const timingCorrecto = (ts: string) => {
  const m = Number(ts.slice(11, 13)) * 60 + Number(ts.slice(14, 16));   // ya es ET
  if (m >= 660 && m <= 780) return 10;
  if (m >= 570 && m <= 630) return 7;
  if (m >= 900 && m <= 960) return 6;
  return 3;
};
const conZ = filas.map((f) => timingScore(f.ts + "Z"));
const bien = filas.map((f) => timingCorrecto(f.ts));
const rep = (v: number[]) => { const m = new Map<number, number>(); for (const x of v) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}:${((n / v.length) * 100).toFixed(1)}%`).join("  "); };
console.log(`  timingScore CON el "+Z" (lo que corre): ${rep(conZ)}`);
console.log(`  timingScore con la hora ET real:        ${rep(bien)}`);
console.log(`  filas con puntuacion de hora distinta: ${conZ.filter((v, i) => v !== bien[i]).length} de ${filas.length} (${((conZ.filter((v, i) => v !== bien[i]).length / filas.length) * 100).toFixed(1)}%)`);

// ── EVA con y sin el bug ─────────────────────────────────────────────────────
const veces = new Map<string, number>();
for (const f of filas) { const k = `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`; veces.set(k, (veces.get(k) ?? 0) + 1); }
const w = EVA_WEIGHTS as unknown as Record<string, number>;
const usados = w.aggression + w.conviction + w.unusuality;
function eva(f: any, tScore: number): number {
  const r = veces.get(`${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`) ?? 1;
  const anchoPct = f.askOper > 0 ? (100 * (f.askOper - f.bidOper)) / ((f.askOper + f.bidOper) / 2) : null;
  const agres = media([executionScore(executionLevel(f.precioOper, f.bidOper, f.askOper, "unclear")), orderSizeScore(f.prima)]);
  const conv = media([spreadScore(anchoPct), dominanceScore(f.oi > 0 ? Math.min(100, (100 * f.size) / f.oi) : 0)]);
  const inus = media([volumeScore(f.size, f.prima), tScore, repetitionScore(r)]);
  return (agres * w.aggression + conv * w.conviction + inus * w.unusuality) / usados;
}
const evaBug = filas.map((f, i) => eva(f, conZ[i]));
const evaOk = filas.map((f, i) => eva(f, bien[i]));
const rank = (v: number[]) => { const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); idx.forEach(([, i], p) => (r[i] = p)); return r; };
const rB = rank(evaBug), rO = rank(evaOk);
const mB = media(rB), mO = media(rO);
const cov = media(rB.map((x, i) => (x - mB) * (rO[i] - mO)));
const spearman = cov / (sd(rB) * sd(rO)) * (filas.length / (filas.length - 1));
console.log(`  correlacion de rangos (Spearman) entre el EVA que corre y el EVA con la hora bien: ${spearman.toFixed(4)}`);
// ¿cambia el tercio alto?
const tercioAlto = (v: number[]) => { const k = Math.floor(filas.length / 3); return new Set(v.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]).slice(0, k).map(([, i]) => i)); };
const tA = tercioAlto(evaBug), tB = tercioAlto(evaOk);
let comun = 0; for (const i of tA) if (tB.has(i)) comun++;
console.log(`  el TERCIO ALTO de EVA (el que decide la separacion) comparte ${comun} de ${tA.size} filas (${((comun / tA.size) * 100).toFixed(1)}%) entre las dos versiones`);
// separacion de EVA a 30d con una y otra
for (const [nombre, v] of [["EVA que corre (hora mal)", evaBug], ["EVA con la hora bien", evaOk]] as const) {
  for (const H of [30, 180]) {
    const con = filas.map((f, i) => ({ d: f.h[H]?.d, k: v[i] })).filter((x) => x.d != null);
    const ord = con.sort((a, b) => b.k - a.k); const k = Math.floor(ord.length / 3);
    const alto = ord.slice(0, k).map((x) => x.d as number), bajo = ord.slice(-k).map((x) => x.d as number);
    const se = Math.sqrt(sd(alto) ** 2 / alto.length + sd(bajo) ** 2 / bajo.length);
    console.log(`    ${nombre} · ${H}d: separacion alto-bajo = ${pct(media(alto) - media(bajo))}  t=${((media(alto) - media(bajo)) / se).toFixed(2)}`);
  }
}

// ── 2. SPLITS EN EL FICHERO YA GENERADO ──────────────────────────────────────
console.log("\n=== 2. EL SPLIT 10:1 DE NVDA (2024-06-10) EN LAS FILAS ENTREGADAS ===");
for (const H of [30, 90, 180, 365]) {
  const con = filas.filter((f) => f.h[H]);
  const cruza = con.filter((f) => f.ticker === "NVDA" && f.dia < "20240610" && f.h[H].diaSal >= "20240610");
  const resto = con.filter((f) => !(f.ticker === "NVDA" && f.dia < "20240610" && f.h[H].diaSal >= "20240610"));
  if (!cruza.length) { console.log(`  ${H}d: ninguna fila cruza`); continue; }
  const ausCruza = cruza.filter((f) => f.h[H].ausenteT).length / cruza.length;
  const ausResto = resto.filter((f) => f.h[H].ausenteT).length / resto.length;
  const rCruza = media(cruza.map((f) => f.h[H].t));
  const rResto = media(resto.map((f) => f.h[H].t));
  console.log(`  ${String(H).padStart(3)}d  cruzan=${String(cruza.length).padStart(4)} (${((cruza.length / con.length) * 100).toFixed(1)}%)  ` +
    `tratamiento a cero: ${(ausCruza * 100).toFixed(1)}% vs ${(ausResto * 100).toFixed(1)}% en el resto  |  ` +
    `retorno flujo ${pct(rCruza)} vs ${pct(rResto)}  |  DIF cruzan=${pct(media(cruza.map((f) => f.h[H].d)))} resto=${pct(media(resto.map((f) => f.h[H].d)))}`);
  const dR = resto.map((f) => f.h[H].d);
  console.log(`         total publicado DIF=${pct(media(con.map((f) => f.h[H].d)))} t=${t1(con.map((f) => f.h[H].d)).toFixed(2)}   ->  quitando las que cruzan: DIF=${pct(media(dR))} t=${t1(dR).toFixed(2)}`);
}
