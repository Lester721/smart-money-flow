// PATAS SUELTAS · PASO 6 — EL PUENTE: qué le falta EXACTAMENTE, con números
//
// No basta con decir que no pasó. Estas son las tres distancias que hay que cubrir, cada una
// medida sobre los mismos datos:
//
//   A. ¿Cuánto movimiento extra necesita el cono para NO perder? (elasticidad real medida,
//      no supuesta: se ajusta el retorno del cono contra el |movimiento| del subyacente)
//   B. ¿Cuánto movimiento extra da la señal de verdad? (el separado del paso 4, con y sin el
//      control de volatilidad del ticker)
//   C. ¿Cuántos días de flujo harían falta para que el efecto observado llegara al listón?
//
// Uso: node --import tsx scripts/marketsnack/patas-6-puente.mjs [100k]

import fs from "node:fs";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos.ts";

const NIVEL = process.argv[2] || "100k";
const H = 5, MIN_OPS = 5, MIN_TICKERS = 9, CUENTA = 56389, VENTANA_VOL = 60;

const panel = JSON.parse(fs.readFileSync(path.resolve(`scripts/marketsnack/patas-2-panel-${NIVEL}.json`), "utf8"));
const CIERRES = path.resolve("scripts/cache-theta/cierres");
const CADENAS = path.resolve("scripts/cache-theta/cadenas");
const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) {
  const t = f.replace(".json", "");
  const j = JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8"));
  const dias = Object.keys(j).sort();
  cierres.set(t, { j, dias, idx: new Map(dias.map((d, i) => [d, i])) });
}
const cacheCad = new Map();
const cadena = (t, y) => { const k = `${t}_${y}`; if (!cacheCad.has(k)) { try { cacheCad.set(k, JSON.parse(fs.readFileSync(path.join(CADENAS, `${t}_d${y}.json`), "utf8"))); } catch { cacheCad.set(k, null); } } return cacheCad.get(k); };

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const t1 = (a) => (a.length < 3 ? 0 : media(a) / (de(a) / Math.sqrt(a.length)));

for (const f of panel) {
  const c = cierres.get(f.t); if (!c) continue;
  const i = c.idx.get(f.d.replaceAll("-", "")); if (i == null || i + H >= c.dias.length) continue;
  f.i = i; f.ok = true;
  const p0 = c.j[c.dias[i]], p1 = c.j[c.dias[i + H]];
  f.r5 = ((p1 - p0) / p0) * 100; f.a5 = Math.abs(f.r5);
  if (i >= VENTANA_VOL) {
    const rs = []; for (let k = i - VENTANA_VOL + 1; k <= i; k++) rs.push((c.j[c.dias[k]] - c.j[c.dias[k - 1]]) / c.j[c.dias[k - 1]] * 100);
    f.vol = de(rs);
  }
}
const usable = panel.filter((f) => f.ok && f.nSueltaE >= MIN_OPS && f.nTodas >= MIN_OPS && f.desSueltaE != null);
const diasOk = new Map();
for (const f of usable) { if (!diasOk.has(f.d)) diasOk.set(f.d, []); diasOk.get(f.d).push(f); }
for (const [d, v] of [...diasOk]) if (v.length < MIN_TICKERS) diasOk.delete(d);

// ── conos reales (mismo constructor que el paso 5) ──
function cono(f) {
  const c = cierres.get(f.t), ymd = f.d.replaceAll("-", ""), ymdSal = c.dias[f.i + H];
  const cad = cadena(f.t, ymd), cadSal = cadena(f.t, ymdSal); if (!cad || !cadSal) return null;
  const spot = c.j[ymd];
  const vencs = Object.keys(cad).filter((v) => v > ymdSal).sort(); if (!vencs.length) return null;
  const venc = vencs[0], cont = cad[venc];
  const strikes = [...new Set(Object.keys(cont).map((k) => Number(k.split("|")[0])))].sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot));
  for (const s of strikes) {
    const qc = cont[`${s}|C`], qp = cont[`${s}|P`]; if (!qc || !qp) continue;
    if (!(qc[0] > 0 && qc[1] > qc[0] && qp[0] > 0 && qp[1] > qp[0])) continue;
    const cs = cadSal[venc]; if (!cs) return null;
    const qcS = cs[`${s}|C`], qpS = cs[`${s}|P`]; if (!qcS || !qpS) return null;
    const coste = qc[1] + qp[1], salida = qcS[0] + qpS[0];
    if (!(coste > 0)) return null;
    return { t: f.t, d: f.d, coste: coste * 100, ret: (salida - coste) / coste * 100, a5: f.a5, spot, primaPct: coste / spot * 100 };
  }
  return null;
}
const conos = [];
for (const v of diasOk.values()) for (const f of v) { const c = cono(f); if (c) conos.push(c); }

