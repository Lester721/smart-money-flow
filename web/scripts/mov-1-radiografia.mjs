// PASO 3 — RADIOGRAFÍA y retrato descriptivo. Todavía no se elige nada.
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";
import { construir, cola, media, sd, pct, eur, tWelch } from "./mov-lib.mjs";

const F = construir();
console.log(`\n${F.length} días · ${F[0].fecha} → ${F[F.length - 1].fecha}`);
const porAno = {};
for (const f of F) porAno[f.ano] = (porAno[f.ano] ?? 0) + 1;
console.log("  por año: " + Object.entries(porAno).map(([a, n]) => `${a}=${n}`).join(" · "));

const SENALES = ["movSig","huecoSig","rangoSig","posRango","recorridoSig","velMaxSig","vel30Sig",
                 "eficiencia","zigzag","rvManana","rvIv","rangoAyerSig","rangoAnteSig","tardeAyerSig","sepSig"];

// Las filas sin ayer/anteayer no pueden entrar en las señales que los usan.
const conAyer = F.filter((f) => f.huecoSig != null && f.rangoAnteSig != null && f.vel30Sig != null && f.rvIv != null);
console.log(`  con ayer y anteayer: ${conAyer.length} (los ${F.length - conAyer.length} primeros no tienen pasado)`);

radiografia(conAyer, [...SENALES, "pl", "strad", "cred", "zTardeSig"], "señales de movimiento",
            { cerosLegitimos: ["zigzag"] });

const A = conAyer.filter((f) => f.fecha < "2024-01-01"), B = conAyer.filter((f) => f.fecha >= "2024-01-01");
console.log(`  2022-2023: ${A.length} días · 2024-2026: ${B.length} días\n`);

// ── ¿EL DÍA MALO SE PARECE EN LOS DOS PERÍODOS? ──
console.log("## ¿EL DÍA MALO TIENE LA MISMA FORMA EN LOS DOS PERÍODOS?");
console.log("   (media de la señal en el 10% peor contra el resto, en cada período)\n");
console.log("| señal | 22-23 peor10% | 22-23 resto | t | 24-26 peor10% | 24-26 resto | t | mismo signo |");
console.log("|---|---|---|---|---|---|---|---|");
for (const s of SENALES) {
  const linea = [s];
  const signos = [];
  for (const G of [A, B]) {
    const ord = [...G].sort((x, y) => x.pl - y.pl);
    const k = Math.floor(G.length * 0.1);
    const malos = ord.slice(0, k).map((f) => f[s]), resto = ord.slice(k).map((f) => f[s]);
    const t = tWelch(malos, resto);
    linea.push(media(malos).toFixed(3), media(resto).toFixed(3), t.toFixed(2));
    signos.push(Math.sign(media(malos) - media(resto)));
  }
  linea.push(signos[0] === signos[1] ? "sí" : "**NO**");
  console.log("| " + linea.join(" | ") + " |");
}

// ── SEPARACIÓN POR TERCILES: ¿ordena la señal el P&L? ──
console.log(`\n## ¿ORDENA LA SEÑAL EL RESULTADO? — tercil alto contra tercil bajo, $/día`);
console.log(`   listón de |t| con ${SENALES.length * 2} pruebas = ${listonT(SENALES.length * 2)}\n`);
console.log("| señal | 22-23 alto | 22-23 bajo | sep | t | 24-26 alto | 24-26 bajo | sep | t | mismo signo |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const s of SENALES) {
  const linea = [s]; const signos = [];
  for (const G of [A, B]) {
    const ord = [...G].sort((x, y) => y[s] - x[s]);
    const k = Math.floor(G.length / 3);
    const alto = ord.slice(0, k).map((f) => f.pl), bajo = ord.slice(-k).map((f) => f.pl);
    const sep = media(alto) - media(bajo);
    linea.push(eur(media(alto)), eur(media(bajo)), eur(sep), tWelch(alto, bajo).toFixed(2));
    signos.push(Math.sign(sep));
  }
  linea.push(signos[0] === signos[1] ? "sí" : "**NO**");
  console.log("| " + linea.join(" | ") + " |");
}

// ── LA COLA POR PERÍODO, base de comparación ──
console.log(`\n## LA BASE — operar todos los días, 1 contrato\n`);
console.log("| período | n | $/año | media/día | acierto | p5 | p1 | peor día | peor racha | P(<−2k) | P(<−4k) |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const [et, G] of [["2022-2023", A], ["2024-2026", B], ["TODO", conAyer]]) {
  const c = cola(G, G.length / 252);
  console.log(`| ${et} | ${c.n} | ${eur(c.alAno)} | ${eur(c.media)} | ${(c.acierto*100).toFixed(0)}% | ${eur(c.p5)} | ${eur(c.p1)} | ${eur(c.peor)} | ${eur(c.dd)} | ${(c.p2000*100).toFixed(1)}% | ${(c.p4000*100).toFixed(1)}% |`);
}
