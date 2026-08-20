// PATAS SUELTAS · PASO 3 — ¿SEPARAR LAS PATAS CAMBIA ALGO?
//
// LA HIPÓTESIS. Quien compra una pata de un spread está vendiendo la otra a la vez: su compra
// NO expresa dirección. El 51,8% de las operaciones (64% de la prima) son multi-pata. Si el
// desequilibrio se construye SÓLO con las sueltas, debería predecir mejor.
//
// SE MIDEN DOS COSAS DISTINTAS Y NO SE MEZCLAN:
//   (a) TAMAÑO  — |retorno| del subyacente. Es lo que paga una opción comprada.
//   (b) SIGNO   — retorno con signo. Es lo que ya se midió por otros caminos y falló.
//
// DISEÑO TRANSVERSAL DENTRO DEL DÍA. Cada día se ordenan los tickers por la métrica y se compara
// el tercio alto contra el bajo ESE MISMO DÍA. Así el movimiento del mercado se cancela solo y
// no hace falta ningún modelo de riesgo. Cada día aporta UNA observación.
//
// N EFECTIVA. Con horizonte h, los días se solapan: la n efectiva es D/h, no D. Se dice siempre.
//
// Uso: node --import tsx scripts/marketsnack/patas-3-medir.mjs [100k|1000k] [minOps]

import fs from "node:fs";
import path from "node:path";
import { listonT, pasarBarrera, informe } from "../../lib/barreraHallazgos.ts";

const NIVEL = process.argv[2] || "100k";
const MIN_OPS = Number(process.argv[3] || 5);      // operaciones clasificadas mínimas por celda
const MIN_TICKERS = 9;                              // para poder hacer tercios de ≥3
const HOR = [1, 3, 5];
const RUPTURA = "2026-07-16";

const panel = JSON.parse(fs.readFileSync(path.resolve(`scripts/marketsnack/patas-2-panel-${NIVEL}.json`), "utf8"));
const CIERRES = path.resolve("scripts/cache-theta/cierres");
const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) {
  const t = f.replace(".json", "");
  const j = JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8"));
  const dias = Object.keys(j).sort();
  cierres.set(t, { j, dias, idx: new Map(dias.map((d, i) => [d, i])) });
}

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const t1 = (a) => (a.length < 3 ? 0 : media(a) / (de(a) / Math.sqrt(a.length)));

// ── retornos reales del subyacente (cierre → cierre) ──
let sinCierre = 0;
for (const f of panel) {
  const c = cierres.get(f.t); if (!c) { sinCierre++; continue; }
  const key = f.d.replaceAll("-", "");
  const i = c.idx.get(key); if (i == null) { sinCierre++; continue; }
  const p0 = c.j[c.dias[i]];
  for (const h of HOR) {
    const j = i + h; if (j >= c.dias.length) continue;
    const p1 = c.j[c.dias[j]];
    if (!(p0 > 0) || !(p1 > 0)) continue;
    f[`r${h}`] = ((p1 - p0) / p0) * 100;
    f[`a${h}`] = Math.abs(f[`r${h}`]);
  }
}

console.log(`═══ PATAS SUELTAS · ¿SEPARAR CAMBIA ALGO? · nivel ${NIVEL} · mínimo ${MIN_OPS} ops/celda ═══\n`);
console.log(`   celdas del panel: ${panel.length}  ·  sin cierre ese día: ${sinCierre}`);

// ── COBERTURA ──
const conRet = panel.filter((f) => f.r1 != null);
console.log(`   celdas con retorno a +1d: ${conRet.length}  ·  días: ${new Set(conRet.map((f) => f.d)).size}`);
for (const m of [3, 5, 10, 20]) {
  const ok = conRet.filter((f) => f.nSueltaE >= m);
  const porDia = new Map();
  for (const f of ok) porDia.set(f.d, (porDia.get(f.d) ?? 0) + 1);
  const dOk = [...porDia.values()].filter((v) => v >= MIN_TICKERS).length;
  console.log(`     mínimo ${String(m).padStart(2)} ops sueltas → ${String(ok.length).padStart(4)} celdas · ${dOk} días con ≥${MIN_TICKERS} tickers`);
}
console.log("");

