// ═══════════════════════════════════════════════════════════════════════════════════════════
// MUROS-MS · PASO 5 — ¿HAY SEÑAL DEBAJO DEL PEAJE?
//
// El paso 4 salió negativo en 17 de 18 casillas, pero TAMBIÉN salió negativo el azar: la
// vertical 0DTE cuesta dinero se toque lo que se toque. Antes de firmar "no sirve" hay que
// separar las dos preguntas:
//     (a) ¿el TOQUE del muro predice algo en el ÍNDICE?  ← esto se mide sin vehículo, en puntos
//     (b) ¿queda algo después del peaje?                 ← eso ya se midió y es que no
// Si (a) es cero, la regla está muerta por señal y no hay vehículo que la salve.
// Si (a) es positivo, la regla está viva y lo que hay que arreglar es el vehículo — y entonces
// se dice CUÁNTO tendría que ganar para pagar el peaje medido.
//
// LA CARRERA: desde el toque, ¿llega antes al IMÁN o a un STOP a la misma distancia al otro
// lado? Con el stop simétrico, el azar es 50% por construcción. Eso es un listón que no se
// puede ajustar.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/msmuros-5-senal.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const NIV = "scripts/gex-niveles.json";
const CAM = "scripts/msmuros-5-camino.json";
const SALIDA = "scripts/msmuros-5-salida.json";

function columnas(cab, pedidas, f) {
  const c = cab.split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = {}; const faltan = [];
  for (const p of pedidas) { const i = c.indexOf(p); if (i < 0) faltan.push(p); idx[p] = i; }
  if (faltan.length) throw new Error(f + ": faltan columnas [" + faltan.join(",") + "]");
  return idx;
}

const N = JSON.parse(readFileSync(NIV, "utf8"));

// ── caché del camino de 5 min (sólo el subyacente) ────────────────────────────────────────
let camino;
if (existsSync(CAM)) {
  camino = JSON.parse(readFileSync(CAM, "utf8"));
  console.log("camino leido de cache: " + Object.keys(camino).length + " dias");
} else {
  camino = {};
  let k = 0;
  for (const fila of N.filas) {
    const f = DIR + "/iv_" + fila.fecha + "_C.csv";
    if (!existsSync(f)) continue;
    const lin = readFileSync(f, "utf8").split("\n");
    if (lin.length < 3) continue;
    const I = columnas(lin[0], ["timestamp", "underlying_price"], f);
    const m = new Map();
    for (let j = 1; j < lin.length; j++) {
      const l = lin[j]; if (l.length < 20) continue;
      const c = l.split(",");
      const ts = c[I.timestamp]; if (ts.length < 16) continue;
      const h = ts.slice(11, 16);
      const sp = +c[I.underlying_price];
      if (sp > 0 && !m.has(h)) m.set(h, sp);
    }
    camino[fila.fecha] = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (++k % 200 === 0) console.log("  ... " + k);
  }
  writeFileSync(CAM, JSON.stringify(camino));
  console.log("camino construido: " + Object.keys(camino).length + " dias");
}

// ── radiografía del camino ANTES de medir ─────────────────────────────────────────────────
const largos = Object.values(camino).map((v) => v.length);
const nulos = Object.values(camino).filter((v) => v.some(([, s]) => !(s > 0))).length;
largos.sort((a, b) => a - b);
console.log("barras por dia: min " + largos[0] + "  p50 " + largos[Math.floor(largos.length / 2)] + "  max " + largos[largos.length - 1] + "   dias con algun precio no positivo: " + nulos);

const LENTES = ["gam", "gamD", "oi"];
const LADOS = [["put", +1], ["call", -1]];
const THETA = 0.10;
const HORA0 = "09:40", HORAF = "15:55";
let seed = 20260820;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// carrera imán vs stop simétrico
function carrera(cam, iEnt, dir, objetivo) {
  const sEnt = cam[iEnt][1];
  const d = Math.abs(objetivo - sEnt);
  if (!(d > 0)) return null;
  const stop = dir > 0 ? sEnt - d : sEnt + d;
  for (let i = iEnt + 1; i < cam.length; i++) {
    const s = cam[i][1];
    if (dir > 0 ? s >= objetivo : s <= objetivo) return { gana: 1, barras: i - iEnt, d, arrastre: (s - sEnt) * dir };
    if (dir > 0 ? s <= stop : s >= stop) return { gana: 0, barras: i - iEnt, d, arrastre: (s - sEnt) * dir };
  }
  const sFin = cam[cam.length - 1][1];
  return { gana: null, barras: cam.length - 1 - iEnt, d, arrastre: (sFin - sEnt) * dir };
}

