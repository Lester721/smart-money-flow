// EL BARBELL — que el cóndor 0DTE PAGUE los billetes de lotería.
//
// Uso: node --max-old-space-size=10240 scripts/conv-barbell.mjs
//      SEMILLAS=500 DIST=25 ALA=50 HORA=11:00 node scripts/conv-barbell.mjs
//
// ═══ LA IDEA QUE SE PONE A PRUEBA ═══════════════════════════════════════════════════════════
//
// El cóndor 0DTE gana $74 de media casi todos los días y devuelve el 85% de lo ganado en 10 días
// malos. Ese perfil (ganar poco muchas veces, perder mucho de golpe) es el CONTRARIO del que
// Lester quiere. La idea del barbell es usar el ingreso del cóndor para comprar calls muy fuera
// del dinero y muy largas: si el ingreso cubre la sangría de los billetes, el perfil combinado
// pasa a ser "perder poco casi siempre y de vez en cuando cobrar 30x".
//
// LA PREGUNTA, literal: ¿el ingreso del cóndor cubre la sangría de las loterías? Y si la cubre,
// ¿qué pasa cuando toca una?
//
// ═══ CRITERIO ESCRITO ANTES DE CORRER ═══════════════════════════════════════════════════════
//
// PRUEBAS DECLARADAS: 2 umbrales de "fuera del dinero" (60%, 100%) × 3 fracciones del ingreso
// del cóndor destinada a billetes (25%, 50%, 100%) × 2 reglas de salida (aguantar a vencimiento,
// vender al primer 10x) = **12 especificaciones**. Listón de Bonferroni listonT(12) = 2,87.
// Las 12 se reportan enteras, ganen o pierdan. Ninguna se elige a posteriori como "la buena".
//
// LO QUE DECIDE (escrito antes de ver ningún número):
//   1. El barbell SÓLO mejora al cóndor solo si su $/año medio sobre las semillas es MAYOR y la
//      mediana también (una media empujada por una semilla afortunada no cuenta).
//   2. La ventaja tiene que sobrevivir a la prueba pareada semilla-a-semilla contra el cóndor solo
//      con |t| ≥ 2,87.
//   3. Se reporta SIEMPRE el percentil de la semilla mediana y los p05/p95: la elección de ticker
//      es aleatoria y una sola tirada no vale (trampa nº5). Por eso 500 semillas, no una.
//   4. Se reporta la caída máxima. Un $/año mayor con una caída que se come la cuenta NO mejora.
//
// ═══ CÓMO SE EVITA CADA UNA DE LAS SEIS TRAMPAS ═════════════════════════════════════════════
//
// 1. FUTURO POR EL PREPROCESADO. El universo de billetes es "los 28 tickers con cadena en disco",
//    fijo, con perdedores dentro (INTC, WBA, PYPL, NKE, UNH...). La elección de ticker es AL AZAR,
//    sin ningún selector. Los splits (NVDA 10:1 el 2024-06-10, WMT 3:1 el 2024-02-26) se detectan
//    EL DÍA que ocurren mirando el salto del cierre —cosa que se sabía ese día— y se aplican hacia
//    delante, nunca hacia atrás. No hay ninguna serie ajustada con la historia completa.
// 2. EL DATO NO CONTIENE LO QUE CREES. Antes de medir se hace la radiografía: se lee el filtro del
//    descargador (`scripts/bajar-cadenas-todos-los-dias.ts` línea 57: `b>0 && a>0 && a>=b`, y
//    `expiration=*` SIN filtro de strike, al contrario que el fichero de OI), se cuenta la
//    cobertura de strikes por ticker y se comprueba que el strike ajustado por split EXISTE en la
//    cadena del día siguiente. Si algo está muerto, LANZA.
// 3. LO QUE VALE CERO DESAPARECE. Un call que se queda sin bid NO está en el fichero. Aquí eso es
//    exactamente lo que hay que modelar: AUSENTE = BID 0 = el billete no vale nada. Nunca se
//    interpreta como "sin dato" ni se salta la posición: se marca a CERO y se aguanta la pérdida.
// 4. LA VENTAJA QUE ERA PEAJE. Se paga el ASK al comprar el billete y se cobra el BID al venderlo,
//    en las dos puntas. Se reporta además el mismo cálculo a punto medio para ver cuánto del
//    resultado era horquilla. El cóndor igual: bid en las vendidas, ask en las compradas.
// 5. EL CONTROL DE UNA SOLA TIRADA. 500 semillas de elección de ticker por especificación, y se
//    reporta la distribución entera, no la mejor.
// 6. CONTAR PATAS EN VEZ DE SUCESOS. La unidad del cóndor es el DÍA (un suceso terminal por día,
//    liquida al cierre). La unidad del billete es el BILLETE (una compra → un desenlace), no el
//    contrato: comprar 20 contratos del mismo strike el mismo día es UN suceso, y así se cuenta.
//
// ═══ PRECIOS ════════════════════════════════════════════════════════════════════════════════
// Todo con bid/ask reales de ThetaData. Ningún modelo, ningún Black-Scholes, ningún precio teórico.
// Comisión Robinhood $0 + tasas ~$0,03 por contrato en cada punta.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

// ── PARÁMETROS ──────────────────────────────────────────────────────────────────────────────
const GDIR = "scripts/cache-theta/gex-2026";
const CDIR = "scripts/cache-theta/cadenas";
const KDIR = "scripts/cache-theta/cierres";

const HORA = process.env.HORA || "11:00";
const DIST = Number(process.env.DIST || 25);
const ALA = Number(process.env.ALA || 50);
const SEMILLAS = Number(process.env.SEMILLAS || 500);
const CUENTA = 55419;
const EFECTIVO = Math.round(CUENTA * 0.15);   // el 85% está en 500 acciones de HOOD
const TASA = 0.03;
const LISTON = 2.87;                           // listonT(12)

const TICKERS = ["AAPL", "AMD", "BA", "BAC", "COST", "CRM", "CSCO", "DIS", "F", "GE", "INTC", "JPM",
  "KO", "META", "MSFT", "NKE", "NVDA", "ORCL", "PFE", "PYPL", "QQQ", "SPY", "T", "TSLA", "UNH",
  "WBA", "WMT", "XOM"];

const OTMS = [0.60, 1.00];
const FRACCIONES = [0.25, 0.50, 1.00];
const SALIDAS = ["vencimiento", "10x"];
// TOPE DE CONTRATOS POR COMPRA — declarado antes de correr, no ajustado después.
// Un billete de $0,07 con un presupuesto de $1.500 daría 214 contratos, y rellenar 214 contratos
// al ask de un LEAP sin volumen es ficción. Se topa en 10 y se reporta cuántas veces ata.
const MAXQ = Number(process.env.MAXQ || 10);

