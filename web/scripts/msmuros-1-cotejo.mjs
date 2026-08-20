// ═══════════════════════════════════════════════════════════════════════════════════════════
// MUROS-MS · PASO 1 — ¿SON LOS MISMOS NIVELES?
//
// MarketSnack publica call_wall / put_wall / magnet / max_pain / gamma_flip en
// /assets/{T}/gex_stats_chart. Su histórico son 19 días (1m). Nosotros tenemos
// scripts/gex-niveles.json con 1.122 días de LOS MISMOS NOMBRES calculados por nosotros.
//
// Si coinciden → la regla se puede medir con 1.122 días en vez de 19.
// Si no coinciden → hay que decir EN QUÉ se diferencian antes de medir nada.
//
// LO QUE HAY QUE FIJAR ANTES DE COMPARAR (y que puede invalidar la comparación entera):
//   1. ¿A QUÉ HORA es la foto de MS? Su sello es 04:00Z (medianoche ET) — eso no es una hora.
//      Se resuelve mirando su asset_price: ¿se parece a nuestra apertura (09:35) o al cierre?
//   2. ¿Qué vencimientos mete cada uno? Nosotros SÓLO 0DTE (gex-2026 es SPXW del día).
//      MS no lo dice. La forma de los niveles lo delata.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/msmuros-1-cotejo.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import zlib from "node:zlib";

const NIV = "scripts/gex-niveles.json";
const MSDIR = "scripts/cache-theta/marketsnack/aux/gex/2026-08-19";
const SALIDA = "scripts/msmuros-1-salida.json";

const leerGz = (p) => JSON.parse(zlib.gunzipSync(readFileSync(p)).toString("utf8"));

// ── radiografía mínima: contar nulos/ceros ANTES de medir nada ─────────────────────────────
function radiografia(filas, campos, titulo) {
  console.log("\n── " + titulo + "  (n=" + filas.length + ")");
  console.log("campo".padEnd(16) + "nulos".padStart(8) + "ceros".padStart(8) + "min".padStart(12) + "p50".padStart(12) + "max".padStart(12));
  for (const c of campos) {
    const v = filas.map((f) => f[c]);
    const nul = v.filter((x) => x == null || !Number.isFinite(Number(x))).length;
    const num = v.filter((x) => x != null && Number.isFinite(Number(x))).map(Number).sort((a, b) => a - b);
    const cer = num.filter((x) => x === 0).length;
    console.log(
      c.padEnd(16) +
        String(nul).padStart(8) +
        String(cer).padStart(8) +
        (num.length ? num[0].toFixed(2) : "-").padStart(12) +
        (num.length ? num[Math.floor(num.length / 2)].toFixed(2) : "-").padStart(12) +
        (num.length ? num[num.length - 1].toFixed(2) : "-").padStart(12),
    );
  }
}

// ═══ 1 · CARGA ═════════════════════════════════════════════════════════════════════════════
const N = JSON.parse(readFileSync(NIV, "utf8"));
const nuestros = new Map(N.filas.map((f) => [f.fecha, f]));
console.log("NUESTROS: " + N.filas.length + " dias  " + N.filas[0].fecha + " -> " + N.filas[N.filas.length - 1].fecha + "   hora de la foto: " + N.hora);

const ficheros = readdirSync(MSDIR).filter((f) => f.endsWith(".json.gz"));
console.log("MS: " + ficheros.length + " tickers en " + MSDIR);

const ms = leerGz(MSDIR + "/SPX.json.gz");
const msSPXW = leerGz(MSDIR + "/SPXW.json.gz");

// ¿SPX y SPXW son el mismo objeto en MS? (si sí, MS mete todo junto)
const igualSPXW = JSON.stringify(ms["1m"].data) === JSON.stringify(msSPXW["1m"].data);
console.log("MS: ¿SPX y SPXW devuelven lo mismo? " + (igualSPXW ? "SI — es el mismo agregado" : "NO"));

const msDia = ms["1m"].data.map((d) => ({ ...d, fecha: d.t.slice(0, 10) }));
console.log("MS 1m: " + msDia.length + " dias  " + msDia[0].fecha + " -> " + msDia[msDia.length - 1].fecha);
radiografia(msDia, ["call_wall", "put_wall", "magnet", "max_pain", "gamma_flip", "net_gex", "asset_price"], "campos de MS (SPX, serie 1m)");

