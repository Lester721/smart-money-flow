// EL GEX VIVO — la versión que Victor mira de verdad, y que nunca hemos medido.
//
// ═══ LA DIFERENCIA, Y POR QUÉ IMPORTA ═══════════════════════════════════════════════════════
//
// Los niveles que medimos (gex-niveles.json) están CONGELADOS a las 09:35: se calculan una vez,
// con el interés abierto de ayer y el precio y la IV de la apertura, y no se tocan más.
//
// El panel de MarketSnack —el que Victor mira— SE RECALCULA durante la sesión. El interés abierto
// sigue siendo el de ayer (no se publica intradía), pero la GAMMA de cada strike depende del
// PRECIO y de la IV, y esos cambian minuto a minuto. Así que sus muros se mueven.
//
// Y ahí está la pregunta que decide, con dos respuestas posibles y opuestas:
//
//   (a) el muro vivo ES MEJOR → hay información en el recálculo, y la versión congelada la tira
//   (b) el muro vivo PERSIGUE AL PRECIO → y por eso PARECE que lo describe. Es el efecto de una
//       media móvil: a posteriori nunca falla, y en directo no dice nada
//
// Hasta hoy no puedo decirle a Lester cuál de las dos es. Esto lo resuelve.
//
// ═══ LO QUE SE MIDE ═════════════════════════════════════════════════════════════════════════
//
// Para cada barra de 5 minutos de cada día:
//   1. se recalcula la gamma de cada strike con el spot y la IV DE ESA BARRA (el OI sigue siendo
//      el de ayer: es lo único conocido)
//   2. se sacan muro de calls, muro de puts e imán VIVOS
//   3. se anota cuánto se han movido respecto a la barra anterior, y cuánto se movió el precio
//
// LA MEDICIÓN CLAVE: **la correlación entre el movimiento del muro y el del precio.** Si es alta,
// el muro persigue y la respuesta es (b). Si es baja, el muro tiene vida propia y merece medirse
// como señal.
//
// Y después, el mismo control de siempre: ¿para el precio mejor que una raya al azar?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/gex-vivo.mjs [nDias]

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const OIDIR = "scripts/cache-theta/oi-spxw";
const SALIDA = "scripts/gex-vivo-resultado.json";
const N_DIAS = Number(process.argv[2] || 0);        // 0 = todos

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const corr = (a, b) => {
  const ma = media(a), mb = media(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : NaN;
};

// Gamma de Black-Scholes. SÓLO se usa para la GRIEGA, nunca para un precio — lo teórico está
// vetado en el camino del dinero (ver lib/PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS.ts).
const phi = (x) => 0.3989422804014327 * Math.exp((-x * x) / 2);
function gammaBS(S, K, T, v) {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(v > 0)) return 0;
  const d1 = (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
  const g = phi(d1) / (S * v * Math.sqrt(T));
  return isFinite(g) ? g : 0;
}

/** Lee la cadena de un día: por cada marca de 5 min, los strikes con su IV. */
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) return null;
  const [iK, iT, iV, iU] = idx;
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

/** El interés abierto de AYER, que es lo último conocido durante la sesión. */
function leerOI(fecha) {
  for (const p of [`${OIDIR}/${fecha}.json`, `${OIDIR}/oi_${fecha}.json`]) {
    if (existsSync(p)) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
  }
  return null;
}

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const usar = N_DIAS ? fechas.slice(-N_DIAS) : fechas;
console.log(`\n## GEX VIVO · ${usar.length} días (${usar[0]} → ${usar[usar.length - 1]})\n`);

const hayOI = existsSync(OIDIR) ? readdirSync(OIDIR).length : 0;
console.log(`interés abierto en disco: ${hayOI} ficheros en ${OIDIR}`);
if (!hayOI) {
  console.log(`\n⚠️  SIN INTERÉS ABIERTO no se puede pesar la gamma por posición real.`);
  console.log(`   Se mide con la gamma BRUTA (todos los strikes igual), que es una aproximación`);
  console.log(`   DISTINTA — no la misma cosa con menos precisión. Se dice, no se disimula.\n`);
}

