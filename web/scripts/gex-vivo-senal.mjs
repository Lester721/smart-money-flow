// ¿SIRVE EL GEX VIVO PARA ENTRAR? — la hipótesis de Lester, medida.
//
// ═══ POR QUÉ AHORA SÍ SE PUEDE PREGUNTAR ════════════════════════════════════════════════════
//
// Con el interés abierto real, los muros vivos NO persiguen al precio: correlación 0,229 el imán,
// 0,057 el muro de calls, y sólo se mueven el 7-10% de las barras. Tienen vida propia, así que
// preguntar si predicen tiene sentido. (Sin el interés abierto la correlación salía 0,761, pero
// eso era un artefacto: sin peso, el "imán" es el strike cercano al dinero por construcción.)
//
// ═══ LA HIPÓTESIS, TAL CUAL LA DIJO LESTER ══════════════════════════════════════════════════
//
//   "la combinación del gamma negativo y el imán del GEX me proveen información de la dirección
//    que pueda aprovechar en un day trade... me meto en un trade direccional de minutos y salgo
//    en menos de quizá 5 o 10 minutos"
//
// Dos piezas, y se miden por separado y juntas:
//
//   EL IMÁN     el strike con más gamma total. Si atrae, el precio debería ir HACIA él.
//   EL SIGNO    con gamma positiva el mercado se clava (los dealers venden fuerza y compran
//               debilidad); con gamma negativa se amplifica (hacen lo contrario). Así que el
//               imán debería ATRAER con gamma positiva y EMPUJAR con gamma negativa.
//
// ═══ LO QUE DECIDE, Y EL LISTÓN ═════════════════════════════════════════════════════════════
//
// Todo en PUNTOS de SPX, que es lo que se cobra. Entrar al azar da 0,209 puntos por operación:
// ése es el suelo, no el cero.
//
// Y tres controles, porque sin ellos cualquier número parece bueno:
//   1. el imán BARAJADO — el mismo imán, pero de otro día a la misma hora. Rompe el vínculo y
//      conserva la distribución. Si el barajado da lo mismo, no había señal.
//   2. las dos MITADES del período, por separado
//   3. el efecto por HORA, porque un efecto que sólo existe a las 15:55 es el cierre, no el GEX
//
// ═══ SIN MIRAR AL FUTURO ════════════════════════════════════════════════════════════════════
//
// El imán de la barra t se calcula con el spot y la IV DE ESA BARRA y el interés abierto de la
// apertura. El resultado es el precio en t+k. Nada de t+k entra en la decisión.
//
// Uso: node --import tsx --max-old-space-size=12288 scripts/gex-vivo-senal.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const OIDIR = "scripts/cache-theta/oi-spxw";
const SALIDA = "scripts/gex-vivo-senal.json";
const BARRAS = [1, 2, 3, 6, 12];        // 5, 10, 15, 30 y 60 minutos
const LISTON_PUNTOS = 0.209;            // lo que da entrar al azar

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
  const [iK, iT, iV, iU] = ["strike", "timestamp", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iV, iU].some((x) => x < 0)) return null;
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

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
console.log(`\n## GEX VIVO COMO SEÑAL · ${fechas.length} días\n`);