// ═══ 2 · ¿A QUÉ HORA ES LA FOTO DE MS? ═════════════════════════════════════════════════════
// Se contrasta su asset_price contra nuestra apertura (09:35) y nuestro cierre (16:00).
console.log("\n" + "═".repeat(96));
console.log("2. ¿A QUE HORA ES LA FOTO DE MS?  (su asset_price contra el nuestro)");
console.log("═".repeat(96));

const solape = msDia.filter((d) => nuestros.has(d.fecha));
console.log("dias que solapan: " + solape.length + "  (" + (solape[0]?.fecha ?? "-") + " -> " + (solape[solape.length - 1]?.fecha ?? "-") + ")");

let eAp = 0, eCi = 0, eMax = 0, eMin = 0;
console.log("\nfecha        MS_price   n_09:35    n_16:00    n_max     n_min    |MS-09:35| |MS-16:00|");
for (const d of solape) {
  const n = nuestros.get(d.fecha);
  const dAp = Math.abs(d.asset_price - n.apertura);
  const dCi = Math.abs(d.asset_price - n.cierre);
  eAp += dAp; eCi += dCi;
  eMax += Math.abs(d.asset_price - n.maxMuestreado);
  eMin += Math.abs(d.asset_price - n.minMuestreado);
  console.log(
    d.fecha + "  " + d.asset_price.toFixed(2).padStart(9) + n.apertura.toFixed(2).padStart(11) +
      n.cierre.toFixed(2).padStart(11) + n.maxMuestreado.toFixed(2).padStart(10) + n.minMuestreado.toFixed(2).padStart(10) +
      dAp.toFixed(2).padStart(11) + dCi.toFixed(2).padStart(11),
  );
}
const k = solape.length || 1;
console.log("\nerror medio |MS - nuestro|:  vs 09:35 = " + (eAp / k).toFixed(2) + " pts    vs 16:00 = " + (eCi / k).toFixed(2) + " pts    vs max = " + (eMax / k).toFixed(2) + "    vs min = " + (eMin / k).toFixed(2));
const hora = eCi < eAp ? "CIERRE (16:00)" : "APERTURA (09:35)";
console.log("→ la foto de MS es la del " + hora);

// ═══ 3 · EL COTEJO NIVEL A NIVEL ═══════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(96));
console.log("3. COTEJO NIVEL A NIVEL  (MS contra cada una de nuestras tres lentes)");
console.log("═".repeat(96));

const PARES = [
  ["call_wall", "muroCall"],
  ["put_wall", "muroPut"],
  ["magnet", "imanBruto"],
  ["magnet", "imanNeto"],
  ["gamma_flip", "flip"],
];
const LENTES = ["gam", "gamD", "oi"];

const tabla = {};
for (const [campoMS, campoN] of PARES) {
  for (const lente of LENTES) {
    const filas = [];
    for (const d of solape) {
      const n = nuestros.get(d.fecha);
      const a = d[campoMS];
      const b = n.niveles?.[lente]?.[campoN];
      if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
      filas.push({ fecha: d.fecha, ms: a, nos: b, dif: b - a, pct: ((b - a) / a) * 100, spot: d.asset_price });
    }
    if (!filas.length) continue;
    const abs = filas.map((f) => Math.abs(f.dif));
    const media = abs.reduce((s, x) => s + x, 0) / abs.length;
    const mediana = abs.slice().sort((x, y) => x - y)[Math.floor(abs.length / 2)];
    const exacto = filas.filter((f) => f.dif === 0).length;
    const d5 = filas.filter((f) => Math.abs(f.dif) <= 5).length;
    const d25 = filas.filter((f) => Math.abs(f.dif) <= 25).length;
    const sesgo = filas.reduce((s, f) => s + f.dif, 0) / filas.length;
    tabla[campoMS + "|" + lente + "." + campoN] = {
      n: filas.length, mediaAbsPts: +media.toFixed(2), medianaAbsPts: +mediana.toFixed(2),
      sesgoPts: +sesgo.toFixed(2), exactoPct: +((exacto / filas.length) * 100).toFixed(1),
      dentro5Pct: +((d5 / filas.length) * 100).toFixed(1), dentro25Pct: +((d25 / filas.length) * 100).toFixed(1),
      mediaAbsPctIndice: +((media / filas.reduce((s, f) => s + f.spot, 0) / filas.length) * 100 * filas.length).toFixed(3),
    };
  }
}
console.log("\n" + "MS  vs  nuestro".padEnd(30) + "n".padStart(4) + "exacto%".padStart(9) + "±5pts%".padStart(9) + "±25pts%".padStart(9) + "|dif|med".padStart(10) + "sesgo".padStart(9));
for (const [k2, v] of Object.entries(tabla)) {
  console.log(k2.padEnd(30) + String(v.n).padStart(4) + String(v.exactoPct).padStart(9) + String(v.dentro5Pct).padStart(9) + String(v.dentro25Pct).padStart(9) + v.mediaAbsPts.toFixed(1).padStart(10) + v.sesgoPts.toFixed(1).padStart(9));
}