// ── una pasada ──────────────────────────────────────────────────────────────
const obs = [];              // una fila por barra: movimiento del muro y del precio
let sinDatos = 0;
for (let d = 0; d < usar.length; d++) {
  const fecha = usar[d];
  if (d % 150 === 0) console.log(`   ${d}/${usar.length} · ${fecha}`);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { sinDatos++; continue; }
  const oi = leerOI(fecha);

  const horas = [...C.keys()].filter((h) => h >= "09:35" && h <= "16:00").sort();
  if (horas.length < 10) { sinDatos++; continue; }

  let prev = null;
  for (const h of horas) {
    const cc = C.get(h), pp = P.get(h);
    if (!cc || !pp) continue;
    const S = cc.spot;
    // el tiempo que queda hasta el cierre, en años — la gamma de 0DTE depende muchísimo de esto
    const min = (16 - Number(h.slice(0, 2))) * 60 - Number(h.slice(3));
    const T = Math.max(min, 1) / (60 * 6.5 * 252);

    const porStrike = new Map();
    for (const [lado, lista] of [["C", cc.strikes], ["P", pp.strikes]]) {
      for (const s of lista) {
        const peso = oi ? Number(oi[`${s.K}|${lado}`] ?? oi[lado]?.[s.K] ?? 0) : 1;
        if (!(peso > 0)) continue;
        const g = gammaBS(S, s.K, T, s.iv) * peso * 100 * S * S * 0.01;
        if (!isFinite(g) || g <= 0) continue;
        const e = porStrike.get(s.K) ?? { call: 0, put: 0 };
        if (lado === "C") e.call += g; else e.put += g;
        porStrike.set(s.K, e);
      }
    }
    if (porStrike.size < 5) continue;

    let muroCall = null, muroPut = null, iman = null, maxC = 0, maxP = 0, maxT = 0;
    for (const [K, e] of porStrike) {
      if (e.call > maxC) { maxC = e.call; muroCall = K; }
      if (e.put > maxP) { maxP = e.put; muroPut = K; }
      if (e.call + e.put > maxT) { maxT = e.call + e.put; iman = K; }
    }
    if (prev && muroCall && iman) {
      obs.push({
        fecha, hora: h,
        dPrecio: S - prev.S,
        dMuroCall: muroCall - prev.muroCall,
        dMuroPut: muroPut - prev.muroPut,
        dIman: iman - prev.iman,
        distIman: ((S - iman) / S) * 100,
      });
    }
    prev = { S, muroCall, muroPut, iman };
  }
}

console.log(`\n${obs.length.toLocaleString("es-ES")} barras medidas · ${sinDatos} días sin dato\n`);
if (obs.length < 500) { console.error("Muestra insuficiente."); process.exit(1); }

// ── LA MEDICIÓN QUE DECIDE ──────────────────────────────────────────────────
const dP = obs.map((o) => o.dPrecio);
console.log(`${"═".repeat(76)}`);
console.log(`  ¿EL MURO VIVO PERSIGUE AL PRECIO?`);
console.log("═".repeat(76));
console.log("\n| nivel | correlación con el movimiento del precio | veces que se mueve |");
console.log("|---|---|---|");
for (const [nom, k] of [["muro de calls", "dMuroCall"], ["muro de puts", "dMuroPut"], ["imán", "dIman"]]) {
  const v = obs.map((o) => o[k]);
  const mueve = (v.filter((x) => x !== 0).length / v.length) * 100;
  console.log(`| ${nom} | **${corr(dP, v).toFixed(3)}** | ${mueve.toFixed(1)}% de las barras |`);
}

const c = corr(dP, obs.map((o) => o.dIman));
console.log(`\n${"═".repeat(76)}`);
if (c > 0.5) {
  console.log(`  🔴 EL IMÁN PERSIGUE AL PRECIO (correlación ${c.toFixed(3)}).`);
  console.log(`     Eso explica por qué el panel de Victor "acierta" mirándolo a posteriori: el`);
  console.log(`     nivel se mueve HACIA donde va el precio, igual que una media móvil. Un nivel`);
  console.log(`     que sigue al precio siempre parece describirlo, y en directo no dice nada.`);
} else if (c > 0.2) {
  console.log(`  🟡 EL IMÁN SIGUE EN PARTE AL PRECIO (correlación ${c.toFixed(3)}).`);
  console.log(`     Ni independiente ni pura persecución. Hay que medir el RESIDUO: lo que el muro`);
  console.log(`     hace por encima de lo que explica el precio.`);
} else {
  console.log(`  🟢 EL IMÁN NO PERSIGUE AL PRECIO (correlación ${c.toFixed(3)}).`);
  console.log(`     Tiene vida propia, así que la versión viva SÍ podría tener información que la`);
  console.log(`     congelada tira. Merece medirla como señal.`);
}
console.log("═".repeat(76));

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), dias: usar.length, obs: obs.length, conOI: !!hayOI, corrIman: c }, null, 1), "utf8");
console.log(`\nresumen en ${SALIDA} · el detalle por barra NO se guarda (pesa demasiado)`);