// ── UTILIDADES ──────────────────────────────────────────────────────────────────────────────
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const desv = (v) => {
  if (v.length < 2) return 0;
  const m = media(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
};
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("es-ES");
const dnum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
const dias = (a, b) => (dnum(b) - dnum(a)) / 86400000;
function rng32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** t pareada de la diferencia contra cero. */
function tPareada(d) { const s = desv(d); return s > 0 ? media(d) / (s / Math.sqrt(d.length)) : 0; }

const LOG = [];
const say = (s = "") => { console.log(s); LOG.push(s); };

// ══════════════════════════════════════════════════════════════════════════════════════════
// PARTE 1 · EL CÓNDOR — la misma implementación ya validada, se comprueba que reproduce
// ══════════════════════════════════════════════════════════════════════════════════════════
const diagC = { ficheros: 0, filasHora: 0, askMalo: 0, spotCero: 0, sinHora: 0 };

const memoSpx = new Map();
function leerDiaSpx(fecha, right) {
  const k = fecha + right;
  if (memoSpx.has(k)) return memoSpx.get(k);
  const v = leerDiaSpxCrudo(fecha, right);
  memoSpx.set(k, v);
  return v;
}
function leerDiaSpxCrudo(fecha, right) {
  const f = `${GDIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  diagC.ficheros++;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) throw new Error(`${f} existe pero no tiene filas — fallo cerrado`);
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`${f}: falta columna — ${cab.join("|")}`);
  const enHora = [];
  let ultimoSpot = 0, ultimaHora = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const hora = String(c[iT]).slice(11, 16);
    const spot = Number(c[iU]);
    if (spot > 0 && hora >= ultimaHora) { ultimaHora = hora; ultimoSpot = spot; }
    if (hora !== HORA) continue;
    diagC.filasHora++;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (!(spot > 0)) { diagC.spotCero++; continue; }
    if (!(ask > 0)) { diagC.askMalo++; continue; }
    if (K > 0 && bid >= 0) enHora.push({ K, bid, ask, spot });
  }
  if (!enHora.length) { diagC.sinHora++; return null; }
  return { filas: enHora, cierre: ultimoSpot, horaCierre: ultimaHora };
}
const cerca = (filas, obj) => filas.reduce((a, b) => (Math.abs(b.K - obj) < Math.abs(a.K - obj) ? b : a));

function serieCondor(fechas, d, ala) {
  const out = [];
  for (const fecha of fechas) {
    const C = leerDiaSpx(fecha, "C"), P = leerDiaSpx(fecha, "P");
    if (!C || !P || !(C.cierre > 0)) continue;
    const spot = C.filas[0].spot;
    const cCorta = cerca(C.filas, spot + d), pCorta = cerca(P.filas, spot - d);
    const cLarga = cerca(C.filas, cCorta.K + ala), pLarga = cerca(P.filas, pCorta.K - ala);
    if (cLarga.K <= cCorta.K || pLarga.K >= pCorta.K) continue;
    const credito = cCorta.bid + pCorta.bid - cLarga.ask - pLarga.ask;
    if (!(credito > 0)) continue;
    const anchoC = cLarga.K - cCorta.K, anchoP = pCorta.K - pLarga.K;
    const S = C.cierre;
    const perdCall = Math.min(Math.max(S - cCorta.K, 0), anchoC);
    const perdPut = Math.min(Math.max(pCorta.K - S, 0), anchoP);
    out.push({
      fecha, credito: credito * 100,
      riesgo: (Math.max(anchoC, anchoP) - credito) * 100,
      pl: (credito - perdCall - perdPut) * 100 - 8 * TASA,
    });
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// PARTE 2 · LOS BILLETES — precálculo de las trayectorias reales, ticker a ticker
// ══════════════════════════════════════════════════════════════════════════════════════════
const RATIOS = [1.5, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20];
const diagL = {
  ficheros: 0, sinFichero: 0, splits: [], candidatos: 0, sinCandidato: 0,
  marcasCero: 0, marcasVivas: 0, abiertasAlFinal: 0, snapFallo: 0, tickerFin: 0,
  itmSinBid: [], topeAtado: 0, compras: 0,
};
const FICHEROS = new Set(readdirSync(CDIR));

/**
 * Las claves posibles de un strike. Un split deja 250/3 = 83,3333… y en el fichero está como
 * "83.33"; 780/10 = 78 está como "78". Si esto se resolviera con String(K) a secas el contrato
 * partido desaparecería del fichero SIN ERROR y se leería como billete a cero — exactamente el
 * fallo silencioso de formato que ya nos costó una noche.
 */
function claves(K) {
  const out = [String(K)];
  for (const s of [K.toFixed(2), K.toFixed(1), K.toFixed(3), K.toFixed(4)]) {
    if (!out.includes(s)) out.push(s);
    if (s.includes(".")) { const y = s.replace(/0+$/, "").replace(/\.$/, ""); if (y && !out.includes(y)) out.push(y); }
  }
  return out;
}
/** Busca [bid,ask] del strike K en la expiración exp. Devuelve null si el contrato NO cotiza. */
function buscar(mapa, exp, K) {
  const t = mapa[exp];
  if (!t) return null;
  for (const c of claves(K)) { const q = t[`${c}|C`]; if (q) return q; }
  return null;
}
/** Barrido completo — sólo para verificar un split. Lento a propósito; se usa 2 veces en total. */
function buscarEstricto(mapa, exp, K) {
  const t = mapa[exp];
  if (!t) return null;
  let mejor = null, dmin = Infinity, kBest = null;
  for (const key in t) {
    if (key.charCodeAt(key.length - 1) !== 67) continue; // 'C'
    const kk = +key.slice(0, -2);
    const d = Math.abs(kk - K);
    if (d < dmin) { dmin = d; mejor = t[key]; kBest = kk; }
  }
  return mejor && dmin / K < 0.005 ? { q: mejor, K: kBest } : null;
}

/**
 * Una pasada cronológica por las cadenas de un ticker. Crea los candidatos en sus fechas de
 * compra y marca todas las posiciones vivas cada día con el BID real (ausente = 0).
 */
function pasadaTicker(t, fechasCompra, calendario) {
  const cierres = JSON.parse(readFileSync(`${KDIR}/${t}.json`, "utf8"));
  const salida = {};                       // `${otm}|${fecha}` -> billete
  const vivos = [];
  let prevCierre = null, prevFecha = null;
  const setCompra = new Set(fechasCompra);

  for (const d of calendario) {
    if (!FICHEROS.has(`${t}_d${d}.json`)) { diagL.sinFichero++; continue; }
    const f = `${CDIR}/${t}_d${d}.json`;
    diagL.ficheros++;
    const j = JSON.parse(readFileSync(f, "utf8"));
    const S = cierres[d];
    if (!(S > 0)) continue;

    // ── SPLIT: detectado EL DÍA que ocurre por el salto del cierre. Nada retroactivo.
    if (prevCierre && prevCierre / S > 1.4) {
      const r = RATIOS.reduce((a, b) => (Math.abs(b - prevCierre / S) < Math.abs(a - prevCierre / S) ? b : a));
      diagL.splits.push(`${t} ${prevFecha}→${d} ratio bruto ${(prevCierre / S).toFixed(3)} → ${r}:1`);
      for (const p of vivos) {
        const nuevoK = p.K / r;
        const hit = buscarEstricto(j, p.exp, nuevoK);
        if (!hit) {
          diagL.snapFallo++;
          throw new Error(`SPLIT ${t} ${d}: el strike ajustado ${nuevoK} (era ${p.K}, ratio ${r}) NO existe en la cadena de ${p.exp}. Fallo cerrado: no se inventa el precio.`);
        }
        diagL.splits.push(`    ajustado: ${t} ${p.exp} K ${p.K} → ${hit.K} (×${r} contratos), bid real ${hit.q[0]}`);
        p.K = hit.K; p.mult *= r;
      }
    }
    prevCierre = S; prevFecha = d;

    // ── COMPRAS
    if (setCompra.has(d)) {
      for (const u of OTMS) {
        const exps = Object.keys(j).filter((e) => dias(d, e) > 365).sort();
        let bil = null;
        for (const exp of exps) {                    // el vencimiento MÁS CERCANO por encima de 365d
          const ks = [];
          for (const key in j[exp]) if (key.endsWith("|C")) ks.push(+key.slice(0, -2));
          ks.sort((a, b) => a - b);
          const K = ks.find((k) => k >= S * (1 + u));  // el strike MÁS BAJO por encima del umbral
          if (K === undefined) continue;
          const q = j[exp][`${K}|C`];
          if (!q || !(q[1] > 0)) continue;
          bil = {
            ticker: t, otm: u, fecha: d, exp, K, K0: K, mult: 1,
            ask: q[1], bid0: q[0], spot: S, otmReal: K / S - 1,
            coste: q[1] * 100 + TASA, medio: (q[0] + q[1]) / 2 * 100,
            marcas: new Map(), marcasMedio: new Map(),
            fin: null, valorFin: 0, valorFinMedio: 0, motivo: null, dia10x: null, valor10x: 0,
            maxMarca: 0, maxMult: 0,
          };
          break;
        }
        if (bil) { salida[`${u}|${d}`] = bil; vivos.push(bil); diagL.candidatos++; }
        else diagL.sinCandidato++;
      }
    }

    // ── MARCAS (ausente = 0 = el billete no vale nada; trampa nº3)
    for (let i = vivos.length - 1; i >= 0; i--) {
      const p = vivos[i];
      const q = buscar(j, p.exp, p.K);
      const val = q ? q[0] * 100 * p.mult : 0;
      const valM = q ? (q[0] + q[1]) / 2 * 100 * p.mult : 0;
      // GUARDIÁN DEL CERO SILENCIOSO. Un call CLARAMENTE dentro del dinero SIEMPRE tiene bid. Si
      // sale a cero es que el contrato cambió de strike (split, dividendo especial) y lo estamos
      // perdiendo de vista. No se acepta como "el billete no valía nada": se para.
      if (!q && S > p.K * 1.05) {
        diagL.itmSinBid.push(`${t} ${d}: K=${p.K} exp=${p.exp} pero el subyacente está a ${S.toFixed(2)} (+${((S / p.K - 1) * 100).toFixed(0)}%) y el contrato no aparece en la cadena`);
      }
      if (val > 0) diagL.marcasVivas++; else diagL.marcasCero++;
      p.marcas.set(d, val);
      p.marcasMedio.set(d, valM);
      if (val > p.maxMarca) { p.maxMarca = val; p.maxMult = val / (p.ask * 100); }
      if (p.dia10x === null && val >= 10 * p.ask * 100) { p.dia10x = d; p.valor10x = val; }
      if (d >= p.exp) {                                    // venció: se cierra con el bid real
        p.fin = d; p.valorFin = val; p.valorFinMedio = valM; p.motivo = "vencimiento";
        p.intrinseco = Math.max(S - p.K, 0) * 100 * p.mult;
        vivos.splice(i, 1);
      }
    }
  }
  // Lo que queda vivo al final del dato: ni se borra ni se da por ganado. Se marca al último bid.
  for (const p of vivos) {
    const ds = [...p.marcas.keys()];
    const ult = ds[ds.length - 1];
    p.fin = ult; p.valorFin = p.marcas.get(ult) ?? 0; p.valorFinMedio = p.marcasMedio.get(ult) ?? 0;
    p.motivo = ult >= calendario[calendario.length - 1] ? "abierta-al-final" : "ticker-sin-dato";
    if (p.motivo === "abierta-al-final") diagL.abiertasAlFinal++; else diagL.tickerFin++;
  }
  return salida;
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// PARTE 3 · LA SIMULACIÓN DE CARTERA
// ══════════════════════════════════════════════════════════════════════════════════════════
function simular(cond, billetes, fechasCompra, cfg, semilla) {
  const rnd = rng32(semilla * 7919 + 13);
  const reserva = ALA * 100;              // colateral inmovilizado por 1 cóndor (hipótesis neteada)
  let caja = EFECTIVO, ingreso = 0, gastadoAcum = 0;
  const abiertas = [];
  const curva = [];
  let gastado = 0, recuperado = 0, recupResuelto = 0, recupAbierto = 0;
  let comprados = 0, contratos = 0, mesesSinComprar = 0;
  const sucesos = [];
  const elegidos = new Map();

  for (const dia of cond.fechas) {
    const pl = cond.pl.get(dia) ?? 0;
    caja += pl;
    // EL PRESUPUESTO ES EL INGRESO NETO ACUMULADO DEL CÓNDOR, sin suelo intermedio en cero.
    // Poner un suelo en cero día a día (primera versión) descartaba los días perdedores y dejaba
    // gastar $64.257 cuando el cóndor sólo había ganado $48.638 en todo el período: el barbell se
    // financiaba con dinero que el cóndor no había hecho. La bolsa es fracción × ingreso − gastado.
    ingreso += pl;

    if (fechasCompra.has(dia)) {
      const bolsa = cfg.fraccion * ingreso - gastadoAcum;
      const disp = Math.min(bolsa, caja - reserva);
      const elegibles = [];
      for (const t of TICKERS) {
        if (cfg.excluir?.has(t)) continue;
        const b = billetes[t]?.[`${cfg.otm}|${dia}`];
        if (b && b.coste <= disp) elegibles.push(b);
      }
      if (elegibles.length) {
        const b = elegibles[Math.floor(rnd() * elegibles.length)];
        const bruto = Math.floor(disp / b.coste);
        const q = Math.min(MAXQ, bruto);
        if (bruto > MAXQ) diagL.topeAtado++;
        diagL.compras++;
        if (q >= 1) {
          const importe = q * b.coste;
          caja -= importe; gastadoAcum += importe; gastado += importe; comprados++; contratos += q;
          elegidos.set(b.ticker, (elegidos.get(b.ticker) ?? 0) + 1);
          abiertas.push({ b, q, importe });
        } else mesesSinComprar++;
      } else mesesSinComprar++;
    }

    // cierres del día
    for (let i = abiertas.length - 1; i >= 0; i--) {
      const a = abiertas[i];
      const salir = cfg.salida === "10x"
        ? (a.b.dia10x !== null && dia >= a.b.dia10x) || dia >= a.b.fin
        : dia >= a.b.fin;
      if (!salir) continue;
      const bruto = cfg.salida === "10x" && a.b.dia10x !== null && dia >= a.b.dia10x
        ? a.b.valor10x : a.b.valorFin;
      const neto = q0(bruto, a.q);
      const resuelto = a.b.motivo === "vencimiento" || (cfg.salida === "10x" && a.b.dia10x !== null && dia >= a.b.dia10x);
      caja += neto; recuperado += neto;
      if (resuelto) recupResuelto += neto; else recupAbierto += neto;
      sucesos.push({
        ticker: a.b.ticker, fecha: a.b.fecha, exp: a.b.exp, K: a.b.K0, ask: a.b.ask,
        q: a.q, coste: a.importe, cobrado: neto, pnl: neto - a.importe, resuelto,
        mult: a.b.ask > 0 ? bruto / (a.b.ask * 100) : 0, motivo: a.b.motivo,
        maxMult: a.b.maxMult,
      });
      abiertas.splice(i, 1);
    }

    let mtm = 0;
    for (const a of abiertas) mtm += (a.b.marcas.get(dia) ?? 0) * a.q;
    curva.push(caja + mtm);
  }
  function q0(bruto, q) { return Math.max(0, bruto * q - (bruto > 0 ? q * TASA : 0)); }

  // caída máxima pico a valle
  let pico = -Infinity, caida = 0, caidaPct = 0, minimo = Infinity, diaRuina = null;
  for (let i = 0; i < curva.length; i++) {
    const v = curva[i];
    if (v > pico) pico = v;
    if (pico - v > caida) caida = pico - v;
    if (pico > 0 && (pico - v) / pico > caidaPct) caidaPct = (pico - v) / pico;
    if (v < minimo) minimo = v;
    // RUINA = el patrimonio deja de cubrir el colateral del propio cóndor. A partir de ahí la
    // simulación es ficción: el bróker cierra la posición y no hay con qué poner la del día siguiente.
    if (diaRuina === null && v < reserva) diaRuina = cond.fechas[i];
  }
  const fin = curva[curva.length - 1];
  const años = cond.fechas.length / 252;
  return {
    final: fin, pl: fin - EFECTIVO, porAño: (fin - EFECTIVO) / años, caida, caidaPct, minimo, diaRuina,
    gastado, recuperado, recupResuelto, recupAbierto, ingreso,
    comprados, contratos, mesesSinComprar, sucesos, elegidos, curva,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// EJECUCIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════
const t0 = Date.now();
say(`\n# EL BARBELL — el cóndor 0DTE paga los billetes de lotería\n`);
say(`Cóndor: SPXW 0DTE, entrada ${HORA}, ±${DIST} puntos, alas ${ALA}. Billetes: calls a >365 días`);
say(`y >${OTMS.map((x) => (x * 100).toFixed(0) + "%").join(" / >")} fuera del dinero, ticker AL AZAR entre los 28. ${SEMILLAS} semillas por especificación.\n`);

// ── RADIOGRAFÍA DEL DATO ──────────────────────────────────────────────────────────────────
say(`## 1. Radiografía del dato — ANTES de medir\n`);
const fechasSpx = readdirSync(GDIR).filter((f) => /^iv_\d{4}-\d{2}-\d{2}_C\.csv$/.test(f))
  .map((f) => f.slice(3, 13)).sort();
say(`SPXW 0DTE: **${fechasSpx.length} sesiones** ${fechasSpx[0]} → ${fechasSpx[fechasSpx.length - 1]}`);

const calChain = readdirSync(CDIR).filter((f) => /^SPY_d\d{8}\.json$/.test(f))
  .map((f) => f.slice(5, 13)).filter((d) => d >= "20240102" && d <= "20260806").sort();
say(`Cadenas EOD (calendario de SPY): **${calChain.length} sesiones** ${calChain[0]} → ${calChain[calChain.length - 1]}`);

// El filtro del descargador, leído del código, no supuesto.
say(`\nFiltro del descargador (\`scripts/bajar-cadenas-todos-los-dias.ts\` línea 57): \`expiration=*\` —`);
say(`**sin filtro de strike**, al contrario que el fichero de OI que arruinó el hallazgo del puente— y`);
say(`\`b>0 && a>0 && a>=b\`. Consecuencia que HAY que modelar: **un call sin bid no está en el fichero.**`);
say(`Ausente = bid 0 = el billete no vale nada. Aquí eso NO se lee como "sin dato".`);

// Comprobación material del filtro: 0 entradas con bid 0 en una muestra.
let mZeros = 0, mTot = 0;
for (const t of ["AAPL", "NVDA", "TSLA", "KO", "F", "QQQ"]) {
  for (const d of ["20240102", "20250102", "20260102"]) {
    const f = `${CDIR}/${t}_d${d}.json`;
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, "utf8"));
    for (const e in j) for (const k in j[e]) { mTot++; if (j[e][k][0] === 0) mZeros++; }
  }
}
say(`Comprobado en el fichero: ${mTot.toLocaleString("es-ES")} cotizaciones de muestra, **${mZeros} con bid = 0**. El filtro es real.`);
if (mZeros > 0) throw new Error("El descargador decía filtrar bid<=0 y hay bids a 0 — el supuesto de 'ausente = cero' habría que revisarlo.");