const media = (v) => v.reduce((s, x) => s + x, 0) / (v.length || 1);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(v.length - 1, 1)); };
const tDe = (v) => (v.length > 2 && sd(v) > 0 ? media(v) / (sd(v) / Math.sqrt(v.length)) : 0);

const res = {};
for (const L of LENTES) for (const [ln, dir] of LADOS) {
  const real = [], azN = [], azH = [];
  for (const fila of N.filas) {
    const cam0 = camino[fila.fecha];
    if (!cam0) continue;
    const cam = cam0.filter(([h, s]) => h >= HORA0 && h <= HORAF && s > 0);
    if (cam.length < 40) continue;
    const niv = fila.niveles[L]; if (!niv) continue;
    const iman = niv.imanBruto, muro = ln === "put" ? niv.muroPut : niv.muroCall;
    if (muro == null || iman == null) continue;
    const S0 = fila.apertura;
    if (ln === "put" && !(S0 > muro && iman > muro)) continue;
    if (ln === "call" && !(S0 < muro && iman < muro)) continue;
    const tol = (S0 * THETA) / 100;

    let i1 = -1;
    for (let i = 0; i < cam.length; i++) { const s = cam[i][1]; if (ln === "put" ? s <= muro + tol : s >= muro - tol) { i1 = i; break; } }
    if (i1 >= 0 && i1 < cam.length - 3) { const c = carrera(cam, i1, dir, iman); if (c) real.push({ fecha: fila.fecha, ...c }); }

    // azar-nivel: raya sorteada dentro de ±1,5%
    const off = Math.abs(rnd() * 3 - 1.5) / 100;
    const muroF = S0 * (1 + (ln === "put" ? -off : off));
    let i2 = -1;
    for (let i = 0; i < cam.length; i++) { const s = cam[i][1]; if (ln === "put" ? s <= muroF + tol : s >= muroF - tol) { i2 = i; break; } }
    if (i2 >= 0 && i2 < cam.length - 3) { const c = carrera(cam, i2, dir, iman); if (c) azN.push({ fecha: fila.fecha, ...c }); }

    // azar-hora
    const i3 = Math.floor(rnd() * (cam.length - 4));
    { const c = carrera(cam, i3, dir, iman); if (c) azH.push({ fecha: fila.fecha, ...c }); }
  }
  const dec = real.filter((x) => x.gana != null);
  const decN = azN.filter((x) => x.gana != null);
  const decH = azH.filter((x) => x.gana != null);
  res[L + "|" + ln] = {
    n: real.length, nDecididas: dec.length,
    ganaPct: dec.length ? +((media(dec.map((x) => x.gana)) * 100).toFixed(1)) : null,
    tContra50: dec.length > 5 ? +((media(dec.map((x) => x.gana)) - 0.5) / (Math.sqrt(0.25 / dec.length))).toFixed(2) : null,
    arrastrePts: +media(real.map((x) => x.arrastre)).toFixed(2),
    tArrastre: +tDe(real.map((x) => x.arrastre)).toFixed(2),
    distMediaPts: +media(real.map((x) => x.d)).toFixed(1),
    azarNivelGanaPct: decN.length ? +((media(decN.map((x) => x.gana)) * 100).toFixed(1)) : null,
    azarNivelN: decN.length,
    azarHoraGanaPct: decH.length ? +((media(decH.map((x) => x.gana)) * 100).toFixed(1)) : null,
    azarHoraArrastre: +media(azH.map((x) => x.arrastre)).toFixed(2),
    azarNivelArrastre: +media(azN.map((x) => x.arrastre)).toFixed(2),
  };
}

console.log("\n" + "═".repeat(120));
console.log("LA SEÑAL PURA, EN PUNTOS DEL ÍNDICE  ·  carrera imán vs stop simétrico (el azar es 50% por construcción)");
console.log("═".repeat(120));
console.log("lente|lado".padEnd(14) + "n".padStart(6) + "decid".padStart(7) + "llega%".padStart(8) + "t vs50".padStart(8) + "arrastre".padStart(10) + "t arr".padStart(7) + "dist".padStart(7) + "  azarNivel%  azarHora%  arrAzarHora");
for (const [k, r] of Object.entries(res)) {
  console.log(k.padEnd(14) + String(r.n).padStart(6) + String(r.nDecididas).padStart(7) + String(r.ganaPct).padStart(8) + String(r.tContra50).padStart(8) +
    String(r.arrastrePts).padStart(10) + String(r.tArrastre).padStart(7) + String(r.distMediaPts).padStart(7) +
    String(r.azarNivelGanaPct).padStart(12) + String(r.azarHoraGanaPct).padStart(11) + String(r.azarHoraArrastre).padStart(13));
}
writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), theta: THETA, res }, null, 1));
console.log("\nescrito " + SALIDA);
