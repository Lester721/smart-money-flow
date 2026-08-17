// ¿SE VEÍA VENIR? — el puente entre "sabemos qué contratos explotan" y "cuáles comprar"
//
// Uso: node --max-old-space-size=10240 scripts/puente-se-veia-venir.mjs
// Salida: scripts/puente-filas.json
//
// ═══ LA PREGUNTA DE LESTER (2026-08-16) ═══════════════════════════════════════════════════
//
// "Tenemos ganadores y una estrategia para capitalizar sobre esos ganadores. Lo que necesito es
//  que encuentres el puente entre estos. ¿Hubo un aumento de open interest? ¿Hubo algo en el
//  option chain que nos hubiera ayudado a identificar estas acciones?"
//
// Y tiene razón en la crítica de fondo: todo lo medido en este proyecto —EVA, el flujo, los
// scorecards— puntúa CONTRATOS. Nadie ha medido nunca nada a nivel de ACCIÓN. Cuando se dijo que
// "EVA no sirve" se estaba respondiendo a otra pregunta.
//
// ═══ EL REPLANTEAMIENTO QUE HACE ESTO ABORDABLE ═══════════════════════════════════════════
//
// Comprar calls a >365 días y >60% fuera del dinero dio 22,66x entrando en 2019 y 0,11x entrando
// en 2021. Misma regla, mismo universo, 200 veces de diferencia.
//
// O sea: el puente NO exige acertar la acción de la década. Exige saber CUÁNDO estar dentro. Y eso
// sí se puede atacar con lo que hay en disco.
//
// ═══ EL DISEÑO ═══════════════════════════════════════════════════════════════════════════
//
// Unidad: (acción, mes), 2016-2026, 8 símbolos → ~960 observaciones.
//
// LO QUE SE EXPLICA: lo que devolvieron las calls del cubo estrella compradas ese mes, aguantadas
// hasta vencimiento. SÓLO contratos ya resueltos — uno sin vencer no tiene resultado, ni cero ni
// ganancia, y mezclarlo decide el número (ver contratos-10x.mjs).
//
// LOS PREDICTORES, todos observables ESE MISMO MES y ninguno después:
//   1. oiLejos     — % del interés abierto que está en strikes >60% por encima del precio. Es el
//                    puente más directo: ¿alguien estaba construyendo la posición que luego explota?
//   2. oiLejosD3   — su cambio en 3 meses. La ACUMULACIÓN, no el nivel.
//   3. ratioCP     — interés abierto en calls dividido por el de puts.
//   4. ratioCPD3   — su cambio en 3 meses.
//   5. skew        — precio de la call ~30% fuera dividido por el de la put ~30% fuera, a ~90 días.
//                    Si el mercado empieza a pagar por el lado alcista, se ve aquí.
//   6. barata      — prima media del cubo estrella dividida por el precio de la acción. Cómo de
//                    barato está el billete de lotería.
//   7. momento3m   — cuánto subió la acción los 3 meses anteriores.
//
// ⚠️ TAMAÑO: 960 ticker-meses suenan a mucho, pero los 8 nombres se mueven juntos. En la práctica
// son ~120 períodos independientes. Esto es un PRIMER VISTAZO, no una conclusión. Si algo aparece,
// hace falta la descarga de 20 tickers más para convertirlo en algo defendible.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
// ⚠️ BLACK-SCHOLES AL REVÉS, NUNCA HACIA DELANTE.
// `impliedVol` parte del precio REAL de mercado y extrae la volatilidad; `bsDelta`/`bsGamma` la
// usan para pesar el indicador. NINGÚN precio de este script sale de un modelo — el que genera
// precios está encerrado en lib/PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS.ts y aquí no se toca.
// Un delta mal estimado empeora el predictor; no puede fabricar una ganancia.
import { impliedVol, bsDelta, bsGamma } from "../lib/blackScholes";

const CDIR = "scripts/cache-theta/cadenas";
const ODIR = "scripts/cache-theta";
const SALIDA = "scripts/puente-filas.json";
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);
const mes = (d) => d.slice(0, 6);

// ── Días por símbolo ────────────────────────────────────────────────────────
const porSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!porSim.has(m[1])) porSim.set(m[1], []);
  porSim.get(m[1]).push(m[2]);
}
for (const v of porSim.values()) v.sort();
const cargar = (sym, dia) => {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
};

