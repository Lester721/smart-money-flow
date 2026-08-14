// LABORATORIO EVA · RONDA 2 — apretarle las tuercas a la inusualidad.
//
// La ronda 1 encontró que `unus` (inusualidad) separa 16,5% con t=5,64, coherente en las dos
// mitades, mientras los compuestos de Victor (t=1,16) y EVA (t=0,57) no llegan. O sea: **el
// compuesto está DILUYENDO el único ingrediente que lleva señal.**
//
// Un t alto no basta. Antes de creérselo hay que ver si se comporta como una señal de verdad:
//
//   A. ¿Es MONÓTONA? Una señal real ordena todo el rango, no sólo los extremos. Si sólo el
//      decil de arriba y el de abajo se separan y el medio es un revoltijo, es un artefacto.
//   B. ¿Aguanta en TERCIOS de tiempo, no sólo en mitades? Partir en dos es fácil de aprobar.
//   C. ¿Vale en varios TICKERS o vive en uno? (Es lo que mató al filtro de IV y casi a la Wheel.)
//   D. ¿El decil de arriba GANA dinero, o sólo pierde menos?
//   E. ¿Suma combinarla con las otras dos robustas (DTE a favor, volumen al revés)?
//
// Aviso de pruebas múltiples: la ronda 1 hizo 8 y esta hace ~20 más. El listón sube. Lo que
// vale no es el t más alto, es la COHERENCIA: monótona, en los tres tercios y en varios tickers.

import { readFileSync } from "node:fs";

interface Fila {
  pnl: number; aggr: number; conv: number; unus: number; ivp: number;
  spreadPct: number | null; oi: number; volume: number; dte: number | null;
  side: string; exceededOI: boolean; isCall: boolean; ticker: string; fecha: string;
}
const F: Fila[] = JSON.parse(readFileSync(process.env.BT_DUMP || "scripts/eva-filas.json", "utf8"));