console.log(`═══ EL PUENTE · qué le falta a la señal, con números ═══\n`);
console.log(`   conos con precios reales: ${conos.length}  ·  días: ${new Set(conos.map((c) => c.d)).size}\n`);

// ── A · ELASTICIDAD: cuánto movimiento hace falta para que el cono no pierda ──
const x = conos.map((c) => c.a5), y = conos.map((c) => c.ret);
const mx = media(x), my = media(y);
let sxy = 0, sxx = 0;
for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
const b = sxy / sxx, a = my - b * mx;
const equilibrio = -a / b;
const resid = y.map((yi, i) => yi - (a + b * x[i]));
const seB = Math.sqrt((resid.reduce((s, r) => s + r * r, 0) / (x.length - 2)) / sxx);
console.log(`── A · LA ELASTICIDAD REAL DEL CONO ──`);
console.log(`   retorno del cono = ${a.toFixed(2)} + ${b.toFixed(2)} × |movimiento a 5 días|   (t del coeficiente = ${(b / seB).toFixed(1)}, n=${x.length})`);
console.log(`   → cada punto extra de |movimiento| vale ${b.toFixed(2)} puntos de retorno del cono`);
console.log(`   → el cono EMPATA cuando el subyacente se mueve ${equilibrio.toFixed(2)}%  en 5 días`);
console.log(`   → el movimiento medio real es ${mx.toFixed(2)}%  ·  falta ${(equilibrio - mx).toFixed(2)} puntos`);
console.log(`   (prima del cono como % del subyacente: mediana ${[...conos.map((c) => c.primaPct)].sort((p, q) => p - q)[Math.floor(conos.length / 2)].toFixed(2)}%)\n`);

// ── B · LO QUE LA SEÑAL DA DE VERDAD ──
function sep(metrica, salida) {
  const obs = [];
  for (const v of diasOk.values()) {
    const con = v.filter((f) => f[metrica] != null && f[salida] != null);
    if (con.length < MIN_TICKERS) continue;
    const ord = [...con].sort((p, q) => p[metrica] - q[metrica]), k = Math.floor(ord.length / 3);
    obs.push(media(ord.slice(-k).map((f) => f[salida])) - media(ord.slice(0, k).map((f) => f[salida])));
  }
  return { m: media(obs), t: t1(obs), n: obs.length };
}
for (const f of panel) if (f.vol > 0 && f.a5 != null) f.z5 = f.a5 / (f.vol * Math.sqrt(H));
const crudo = sep("desSueltaE", "a5");
const control = sep("desSueltaE", "z5");
const volMedia = media(usable.filter((f) => f.vol > 0).map((f) => f.vol)) * Math.sqrt(H);
console.log(`── B · LO QUE LA SEÑAL SEPARA DE VERDAD ──`);
console.log(`   sin control     : +${crudo.m.toFixed(3)} puntos de |movimiento|  (t=${crudo.t.toFixed(2)}, ${crudo.n} días, n efectiva ${(crudo.n / H).toFixed(1)})`);
console.log(`   con el control de volatilidad del ticker: +${control.m.toFixed(4)} unidades de vol propia`);
console.log(`   = +${(control.m * volMedia).toFixed(3)} puntos de |movimiento|  (t=${control.t.toFixed(2)})`);
console.log(`   → el ${((1 - (control.m * volMedia) / crudo.m) * 100).toFixed(0)}% del separado bruto era el TICKER, no la señal\n`);