// ── conjunto común: las mismas celdas para TODAS las métricas, si no la comparación es tramposa ──
const usable = conRet.filter((f) =>
  f.nSueltaE >= MIN_OPS && f.nTodas >= MIN_OPS && f.desSueltaE != null && f.desTodas != null);
const diasOk = new Map();
for (const f of usable) { if (!diasOk.has(f.d)) diasOk.set(f.d, []); diasOk.get(f.d).push(f); }
for (const [d, v] of [...diasOk]) if (v.length < MIN_TICKERS) diasOk.delete(d);
const filas = [...diasOk.values()].flat();
console.log(`── CONJUNTO COMÚN ──`);
console.log(`   celdas ticker-día: ${filas.length}  ·  días con tercios: ${diasOk.size}  ·  tickers: ${new Set(filas.map((f) => f.t)).size}`);
const porTicker = new Map();
for (const f of filas) porTicker.set(f.t, (porTicker.get(f.t) ?? 0) + 1);
console.log(`   reparto: ${[...porTicker].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(" ")}\n`);

// ── EL MOTOR: un día = una observación ──
function transversal(filasDia, metrica, salida) {
  const obs = [];
  for (const [d, v] of filasDia) {
    const con = v.filter((f) => f[metrica] != null && f[salida] != null);
    if (con.length < MIN_TICKERS) continue;
    const ord = [...con].sort((a, b) => a[metrica] - b[metrica]);
    const k = Math.floor(ord.length / 3);
    const bajo = ord.slice(0, k).map((f) => f[salida]);
    const alto = ord.slice(-k).map((f) => f[salida]);
    obs.push({ d, v: media(alto) - media(bajo), n: con.length, alto: media(alto), bajo: media(bajo) });
  }
  return obs;
}

const METRICAS = [
  ["desSueltaE", "sólo SUELTAS (estricta)"],
  ["desTodas", "TODAS sin separar"],
  ["desMultiE", "sólo MULTI-PATA"],
  ["desSueltaA", "sólo SUELTAS (ancha: fuera también MESL/MFSL)"],
];
// pruebas para el listón: 4 métricas × 2 salidas (tamaño y signo) × 3 horizontes
const PRUEBAS = METRICAS.length * 2 * HOR.length;
const LISTON = listonT(PRUEBAS);
console.log(`   listón de |t| (Bonferroni, ${PRUEBAS} pruebas): ${LISTON}\n`);

