// TENDENCIA-OTRA-VEZ · PASO 5 — los controles: azar, tercios, meseta y la caja de Lester.
import { readFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos.ts";

const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json", "utf8"));
const { tabla, baseA, baseB, baseT, nReglas } = JSON.parse(readFileSync("scripts/tend-rejilla.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const A = filas.filter((f) => f.fecha < "2024-01-01"), B = filas.filter((f) => f.fecha >= "2024-01-01");
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
const pc = (x) => `${(x * 100).toFixed(0)}%`;
const T = tabla.filter((t) => !t.fam.startsWith("pct"));

const P = (v, q) => v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * q)))];
function met(per, mask) {
  const pls = []; let acum = 0, pico = 0, peor = 0;
  for (let i = 0; i < per.length; i++) {
    const p = mask[i] ? per[i].pl : 0; if (mask[i]) pls.push(per[i].pl);
    acum += p; pico = Math.max(pico, acum); peor = Math.min(peor, acum - pico);
  }
  const ord = [...pls].sort((a, b) => a - b), k5 = Math.max(1, Math.floor(pls.length * 0.05));
  return { nOp: pls.length, pctOp: pls.length / per.length, total: pls.reduce((a, b) => a + b, 0),
           ano: pls.reduce((a, b) => a + b, 0) / (per.length / 252), peorRacha: peor,
           peorDia: ord[0] ?? 0, p1: P(ord, 0.01), p5: P(ord, 0.05),
           es5: ord.slice(0, k5).reduce((a, b) => a + b, 0) / k5,
           n2000: pls.filter((x) => x <= -2000).length, n4000: pls.filter((x) => x <= -4000).length };
}
// reconstruir la función de una regla desde su id
function fn(id) {
  let m;
  if ((m = id.match(/^MA(\d+) ≥ (-?[\d.]+)%$/))) { const N=+m[1],u=+m[2]; return (x)=>x["d"+N]*100>=u; }
  if ((m = id.match(/^MA(\d+) ≤ (-?[\d.]+)%$/))) { const N=+m[1],u=+m[2]; return (x)=>x["d"+N]*100<=u; }
  if ((m = id.match(/^MA(\d+) en \[(-?[\d.]+)%,(-?[\d.]+)%\]$/))) { const N=+m[1],lo=+m[2],hi=+m[3]; return (x)=>{const d=x["d"+N]*100; return d>=lo&&d<=hi;}; }
  if ((m = id.match(/^MA(\d+) ≥ (-?[\d.]+)σ$/))) { const N=+m[1],u=+m[2]; return (x)=>x["s"+N]>=u; }
  if ((m = id.match(/^MA(\d+) ≤ (-?[\d.]+)σ$/))) { const N=+m[1],u=+m[2]; return (x)=>x["s"+N]<=u; }
  throw new Error("id no reconocido: " + id);
}

// ── LOS 84 SUPERVIVIENTES DEL BARRIDO ──
const surv = T.filter((t) =>
  t.A.peorRacha >= baseA.peorRacha * 0.75 && t.B.peorRacha >= baseB.peorRacha * 0.75 &&
  t.A.pctOp >= 0.4 && t.B.pctOp >= 0.4 &&
  t.A.ano >= baseA.ano - 2000 && t.B.ano >= baseB.ano - 2000);
console.log(`═══ LOS ${surv.length} SUPERVIVIENTES — ¿región o puntos sueltos? ═══`);
const porFam = {}, porN = {};
for (const t of surv) { porFam[t.fam] = (porFam[t.fam] ?? 0) + 1; porN["MA" + t.N] = (porN["MA" + t.N] ?? 0) + 1; }
console.log("  por familia:", JSON.stringify(porFam));
console.log("  por media  :", JSON.stringify(porN));

// ── LA MESETA: barrido del umbral para las medias que aparecen ──
console.log(`\n═══ ¿MESETA O PICO? — el umbral "≥ u%" barrido entero ═══`);
for (const N of [20, 25, 50, 100, 200]) {
  const fila = [];
  for (let u = -3; u <= 4.0001; u += 0.5) {
    const t = T.find((x) => x.id === `MA${N} ≥ ${+u.toFixed(2)}%`); if (!t) continue;
    fila.push(`${u >= 0 ? "+" : ""}${u.toFixed(1)}: A ${Math.round(t.A.peorRacha/1000)}k/${Math.round(t.A.ano/1000)}k B ${Math.round(t.B.peorRacha/1000)}k/${Math.round(t.B.ano/1000)}k`);
  }
  console.log(`  MA${N} (racha/ingreso en miles):`); console.log("    " + fila.join(" · "));
}