const obs = [];
let sinOI = 0;
for (let d = 0; d < fechas.length; d++) {
  const fecha = fechas[d];
  if (d % 200 === 0) console.log(`   ${d}/${fechas.length} · ${fecha}`);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) continue;
  const fOI = `${OIDIR}/${fecha}.json`;
  if (!existsSync(fOI)) { sinOI++; continue; }        // SIN interés abierto NO se mide. No se rellena.
  const oi = JSON.parse(readFileSync(fOI, "utf8"));

  const horas = [...C.keys()].filter((h) => h >= "09:35" && h <= "15:55").sort();
  if (horas.length < 20) continue;

  const barras = [];
  for (const h of horas) {
    const cc = C.get(h), pp = P.get(h);
    if (!cc || !pp) continue;
    const S = cc.spot;
    const min = (16 - Number(h.slice(0, 2))) * 60 - Number(h.slice(3));
    const T = Math.max(min, 1) / (60 * 6.5 * 252);

    const porStrike = new Map();
    let gexTotal = 0;
    for (const [lado, lista] of [["C", cc.strikes], ["P", pp.strikes]]) {
      for (const s of lista) {
        const peso = Number(oi[`${s.K}|${lado}`] ?? 0);
        if (!(peso > 0)) continue;
        const g = gammaBS(S, s.K, T, s.iv) * peso * 100 * S * S * 0.01;
        if (!isFinite(g) || g <= 0) continue;
        const e = porStrike.get(s.K) ?? { call: 0, put: 0 };
        if (lado === "C") e.call += g; else e.put += g;
        porStrike.set(s.K, e);
        // CONVENIO: los dealers están largos de calls y cortos de puts. GEX>0 = clavan, GEX<0 = amplifican.
        gexTotal += lado === "C" ? g : -g;
      }
    }
    if (porStrike.size < 5) continue;

    let iman = null, maxT = 0;
    for (const [K, e] of porStrike) { if (e.call + e.put > maxT) { maxT = e.call + e.put; iman = K; } }
    if (!iman) continue;
    barras.push({ h, S, iman, gex: gexTotal });
  }

  for (let i = 0; i < barras.length; i++) {
    const b = barras[i];
    const fila = { fecha, hora: b.h, S: b.S, dist: b.iman - b.S, gex: b.gex, i };
    let sirve = false;
    for (const k of BARRAS) {
      if (i + k >= barras.length) continue;
      fila[`d${k}`] = barras[i + k].S - b.S;           // el movimiento, EN PUNTOS
      sirve = true;
    }
    if (sirve) { fila.nBarras = barras.length; obs.push(fila); }
  }
}
console.log(`\n${obs.length.toLocaleString("es-ES")} barras · ${sinOI} días descartados por no tener interés abierto\n`);
if (obs.length < 5000) { console.error("Muestra insuficiente."); process.exit(1); }

// ── EL CONTROL BARAJADO: el imán de otro día, a la misma hora ──────────────
// Conserva la distribución de distancias y rompe el vínculo con ESTE día. Determinista
// (Math.random está prohibido en este proyecto): se empareja con la barra de 500 posiciones
// más adelante en la lista, que es otro día distinto.
const porHora = new Map();
for (const o of obs) { if (!porHora.has(o.hora)) porHora.set(o.hora, []); porHora.get(o.hora).push(o); }
for (const lista of porHora.values()) {
  const n = lista.length;
  for (let j = 0; j < n; j++) lista[j].distBarajada = lista[(j + Math.floor(n / 2)) % n].dist;
}

/** La operación: si el imán está por encima, se compra; si está por debajo, se vende.
 *  Devuelve los PUNTOS ganados. Con gamma negativa se invierte, que es la hipótesis. */
const puntos = (o, k, campo, invertir) => {
  const d = o[campo];
  if (d === 0 || o[`d${k}`] == null) return null;
  const lado = Math.sign(d) * (invertir ? -1 : 1);
  return lado * o[`d${k}`];
};

function fila(nombre, sub, campo, invertir) {
  const cel = BARRAS.map((k) => {
    const v = sub.map((o) => puntos(o, k, campo, invertir)).filter((x) => x != null);
    if (v.length < 500) return "—";
    return `${num(media(v), 3)} (t ${num(tDe(v), 1)})`;
  });
  console.log(`| ${nombre} | ${sub.length.toLocaleString("es-ES")} | ${cel.join(" | ")} |`);
  return BARRAS.map((k) => {
    const v = sub.map((o) => puntos(o, k, campo, invertir)).filter((x) => x != null);
    return { k, n: v.length, pts: media(v), t: tDe(v) };
  });
}

const cab = `| qué | n | ${BARRAS.map((k) => `${k * 5} min`).join(" | ")} |`;
const sep = `|---|---|${BARRAS.map(() => "---").join("|")}|`;

console.log("=".repeat(104));
console.log("  IR HACIA EL IMÁN · puntos de SPX por operación");
console.log(`  (el listón es ${LISTON_PUNTOS} puntos, que es lo que da entrar al azar)`);
console.log("=".repeat(104) + "\n");
console.log(cab); console.log(sep);
const rTodo = fila("**todas las barras**", obs, "dist", false);
fila("· control: imán BARAJADO", obs, "distBarajada", false);
console.log(`| | | | | | | |`);
const pos = obs.filter((o) => o.gex > 0), neg = obs.filter((o) => o.gex < 0);
const rPos = fila("**gamma POSITIVA** (debería clavar)", pos, "dist", false);
fila("· control barajado, gamma positiva", pos, "distBarajada", false);
const rNeg = fila("**gamma NEGATIVA** (debería amplificar)", neg, "dist", false);
fila("· control barajado, gamma negativa", neg, "distBarajada", false);