function bloque(titulo, dm, guardar) {
  console.log(`${"═".repeat(78)}\n${titulo}\n`);
  const res = {};
  for (const [salida, etiqueta, pref] of [["a", "TAMAÑO |retorno|", "a"], ["r", "SIGNO retorno", "r"]]) {
    console.log(`── ${etiqueta} ──`);
    console.log(`   métrica                                        h   días  nEfec   alto     bajo     alto−bajo    t`);
    for (const [met, nom] of METRICAS) {
      for (const h of HOR) {
        const obs = transversal(dm, met, `${pref}${h}`);
        if (obs.length < 5) { console.log(`   ${nom.padEnd(45)} ${h}   (sólo ${obs.length} días)`); continue; }
        const v = obs.map((o) => o.v);
        const t = t1(v);
        const nEf = obs.length / h;
        const marca = Math.abs(t) >= LISTON ? "  ***" : "";
        console.log(`   ${nom.padEnd(45)} ${h}   ${String(obs.length).padStart(4)}  ${nEf.toFixed(1).padStart(5)}  ` +
          `${media(obs.map((o) => o.alto)).toFixed(3).padStart(7)}  ${media(obs.map((o) => o.bajo)).toFixed(3).padStart(7)}  ` +
          `${(media(v) >= 0 ? "+" : "") + media(v).toFixed(4).padStart(8)}   ${t.toFixed(2).padStart(6)}${marca}`);
        res[`${met}|${pref}${h}`] = { media: media(v), t, dias: obs.length, nEf, obs };
      }
    }
    console.log("");
  }
  // ── LA COMPARACIÓN QUE MANDA: separar vs no separar, emparejado por día ──
  console.log(`── ¿SEPARAR CAMBIA ALGO? (diferencia emparejada día a día: sueltas − todas) ──`);
  for (const [salida, etiqueta] of [["a", "TAMAÑO"], ["r", "SIGNO"]]) {
    for (const h of HOR) {
      const A = res[`desSueltaE|${salida}${h}`], B = res[`desTodas|${salida}${h}`];
      if (!A || !B) continue;
      const mapa = new Map(B.obs.map((o) => [o.d, o.v]));
      const dif = A.obs.filter((o) => mapa.has(o.d)).map((o) => o.v - mapa.get(o.d));
      console.log(`   ${etiqueta.padEnd(7)} h=${h}   sueltas ${(A.media >= 0 ? "+" : "") + A.media.toFixed(4)} (t=${A.t.toFixed(2)})  vs  todas ${(B.media >= 0 ? "+" : "") + B.media.toFixed(4)} (t=${B.t.toFixed(2)})  ` +
        `→ diferencia ${(media(dif) >= 0 ? "+" : "") + media(dif).toFixed(4)}  t=${t1(dif).toFixed(2)}  (n=${dif.length} días)`);
    }
  }
  console.log("");
  if (guardar) fs.writeFileSync(path.resolve(`scripts/marketsnack/patas-3-salida-${NIVEL}.json`),
    JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { media: v.media, t: v.t, dias: v.dias, nEf: v.nEf }])), null, 1));
  return res;
}

const todo = bloque(`TODA LA VENTANA  ·  ${[...diasOk.keys()].sort()[0]} → ${[...diasOk.keys()].sort().at(-1)}`, diasOk, true);

// ── PARTIDO POR LA RUPTURA DEL 16-JUL ──
const antes = new Map([...diasOk].filter(([d]) => d < RUPTURA));
const despues = new Map([...diasOk].filter(([d]) => d >= RUPTURA));
console.log(`\n### El corte del ${RUPTURA}: ${antes.size} días antes · ${despues.size} días después.`);
console.log(`### La ruptura de MS es de los ÍNDICES (asset_price nulo 100% en SPX/NDX/VIX antes,`);
console.log(`### 0% en acciones a los dos lados). Estos 27 tickers son acciones y ETFs: no les toca.`);
console.log(`### Se parte igualmente por disciplina.\n`);
if (antes.size >= 10) bloque(`ANTES DEL ${RUPTURA}  (${antes.size} días)`, antes, false);
if (despues.size >= 10) bloque(`DESDE EL ${RUPTURA}  (${despues.size} días)`, despues, false);

// ── LAS CUATRO CRIBAS sobre el agrupado, con el retorno neutralizado por día ──
console.log(`${"═".repeat(78)}\nLAS CUATRO CRIBAS (pasarBarrera) sobre las celdas ticker-día\n`);
console.log(`Se neutraliza el día: a cada retorno se le resta la media transversal de ese día, para`);
console.log(`que el tercio alto no gane sólo por haber caído en días buenos.\n`);
for (const h of HOR) {
  for (const [salida, etiqueta] of [["a", "TAMAÑO"], ["r", "SIGNO"]]) {
    const porDiaM = new Map();
    for (const [d, v] of diasOk) {
      const c = v.filter((f) => f[`${salida}${h}`] != null);
      if (c.length) porDiaM.set(d, media(c.map((f) => f[`${salida}${h}`])));
    }
    const fh = filas.filter((f) => f[`${salida}${h}`] != null && porDiaM.has(f.d))
      .map((f) => ({ pnl: f[`${salida}${h}`] - porDiaM.get(f.d), ticker: f.t, fecha: f.d, m: f.desSueltaE }));
    if (fh.length < 50) continue;
    const v = pasarBarrera(fh, (f) => f.m, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
    console.log(informe(v, `${etiqueta} h=${h} · ordenado por desequilibrio de SUELTAS`));
  }
}
