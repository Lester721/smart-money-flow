// EL GEX PESADO POR VOLUMEN ACUMULADO — la versión honesta.
//
// ═══ EL ERROR QUE ESTO CORRIGE ══════════════════════════════════════════════════════════════
//
// El primer intento pesó la gamma por el volumen del DÍA ENTERO y salió prediciendo 2,354 puntos
// a 30 minutos con t=49. Era mentira: el volumen del día sólo se conoce al cierre, así que llevaba
// dentro dónde acabó el precio. La forma lo delataba —crecía con el horizonte— y la prueba directa
// lo confirmó: el strike de más volumen está a 11 puntos del CIERRE y a 23 de las 09:35.
//
// ═══ LA TRAMPA DE LAS ETIQUETAS DE TIEMPO — leer antes de tocar nada ════════════════════════
//
// Una barra OHLC se etiqueta por su INICIO. La barra "09:35" contiene el volumen de 09:35 a 09:40.
// La cotización etiquetada "09:35" es de las 09:35 en punto.
//
// Así que a las 09:35, cuando se decide, lo que se conoce es el volumen hasta la barra "09:30"
// (que cubre 09:30–09:35). **La barra con la misma etiqueta que la decisión NO se puede usar.**
//
// Esto ya nos costó un hallazgo entero una vez. Aquí el acumulado es ESTRICTAMENTE hasta la barra
// anterior, y por eso la primera decisión posible es a las 09:35 (con el volumen de una sola barra).
//
// ═══ LO QUE SE COMPARA ══════════════════════════════════════════════════════════════════════
//
//   · el peso de siempre: INTERÉS ABIERTO de ayer
//   · el peso nuevo:      VOLUMEN ACUMULADO hasta la barra anterior
//   · el control:         el imán de OTRO DÍA a la misma hora (rompe el vínculo, conserva la forma)
//
// Los tres sobre LAS MISMAS BARRAS. El listón es 0,209 puntos, que es lo que da entrar al azar.
//
// Uso: node --import tsx --max-old-space-size=12288 scripts/gex-volumen-acumulado.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const OIDIR = "scripts/cache-theta/oi-spxw";
const VDIR = "scripts/cache-theta/vol-intradia";
const BARRAS = [1, 3, 6];
const LISTON = 0.209;

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => (v.length > 2 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const num = (x, d = 3) => (isFinite(x) ? x.toFixed(d) : "—");

const phi = (x) => 0.3989422804014327 * Math.exp((-x * x) / 2);
function gammaBS(S, K, T, v) {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(v > 0)) return 0;
  const d1 = (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
  const g = phi(d1) / (S * v * Math.sqrt(T));
  return isFinite(g) ? g : 0;
}

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const ix = ["strike", "timestamp", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (ix.some((x) => x < 0)) return null;
  const [iK, iT, iV, iU] = ix;
  const porHora = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16);
    const K = Number(c[iK]), iv = Number(c[iV]), sp = Number(c[iU]);
    if (!(K > 0) || !(iv > 0.01) || iv > 4 || !(sp > 0)) continue;
    if (!porHora.has(h)) porHora.set(h, { spot: sp, strikes: [] });
    porHora.get(h).strikes.push({ K, iv });
  }
  return porHora;
}

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))]
  .filter((d) => existsSync(`${OIDIR}/${d}.json`) && existsSync(`${VDIR}/${d}.json`))
  .sort();
console.log(`\n## ${fechas.length} días con cadena, interés abierto Y volumen intradía`);
console.log(`   ${fechas[0]} → ${fechas[fechas.length - 1]}  ·  la descarga sigue: esto es un vistazo\n`);