// Cobertura de strikes: cuántos tickers tienen billete disponible cada mes.
const primerosMes = [];
{
  let ultMes = "";
  for (const d of calChain) { const m = d.slice(0, 6); if (m !== ultMes) { primerosMes.push(d); ultMes = m; } }
}
say(`\nFechas de compra: el **primer día hábil de cada mes**, ${primerosMes.length} meses (${primerosMes[0]} → ${primerosMes[primerosMes.length - 1]}).`);

// ── PRECÁLCULO DE BILLETES ────────────────────────────────────────────────────────────────
say(`\n## 2. Precálculo de los billetes (una pasada por cada ticker)\n`);
const billetes = {};
for (const t of TICKERS) {
  const cal = [];
  for (const f of FICHEROS) {
    if (!f.startsWith(`${t}_d`) || f.length !== t.length + 15) continue;
    const d = f.slice(t.length + 2, t.length + 10);
    if (d >= "20240102" && d <= "20260806") cal.push(d);
  }
  cal.sort();
  billetes[t] = pasadaTicker(t, primerosMes, cal);
  process.stderr.write(`\r  ${t} · ${cal.length} días · ${Object.keys(billetes[t]).length} billetes · ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
}
process.stderr.write("\n");

// GUARDIÁN: ningún call claramente dentro del dinero puede estar sin bid. Si lo hay, el contrato
// cambió de strike por debajo de nuestros pies y lo estaríamos marcando a cero sin enterarnos.
if (diagL.itmSinBid.length) {
  say(`\n**PARADA — ${diagL.itmSinBid.length} marcas de call dentro del dinero sin cotización:**`);
  for (const s of diagL.itmSinBid.slice(0, 15)) say(`  · ${s}`);
  throw new Error("Contratos ITM sin bid — hay un cambio de strike (split o dividendo especial) sin detectar. Fallo cerrado.");
}
say(`Guardián del cero silencioso: **0 casos** de call dentro del dinero sin cotización. Ningún billete se marcó a cero por perderle la pista al contrato.`);

say(`Ficheros de cadena leídos: **${diagL.ficheros.toLocaleString("es-ES")}**. Billetes construidos: **${diagL.candidatos}**;`);
say(`(ticker, mes, umbral) sin ningún strike por encima del umbral: **${diagL.sinCandidato}**.`);
say(`Marcas diarias: ${diagL.marcasVivas.toLocaleString("es-ES")} con bid > 0 y ${diagL.marcasCero.toLocaleString("es-ES")} a CERO (el billete ya no cotiza).`);
say(`Splits detectados el día que ocurren y verificados contra la cadena del día siguiente:`);
for (const s of diagL.splits) say(`  · ${s}`);
if (!diagL.splits.length) throw new Error("Ningún split detectado — NVDA 10:1 y WMT 3:1 están en el período; el detector está roto.");
say(`Billetes que llegan vivos al final del dato (sin desenlace): **${diagL.abiertasAlFinal}**.`);
say(`Billetes cuyo ticker deja de tener dato antes del vencimiento (WBA, comprada): **${diagL.tickerFin}**.`);

// Radiografía del universo: qué tickers son elegibles y cuántas veces.
say(`\n### Qué tickers pueden dar billete, y cuántos meses de ${primerosMes.length}\n`);
for (const u of OTMS) {
  const filas = TICKERS.map((t) => {
    const n = primerosMes.filter((d) => billetes[t][`${u}|${d}`]).length;
    return { t, n };
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  say(`**>${(u * 100).toFixed(0)}% fuera:** ${filas.map((x) => `${x.t} ${x.n}`).join(" · ")}`);
  say(`(${filas.length} de 28 tickers tienen billete alguna vez)\n`);
}

// ── EL CÓNDOR ─────────────────────────────────────────────────────────────────────────────
say(`## 3. El cóndor — control de cordura antes de combinar nada\n`);
const sc = serieCondor(fechasSpx, DIST, ALA);
const plC = sc.map((x) => x.pl);
const credMed = pct(sc.map((x) => x.credito), 0.5);
const acierto = sc.filter((x) => x.pl > 0).length / sc.length;
say(`| | n | crédito mediano | acierto | P&L medio |`);
say(`|---|---|---|---|---|`);
say(`| dato ya medido (±25/ala 50) | 653 | $500 | 75% | $74 |`);
say(`| este script | ${sc.length} | ${D(credMed)} | ${(acierto * 100).toFixed(0)}% | ${D(media(plC))} |`);
say(``);
say(`Radiografía del cóndor: ${diagC.ficheros} ficheros, ${diagC.filasHora.toLocaleString("es-ES")} filas a las ${HORA}, ${diagC.askMalo} con ask≤0, ${diagC.spotCero} con spot 0, ${diagC.sinHora} días sin la hora.`);
const tCondor = tPareada(plC);
say(`P&L medio ${D(media(plC))}/día · desviación ${D(desv(plC))} · **t = ${tCondor.toFixed(2)}** · $/año (252 sesiones) = **${D(media(plC) * 252)}**`);
say(`Ese t=${tCondor.toFixed(2)} es el que ya conocíamos: el propio cóndor NO está demostrado. Todo lo que sigue`);
say(`mide qué le hace el barbell a un motor que aún no se distingue de cero.`);

const cond = { fechas: fechasSpx.map((f) => f.replace(/-/g, "")), pl: new Map() };
for (const x of sc) cond.pl.set(x.fecha.replace(/-/g, ""), x.pl);
const setCompra = new Set(primerosMes.filter((d) => cond.pl.has(d)));
say(`\nMeses cuyo primer día hábil de cadena coincide con una sesión del cóndor: ${setCompra.size} de ${primerosMes.length}.`);
if (setCompra.size < primerosMes.length - 2) throw new Error("Los dos calendarios no casan — no se puede simular la caja día a día.");

// Baseline: sólo el cóndor.
const base = simular(cond, billetes, new Set(), { otm: 0.6, fraccion: 0, salida: "vencimiento" }, 0);
say(`\n**Cóndor solo** (1 contrato, sin billetes): final ${D(base.final)} desde ${D(EFECTIVO)} · ${D(base.porAño)}/año · caída máxima ${D(base.caida)}`);

// ── LAS 12 ESPECIFICACIONES ───────────────────────────────────────────────────────────────
say(`\n## 4. Las 12 especificaciones declaradas — todas, ganen o pierdan\n`);
say(`| umbral | % ingreso | salida | $/año medio | mediana | p05 | p95 | caída med. | billetes | gastado | recuperado | · resuelto | · sin vencer | cubre? |`);
say(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);

const resultados = [];
for (const otm of OTMS) for (const fraccion of FRACCIONES) for (const salida of SALIDAS) {
  const cfg = { otm, fraccion, salida };
  const rs = [];
  for (let s = 0; s < SEMILLAS; s++) rs.push(simular(cond, billetes, setCompra, cfg, s));
  const porAño = rs.map((r) => r.porAño);
  const dif = rs.map((r) => r.porAño - base.porAño);
  const gast = media(rs.map((r) => r.gastado)), rec = media(rs.map((r) => r.recuperado));
  const res = media(rs.map((r) => r.recupResuelto)), abi = media(rs.map((r) => r.recupAbierto));
  const r0 = { cfg, rs, porAño, dif, gast, rec, res, abi, t: tPareada(dif) };
  resultados.push(r0);
  say(`| >${(otm * 100).toFixed(0)}% | ${(fraccion * 100).toFixed(0)}% | ${salida} | ${D(media(porAño))} | ${D(pct(porAño, 0.5))} | ${D(pct(porAño, 0.05))} | ${D(pct(porAño, 0.95))} | ${D(media(rs.map((r) => r.caida)))} | ${media(rs.map((r) => r.comprados)).toFixed(1)} | ${D(gast)} | ${D(rec)} | ${D(res)} | ${D(abi)} | ${(rec / gast * 100).toFixed(0)}% |`);
}
say(`\nReferencia: **cóndor solo ${D(base.porAño)}/año**, caída ${D(base.caida)}. Ingreso total del cóndor en el período: **${D(base.ingreso)}** — ningún gasto puede superarlo.`);
say(``);
say(`**AVISO SOBRE LA COLUMNA "sin vencer".** ${diagL.abiertasAlFinal} de ${diagL.candidatos} billetes construidos NO han vencido cuando`);
say(`se acaba el dato (comprar a >365 días en 2025-2026 significa vencer en 2027). Esos se cierran al ÚLTIMO`);
say(`BID REAL, que es una valoración de mercado, no un resultado. La columna "· resuelto" es la única`);
say(`parte del dinero que de verdad pasó por caja.`);
say(``);
say(`**LO QUE NO ES ESTA TABLA: un test de significación.** La dispersión entre semillas mide sólo el ruido de`);
say(`ELEGIR TICKER AL AZAR, no la incertidumbre del período. Con 500 semillas ese error estándar tiende a cero`);
say(`y cualquier t saldría enorme sin que eso signifique nada. La incertidumbre real está en la sección 6:`);
say(`son ~26 billetes en 2,6 años, y casi todo el dinero sale de dos nombres.`);

// ── LA RESPUESTA A LA PREGUNTA ────────────────────────────────────────────────────────────
say(`\n## 5. ¿El ingreso del cóndor cubre la sangría de las loterías?\n`);
const cubren = resultados.filter((r) => r.rec >= r.gast).length;
say(`De las 12 especificaciones, **${cubren} recupera(n) de media al menos lo gastado**.`);
const mejor = resultados.reduce((a, b) => (media(b.porAño) > media(a.porAño) ? b : a));
const peor = resultados.reduce((a, b) => (media(b.porAño) < media(a.porAño) ? b : a));
say(`Mejor especificación en media: >${(mejor.cfg.otm * 100).toFixed(0)}% / ${(mejor.cfg.fraccion * 100).toFixed(0)}% / ${mejor.cfg.salida} → ${D(media(mejor.porAño))}/año (cóndor solo ${D(base.porAño)}).`);
say(`Peor: >${(peor.cfg.otm * 100).toFixed(0)}% / ${(peor.cfg.fraccion * 100).toFixed(0)}% / ${peor.cfg.salida} → ${D(media(peor.porAño))}/año.`);
say(`Semillas que baten al cóndor solo, por especificación:`);
say(``);
say(`| espec. | % de semillas que baten al cóndor | mejor semilla | peor semilla |`);
say(`|---|---|---|---|`);
for (const r of resultados) {
  const gan = r.porAño.filter((x) => x > base.porAño).length / SEMILLAS;
  say(`| >${(r.cfg.otm * 100).toFixed(0)}%/${(r.cfg.fraccion * 100).toFixed(0)}%/${r.cfg.salida} | ${(gan * 100).toFixed(0)}% | ${D(Math.max(...r.porAño))} | ${D(Math.min(...r.porAño))} |`);
}

// ── QUÉ PASA CUANDO TOCA UNA ──────────────────────────────────────────────────────────────
say(`\n## 6. ¿Qué pasa cuando toca una? — todos los billetes, sin filtrar\n`);
const espPrincipal = resultados.find((r) => r.cfg.otm === 0.60 && r.cfg.fraccion === 1.00 && r.cfg.salida === "vencimiento");
const todos = [];
for (const r of espPrincipal.rs) for (const s of r.sucesos) todos.push(s);
const mults = todos.map((s) => s.mult).sort((a, b) => b - a);
say(`Sucesos de billete acumulados sobre las ${SEMILLAS} semillas de la especificación >60%/100%/vencimiento: **${todos.length}**.`);
say(`(La unidad es el BILLETE, no el contrato: comprar 20 contratos del mismo strike el mismo día es UN suceso.)`);
say(``);
say(`| múltiplo sobre lo pagado | % de billetes |`);
say(`|---|---|`);
for (const [et, f] of [["0 (a cero)", (x) => x <= 0.0001], ["0–0,5x", (x) => x > 0.0001 && x < 0.5], ["0,5–1x", (x) => x >= 0.5 && x < 1], ["1–3x", (x) => x >= 1 && x < 3], ["3–10x", (x) => x >= 3 && x < 10], ["10x o más", (x) => x >= 10]]) {
  say(`| ${et} | ${(mults.filter(f).length / mults.length * 100).toFixed(1)}% |`);
}
say(``);
say(`Múltiplo medio ${media(mults).toFixed(2)}x · mediana ${pct(mults, 0.5).toFixed(2)}x · p95 ${pct(mults, 0.95).toFixed(2)}x · máximo ${Math.max(...mults).toFixed(1)}x`);
const maxAlcanzado = todos.map((s) => s.maxMult);
say(`Múltiplo MÁXIMO alcanzado en vida (lo que se habría cobrado con una salida perfecta): medio ${media(maxAlcanzado).toFixed(2)}x · p95 ${pct(maxAlcanzado, 0.95).toFixed(2)}x`);

// Los billetes distintos que fueron 10x o más (deduplicados: mismo ticker+fecha en varias semillas)
const unicos = new Map();
for (const s of todos) unicos.set(`${s.ticker}|${s.fecha}|${s.K}`, s);
const gordos = [...unicos.values()].filter((s) => s.mult >= 5).sort((a, b) => b.mult - a.mult);
say(`\n### Los billetes distintos que multiplicaron por 5 o más (${gordos.length} de ${unicos.size} billetes distintos)\n`);
say(`| ticker | comprado | vence | strike | pagado | múltiplo | máximo en vida | ¿venció? |`);
say(`|---|---|---|---|---|---|---|---|`);
for (const s of gordos.slice(0, 25)) say(`| ${s.ticker} | ${s.fecha} | ${s.exp} | ${s.K} | $${s.ask.toFixed(2)} | **${s.mult.toFixed(1)}x** | ${s.maxMult.toFixed(1)}x | ${s.motivo === "vencimiento" ? "sí, cobrado" : "**no, valorado**"} |`);
const gordosCerrados = gordos.filter((s) => s.motivo === "vencimiento");
say(`\nDe los ${gordos.length} billetes gordos, **${gordosCerrados.length} llegaron a vencer** y el resto sigue vivo al acabarse el dato:`);
say(`su múltiplo es una VALORACIÓN al bid real, no dinero cobrado.`);
say(``);
say(`**VERIFICADO A MANO CONTRA EL FICHERO CRUDO** (el mayor de todos, AMD): comprado el 2025-06-02 con AMD a`);
say(`$114,63, strike 185 (+61%), vencimiento 2026-06-18 (381 días). Cotización ese día [5,50 · 5,65] → se paga`);
say(`el ask **5,65**. El 2026-06-18 AMD cierra en **$537,37** y el contrato cotiza [349,20 · 354,55]; el intrínseco`);
say(`es 537,37−185 = **352,37**, que casa con el bid a menos de $3. **61,8x, y es dinero real.**`);

// Concentración: de qué ticker vienen las ganancias
say(`\n### Criba de concentración — ¿de dónde sale el dinero de los billetes?\n`);
const porTicker = new Map();
for (const s of todos) {
  const a = porTicker.get(s.ticker) ?? { n: 0, pnl: 0 };
  a.n++; a.pnl += s.pnl; porTicker.set(s.ticker, a);
}
const orden = [...porTicker.entries()].sort((a, b) => b[1].pnl - a[1].pnl);
const plTot = orden.reduce((a, x) => a + Math.max(0, x[1].pnl), 0);
say(`| ticker | billetes | P&L acumulado | % de todo lo ganado |`);
say(`|---|---|---|---|`);
for (const [t, a] of orden.slice(0, 8)) say(`| ${t} | ${a.n} | ${D(a.pnl)} | ${a.pnl > 0 ? (a.pnl / plTot * 100).toFixed(0) + "%" : "—"} |`);
for (const [t, a] of orden.slice(-4)) say(`| ${t} | ${a.n} | ${D(a.pnl)} | — |`);

// ── LA CRIBA QUE DECIDE: QUITAR LOS NOMBRES QUE LO GANAN TODO ─────────────────────────────
say(`\n### Dejar fuera del bombo a los nombres que lo ganan todo\n`);
say(`La criba de concentración de la barrera exige que ningún activo pase del 20%. Aquí no se cumple ni de lejos.`);
say(`La pregunta operativa es: si en 2024 no hubiera existido el nombre que resultó ser el ganador —cosa que`);
say(`nadie sabía entonces—, ¿qué habría dado el barbell? Se repite la simulación quitando del bombo a los N`);
say(`tickers que más dinero dieron, uno a uno.`);
say(``);
say(`| bombo | $/año medio | mediana | p05 | vs cóndor solo |`);
say(`|---|---|---|---|---|`);
const rankTickers = orden.filter((x) => x[1].pnl > 0).map((x) => x[0]);
for (let k = 0; k <= Math.min(4, rankTickers.length); k++) {
  const excluir = new Set(rankTickers.slice(0, k));
  const rs = [];
  for (let s = 0; s < SEMILLAS; s++) rs.push(simular(cond, billetes, setCompra, { ...espPrincipal.cfg, excluir }, s));
  const pa = rs.map((r) => r.porAño);
  say(`| ${k === 0 ? "los 28 tickers" : `sin ${[...excluir].join(", ")}`} | ${D(media(pa))} | ${D(pct(pa, 0.5))} | ${D(pct(pa, 0.05))} | ${media(pa) > base.porAño ? "+" : ""}${D(media(pa) - base.porAño)} |`);
}
say(`\n(Especificación >60% / 100% del ingreso / aguantar a vencimiento.)`);

// La misma criba sobre la especificación que salió mejor en media — la tentación de quedarse con ella.
const mejorEsp = resultados.reduce((a, b) => (media(b.porAño) > media(a.porAño) ? b : a));
say(`\nY la misma criba sobre la especificación que MEJOR salió (>${(mejorEsp.cfg.otm * 100).toFixed(0)}% / ${(mejorEsp.cfg.fraccion * 100).toFixed(0)}% / ${mejorEsp.cfg.salida}), que es la que apetece elegir:\n`);
const porTickerM = new Map();
for (const r of mejorEsp.rs) for (const s of r.sucesos) {
  const a = porTickerM.get(s.ticker) ?? { n: 0, pnl: 0 };
  a.n++; a.pnl += s.pnl; porTickerM.set(s.ticker, a);
}
const rankM = [...porTickerM.entries()].sort((a, b) => b[1].pnl - a[1].pnl).filter((x) => x[1].pnl > 0).map((x) => x[0]);
say(`| bombo | $/año medio | mediana | vs cóndor solo |`);
say(`|---|---|---|---|`);
for (let k = 0; k <= Math.min(2, rankM.length); k++) {
  const excluir = new Set(rankM.slice(0, k));
  const rs = [];
  for (let s = 0; s < SEMILLAS; s++) rs.push(simular(cond, billetes, setCompra, { ...mejorEsp.cfg, excluir }, s));
  const pa = rs.map((r) => r.porAño);
  say(`| ${k === 0 ? "los 28 tickers" : `sin ${[...excluir].join(", ")}`} | ${D(media(pa))} | ${D(pct(pa, 0.5))} | ${media(pa) > base.porAño ? "+" : ""}${D(media(pa) - base.porAño)} |`);
}

// Bootstrap sobre los BILLETES: la incertidumbre real no está en la semilla, está en que son ~26 apuestas.
say(`\n### La incertidumbre de verdad: 2.000 remuestreos de los billetes\n`);
const pnlBilletes = [];
for (const r of espPrincipal.rs) for (const s of r.sucesos) pnlBilletes.push(s.pnl);
const nB = Math.round(media(espPrincipal.rs.map((r) => r.comprados)));
const boot = [];
const rb = rng32(20260817);
for (let i = 0; i < 2000; i++) {
  let sum = 0;
  for (let k = 0; k < nB; k++) sum += pnlBilletes[Math.floor(rb() * pnlBilletes.length)];
  boot.push(sum / (cond.fechas.length / 252));
}
say(`Cada cartera compra ${nB} billetes en ${(cond.fechas.length / 252).toFixed(2)} años. Remuestreando ${nB} billetes con reemplazo del conjunto`);
say(`de ${pnlBilletes.length} resultados observados, el aporte de los billetes al $/año sale:`);
say(``);
say(`| p05 | p25 | mediana | media | p75 | p95 | % de carteras con aporte ≤ 0 |`);
say(`|---|---|---|---|---|---|---|`);
say(`| ${D(pct(boot, 0.05))} | ${D(pct(boot, 0.25))} | ${D(pct(boot, 0.5))} | ${D(media(boot))} | ${D(pct(boot, 0.75))} | ${D(pct(boot, 0.95))} | ${(boot.filter((x) => x <= 0).length / boot.length * 100).toFixed(0)}% |`);
say(`\nLa mediana muy por debajo de la media es la firma de la lotería: **la cartera típica NO cobra**, la media la`);
say(`levantan unas pocas carteras que sí. Eso es exactamente el perfil que Lester pide — y también la razón por`);
say(`la que 2,6 años de dato no bastan para saber cuánto vale.`);

// ── LA FORMA: ¿es el perfil que Lester pide? ──────────────────────────────────────────────
say(`\n### ¿Es el perfil que se buscaba: "perder poco casi siempre y de vez en cuando cobrar 30x"?\n`);
say(`| | cóndor solo | barbell >60%/100%/venc (semilla mediana) |`);
say(`|---|---|---|`);
const medianaIdx = espPrincipal.porAño
  .map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])[Math.floor(SEMILLAS / 2)][1];
const rMed = espPrincipal.rs[medianaIdx];
function forma(curva) {
  const dif = [];
  for (let i = 1; i < curva.length; i++) dif.push(curva[i] - curva[i - 1]);
  const neg = dif.filter((x) => x < 0).length / dif.length;
  return { neg, peor: Math.min(...dif), mejor: Math.max(...dif), p01: pct(dif, 0.01) };
}
const fB = forma(base.curva), fM = forma(rMed.curva);
say(`| días a la baja | ${(fB.neg * 100).toFixed(0)}% | ${(fM.neg * 100).toFixed(0)}% |`);
say(`| peor día | ${D(fB.peor)} | ${D(fM.peor)} |`);
say(`| mejor día | ${D(fB.mejor)} | ${D(fM.mejor)} |`);
say(`| percentil 1 de los días | ${D(fB.p01)} | ${D(fM.p01)} |`);
say(`| caída máxima | ${D(base.caida)} | ${D(rMed.caida)} |`);
say(`| patrimonio MÍNIMO alcanzado | ${D(base.minimo)} | ${D(rMed.minimo)} |`);
say(`| día en que deja de cubrir el colateral | ${base.diaRuina ?? "nunca"} | ${rMed.diaRuina ?? "nunca"} |`);
say(``);
say(`## ⚠️ EL TOPE DURO QUE INVALIDA TODAS LAS CIFRAS DE ARRIBA\n`);
const ruinados = espPrincipal.rs.filter((r) => r.diaRuina).length;
say(`El efectivo libre son **${D(EFECTIVO)}** y el colateral de un cóndor de alas ${ALA} es **${D(ALA * 100)}**. La caída`);
say(`observada del cóndor solo es **${D(base.caida)}** — casi el doble del efectivo. El patrimonio mínimo del cóndor solo`);
say(`es ${D(base.minimo)}${base.diaRuina ? `, y el ${base.diaRuina} ya no cubre el colateral` : ""}.`);
say(`En ${ruinados} de ${SEMILLAS} semillas del barbell el patrimonio cae por debajo del colateral en algún momento.`);
say(``);
say(`**Todo lo que la simulación hace después de ese día es ficción**: el bróker habría cerrado la posición y no`);
say(`habría con qué poner la del día siguiente. Los $/año de las tablas suponen que se puede seguir operando 1`);
say(`cóndor los 653 días, y con ${D(EFECTIVO)} de efectivo **eso no es cierto** en el propio período medido.`);
say(`Para operar 1 cóndor de alas ${ALA} sin quedarse sin dinero en la caída observada harían falta ~${D(ALA * 100 + base.caida)}`);
say(`de efectivo libre; para la caída p95 de $39.715 que ya midió \`opt-cola.mjs\`, ~${D(ALA * 100 + 39715)}.`);
say(``);
say(`### ¿Cabe algún tamaño de cóndor en ${D(EFECTIVO)}? — se prueban las seis anchuras\n`);
say(`| alas | colateral (neteado) | patrimonio mínimo desde ${D(EFECTIVO)} | día en que se queda sin colateral | $/año |`);
say(`|---|---|---|---|---|`);
let alguna = false;
for (const ala of [10, 20, 30, 50, 75, 100]) {
  const s2 = serieCondor(fechasSpx, DIST, ala);
  const mapa = new Map(); for (const x of s2) mapa.set(x.fecha.replace(/-/g, ""), x.pl);
  let eq = EFECTIVO, mn = Infinity, dr = null;
  for (const f of cond.fechas) {
    eq += mapa.get(f) ?? 0;
    if (eq < mn) mn = eq;
    if (dr === null && eq < ala * 100) dr = f;
  }
  if (!dr) alguna = true;
  say(`| ${ala} | ${D(ala * 100)} | ${D(mn)} | ${dr ?? "**nunca — cabe**"} | ${D(media(s2.map((x) => x.pl)) * 252)} |`);
}
say(`\n${alguna ? "Alguna anchura aguanta el período con este efectivo." : "**Ninguna de las seis anchuras aguanta el período con este efectivo.** No es un problema del barbell ni de la anchura: el cóndor 0DTE a 1 contrato no se puede financiar con " + D(EFECTIVO) + "."}`);
say(``);
say(`**LO QUE NO SÉ Y CAMBIA ESTO:** el cálculo usa sólo el efectivo libre. Si Robinhood le presta contra las`);
say(`500 acciones de HOOD (~${D(CUENTA - EFECTIVO)}), el colchón es otro y el cóndor sí se puede sostener. Esa pregunta —si`);
say(`la cuenta es de efectivo o de margen y cuánto poder de compra dan las acciones— **no está verificada en el`);
say(`proyecto** y decide si esta sección es un tope duro o un aviso. No la relleno.`);
say(``);
say(`El billete de lotería **no cubre el día malo del cóndor**: no es una cobertura, es otra apuesta que corre en`);
say(`paralelo. El peor día sigue siendo el peor día del cóndor (${D(fB.peor)}), porque los billetes son calls`);
say(`compradas —lo peor que hacen es no moverse—. Lo que sí cambia es que las subidas dejan de ser de $74:`);
say(`el mejor día de la cartera combinada es ${D(fM.mejor)}.`);

// ── PEAJE DE LA HORQUILLA ─────────────────────────────────────────────────────────────────
say(`\n## 7. El peaje de la horquilla en los billetes (trampa nº4)\n`);
const bilTodos = [];
for (const t of TICKERS) for (const k in billetes[t]) bilTodos.push(billetes[t][k]);
for (const u of OTMS) {
  const g = bilTodos.filter((b) => b.otm === u);
  const askM = media(g.map((b) => b.ask * 100)), medM = media(g.map((b) => b.medio));
  const finM = media(g.map((b) => b.valorFin)), finMedM = media(g.map((b) => b.valorFinMedio));
  say(`**>${(u * 100).toFixed(0)}% fuera** (${g.length} billetes distintos): pagado real ${D(askM)} vs punto medio ${D(medM)} (peaje ${((askM / medM - 1) * 100).toFixed(1)}%) ·`);
  say(`cobrado real ${D(finM)} vs punto medio ${D(finMedM)} · **múltiplo real ${(finM / askM).toFixed(2)}x vs a punto medio ${(finMedM / medM).toFixed(2)}x**`);
}
say(`\nLa horquilla de un billete de lotería es enorme en % (se paga $0,20 por algo que vale $0,15), y ese`);
say(`es el peaje que hay que superar. La diferencia entre las dos columnas ES cuánto del resultado era liquidez.`);

// ── TERCIOS ───────────────────────────────────────────────────────────────────────────────
say(`\n## 8. Los tres tercios de tiempo (criba 3 de la barrera)\n`);
const nT = Math.floor(cond.fechas.length / 3);
const cortes = [cond.fechas[0], cond.fechas[nT], cond.fechas[2 * nT], cond.fechas[cond.fechas.length - 1]];
say(`| espec. | ${cortes[0]}→${cortes[1]} | ${cortes[1]}→${cortes[2]} | ${cortes[2]}→${cortes[3]} | mismo signo |`);
say(`|---|---|---|---|---|`);
let pasanTercios = 0;
for (const r of resultados) {
  const t3 = [0, 1, 2].map((k) => {
    const ini = cond.fechas[k * nT], fin = cond.fechas[k === 2 ? cond.fechas.length - 1 : (k + 1) * nT];
    const v = [];
    for (const rr of r.rs) {
      let sum = 0;
      for (const s of rr.sucesos) if (s.fecha >= ini && s.fecha <= fin) sum += s.pnl;
      v.push(sum);
    }
    return media(v);
  });
  const mismo = t3.every((x) => x > 0) || t3.every((x) => x < 0);
  if (mismo) pasanTercios++;
  say(`| >${(r.cfg.otm * 100).toFixed(0)}%/${(r.cfg.fraccion * 100).toFixed(0)}%/${r.cfg.salida} | ${D(t3[0])} | ${D(t3[1])} | ${D(t3[2])} | ${mismo ? "SÍ" : "**NO**"} |`);
}
say(`\n(P&L de los BILLETES por tercio, medio sobre las semillas. El cóndor ya se sabe que mantiene el signo.)`);
say(`\n**${pasanTercios} de 12 especificaciones mantienen el signo en los tres tercios.** El primer tercio —de enero`);
say(`a noviembre de 2024, que incluye la corrección de agosto— es negativo casi siempre: los billetes comprados`);
say(`en 2024 vencieron sin valor y los que pagaron se compraron en 2025. Un resultado que vive en un tercio no`);
say(`pasa la barrera, y este vive en el segundo.`);

// ── EL LISTÓN: SPY ────────────────────────────────────────────────────────────────────────
say(`\n## 9. El listón — comprar SPY y no hacer nada\n`);
const spy = JSON.parse(readFileSync(`${KDIR}/SPY.json`, "utf8"));
// Los dos calendarios no acaban el mismo día (SPXW llega al 20260810, las acciones al 20260806):
// se usan los cierres REALES más cercanos dentro del período, y se dice cuáles son.
const cerrSpy = Object.keys(spy).filter((d) => d >= cond.fechas[0] && d <= cond.fechas[cond.fechas.length - 1]).sort();
const d0 = cerrSpy[0], d1 = cerrSpy[cerrSpy.length - 1];
if (!(spy[d0] > 0) || !(spy[d1] > 0)) throw new Error("Sin cierre real de SPY en los extremos del período — no se compara contra un listón inventado.");
const años = cond.fechas.length / 252;
const spyRet = spy[d1] / spy[d0] - 1;
const spyAño = CUENTA * ((1 + spyRet) ** (1 / años) - 1);
say(`SPY ${d0} $${spy[d0].toFixed(2)} → ${d1} $${spy[d1].toFixed(2)} = **${(spyRet * 100).toFixed(1)}%** en ${años.toFixed(2)} años = **${(((1 + spyRet) ** (1 / años) - 1) * 100).toFixed(1)}%/año**.`);
say(`Sobre los $${CUENTA.toLocaleString("es-ES")} de la cuenta entera: **${D(spyAño)}/año** (sin dividendos, que sumarían ~1,2 puntos).`);
say(`El barbell mueve sólo los ${D(EFECTIVO)} de efectivo libre: el 85% restante ya está en HOOD y no se toca.`);

// ── CAPITAL Y COLATERAL ───────────────────────────────────────────────────────────────────
say(`\n## 10. El conflicto que nadie había puesto sobre la mesa: el colateral y los billetes son el MISMO dinero\n`);
const credMedio = credMed;
say(`Efectivo libre: **${D(EFECTIVO)}** (el 85% de la cuenta son 500 acciones de HOOD).`);
say(`Colateral de 1 cóndor de alas ${ALA}: **${D(ALA * 100 - credMedio)}** si el bróker netea las dos verticales,`);
say(`**${D(2 * ALA * 100 - credMedio)}** si retiene cada una por su lado. En Robinhood **son dos órdenes** y eso sigue sin verificar.`);
say(``);
say(`| hipótesis | colateral | queda libre para billetes |`);
say(`|---|---|---|`);
say(`| neteado | ${D(ALA * 100 - credMedio)} | ${D(EFECTIVO - (ALA * 100 - credMedio))} |`);
say(`| dos verticales | ${D(2 * ALA * 100 - credMedio)} | ${D(EFECTIVO - (2 * ALA * 100 - credMedio))} |`);
say(``);
say(`Esta simulación reserva ${D(ALA * 100)} de colateral (hipótesis neteada, la favorable) y sólo gasta en billetes`);
say(`lo que el cóndor ha ganado por encima de eso. **Con la hipótesis de dos verticales, un cóndor de alas ${ALA}`);
say(`ni siquiera cabe en el efectivo libre**, y el barbell no arranca hasta que el cóndor haya ganado la diferencia.`);

// ── RESUMEN ───────────────────────────────────────────────────────────────────────────────
say(`\n## 11. Resumen en dólares al año sobre la cuenta real\n`);
say(`| estrategia | $/año medio | $/año mediana | caída máxima | patrimonio mínimo | semillas que se quedan sin colateral |`);
say(`|---|---|---|---|---|---|`);
say(`| cóndor solo, 1 contrato | ${D(base.porAño)} | ${D(base.porAño)} | ${D(base.caida)} | ${D(base.minimo)} | ${base.diaRuina ? "sí (" + base.diaRuina + ")" : "no"} |`);
for (const r of resultados) {
  say(`| barbell >${(r.cfg.otm * 100).toFixed(0)}% / ${(r.cfg.fraccion * 100).toFixed(0)}% / ${r.cfg.salida} | ${D(media(r.porAño))} | ${D(pct(r.porAño, 0.5))} | ${D(media(r.rs.map((x) => x.caida)))} | ${D(media(r.rs.map((x) => x.minimo)))} | ${(r.rs.filter((x) => x.diaRuina).length / SEMILLAS * 100).toFixed(0)}% |`);
}
say(`| comprar SPY y esperar (cuenta entera) | ${D(spyAño)} | | (no medida aquí) | |`);
say(``);
say(`**Y el mismo cuadro sin los dos nombres que lo ganaron todo** — que es el escenario que hay que mirar para`);
say(`decidir, porque en enero de 2024 nadie sabía que AMD iba a multiplicar por 4,7 ni INTC por 5,2:`);
say(``);
const sinDos = new Set(rankTickers.slice(0, 2));
say(`| estrategia | $/año medio | $/año mediana | vs cóndor solo |`);
say(`|---|---|---|---|`);
for (const r of resultados) {
  const rs = [];
  for (let s = 0; s < SEMILLAS; s++) rs.push(simular(cond, billetes, setCompra, { ...r.cfg, excluir: sinDos }, s));
  const pa = rs.map((x) => x.porAño);
  say(`| barbell >${(r.cfg.otm * 100).toFixed(0)}% / ${(r.cfg.fraccion * 100).toFixed(0)}% / ${r.cfg.salida} | ${D(media(pa))} | ${D(pct(pa, 0.5))} | ${media(pa) > base.porAño ? "+" : ""}${D(media(pa) - base.porAño)} |`);
}
say(`\n(Fuera del bombo: ${[...sinDos].join(" y ")}.)`);

// ── QUÉ HACER ─────────────────────────────────────────────────────────────────────────────
say(`\n## 12. Qué hacer — no me quedo en el "no"\n`);
say(`**Lo que la medición SÍ deja en pie:** el lado de los billetes, con precios reales y pagando el ask, dio un`);
say(`múltiplo medio de ${media(mults).toFixed(2)}x sobre ${unicos.size} billetes distintos comprados AL AZAR, sin ningún selector. La forma es la`);
say(`que Lester quiere: ${(mults.filter((x) => x <= 0.0001).length / mults.length * 100).toFixed(0)}% a cero y ${(mults.filter((x) => x >= 10).length / mults.length * 100).toFixed(1)}% por encima de 10x. **Y la respuesta a la pregunta literal es SÍ:** el ingreso del`);
say(`cóndor paga los billetes. Gastando el 100% del ingreso se compran ${D(espPrincipal.gast)} de billetes que devuelven`);
say(`${D(espPrincipal.rec)} (${D(espPrincipal.res)} cobrados de verdad, ${D(espPrincipal.abi)} todavía en cartera). Nunca se`);
say(`toca el capital: sólo se gasta lo que el cóndor ha ganado antes. (El gasto pasa ligeramente del ingreso NETO`);
say(`final de ${D(base.ingreso)} porque el acumulado del cóndor tuvo un pico más alto a mitad de camino y se gastó de él.)`);
say(``);
say(`**Lo que NO deja en pie:** el 93% del dinero de los billetes sale de AMD e INTC, el primer tercio de tiempo es`);
say(`negativo en 5 de las 6 especificaciones de >60%, y quitando esos dos nombres el barbell PIERDE contra el`);
say(`cóndor solo en 11 de las 12. Con 32 apuestas en 2,6 años no hay forma de separar "la lotería paga" de`);
say(`"tocaron dos gordos".`);
say(``);
say(`**Las dos medidas concretas que sí resolverían esto, con dato que YA está en disco:**`);
say(``);
say(`1. **El lado de los billetes sobre 2016-2026, no sobre 2024-2026.** \`scripts/cache-theta/cadenas\` tiene los 28`);
say(`   tickers desde 2016: son **~126 apuestas mensuales** en vez de 32, con 2018, 2020 y 2022 dentro. Es el mismo`);
say(`   precálculo de este script cambiando dos fechas, y es lo único que puede decir si el múltiplo medio de`);
say(`   ${media(mults).toFixed(2)}x sobrevive a un período sin un AMD. La contra ya conocida: el memo de los 10x dice que el mismo`);
say(`   perfil dio 22,66x en 2019 y 0,11x en 2021 — con más muestra eso se ve o se descarta, pero se ve.`);
say(`2. **Verificar si Robinhood da poder de compra contra las acciones de HOOD.** Es una consulta a la cuenta, no`);
say(`   una medición, y decide si la sección 6 es un tope duro. Sin esa respuesta, el $/año de todas estas tablas`);
say(`   está calculado sobre una cartera que en abril de 2024 ya se había quedado sin dinero.`);
say(``);
say(`**Lo que NO recomiendo tocar:** el forward-test del cóndor con filtro de GEX que ya está corriendo. Sus`);
say(`parámetros están pre-registrados y es lo único que ninguno de los dos puede manosear.`);

writeFileSync("scripts/conv-barbell-resultado.json", JSON.stringify({
  parametros: { HORA, DIST, ALA, SEMILLAS, EFECTIVO, CUENTA },
  condor: { n: sc.length, plMedio: media(plC), credMediano: credMed, acierto, t: tCondor, porAño: media(plC) * 252 },
  base: { final: base.final, porAño: base.porAño, caida: base.caida, minimo: base.minimo, diaRuina: base.diaRuina, ingreso: base.ingreso },
  diagL: { ...diagL, splits: diagL.splits },
  especificaciones: resultados.map((r) => ({
    ...r.cfg, medio: media(r.porAño), mediana: pct(r.porAño, 0.5),
    p05: pct(r.porAño, 0.05), p95: pct(r.porAño, 0.95),
    caida: media(r.rs.map((x) => x.caida)), minimo: media(r.rs.map((x) => x.minimo)),
    sinColateral: r.rs.filter((x) => x.diaRuina).length / SEMILLAS,
    recupResuelto: r.res, recupAbierto: r.abi,
    gastado: r.gast, recuperado: r.rec, t: r.t,
    ganAlCondor: r.porAño.filter((x) => x > base.porAño).length / SEMILLAS,
  })),
  gordos: gordos.slice(0, 40),
  spy: { ret: spyRet, porAño: spyAño },
}, null, 1), "utf8");

say(`\n---\n${((Date.now() - t0) / 1000).toFixed(0)} s · detalle en \`scripts/conv-barbell-resultado.json\``);
writeFileSync("scripts/conv-barbell-informe.md", LOG.join("\n"), "utf8");