// ── C · CUÁNTO FALTA PARA CADA COSA ──
const LISTON = listonT(24);
const faltaMov = equilibrio - mx;
const real = control.m * volMedia;
console.log(`── C · LAS TRES DISTANCIAS ──`);
console.log(`   1) PARA QUE EL CONO DEJE DE PERDER`);
console.log(`      hace falta que la señal añada ${faltaMov.toFixed(2)} puntos de |movimiento|`);
console.log(`      la señal añade ${real.toFixed(3)} puntos (ya limpia de ticker)`);
console.log(`      → cubre el ${((real / faltaMov) * 100).toFixed(1)}% de lo que hace falta · necesita ser ${(faltaMov / real).toFixed(0)}× más fuerte\n`);
const nEfActual = control.n / H;
const nEfNecesaria = nEfActual * (LISTON / Math.abs(control.t)) ** 2;
console.log(`   2) PARA QUE EL EFECTO OBSERVADO LLEGUE AL LISTÓN (|t| ≥ ${LISTON})`);
console.log(`      n efectiva actual: ${nEfActual.toFixed(1)} ventanas de ${H} días  (t=${control.t.toFixed(2)})`);
console.log(`      n efectiva necesaria: ${nEfNecesaria.toFixed(0)} ventanas = ${(nEfNecesaria * H).toFixed(0)} sesiones ≈ ${(nEfNecesaria * H / 252).toFixed(1)} años de flujo`);
console.log(`      tenemos 86 días. Falta ${((nEfNecesaria * H) / 86).toFixed(1)}× más historia — y el archivo de MarketSnack es una ventana rodante.\n`);
const dA = conos.filter((c) => c.grupo === "alto");
console.log(`   3) PARA QUE EL PEAJE DEJE DE MANDAR`);
const horq = conos.map((c) => c.coste);
console.log(`      el cono pierde ${my.toFixed(2)}% de media con precios reales;`);
console.log(`      la horquilla del cono ATM a 9 días es el 7,8% de la prima (medido en el paso 5).`);
console.log(`      Aunque la señal fuese perfecta y el listón se cumpliera, ${real.toFixed(3)} puntos de movimiento`);
console.log(`      valen ${(real * b).toFixed(2)} puntos de retorno del cono: no llega ni a un cuarto del peaje.\n`);

// ── DÓLARES AL AÑO de lo que hay ──
const porDia = new Map();
for (const c of conos) { if (!porDia.has(c.d)) porDia.set(c.d, { coste: 0, pnl: 0 }); const e = porDia.get(c.d); e.coste += c.coste; e.pnl += c.coste * c.ret / 100; }
console.log(`── EN DÓLARES, sobre la cuenta de $${CUENTA.toLocaleString("es-ES")} ──`);
const costeDia = media([...porDia.values()].map((e) => e.coste));
console.log(`   comprar TODOS los conos: $${costeDia.toFixed(0)}/día · capital atado ${H}×: $${(costeDia * H).toFixed(0)}`);
console.log(`   escala que cabe: ${(Math.min(1, CUENTA / (costeDia * H)) * 100).toFixed(0)}%`);
const esc = Math.min(1, CUENTA / (costeDia * H));
console.log(`   $/año = 252 cestas × $${media([...porDia.values()].map((e) => e.pnl)).toFixed(0)} × ${(esc * 100).toFixed(0)}% = $${(252 * media([...porDia.values()].map((e) => e.pnl)) * esc).toFixed(0)}/año\n`);

fs.writeFileSync(path.resolve(`scripts/marketsnack/patas-6-salida-${NIVEL}.json`), JSON.stringify({
  elasticidad: b, tElasticidad: b / seB, equilibrioPct: equilibrio, movMedio: mx,
  separadoCrudo: crudo, separadoControl: control, separadoEnPuntos: real,
  faltaMovimiento: faltaMov, cobertura: real / faltaMov,
  nEfActual, nEfNecesaria, sesionesNecesarias: nEfNecesaria * H,
  dolaresAlAno: 252 * media([...porDia.values()].map((e) => e.pnl)) * esc,
  capitalComprometido: costeDia * H * esc,
}, null, 1));