// ═══ 4 · MAX PAIN (fuera de lentes) y SIGNO DE GEX ═════════════════════════════════════════
console.log("\n" + "═".repeat(96));
console.log("4. MAX PAIN y SIGNO DEL GEX NETO");
console.log("═".repeat(96));

const mp = solape.filter((d) => d.max_pain != null && nuestros.get(d.fecha).maxPain != null)
  .map((d) => ({ fecha: d.fecha, ms: d.max_pain, nos: nuestros.get(d.fecha).maxPain }));
const mpAbs = mp.map((f) => Math.abs(f.nos - f.ms));
console.log("max_pain: n=" + mp.length + "  exacto=" + mp.filter((f) => f.nos === f.ms).length + "  |dif| medio=" + (mpAbs.reduce((s, x) => s + x, 0) / (mpAbs.length || 1)).toFixed(1) + " pts");
for (const f of mp) console.log("  " + f.fecha + "  MS=" + f.ms + "  nos=" + f.nos + "  dif=" + (f.nos - f.ms));

const sg = solape.map((d) => {
  const n = nuestros.get(d.fecha);
  return { fecha: d.fecha, msNet: d.net_gex, gam: n.niveles.gam.netPct, gamD: n.niveles.gamD.netPct };
});
const coincGam = sg.filter((s) => Math.sign(s.msNet) === Math.sign(s.gam)).length;
const coincGamD = sg.filter((s) => Math.sign(s.msNet) === Math.sign(s.gamD)).length;
console.log("\nsigno del GEX neto: coincide con nuestra lente gam en " + coincGam + "/" + sg.length + "   con gamD en " + coincGamD + "/" + sg.length);
console.log("\nfecha        MS_net_gex        nuestro_gam       nuestro_gamD");
for (const s of sg) console.log("  " + s.fecha + "  " + (s.msNet / 1e9).toFixed(2).padStart(10) + "e9" + (s.gam / 1e9).toFixed(2).padStart(14) + "e9" + (s.gamD / 1e9).toFixed(2).padStart(14) + "e9");

// ═══ 5 · LA FORMA DELATA EL VENCIMIENTO ════════════════════════════════════════════════════
// Nuestros niveles vienen de un chain de UN SOLO vencimiento (0DTE). Si los de MS vinieran de
// lo mismo, la distancia muro↔spot sería parecida. Si MS mete toda la cadena, sus muros están
// MÁS LEJOS y son MÁS ESTABLES día a día.
console.log("\n" + "═".repeat(96));
console.log("5. LA FORMA: ¿un vencimiento o toda la cadena?");
console.log("═".repeat(96));

function forma(nombre, arr) {
  const anchos = arr.map((x) => x.ancho).filter(Number.isFinite);
  const dCall = arr.map((x) => x.dCall).filter(Number.isFinite);
  const dPut = arr.map((x) => x.dPut).filter(Number.isFinite);
  const med = (v) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : NaN);
  // estabilidad: cuánto se mueve el muro de un día al siguiente
  const salt = [];
  for (let i = 1; i < arr.length; i++) if (Number.isFinite(arr[i].call) && Number.isFinite(arr[i - 1].call)) salt.push(Math.abs(arr[i].call - arr[i - 1].call));
  console.log(nombre.padEnd(22) + "ancho canal(med)=" + med(anchos).toFixed(1).padStart(8) + " pts   muroCall-spot=" + med(dCall).toFixed(1).padStart(8) + "   spot-muroPut=" + med(dPut).toFixed(1).padStart(8) + "   salto diario muroCall=" + med(salt).toFixed(1).padStart(7));
  return { anchoMed: +med(anchos).toFixed(1), dCallMed: +med(dCall).toFixed(1), dPutMed: +med(dPut).toFixed(1), saltoMed: +med(salt).toFixed(1) };
}

