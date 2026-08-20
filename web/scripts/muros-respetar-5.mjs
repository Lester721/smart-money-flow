// ═══════════════════════════════════════════════════════════════════════════════════════════
// ¿SON MUROS? · QUINTA VUELTA — qué queda vivo, y medido sin ninguna elección libre.
//
// La cuarta vuelta dejó una cosa rara en pie y hay que entenderla o retirarla:
//   · El canal real contiene el día MÁS que un canal barajado de la MISMA anchura (C3).
//   · Pero una banda SIMÉTRICA de esa misma anchura lo contiene MÁS TODAVÍA (C4).
// Las dos a la vez sólo pueden significar una cosa: la asimetría del canal (que el muro de calls
// esté más lejos que el de puts, o al revés) estorba —cualquier asimetría estorba— pero la
// asimetría REAL estorba MENOS que una trasplantada de otro día. Y eso, si es cierto, quiere
// decir que la asimetría lleva dentro un poco de DIRECCIÓN: el muro deja sitio hacia donde el
// día se va a mover.
//
// Aquí se mide esa afirmación de frente, sin θ, sin umbral, sin nada que elegir:
//   ¿el SIGNO de la asimetría acierta el SIGNO del día (cierre − apertura)?
// El control es una moneda: 50%. Y se parte en las dos mitades, que es donde mueren estas cosas.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/muros-respetar-5.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";

const N = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const SALIDA = "scripts/muros-respetar-5.json";
const LENTES = ["gam", "gamD", "oi"];
const PRUEBAS = 90 + 9;
const CUENTA = 56389;

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tUna = (v) => { const s = sd(v); return s > 0 ? media(v) / (s / Math.sqrt(v.length)) : 0; };
function listonT(p) { if (p <= 1) return 2; const q = 0.05 / p / 2; const t = Math.sqrt(-2 * Math.log(q)); return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100; }
const LISTON = listonT(PRUEBAS);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const eur = (x) => (Number.isFinite(x) ? `$${Math.round(x).toLocaleString("es-ES")}` : "—");

console.log(`\n${"═".repeat(96)}`);
console.log(`¿SON MUROS? · QUINTA VUELTA · la asimetría del canal como DIRECCIÓN`);
console.log(`listón |t| ≥ ${LISTON} (${PRUEBAS} pruebas declaradas) · control = moneda (50%)`);
console.log(`${"═".repeat(96)}`);

console.log(`\n## ¿EL SIGNO DE LA ASIMETRÍA ACIERTA EL SIGNO DEL DÍA?`);
console.log(`   asimetría = distancia al muro de calls − distancia al muro de puts. Positiva = hay más sitio`);
console.log(`   ARRIBA. Predice: el día sube. Nada que elegir: ni θ, ni umbral, ni filtro.\n`);
console.log(`   ${"lente".padEnd(5)} ${"per".padEnd(3)} ${"n".padStart(5)} ${"acierto".padStart(8)} ${"t vs 50%".padStart(9)} ║ ${"pts/día".padStart(8)} ${"t".padStart(6)} ${"$/año SPY".padStart(10)}`);
console.log(`   ${"─".repeat(74)}`);

const R = {};
const anios = { A: 2, B: (new Date("2026-08-10") - new Date("2024-01-02")) / (365.25 * 864e5), T: (new Date("2026-08-10") - new Date("2022-01-03")) / (365.25 * 864e5) };
for (const lente of LENTES) {
  for (const per of ["A", "B", "T"]) {
    const aciertos = [], puntos = [];
    let nDias = 0;
    for (const f of N.filas) {
      const p = f.fecha < "2024-01-01" ? "A" : "B";
      if (per !== "T" && p !== per) continue;
      const dc = f.niveles[lente].dMuroCall?.pts, dp = f.niveles[lente].dMuroPut?.pts;
      if (dc == null || dp == null) continue;
      if (!(dc > 0 && dp < 0)) continue;                 // sólo días con canal, igual que antes
      const asim = dc + dp;                              // dp es negativo: dc−|dp|
      if (asim === 0) continue;
      const mov = f.cierre - f.apertura;
      nDias++;
      aciertos.push(Math.sign(asim) === Math.sign(mov) ? 1 : 0);
      puntos.push(Math.sign(asim) * mov);                // puntos de SPX a favor de la señal
    }
    if (nDias < 40) continue;
    const acc = 100 * media(aciertos);
    const tAcc = (media(aciertos) - 0.5) / (Math.sqrt(0.25 / nDias));
    // dinero: SPY, toda la cuenta, horquilla de 1 céntimo SUPUESTA (no medida en esta caché)
    const razon = 10.03, acciones = Math.floor(CUENTA / (media(N.filas.map((f) => f.apertura)) / razon));
    const porOp = (media(puntos) / razon) * acciones - 0.01 * acciones;
    const anual = porOp * (nDias / anios[per]);
    R[`${lente}|${per}`] = { n: nDias, acc, tAcc, pts: media(puntos), tPts: tUna(puntos), anual };
    const marca = Math.abs(tAcc) >= LISTON && Math.abs(tUna(puntos)) >= LISTON ? " ◄" : "";
    console.log(`   ${lente.padEnd(5)} ${per.padEnd(3)} ${String(nDias).padStart(5)} ${(f1(acc) + "%").padStart(8)} ${f2(tAcc).padStart(9)} ║ ${f2(media(puntos)).padStart(8)} ${f2(tUna(puntos)).padStart(6)} ${eur(anual).padStart(10)}${marca}`);
  }
}
console.log(`\n   (pts/día = puntos de SPX a favor de la señal, media. $/año = SPY con toda la cuenta y horquilla`);
console.log(`    de 1 céntimo SUPUESTA — esta caché guarda spot por minuto, no bid/ask de SPY. Se dice.)`);

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), liston: LISTON, pruebas: PRUEBAS, resultado: R }, null, 1));
console.log(`\n   escrito ${SALIDA}\n`);