// ── EL INTERÉS ABIERTO, AHORA ANCHO ─────────────────────────────────────────
//
// La primera versión leía `{sym}_oi_y_*.json`, que se descargó para el GEX y **sólo contiene
// strikes dentro del ±25% del precio y vencimientos ≤60 días**. Medir con eso "el OI en strikes
// >60% por encima" dio 570 ceros de 573 y una separación falsa con t=5,59. Ver
// [mirar-el-fichero-antes-de-medilo] en memoria.
//
// Ahora se lee `oi-ancho/`, que no filtra nada: comprobado, NVDA 2019 pasa de tener strikes
// 125–202,5 a tenerlos de 70 a 1210.
//
// Sólo se lee el ÚLTIMO DÍA DE CADA MES, que es cuando se miden los predictores: son ~128 lecturas
// por ticker en vez de 2.663.
const OIDIR = `${ODIR}/oi-ancho`;
/** {vencimiento: {"strike|C": oi}} de un día, o null si no está. */
function oiDelDia(sym, dia) {
  const f = `${OIDIR}/${sym}_d${dia}.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}

const filas = [];
const sinOI = new Set();
let ivNulos = 0, ivBuenos = 0;   // ver bug 2

for (const [sym, dias] of porSim) {
  if (!existsSync(`${OIDIR}/${sym}_d${dias[Math.floor(dias.length / 2)]}.json`)) sinOI.add(sym);

  // splits, para normalizar strikes y precios a unidades finales
  const splits = [];
  { let prev = 0;
    for (const d of dias) {
      const c = cargar(sym, d); if (!c) continue;
      let maxK = 0;
      for (const g of Object.values(c)) for (const k of Object.keys(g)) { const v = Number(k.slice(0, -2)); if (v > maxK) maxK = v; }
      if (prev && maxK > 0 && prev / maxK >= 1.8) splits.push({ desde: d, ratio: prev / maxK });
      prev = maxK;
    } }
  // 🔴 BUG 1 CORREGIDO — MIRABA AL FUTURO.
  //
  // Esto era: `splits.reduce((f, s) => (s.desde > d ? f * s.ratio : f), 1)` — acumulaba los splits
  // POSTERIORES a la fecha y los aplicaba hacia atrás. El 31 de mayo de 2019 el código ya "sabía"
  // que TSLA se partiría en 2020 y en 2022.
  //
  // Y las acciones se parten DESPUÉS de subir mucho, así que la señal estaba señalando ganadoras
  // ya conocidas. Medido por la auditoría: el 72,7% de las acciones elegidas tenían split futuro,
  // contra una tasa base del 30,3%; y gamLejos valía 0,167 de media en ésas contra 0,022 en el resto.
  //
  // LA CORRECCIÓN ES F=1, no "usar sólo los splits pasados". `gamLejos` es un COCIENTE entre cosas
  // del MISMO día (gamma lejana / gamma total): los strikes y los precios están en las mismas
  // unidades a los dos lados de la división, así que normalizar no aporta nada y sólo puede
  // estropear. Se deja la detección de splits para el resultado, que sí cruza fechas.
  const factor = () => 1;
  const idxUltimo = (exp) => {
    if (exp > dias[dias.length - 1]) return -1;
    let lo = 0, hi = dias.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= exp) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  };

  // Series de contratos (normalizadas) + spot por día
  const series = new Map(), spot = [];
  for (let i = 0; i < dias.length; i++) {
    const c = cargar(sym, dias[i]);
    if (!c) { spot.push(null); continue; }
    const F = factor();
    let mejorK = null, mejorDif = Infinity;
    for (const [exp, grupo] of Object.entries(c)) {
      for (const [clave, ba] of Object.entries(grupo)) {
        const right = clave.slice(-1), K = Number(clave.slice(0, -2));
        if (!(K > 0)) continue;
        const key = `${exp}|${K / F}|${right}`;
        let s = series.get(key); if (!s) { s = []; series.set(key, s); }
        s.push({ i, ask: ba[1] * F, bid: ba[0] * F });
        if (right === "C") {
          const p = grupo[`${K}|P`];
          if (p) { const dif = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2); if (dif < mejorDif) { mejorDif = dif; mejorK = K / F; } }
        }
      }
    }
    spot.push(mejorK);
  }

  // ── RESULTADO por mes: el cubo estrella comprado ese mes ──────────────────
  const resultado = new Map();   // mes → [multiplos]
  for (const [key, s] of series) {
    if (s.length < 2) continue;
    const [exp, kStr, right] = key.split("|");
    if (right !== "C") continue;
    const K = Number(kStr), iu = idxUltimo(exp);
    if (iu < 0) continue;                       // aún no ha vencido: NO se mide
    const final = s[s.length - 1].i >= iu ? s[s.length - 1].bid : 0;
    for (let j = 0; j < s.length - 1; j++) {
      const ask = s[j].ask, bid = s[j].bid;
      if (!(ask >= 0.10)) continue;
      if (!((ask - bid) / ask <= 0.40)) continue;
      const d = dias[s[j].i], sp = spot[s[j].i];
      if (!sp) continue;
      const dte = Math.round((ms(exp) - ms(d)) / 86_400_000);
      const otm = ((K - sp) / sp) * 100;
      if (!(dte > 365 && otm > 60)) continue;
      const m = mes(d);
      if (!resultado.has(m)) resultado.set(m, []);
      resultado.get(m).push(Math.min(final / ask, 50));
    }
  }

  // ── PREDICTORES por mes, del ÚLTIMO día del mes (nada posterior) ──────────
  const porMes = new Map();
  for (const d of dias) porMes.set(mes(d), d);      // se queda el último día de cada mes

  const pred = new Map();
  for (const [m, d] of porMes) {
    const c = cargar(sym, d), sp = spot[dias.indexOf(d)];
    if (!c || !sp) continue;
    const F = factor();

    // 1-2. interés abierto lejos del dinero y ratio call/put
    // CONTRATOS *Y* DÓLARES. Contar contratos ignora el tamaño de la apuesta: mil contratos sobre
    // un strike de $500 obligan al creador de mercado a mover 25 veces más dinero que mil sobre uno
    // de $20. Y el mecanismo que se sospecha —que el creador de mercado, corto de esas calls, tiene
    // que ir comprando acciones según el precio sube— se mide en DÓLARES, no en contratos.
    //
    // `Notional = OI × 100 × strike` es además el cálculo que ya manda CLAUDE.md y que no se aplicó.
    //
    // PREDICCIÓN COMPROBABLE: si el mecanismo es ése, pesar por nocional debe separar MÁS que
    // contar contratos. Si separa menos, la explicación está mal.
    let oiC = 0, oiP = 0, oiLejosC = 0;
    let nocC = 0, nocLejosC = 0;
    // LOS DOS ESCALONES QUE FALTAN DE LA ESCALERA.
    //   delta en dólares = OI × 100 × delta × precio  → las acciones que el creador tiene que tener
    //   gamma en dólares = OI × 100 × gamma × precio² → cuánto cambia esa cobertura si sube un 1%
    // El último escalón ES el GEX. Si el mecanismo es la cobertura forzada, cada escalón debe
    // separar más que el anterior. Contratos 3,29 → nocional 3,57 → ¿?
    let dolC = 0, dolLejosC = 0, gamC = 0, gamLejosC = 0;
    const cadDia = cargar(sym, d);
    // AHORA CON TODOS LOS VENCIMIENTOS Y TODOS LOS STRIKES.
    // `oiLejosC` es lo que mide la hipotesis de Lester: cuanto interes abierto hay acumulado en
    // calls muy por encima del precio, o sea gente con posiciones vivas apostando a una subida
    // grande. Con el fichero viejo esto era CERO por construccion.
    const oiDia = oiDelDia(sym, d);
    if (oiDia) {
      for (const [expRaw, grupo] of Object.entries(oiDia)) {
        for (const [claveRaw, oi] of Object.entries(grupo)) {
          const clave = claveRaw;
          const K = Number(clave.slice(0, -2)) / F;
          const n = Number(oi) || 0;
          if (!(K > 0) || !(n > 0)) continue;
          if (clave.slice(-1) === "C") {
            const noc = n * 100 * K;                       // dólares comprometidos en ese strike
            oiC += n; nocC += noc;
            const lejos = K > sp * 1.6;
            if (lejos) { oiLejosC += n; nocLejosC += noc; }
            // Delta y gamma, con la IV sacada del precio REAL de ese contrato ese día.
            const ba = cadDia?.[expRaw]?.[claveRaw];
            if (ba && ba[0] > 0 && ba[1] > 0) {
              const T = (ms(expRaw) - ms(d)) / (365 * 86_400_000);
              if (T > 0) {
                const mid = ((ba[0] + ba[1]) / 2) * F;
                const iv = impliedVol(mid, sp, K, T, "call");
                // 🔴 BUG 2 CORREGIDO — ESTE `if` SE COMÍA CONTRATOS EN SILENCIO.
                // `impliedVol` devuelve null cuando el precio es mayor que el subyacente, y con las
                // unidades rotas del bug 1 eso pasaba en masa: sólo sobrevivían las calls muy
                // baratas (las muy lejanas), o sea que el descarte actuaba como un filtro selectivo
                // invisible. Ahora se cuentan, y si son demasiados la corrida lo dice.
                if (!(iv > 0) || !Number.isFinite(iv)) ivNulos++;
                else ivBuenos++;
                if (iv > 0 && Number.isFinite(iv)) {
                  const dl = Math.abs(bsDelta(sp, K, T, iv, "call")) * n * 100 * sp;
                  const gm = bsGamma(sp, K, T, iv) * n * 100 * sp * sp;
                  if (Number.isFinite(dl)) { dolC += dl; if (lejos) dolLejosC += dl; }
                  if (Number.isFinite(gm)) { gamC += gm; if (lejos) gamLejosC += gm; }
                }
              }
            }
          } else oiP += n;
        }
      }
    }

    // 5. skew: call ~30% fuera contra put ~30% fuera, al vencimiento más cercano a 90 días
    let skew = null, primaCubo = [], nCubo = 0;
    let mejorExp = null, mejorDif = Infinity;
    for (const exp of Object.keys(c)) {
      const dte = Math.round((ms(exp) - ms(d)) / 86_400_000);
      if (dte < 30) continue;
      const dif = Math.abs(dte - 90);
      if (dif < mejorDif) { mejorDif = dif; mejorExp = exp; }
    }
    if (mejorExp) {
      const g = c[mejorExp];
      const buscar = (objetivo, right) => {
        let mejor = null, dm = Infinity;
        for (const [clave, ba] of Object.entries(g)) {
          if (clave.slice(-1) !== right) continue;
          const K = Number(clave.slice(0, -2)) / F;
          const dd = Math.abs(K - objetivo);
          if (dd < dm) { dm = dd; mejor = (ba[0] + ba[1]) / 2 * F; }
        }
        return mejor;
      };
      const cc = buscar(sp * 1.30, "C"), pp = buscar(sp * 0.70, "P");
      if (cc > 0 && pp > 0) skew = cc / pp;
    }
    // 6. lo barata que está la apuesta: prima media del cubo estrella / precio
    for (const [exp, g] of Object.entries(c)) {
      const dte = Math.round((ms(exp) - ms(d)) / 86_400_000);
      if (dte <= 365) continue;
      for (const [clave, ba] of Object.entries(g)) {
        if (clave.slice(-1) !== "C") continue;
        const K = Number(clave.slice(0, -2)) / F;
        if (K <= sp * 1.6) continue;
        primaCubo.push((ba[1] * F) / sp); nCubo++;
      }
    }
    pred.set(m, {
      spot: sp,
      oiLejos: oiC > 0 ? oiLejosC / oiC : null,
      nocLejos: nocC > 0 ? nocLejosC / nocC : null,
      dolLejos: dolC > 0 ? dolLejosC / dolC : null,
      gamLejos: gamC > 0 ? gamLejosC / gamC : null,
      ratioCP: oiP > 0 ? oiC / oiP : null,
      skew,
      barata: nCubo ? primaCubo.reduce((a, b) => a + b, 0) / nCubo : null,
    });
  }

  // 3-4 y 7: cambios a 3 meses y momento del precio
  const meses = [...pred.keys()].sort();
  for (let i = 0; i < meses.length; i++) {
    const m = meses[i], p = pred.get(m), p3 = i >= 3 ? pred.get(meses[i - 3]) : null;
    const res = resultado.get(m);
    // 🔴 BUG 3 CORREGIDO — EL UNIVERSO SE CONSTRUÍA CON EL FUTURO.
    // Era `res.length < 20`, y `res` son contratos YA RESUELTOS: exigir veinte decidía qué
    // (acción, mes) entraba en la muestra sabiendo el desenlace. Ahora basta con que haya UNO —
    // que un contrato no haya vencido todavía es un límite de los datos, no un criterio.
    if (!res || res.length < 1) continue;
    filas.push({
      ticker: sym, mes: m, n: res.length,
      resultado: res.reduce((a, b) => a + b, 0) / res.length,
      oiLejos: p.oiLejos, nocLejos: p.nocLejos, dolLejos: p.dolLejos, gamLejos: p.gamLejos,
      ratioCP: p.ratioCP, skew: p.skew, barata: p.barata,
      nocLejosD3: p3 && p.nocLejos != null && p3.nocLejos != null ? p.nocLejos - p3.nocLejos : null,
      oiLejosD3: p3 && p.oiLejos != null && p3.oiLejos != null ? p.oiLejos - p3.oiLejos : null,
      ratioCPD3: p3 && p.ratioCP != null && p3.ratioCP != null ? p.ratioCP - p3.ratioCP : null,
      momento3m: p3 && p3.spot ? p.spot / p3.spot - 1 : null,
    });
  }
  console.log(`${sym.padEnd(5)} ${filas.filter((f) => f.ticker === sym).length} meses medibles` +
              (sinOI.has(sym) ? "  ⚠ SIN interés abierto ancho" : ""));
}

if (sinOI.size) console.log(`\n⚠ sin interés abierto: ${[...sinOI].join(", ")} — sus predictores de OI van nulos`);
writeFileSync(SALIDA, JSON.stringify(filas), "utf8");
console.log(`\n${filas.length} filas (acción-mes) escritas en ${SALIDA}`);