const formaMS = forma("MS (SPX, dia)", solape.map((d) => ({ call: d.call_wall, ancho: d.call_wall - d.put_wall, dCall: d.call_wall - d.asset_price, dPut: d.asset_price - d.put_wall })));
const formas = { MS: formaMS };
for (const lente of LENTES) {
  formas[lente] = forma("nuestro " + lente, solape.map((d) => {
    const n = nuestros.get(d.fecha).niveles[lente];
    return { call: n.muroCall, ancho: n.muroCall - n.muroPut, dCall: n.muroCall - n.apertura, dPut: n.apertura - n.muroPut };
  }).map((x, i) => ({ ...x, dCall: nuestros.get(solape[i].fecha).niveles[lente].muroCall - nuestros.get(solape[i].fecha).apertura, dPut: nuestros.get(solape[i].fecha).apertura - nuestros.get(solape[i].fecha).niveles[lente].muroPut })));
}

// Y sobre TODA nuestra historia, para que el ancho de MS se lea contra algo:
const formaTodo = forma("nuestro gam (1122d)", N.filas.map((f) => ({ call: f.niveles.gam.muroCall, ancho: f.niveles.gam.muroCall - f.niveles.gam.muroPut, dCall: f.niveles.gam.muroCall - f.apertura, dPut: f.apertura - f.niveles.gam.muroPut })));

// ¿cuántas veces nuestro muroCall == muroPut? (el colapso al dinero que avisa la cabecera)
const colapso = {};
for (const lente of LENTES) colapso[lente] = +((N.filas.filter((f) => f.niveles[lente].muroCall === f.niveles[lente].muroPut).length / N.filas.length) * 100).toFixed(1);
console.log("\nnuestros muros COLAPSADOS (muroCall == muroPut): gam " + colapso.gam + "%   gamD " + colapso.gamD + "%   oi " + colapso.oi + "%");
const colapsoMS = +((solape.filter((d) => d.call_wall === d.put_wall).length / (solape.length || 1)) * 100).toFixed(1);
console.log("muros de MS colapsados: " + colapsoMS + "%");

// ═══ 6 · GRANULARIDAD DE STRIKE ════════════════════════════════════════════════════════════
const granMS = {};
for (const d of solape) for (const c of ["call_wall", "put_wall", "magnet", "max_pain"]) {
  const v = d[c]; if (v == null) continue;
  const g = v % 25 === 0 ? "25" : v % 10 === 0 ? "10" : v % 5 === 0 ? "5" : "otro";
  granMS[g] = (granMS[g] || 0) + 1;
}
console.log("\ngranularidad de los strikes de MS: " + JSON.stringify(granMS));
const granN = {};
for (const d of solape) for (const lente of LENTES) for (const c of ["muroCall", "muroPut", "imanBruto"]) {
  const v = nuestros.get(d.fecha).niveles[lente][c]; if (v == null) continue;
  const g = v % 25 === 0 ? "25" : v % 10 === 0 ? "10" : v % 5 === 0 ? "5" : "otro";
  granN[g] = (granN[g] || 0) + 1;
}
console.log("granularidad de los nuestros:      " + JSON.stringify(granN));

writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(),
  diasMS: msDia.length, diasNuestros: N.filas.length, diasSolape: solape.length,
  rangoSolape: solape.length ? [solape[0].fecha, solape[solape.length - 1].fecha] : null,
  horaFotoMS: hora, errorVs0935: +(eAp / k).toFixed(2), errorVs1600: +(eCi / k).toFixed(2),
  igualSPXW, cotejo: tabla,
  maxPain: { n: mp.length, exacto: mp.filter((f) => f.nos === f.ms).length, difMedia: +(mpAbs.reduce((s, x) => s + x, 0) / (mpAbs.length || 1)).toFixed(1) },
  signoGex: { n: sg.length, coincGam, coincGamD },
  formas, formaTodo, colapso, colapsoMS, granMS, granN,
}, null, 1));
console.log("\nescrito " + SALIDA);
