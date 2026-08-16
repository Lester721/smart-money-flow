// AUDITORÍA 3 — reconstruir la tabla ANTERIOR (−15,41% / −5,16%) desde las filas ya corregidas,
// forzando a −100% las filas que cruzan el split de NVDA. Si sale la tabla vieja, el bug era ese.
// Solo lectura. Uso: node --max-old-space-size=6144 scripts/audit-eva-largo-reconstruir.mjs

import { readFileSync } from "node:fs";
const F = process.env.EVA_LARGO_FILAS || "scripts/eva-largo-filas.json";
const filas = JSON.parse(readFileSync(F, "utf8"));
const H = [30, 90, 180, 365];
const media = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const pct = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2)}%`;
const sd = (x) => { const m = media(x); return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1)); };
const tC = (x) => media(x) / (sd(x) / Math.sqrt(x.length));

// La tabla que se me pidió atacar
const VIEJA = { 30: [-0.0540, -0.0608, 0.0068, 17.55, 32415], 90: [-0.0580, -0.0636, 0.0055, 12.91, 18527],
                180: [-0.1541, -0.1573, 0.0032, 5.73, 10602], 365: [-0.0516, -0.0627, 0.0111, 9.44, 3714] };

console.log(`fichero: ${F}\nfilas: ${filas.length.toLocaleString("es-ES")}\n`);

console.log("═══ 1 · filas que CRUZAN un split, por horizonte ═══");
console.log("horiz       n   cruzan split   %      retorno de las que cruzan   retorno del resto");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  const cr = s.filter((f) => f.h[h].split);
  const no = s.filter((f) => !f.h[h].split);
  console.log(`${String(h).padStart(4)} ${String(s.length).padStart(7)} ${String(cr.length).padStart(12)} ` +
    `${((cr.length / s.length) * 100).toFixed(1).padStart(6)}%   ${(cr.length ? pct(media(cr.map((f) => f.h[h].t))) : "—").padStart(22)}   ` +
    `${pct(media(no.map((f) => f.h[h].t))).padStart(16)}`);
}

console.log("\n═══ 2 · RECONSTRUCCIÓN: forzar a −100% las dos patas de las filas que cruzan ═══");
console.log("(es lo que hacía el medidor antes del arreglo: el strike viejo no existe → puja 0)\n");
console.log("horiz    flujo rec.  (vieja)     cubo rec.  (vieja)    difer rec. (vieja)    t rec.  (vieja)");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  const t = s.map((f) => (f.h[h].split ? -1 : f.h[h].t));
  const c = s.map((f) => (f.h[h].split ? -1 : f.h[h].c));
  const d = t.map((v, i) => v - c[i]);
  const [vt, vc, vd, vtt] = VIEJA[h];
  console.log(`${String(h).padStart(4)} ${pct(media(t)).padStart(11)}  ${pct(vt).padStart(8)} ` +
    `${pct(media(c)).padStart(12)}  ${pct(vc).padStart(8)} ${pct(media(d)).padStart(12)}  ${pct(vd).padStart(8)} ` +
    `${tC(d).toFixed(2).padStart(10)}  ${vtt.toFixed(2).padStart(7)}`);
}

console.log("\n═══ 3 · la tabla ACTUAL (ya con el split arreglado) ═══");
console.log("horiz       n     flujo      cubo     difer        t");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  const d = s.map((f) => f.h[h].d);
  console.log(`${String(h).padStart(4)} ${String(s.length).padStart(7)} ${pct(media(s.map((f) => f.h[h].t))).padStart(10)} ` +
    `${pct(media(s.map((f) => f.h[h].c))).padStart(9)} ${pct(media(d)).padStart(9)} ${tC(d).toFixed(2).padStart(8)}`);
}

console.log("\n═══ 4 · ¿de qué ticker y qué meses son las filas que cruzan? ═══");
for (const h of H) {
  const cr = filas.filter((f) => f.h[h]?.split);
  if (!cr.length) continue;
  const tk = new Map(), me = new Map();
  for (const f of cr) {
    tk.set(f.ticker, (tk.get(f.ticker) ?? 0) + 1);
    const m = `${f.dia.slice(0, 4)}-${f.dia.slice(4, 6)}`;
    me.set(m, (me.get(m) ?? 0) + 1);
  }
  console.log(`${String(h).padStart(4)} d  tickers: ${[...tk].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(" ")}`);
  console.log(`        meses de entrada: ${[...me].sort().map(([m, n]) => `${m}:${n}`).join(" ")}`);
}

console.log("\n═══ 5 · el arreglo del split, ¿cambia el TITULAR (la diferencia pareada)? ═══");
console.log("horiz    difer ANTES(vieja)   difer AHORA    cambio");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  console.log(`${String(h).padStart(4)} ${pct(VIEJA[h][2]).padStart(16)} ${pct(media(s.map((f) => f.h[h].d))).padStart(14)}   ` +
    `${pct(media(s.map((f) => f.h[h].d)) - VIEJA[h][2]).padStart(8)}`);
}