const obs = [];
let sinImanVol = 0;
for (let d = 0; d < fechas.length; d++) {
  const fecha = fechas[d];
  if (d % 50 === 0) console.log(`   ${d}/${fechas.length} · ${fecha}`);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) continue;
  const oi = JSON.parse(readFileSync(`${OIDIR}/${fecha}.json`, "utf8"));
  const vol = JSON.parse(readFileSync(`${VDIR}/${fecha}.json`, "utf8"));

  const horas = [...C.keys()].filter((h) => h >= "09:35" && h <= "15:55").sort();
  if (horas.length < 10) continue;
  const horasVol = Object.keys(vol).sort();

  // EL ACUMULADO, barra a barra. Se construye hacia adelante para no recalcularlo.
  const acum = new Map();
  let iVol = 0;
  const barras = [];
  for (const h of horas) {
    // ── se mete en el acumulado TODO lo ANTERIOR a la etiqueta de la decisión ──
    // La barra "09:35" cubre 09:35–09:40, así que a las 09:35 aún no ha ocurrido.
    while (iVol < horasVol.length && horasVol[iVol] < h) {
      for (const [k, v] of Object.entries(vol[horasVol[iVol]])) acum.set(k, (acum.get(k) ?? 0) + v);
      iVol++;
    }
    const cc = C.get(h), pp = P.get(h);
    if (!cc || !pp) continue;
    const S = cc.spot;
    const min = (16 - Number(h.slice(0, 2))) * 60 - Number(h.slice(3));
    const T = Math.max(min, 1) / (60 * 6.5 * 252);

    const porOI = new Map(), porVol = new Map();
    for (const [lado, lista] of [["C", cc.strikes], ["P", pp.strikes]]) {
      for (const s of lista) {
        const g1 = gammaBS(S, s.K, T, s.iv) * 100 * S * S * 0.01;
        if (!isFinite(g1) || g1 <= 0) continue;
        const wOI = Number(oi[`${s.K}|${lado}`] ?? 0);
        const wV = acum.get(`${s.K}|${lado}`) ?? 0;
        if (wOI > 0) porOI.set(s.K, (porOI.get(s.K) ?? 0) + g1 * wOI);
        if (wV > 0) porVol.set(s.K, (porVol.get(s.K) ?? 0) + g1 * wV);
      }
    }
    const mayor = (m) => { let k = null, mx = 0; for (const [K, g] of m) if (g > mx) { mx = g; k = K; } return k; };
    const imOI = porOI.size >= 5 ? mayor(porOI) : null;
    const imVol = porVol.size >= 5 ? mayor(porVol) : null;
    if (!imVol) sinImanVol++;
    barras.push({ h, S, imOI, imVol });
  }

  for (let i = 0; i < barras.length; i++) {
    const b = barras[i];
    if (!b.imOI && !b.imVol) continue;
    const fila = { fecha, hora: b.h, distOI: b.imOI ? b.imOI - b.S : null, distVol: b.imVol ? b.imVol - b.S : null };
    let sirve = false;
    for (const k of BARRAS) {
      if (i + k >= barras.length) continue;
      fila[`d${k}`] = barras[i + k].S - b.S;
      sirve = true;
    }
    if (sirve) obs.push(fila);
  }
}
console.log(`\n${obs.length.toLocaleString("es-ES")} barras · ${sinImanVol.toLocaleString("es-ES")} sin imán por volumen (aún no había操 suficiente)\n`.replace("操", ""));
if (obs.length < 2000) { console.error("Muestra insuficiente."); process.exit(1); }

// ── el control barajado: el imán de otro día a la misma hora ───────────────
const porHora = new Map();
for (const o of obs) { if (!porHora.has(o.hora)) porHora.set(o.hora, []); porHora.get(o.hora).push(o); }
for (const lista of porHora.values()) {
  const n = lista.length;
  for (let j = 0; j < n; j++) lista[j].distBarajada = lista[(j + Math.floor(n / 2)) % n].distVol;
}

const puntos = (o, k, campo) => {
  const dd = o[campo];
  if (dd == null || dd === 0 || o[`d${k}`] == null) return null;
  return Math.sign(dd) * o[`d${k}`];
};

console.log("=".repeat(96));
console.log("  IR HACIA EL IMÁN · puntos de SPX por operación");
console.log(`  (el listón es ${LISTON}: lo que da entrar al azar)`);
console.log("=".repeat(96) + "\n");
console.log(`| peso del imán | n | ${BARRAS.map((k) => `${k * 5} min`).join(" | ")} |`);
console.log(`|---|---|${BARRAS.map(() => "---").join("|")}|`);
const res = {};
for (const [nom, campo] of [
  ["interés abierto (lo de hoy)", "distOI"],
  ["**VOLUMEN acumulado**", "distVol"],
  ["· control: volumen BARAJADO", "distBarajada"],
]) {
  const cel = [], vals = [];
  for (const k of BARRAS) {
    const v = obs.map((o) => puntos(o, k, campo)).filter((x) => x != null);
    vals.push(v.length >= 500 ? media(v) : NaN);
    cel.push(v.length < 500 ? "—" : `${num(media(v))} (t ${num(tDe(v), 1)})`);
  }
  res[campo] = vals;
  const n = obs.filter((o) => o[campo] != null).length;
  console.log(`| ${nom} | ${n.toLocaleString("es-ES")} | ${cel.join(" | ")} |`);
}

// ── ¿crece con el horizonte? la firma de mirar al futuro ───────────────────
const v = res.distVol.filter((x) => isFinite(x));
const crece = v.length === BARRAS.length && v[0] < v[1] && v[1] < v[2];
console.log(`\n${"=".repeat(96)}`);
if (crece && v[2] > LISTON) {
  console.log(`  ⚠️  CRECE CON EL HORIZONTE (${v.map((x) => num(x)).join(" → ")}).`);
  console.log(`     Ésa es la firma de estar mirando al futuro, no de una señal. ANTES de celebrarlo`);
  console.log(`     hay que buscar por dónde se cuela el dato posterior.`);
} else if (Math.max(...v) > LISTON) {
  console.log(`  🟢 SUPERA EL LISTÓN sin crecer con el horizonte: ${v.map((x) => num(x)).join(" · ")}`);
  console.log(`     Falta el cruce de mitades y comprobar que sobreviva a la horquilla.`);
} else {
  console.log(`  🔴 NO SUPERA EL LISTÓN. Lo mejor con volumen acumulado es ${num(Math.max(...v))} puntos`);
  console.log(`     contra ${LISTON} de entrar al azar. La báscula NO era el problema.`);
}
console.log("=".repeat(96) + "\n");