// ── EL CONTROL DEL AZAR: quitar el MISMO número de días, 500 sorteos ──
function azar(per, nOp, sorteos = 500) {
  const res = [];
  const idx = per.map((_, i) => i);
  for (let s = 0; s < sorteos; s++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const mask = new Array(per.length).fill(false);
    for (let i = 0; i < nOp; i++) mask[idx[i]] = true;
    res.push(met(per, mask));
  }
  return res;
}
const percentilDe = (arr, v) => arr.filter((x) => x < v).length / arr.length;

const CANDIDATAS = ["MA50 ≥ 1%", "MA25 en [1.5%,5%]", "MA100 ≥ 2%",
                    ...surv.slice().sort((x,y)=>(y.A.ano+y.B.ano)-(x.A.ano+x.B.ano)).slice(0,5).map(t=>t.id)];
const yaVisto = new Set();
console.log(`\n═══ CONTROL DEL AZAR — 500 sorteos quitando el MISMO número de días ═══`);
console.log("  | regla | período | opera | racha regla | racha azar (mediana) | pctl racha | $/año regla | $/año azar | pctl $/año |");
console.log("  |---|---|---|---|---|---|---|---|---|");
const detalle = {};
for (const id of CANDIDATAS) {
  if (yaVisto.has(id)) continue; yaVisto.add(id);
  const f = fn(id); detalle[id] = {};
  for (const [et, per] of [["A 22-23", A], ["B 24-26", B]]) {
    const mask = per.map(f), m = met(per, mask);
    const sorteos = azar(per, m.nOp);
    const rachas = sorteos.map((x) => x.peorRacha).sort((a, b) => a - b);
    const anos = sorteos.map((x) => x.ano).sort((a, b) => a - b);
    const pR = percentilDe(rachas, m.peorRacha), pI = percentilDe(anos, m.ano);
    detalle[id][et] = { m, pR, pI, medRacha: P(rachas, 0.5), medAno: P(anos, 0.5) };
    console.log(`  | ${id} | ${et} | ${pc(m.pctOp)} | ${eur(m.peorRacha)} | ${eur(P(rachas,0.5))} | ${(pR*100).toFixed(0)}% | ${eur(m.ano)} | ${eur(P(anos,0.5))} | ${(pI*100).toFixed(0)}% |`);
  }
}
console.log("  (pctl = en qué percentil de los 500 sorteos cae la regla. Racha: 100% = la regla es MEJOR que todos)");

// ── TERCIOS: el signo del efecto en los tres tercios de tiempo ──
console.log(`\n═══ TERCIOS DE TIEMPO — ¿el efecto vive en un solo trozo? ═══`);
const k = Math.floor(filas.length / 3);
const tercios = [filas.slice(0, k), filas.slice(k, 2 * k), filas.slice(2 * k)];
console.log("  | regla | tercio | fechas | opera | $/año regla | $/año base | Δ | racha regla | racha base |");
console.log("  |---|---|---|---|---|---|---|---|---|");
for (const id of Object.keys(detalle)) {
  const f = fn(id);
  for (let i = 0; i < 3; i++) {
    const per = tercios[i];
    const m = met(per, per.map(f)), b = met(per, per.map(() => true));
    console.log(`  | ${id} | ${i + 1} | ${per[0].fecha}→${per[per.length-1].fecha} | ${pc(m.pctOp)} | ${eur(m.ano)} | ${eur(b.ano)} | ${eur(m.ano - b.ano)} | ${eur(m.peorRacha)} | ${eur(b.peorRacha)} |`);
  }
}

// ── ¿SEPARA LOS DÍAS? el t de Welch entre los días que la regla deja pasar y los que veta ──
console.log(`\n═══ ¿SEPARA DÍAS O SÓLO OPERA MENOS? — t de Welch (listón ${listonT(nReglas)} con ${nReglas} pruebas) ═══`);
console.log("  | regla | período | n dentro | n fuera | media dentro | media fuera | t |");
console.log("  |---|---|---|---|---|---|---|");
for (const id of Object.keys(detalle)) {
  const f = fn(id);
  for (const [et, per] of [["A 22-23", A], ["B 24-26", B], ["TODO", filas]]) {
    const dentro = per.filter(f).map((x) => x.pl), fuera = per.filter((x) => !f(x)).map((x) => x.pl);
    const md = dentro.reduce((a,b)=>a+b,0)/(dentro.length||1), mf = fuera.reduce((a,b)=>a+b,0)/(fuera.length||1);
    console.log(`  | ${id} | ${et} | ${dentro.length} | ${fuera.length} | ${eur(md)} | ${eur(mf)} | ${tWelch(dentro, fuera).toFixed(2)} |`);
  }
}