console.log(`\n### La hipótesis de Lester: con gamma NEGATIVA, ir AL CONTRARIO del imán\n`);
console.log(cab); console.log(sep);
const rNegInv = fila("**gamma negativa, invertido**", neg, "dist", true);
fila("· control barajado", neg, "distBarajada", true);

// ── ¿ES SÓLO EL CIERRE? ────────────────────────────────────────────────────
console.log(`\n### ¿Está el efecto repartido o vive en una hora concreta?  (a 15 minutos)\n`);
console.log("| tramo | n | gamma positiva | gamma negativa |");
console.log("|---|---|---|---|");
for (const [nom, a, b] of [["mañana 09:35-11:30", "09:35", "11:30"], ["medio 11:30-14:00", "11:30", "14:00"], ["tarde 14:00-15:55", "14:00", "15:55"]]) {
  const t = obs.filter((o) => o.hora >= a && o.hora < b);
  const vp = t.filter((o) => o.gex > 0).map((o) => puntos(o, 3, "dist", false)).filter((x) => x != null);
  const vn = t.filter((o) => o.gex < 0).map((o) => puntos(o, 3, "dist", false)).filter((x) => x != null);
  console.log(`| ${nom} | ${t.length.toLocaleString("es-ES")} | ${vp.length > 500 ? `${num(media(vp))} (t ${num(tDe(vp), 1)})` : "—"} | ${vn.length > 500 ? `${num(media(vn))} (t ${num(tDe(vn), 1)})` : "—"} |`);
}

// ── LAS DOS MITADES ────────────────────────────────────────────────────────
const dias = [...new Set(obs.map((o) => o.fecha))].sort();
const corte = dias[Math.floor(dias.length / 2)];
console.log(`\n### Las dos mitades · corte en ${corte}  (a 15 minutos)\n`);
console.log("| qué | primera mitad | segunda mitad | ¿mismo signo? |");
console.log("|---|---|---|---|");
for (const [nom, sub, inv] of [
  ["todas", obs, false],
  ["gamma positiva", pos, false],
  ["gamma negativa", neg, false],
  ["gamma negativa, invertido", neg, true],
]) {
  const a = sub.filter((o) => o.fecha < corte).map((o) => puntos(o, 3, "dist", inv)).filter((x) => x != null);
  const b = sub.filter((o) => o.fecha >= corte).map((o) => puntos(o, 3, "dist", inv)).filter((x) => x != null);
  if (a.length < 500 || b.length < 500) continue;
  console.log(`| ${nom} | ${num(media(a))} (t ${num(tDe(a), 1)}) | ${num(media(b))} (t ${num(tDe(b), 1)}) | ${Math.sign(media(a)) === Math.sign(media(b)) ? "**sí**" : "NO"} |`);
}

// ── EL VEREDICTO ───────────────────────────────────────────────────────────
const mejor = [...rTodo, ...rPos, ...rNeg, ...rNegInv].filter((x) => x.n > 500).sort((a, b) => b.pts - a.pts)[0];
console.log(`\n${"=".repeat(104)}`);
console.log(`  Lo mejor de toda la rejilla: ${num(mejor.pts)} puntos a ${mejor.k * 5} minutos (t ${num(mejor.t, 1)}, n ${mejor.n.toLocaleString("es-ES")})`);
console.log(`  El listón —entrar al azar— está en ${LISTON_PUNTOS} puntos.`);
console.log(`  ${mejor.pts > LISTON_PUNTOS ? "→ LO SUPERA. Falta: mitades, control barajado y que sobreviva a la horquilla." : "→ NO lo supera."}`);
console.log(`\n  Y ojo con el coste: una vertical de SPX cruza la horquilla dos veces. Un efecto de`);
console.log(`  décimas de punto puede ser real y aun así no llegar a la caja.`);
console.log("=".repeat(104) + "\n");

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString().slice(0, 10), n: obs.length, todo: rTodo, gexPos: rPos, gexNeg: rNeg, gexNegInv: rNegInv }, null, 1), "utf8");