const media = (v: number[]) => v.reduce((a, x) => a + x, 0) / v.length;
const varz = (v: number[]) => { const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tW = (a: number[], b: number[]) => {
  if (a.length < 3 || b.length < 3) return 0;
  const se = Math.sqrt(varz(a) / a.length + varz(b) / b.length);
  return se > 0 ? (media(a) - media(b)) / se : 0;
};
/** t contra CERO: ¿este grupo gana dinero, o sólo pierde menos que el otro? */
const tCero = (v: number[]) => (v.length < 3 ? 0 : media(v) / Math.sqrt(varz(v) / v.length));
const pct = (x: number) => (x * 100).toFixed(1) + "%";
const win = (v: number[]) => v.filter((x) => x > 0).length / v.length;

const unus = (f: Fila) => f.unus;

console.log(`RONDA 2 · ${F.length} flujos · ${F[0].fecha} → ${F[F.length - 1].fecha}`);

// ── A. MONOTONÍA ─────────────────────────────────────────────────────────────
console.log("");
console.log("═══ A. ¿ES MONÓTONA? (deciles por inusualidad) ═══");
console.log("Una señal real ordena TODO el rango. Si sólo se separan los extremos, es artefacto.");
console.log("");
const ord = [...F].sort((a, b) => unus(a) - unus(b));
const paso = Math.floor(ord.length / 10);
console.log("decil    n     media      mediana    win      unus medio");
const mediasDecil: number[] = [];
for (let i = 0; i < 10; i++) {
  const g = ord.slice(i * paso, i === 9 ? ord.length : (i + 1) * paso);
  const p = g.map((x) => x.pnl);
  mediasDecil.push(media(p));
  const s = [...p].sort((a, b) => a - b);
  console.log(
    `  ${i + 1}`.padEnd(7), String(g.length).padStart(3),
    pct(media(p)).padStart(9), pct(s[s.length >> 1]).padStart(10),
    pct(win(p)).padStart(8), media(g.map(unus)).toFixed(1).padStart(10),
  );
}
// Correlación de rangos entre el número de decil y su media: 1 = perfectamente creciente.
const rangos = mediasDecil.map((_, i) => i + 1);
const ordM = [...mediasDecil].map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
const rangoDe = new Array(10);
ordM.forEach((idx, r) => { rangoDe[idx] = r + 1; });
const dc = rangos.map((r, i) => (r - rangoDe[i]) ** 2).reduce((a, b) => a + b, 0);
const spearman = 1 - (6 * dc) / (10 * (100 - 1));
console.log("");
console.log(`correlación de rangos (Spearman) decil ↔ rendimiento: ${spearman.toFixed(2)}`);
console.log(spearman > 0.7 ? "  → monótona: se comporta como una señal." : "  → NO monótona: los extremos se separan pero el medio no ordena. Sospechoso.");

// ── B. TERCIOS DE TIEMPO ─────────────────────────────────────────────────────
console.log("");
console.log("═══ B. ¿AGUANTA EN LOS TRES TERCIOS DE TIEMPO? ═══");
const porFecha = [...F].sort((a, b) => a.fecha.localeCompare(b.fecha));
const t3 = Math.floor(porFecha.length / 3);
const tercios = [porFecha.slice(0, t3), porFecha.slice(t3, 2 * t3), porFecha.slice(2 * t3)];
console.log("tercio   período                    n    separación      t");
for (let i = 0; i < 3; i++) {
  const g = [...tercios[i]].sort((a, b) => unus(b) - unus(a));
  const k = Math.floor(g.length / 3);
  const alto = g.slice(0, k).map((x) => x.pnl), bajo = g.slice(-k).map((x) => x.pnl);
  console.log(
    `  ${i + 1}`.padEnd(8),
    `${tercios[i][0].fecha} → ${tercios[i][tercios[i].length - 1].fecha}`.padEnd(26),
    String(g.length).padStart(4), pct(media(alto) - media(bajo)).padStart(11), tW(alto, bajo).toFixed(2).padStart(7),
  );
}

// ── C. POR TICKER ────────────────────────────────────────────────────────────
console.log("");
console.log("═══ C. ¿VIVE EN UN TICKER O VALE EN VARIOS? ═══");
console.log("(el filtro de IV murió aquí: funcionaba en HOOD y en ningún otro)");
console.log("");
console.log("ticker     n    separación      t      signo");
let positivos = 0, contados = 0;
for (const t of [...new Set(F.map((f) => f.ticker))].sort()) {
  const g = F.filter((f) => f.ticker === t).sort((a, b) => unus(b) - unus(a));
  const k = Math.floor(g.length / 3);
  if (k < 5) { console.log(`${t.padEnd(9)} ${String(g.length).padStart(3)}   muestra corta`); continue; }
  const alto = g.slice(0, k).map((x) => x.pnl), bajo = g.slice(-k).map((x) => x.pnl);
  const sep = media(alto) - media(bajo);
  contados++; if (sep > 0) positivos++;
  console.log(`${t.padEnd(9)} ${String(g.length).padStart(3)} ${pct(sep).padStart(12)} ${tW(alto, bajo).toFixed(2).padStart(7)}    ${sep > 0 ? "+" : "−"}`);
}
console.log("");
console.log(`${positivos} de ${contados} tickers con el signo correcto.`);

// ── D. ¿EL DECIL DE ARRIBA GANA DINERO? ──────────────────────────────────────
console.log("");
console.log("═══ D. ¿GANA DINERO, O SÓLO PIERDE MENOS? ═══");
console.log("La separación se cobra sólo si se puede vender el lado malo. Comprando, lo que");
console.log("importa es si el grupo bueno está POR ENCIMA DE CERO.");
console.log("");
const desc = [...F].sort((a, b) => unus(b) - unus(a));
for (const [nom, g] of [
  ["decil superior (10%)", desc.slice(0, Math.floor(F.length / 10))],
  ["quintil superior (20%)", desc.slice(0, Math.floor(F.length / 5))],
  ["tercio superior (33%)", desc.slice(0, Math.floor(F.length / 3))],
  ["TODO (referencia)", desc],
] as [string, Fila[]][]) {
  const p = g.map((x) => x.pnl);
  const t = tCero(p);
  console.log(
    nom.padEnd(24), `n=${p.length}`.padStart(7),
    `media ${pct(media(p))}`.padStart(15), `win ${pct(win(p))}`.padStart(11),
    `t vs cero ${t.toFixed(2)}`.padStart(17),
    t > 2 ? "  ← gana de verdad" : t > 0 ? "  (positiva pero no significativa)" : "  pierde",
  );
}

// ── E. COMBINAR LAS TRES ROBUSTAS ────────────────────────────────────────────
// unus a favor, dte a favor, volumen AL REVÉS. Las tres coherentes en las dos mitades.
// Se normaliza cada una a rango 0..1 para poder sumarlas sin que la escala mande.
console.log("");
console.log("═══ E. ¿SUMA COMBINAR unus + dte + volumen(invertido)? ═══");
const rango = (v: number[]) => { const mn = Math.min(...v), mx = Math.max(...v); return (x: number) => (mx > mn ? (x - mn) / (mx - mn) : 0.5); };
const nU = rango(F.map((f) => f.unus)), nD = rango(F.map((f) => f.dte ?? 0)), nV = rango(F.map((f) => Math.log1p(f.volume)));
const CRITERIOS: [string, (f: Fila) => number][] = [
  ["unus sola", (f) => nU(f.unus)],
  ["unus + dte", (f) => nU(f.unus) + nD(f.dte ?? 0)],
  ["unus − volumen", (f) => nU(f.unus) - nV(Math.log1p(f.volume))],
  ["unus + dte − volumen", (f) => nU(f.unus) + nD(f.dte ?? 0) - nV(Math.log1p(f.volume))],
];
const mitad = Math.floor(porFecha.length / 2);
const [p1, p2] = [porFecha.slice(0, mitad), porFecha.slice(mitad)];
console.log("criterio                 total sep       t     |  1ª mitad   2ª mitad");
for (const [nom, c] of CRITERIOS) {
  const sep = (g: Fila[]) => {
    const o = [...g].sort((a, b) => c(b) - c(a));
    const k = Math.floor(o.length / 3);
    const A = o.slice(0, k).map((x) => x.pnl), B = o.slice(-k).map((x) => x.pnl);
    return { s: media(A) - media(B), t: tW(A, B) };
  };
  const T = sep(F), a = sep(p1), b = sep(p2);
  console.log(nom.padEnd(24), pct(T.s).padStart(9), T.t.toFixed(2).padStart(9), "  |", pct(a.s).padStart(9), pct(b.s).padStart(10),
    Math.sign(a.s) === Math.sign(b.s) ? " coherente" : " SE CONTRADICEN");
}

console.log("");
console.log("Recordatorio de siempre: nada de esto descuenta la horquilla de entrada. El P&L usa el");
console.log("precio al que se imprimió el trade institucional; que TÚ consigas ese precio es un");
console.log("supuesto, no un dato. La salida sí paga el bid real.");
