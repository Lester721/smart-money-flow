// ╔══════════════════════════════════════════════════════════════════════════════════════════╗
// ║  COMBINADO — LA PALANCA + TSLA's MISSILE sobre UNA SOLA cuenta de $60.000                 ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════╝
//
// Lester, 2026-08-31: «me gustaría que corrieras aparte un forward test de TSLA MISSILE y LA
// PALANCA juntos con mi cuenta de $60.000 descansando en SPY».
//
// NO ejecuta órdenes. Apunta en papel lo que las dos reglas juntas habrían hecho, día a día.
//
// ╔═══ QUÉ MIDE ESTE CUADERNO QUE LOS OTROS DOS NO PUEDEN ═══╗
// Cada una por separado supone que tiene los $60.000 enteros para ella sola. Juntas NO los
// tienen, y ahí está lo único que este cuaderno puede medir: CUÁNTO SE ESTORBAN.
//   · La Palanca pide el 24% del patrimonio en total (ver EL REPARTO más abajo).
//   · El Missile pide 25% por posición, el DOBLE si confirma, 4 huecos → hasta el 200%.
// O sea que el Missile él solo puede vaciar la cuenta. Dispara ~4 veces al año y aguanta 60
// días como mucho, así que el choque es raro, pero cuando pasa se lo come todo.
//
// ╔═══ EL ORDEN DEL DÍA, y por qué ═══╗
//   1. marcar y cerrar TODO lo abierto de las dos.
//   2. el MISSILE primero. Es rarísimo (34 señales en seis años) y su señal CADUCA: el golpe
//      fue ayer y se compra hoy. La Palanca tiene señales casi todos los días y el mismo
//      nombre le vuelve a salir mañana, así que perder un turno le cuesta mucho menos.
//   3. LA PALANCA con lo que quede.
//   4. el ocioso a SPY.
// Cuando una se queda sin dinero por culpa de la otra SE APUNTA, en `estorbos`. Esa cuenta es
// el resultado de este cuaderno: si al cabo de un año sale cero, juntarlas salió gratis.
//
// ╔═══ LOS FALLOS QUE YA SE COMETIERON (memoria: checklist-forward-test-nuevo) ═══╗
//   · cada familia guarda con SUS nombres → aquí cada posición lleva `estrategia`.
//   · se apunta el día AUNQUE no haya señal → `sesiones` y `sinSenal`.
//   · se apunta la HORQUILLA de cada entrada y NO se filtra por ella.
//   · se vende SPY para financiar, igual que el motor del backtest.
//   · `origen`: railway:<servicio> o local, para que una prueba mía no tape un fallo de Railway.
//   · se cierra Redis al final, o el cron no termina nunca.
//   · latido en cada corrida, con la firma (redis, servicio, resultado).
//   · las unidades no se tocan dos veces: aquí todo son DÓLARES.
import Redis from "ioredis";
import { R, TK, iso, ms, cierres, calls, elegir } from "./palanca-lib.mjs";
import { GOLPE_MIN, VS_OI_MIN, COSTE_MIN, DTE_MIN, HORA_MIN, MA_DIAS, MA_MIN,
         HUECOS, TAM, OBJETIVO, SUELO, MOV_CONFIRMA, MOV_NO, TOPE_DIAS, DOM_MIN,
         GOLPES_MIN, GOLPES_MAX, dteDe, D, cadena, spotDeCadena, golpesDe, oiDe,
         diaAnterior, sembrarSpots, ultimaSesion } from "./missile-lib.mjs";

// ── EL REPARTO, que es lo único que cambia entre las dos versiones ────────────────────────
// Lester, 2026-09-01: «monta una con 6 huecos x 4% y otra de 4 x 6%. 6 huecos es lo que yo
// normalmente me atrevería a comprar pero 4 huecos sería mi próximo paso y quiero ver cómo se
// siente».
//
// HUECO = una compra viva a la vez. Con 6 huecos puede tener hasta 6 posiciones abiertas al
// mismo tiempo; llenas las seis, una señal nueva no entra hasta que se cierre alguna. El TAM es
// cuánto de la cuenta va en cada una. Los dos repartos comprometen lo mismo (el 24%): 6×4% son
// compras de $2.400 y 4×6% de $3.600.
//
// El congelado original era 10 huecos × 2,4% = compras de $1.440, y NO SE MONTA porque con
// $60.000 no alcanza para casi ningún contrato: sólo el 8% de las señales de 2026 caben ahí.
// El cuaderno de La Palanca a solas lleva 0 compras de 6 señales por esto mismo.
const HUECOS_P = Number(process.env.COMBI_HUECOS || 6);
const TAM_P    = Number(process.env.COMBI_TAM || 0.04);
const ID       = process.env.COMBI_ID || (HUECOS_P + "x" + Math.round(TAM_P * 1000) / 10);
const CLAVE = "forward:combinado-" + ID;
const STORE = (process.env.COMBI_STORE || (process.env.REDIS_URL ? "redis" : "file")).toLowerCase();
const CAPITAL = 60000;

// ── almacén ───────────────────────────────────────────────────────────────────────────────
let _r = null;
async function redis() {
  if (_r) return _r;
  if (!process.env.REDIS_URL) throw new Error("COMBI_STORE=redis pero falta REDIS_URL");
  _r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  return _r;
}
const origen = () => process.env.RAILWAY_SERVICE_NAME ? ("railway:" + process.env.RAILWAY_SERVICE_NAME) : "local";
async function leer() {
  if (STORE !== "redis") {
    const { readFileSync } = await import("node:fs");
    try { return JSON.parse(readFileSync("data/forward/combinado-" + ID + ".json", "utf8")); } catch { return null; }
  }
  const c = await (await redis()).get(CLAVE);
  return c ? JSON.parse(c) : null;
}
async function guardar(E, reporte, resumen) {
  const s = JSON.stringify(E);
  if (STORE !== "redis") {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync("data/forward", { recursive: true });
    writeFileSync("data/forward/combinado-" + ID + ".json", s);
    return;
  }
  const r = await redis();
  await r.set(CLAVE, s);
  if (reporte) await r.set(CLAVE + ":report", reporte);
  // La firma es (redis, servicio, resultado). Llamarla con un argumento daba
  // "redis.set is not a function" y el latido no se escribía: el vigilante habría visto
  // este servicio como MUERTO aunque corriera perfectamente.
  await latir(resumen || "corrida");
}
// ⚠️ EL LATIDO, EN TODAS LAS SALIDAS Y SIN TRAGARSE EL ERROR.
// A La Palanca le faltaba el latido en Redis por dos cosas a la vez: las salidas tempranas
// terminaban antes de escribirlo, y el catch estaba vacío. Sin latido, «corrió y no encontró
// nada» y «lleva días muerto» se ven IGUAL desde fuera. Aquí nace ya arreglado.
async function latir(resultado) {
  if (STORE !== "redis") return;
  try {
    const { escribirLatido } = await import("../lib/origenEjecucion.ts");
    await escribirLatido(await redis(), "combinado-" + ID, resultado);
  } catch (e) {
    console.error("  ⛔ NO SE PUDO ESCRIBIR EL LATIDO: " + (e?.message ?? e));
    process.exitCode = 3;
  }
}
// Sin esto el proceso NO TERMINA: ioredis deja el socket abierto y el cron se queda colgado.
async function cerrar() { if (_r) { try { await _r.quit(); } catch {} _r = null; } }

// ══ EL DÍA ════════════════════════════════════════════════════════════════════════════════
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
// Tambien por variable de entorno: en Railway el dia no se puede pasar por linea de
// comandos sin cambiar el startCommand (y eso redespliega). Con esto se rellena un dia
// perdido poniendo la variable, lanzando la corrida y quitandola.
const pedido = arg("--dia") || process.env.COMBI_DIA || null;
const hoyYMD = () => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return p.find(x => x.type === "year").value + p.find(x => x.type === "month").value + p.find(x => x.type === "day").value;
};
// ⚠️ EL DÍA LO MANDA LA CADENA DE TSLA, no el calendario de SPY.
// ThetaData RECHAZA la cadena del día en curso: "Cannot fetch current-day data without
// specifying an expiration" (HTTP 400). SPY sí publica su cierre el mismo día, así que si el
// día saliera de SPY este cuaderno reventaría todas las tardes. ultimaSesion() retrocede hasta
// la última sesión con cadena — exactamente lo que hace el cuaderno del Missile a solas.
const HOY = pedido ? pedido.replace(/-/g, "") : (await ultimaSesion()) || hoyYMD();
const desde = new Date(ms(HOY) - 140 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");

console.log("\n  ╔═══ COMBINADO · La Palanca + TSLA's Missile ═══╗   día " + iso(HOY) +
  "   ·   origen " + origen() + "   ·   store " + STORE + "\n");

// el calendario de sesiones sale de SPY, igual que en el cuaderno de La Palanca
const spyC = await cierres("SPY", desde, HOY);
if (!spyC) { console.log("  ⛔ sin cierres de SPY — no hay datos hoy. NO se escribe nada.");
  await latir("sin cierres de SPY: no había datos"); await cerrar(); process.exit(0); }
const SES = spyC.map(x => x[0]);
// El día lo pone la cadena de TSLA; de SPY se coge el cierre DE ESE MISMO día. Cruzar el cierre
// de un día con la cadena de otro es la trampa de mezclar series de orígenes distintos, que ya
// nos coló un look-ahead una vez.
const iDia = SES.lastIndexOf(HOY);
if (iDia < 0) { console.log("  ⛔ SPY no tiene cierre de " + iso(HOY) + " — NO se escribe nada.");
  await latir("SPY no tenía cierre de " + iso(HOY)); await cerrar(); process.exit(0); }
const DIA = SES[iDia];
const SPYP = spyC[iDia][1];
console.log("  última sesión con datos: " + iso(DIA) + "   ·   SPY $" + SPYP.toFixed(2));

let E = await leer();
if (!E) {
  E = { creado: new Date().toISOString(), capital: CAPITAL, caja: CAPITAL, spyAcc: 0,
        abiertas: [], operaciones: [], spots: {}, sesiones: [], estorbos: [], sinSenal: [], ultimoDia: null };
  console.log("  cuaderno NUEVO: se siembra con $" + CAPITAL.toLocaleString("en-US"));
}
// NI UN DIA HACIA ATRAS. El guardian de arriba solo compara IGUALDAD, asi que pedir un dia
// ANTERIOR al ya procesado colaba: el cuaderno gestionaria posiciones abiertas DESPUES con
// precios de ANTES de abrirlas -- viaje en el tiempo, y el resultado saldria inventado sin que
// nada fallara. Cazado el 2026-09-04 intentando rellenar el 2 de septiembre despues del 3.
// Sale con CERO: pedir un dia imposible es un error de quien lo pide, no un fallo del trabajo,
// y salir con error dejaria el despliegue CRASHED (que apaga el cron para siempre).
if (E.ultimoDia && DIA < E.ultimoDia) {
  console.log("  ⛔ me piden " + iso(DIA) + " pero ya voy por " + iso(E.ultimoDia) + "." +
    " Retroceder inventaria resultados. NO se toca nada.");
  await latir("RECHAZADO: me pidieron " + iso(DIA) + " estando ya en " + iso(E.ultimoDia));
  await cerrar(); process.exit(0);
}

if (E.ultimoDia === DIA) { console.log("  ya se procesó " + iso(DIA) + " — no se repite. Salgo.");
  await latir(iso(DIA) + " ya estaba procesado — nada que hacer hoy"); await cerrar(); process.exit(0); }
if (!E.sesiones.includes(DIA)) E.sesiones.push(DIA);
E.sesiones.sort();
const nSes = (d) => { const i = E.sesiones.indexOf(d); return i < 0 ? 0 : E.sesiones.length - 1 - i; };

// la cadena de TSLA, que el Missile necesita para todo
const chHoy = await cadena(DIA);
const spotTSLA = chHoy ? spotDeCadena(chHoy, DIA) : null;
if (spotTSLA != null) E.spots[DIA] = spotTSLA;
console.log("  TSLA por paridad: " + (spotTSLA == null ? "sin dato (el Missile no evalúa hoy)" : "$" + spotTSLA.toFixed(2)));

// ══ 1. MARCAR Y CERRAR LO ABIERTO ═════════════════════════════════════════════════════════
let cerradasHoy = 0;
for (let i = E.abiertas.length - 1; i >= 0; i--) {
  const p = E.abiertas[i];
  if (p.estrategia === "palanca") {
    const cad = await calls(p.tk, DIA);
    const q = cad ? cad.find(o => o.exp === p.exp && Math.abs(o.K - p.K) < 1e-6) : null;
    if (!q) { console.log("    ⚠️ palanca " + p.tk + " " + p.exp + " " + p.K + ": sin cotización hoy, se arrastra"); continue; }
    p.ultBid = q.bid; p.mult = q.bid / p.ask0;
    const edad = nSes(p.dia), porSuelo = p.mult <= R.suelo, porPlazo = edad >= R.aguante;
    if (porSuelo || porPlazo) {
      const cobro = p.n * q.bid * 100;
      E.caja += cobro;
      E.operaciones.push({ ...p, estado: "cerrada", diaSalida: DIA, multSalida: p.mult, cobro,
        resultado: cobro - p.coste, motivo: porSuelo ? "suelo 0,50x" : "120 sesiones",
        sesionesVivo: edad, cerradaEn: new Date().toISOString(), origen: origen() });
      E.abiertas.splice(i, 1); cerradasHoy++;
      console.log("    ✂️ CIERRA palanca " + p.tk + " K" + p.K + " · " + p.mult.toFixed(2) + "x · " + D(cobro - p.coste));
    }
  } else {
    if (!chHoy || spotTSLA == null) { console.log("    ⚠️ missile " + p.exp + " " + p.K + p.l + ": sin cadena hoy, se deja abierta"); continue; }
    const q = chHoy[p.exp] && chHoy[p.exp][p.K + "|" + p.l];
    if (!q) { console.log("    ⚠️ missile " + p.exp + " " + p.K + p.l + ": hoy no cotiza, se deja abierta"); continue; }
    const bid = q[0], mult = bid / p.ask0, edad = nSes(p.dia);
    const mov = p.l === "P" ? (p.spot - spotTSLA) / p.spot : (spotTSLA - p.spot) / p.spot;
    const objMov = p.confirma ? MOV_CONFIRMA : MOV_NO;
    let motivo = null, mCierre = mult;
    if (mult >= OBJETIVO) { motivo = "objetivo 1,50x"; mCierre = OBJETIVO; }
    else if (mult <= SUELO) { motivo = "suelo 0,50x"; mCierre = SUELO; }
    else if (mov >= objMov) motivo = "la acción se movió " + (100 * mov).toFixed(1) + "% a favor";
    else if (edad >= TOPE_DIAS) motivo = "tope de " + TOPE_DIAS + " días";
    p.ultBid = bid; p.mult = mult;
    if (motivo) {
      const cobro = p.coste * mCierre;
      E.caja += cobro;
      E.operaciones.push({ ...p, estado: "cerrada", diaSalida: DIA, multSalida: mCierre, cobro,
        resultado: cobro - p.coste, motivo, sesionesVivo: edad,
        cerradaEn: new Date().toISOString(), origen: origen() });
      E.abiertas.splice(i, 1); cerradasHoy++;
      console.log("    ✂️ CIERRA missile " + p.exp + " " + p.K + p.l + " · " + mCierre.toFixed(2) + "x · " + D(cobro - p.coste) + " (" + motivo + ")");
    }
  }
}

// ══ 2. PATRIMONIO ═════════════════════════════════════════════════════════════════════════
const libro = () => E.abiertas.reduce((a, p) => a + (p.estrategia === "palanca"
  ? p.n * (p.ultBid ?? p.ask0) * 100
  : p.coste * (p.mult ?? 1)), 0);
const patr = () => E.caja + E.spyAcc * SPYP + libro();
const P0 = patr();
console.log("  patrimonio $" + Math.round(P0).toLocaleString("en-US") +
  "   (caja $" + Math.round(E.caja).toLocaleString("en-US") +
  " · SPY $" + Math.round(E.spyAcc * SPYP).toLocaleString("en-US") +
  " · opciones $" + Math.round(libro()).toLocaleString("en-US") + ")");

// Vender SPY para financiar una entrada, igual que el motor del backtest. Sin esto, como TODO
// el ocioso va a SPY, la caja es cero al día siguiente y el cuaderno no abriría nunca nada.
const financiar = (necesito) => {
  const falta = necesito - E.caja;
  if (falta > 0 && E.spyAcc > 0) {
    const v = Math.min(E.spyAcc, falta / SPYP);
    E.spyAcc -= v; E.caja += v * SPYP;
  }
};

// ══ 3. EL MISSILE PRIMERO ═════════════════════════════════════════════════════════════════
let abiertasHoy = 0;
const vivasMissile = E.abiertas.filter(p => p.estrategia === "missile").length;
let notaMissile = "";
if (!chHoy || spotTSLA == null) notaMissile = "sin cadena de TSLA hoy";
else if (vivasMissile >= HUECOS) notaMissile = "los " + HUECOS + " huecos del Missile están llenos";
else {
  let previos = Object.keys(E.spots).filter(d => d < DIA).sort().slice(-MA_DIAS);
  if (previos.length < MA_MIN) {
    console.log("  sembrando la serie de precios de TSLA…");
    const n = await sembrarSpots(E, DIA);
    console.log("    " + n + " días añadidos");
    previos = Object.keys(E.spots).filter(d => d < DIA).sort().slice(-MA_DIAS);
  }
  if (previos.length < MA_MIN) notaMissile = "faltan días de precio para la media de 20";
  else {
    const ma = previos.reduce((s, d) => s + E.spots[d], 0) / previos.length;
    if (spotTSLA >= ma) notaMissile = "TSLA NO está bajo su media de 20 ($" + ma.toFixed(2) + ")";
    else {
      const AYER = await diaAnterior(DIA);
      const ANTEAYER = AYER ? await diaAnterior(AYER) : null;
      if (!AYER || !ANTEAYER) throw new Error("no se pudo determinar el día anterior — NO se opera a ciegas");
      const cinta = await golpesDe(AYER);
      const oi = await oiDe(ANTEAYER);
      if (!oi.size) throw new Error("sin interés abierto de " + iso(ANTEAYER) + " — el filtro 12x no se puede evaluar");
      // La dominancia se calcula SÓLO sobre operaciones de $500.000 o más, como el backtest.
      // Calcularla sobre la cinta entera da otro número, y eso cambia el TAMAÑO y la SALIDA.
      let al = 0, ba = 0, nDom = 0;
      for (const o of cinta) {
        if (o.prima < GOLPE_MIN) continue;
        const c = o.precio >= o.ask, v = o.precio <= o.bid;
        if (!(o.bid > 0 && o.ask > 0) || (!c && !v)) continue;
        nDom++;
        if ((o.l === "C" && c) || (o.l === "P" && v)) al += o.prima; else ba += o.prima;
      }
      const dom = nDom >= 5 ? (al - ba) / (al + ba) : null;
      const porContrato = new Map();
      for (const o of cinta) {
        if (o.precio < o.ask || o.prima < GOLPE_MIN || o.hora < HORA_MIN) continue;
        if (dteDe(AYER, o.exp) < DTE_MIN) continue;
        const k = o.exp + "|" + o.K + "|" + o.l, y = porContrato.get(k);
        if (y) { y.prima += o.prima; y.tam += o.tam; y.golpes++; }
        else porContrato.set(k, { exp: o.exp, K: o.K, l: o.l, prima: o.prima, tam: o.tam, golpes: 1 });
      }
      const cand = [];
      for (const c of porContrato.values()) {
        const oiV = oi.get(c.exp + "|" + c.K + "|" + c.l) || 0;
        if (!(oiV > 0)) continue;
        const vsOI = c.tam / oiV;
        if (!(vsOI >= VS_OI_MIN)) continue;
        if (!(c.l === "C" ? c.K < spotTSLA : c.K > spotTSLA)) continue;
        if (dteDe(DIA, c.exp) < DTE_MIN) continue;
        const q = chHoy[c.exp] && chHoy[c.exp][c.K + "|" + c.l];
        if (!q || !(q[1] > 0) || q[1] * 100 < COSTE_MIN) continue;
        cand.push({ ...c, oiV, vsOI, ask: q[1], bid: q[0], prof: Math.abs(c.K - spotTSLA) / spotTSLA });
      }
      console.log("  Missile: cinta de " + iso(AYER) + " · " + cinta.length + " operaciones · " + cand.length + " candidatas");
      if (!cand.length) notaMissile = "ningún contrato pasa los filtros";
      else {
        cand.sort((a, b) => (Number(b.exp) - Number(a.exp)) || (a.prof - b.prof));
        const c = cand[0];
        const acorde = dom == null ? 0 : (c.l === "P" ? -1 : 1) * dom;
        const confirma = acorde >= DOM_MIN || (c.golpes >= GOLPES_MIN && c.golpes <= GOLPES_MAX);
        const tope = P0 * TAM * (confirma ? 2 : 1);
        financiar(Math.min(tope, P0));
        const n = Math.floor(Math.min(tope, E.caja) / (c.ask * 100));
        if (n < 1) {
          notaMissile = "la señal EXISTE pero no cabe: el contrato cuesta " + D(c.ask * 100) + " y hay " + D(Math.min(tope, E.caja));
          E.estorbos.push({ dia: DIA, quien: "missile", motivo: notaMissile, tope: Math.round(tope), caja: Math.round(E.caja) });
          console.log("    ⛔ ESTORBO · " + notaMissile);
        } else {
          const coste = n * c.ask * 100;
          E.caja -= coste;
          const horq = c.bid > 0 ? 2 * (c.ask - c.bid) / (c.ask + c.bid) : null;
          E.abiertas.push({ estrategia: "missile", dia: DIA, diaGolpe: AYER, exp: c.exp, K: c.K, l: c.l,
            spot: spotTSLA, ask0: c.ask, bid0: c.bid, horquilla: horq, n, coste, mult: c.bid / c.ask,
            ultBid: c.bid, confirma, vsOI: Math.round(c.vsOI * 10) / 10, golpes: c.golpes,
            dte: dteDe(DIA, c.exp), estado: "abierta", abiertaEn: new Date().toISOString(), origen: origen() });
          abiertasHoy++;
          console.log("    🚀 ABRE missile " + c.exp + " " + c.K + c.l + " × " + n + " · " + D(coste) +
            " · " + c.vsOI.toFixed(1) + "x OI · " + (confirma ? "CONFIRMA" : "no confirma") +
            " · horquilla " + (horq == null ? "—" : (100 * horq).toFixed(2) + "%"));
        }
      }
    }
  }
}
if (notaMissile) console.log("  Missile: sin entrada — " + notaMissile);

// ══ 4. LA PALANCA, CON LO QUE QUEDE ═══════════════════════════════════════════════════════
const vivasPalanca = () => E.abiertas.filter(p => p.estrategia === "palanca");
const abiertosTk = new Set(vivasPalanca().map(p => p.tk));
const seniales = [];
for (const tk of TK) {
  const C = await cierres(tk, desde, DIA);
  if (!C || C.length < R.mediaN + 1) continue;
  const ult = C[C.length - 1];
  if (ult[0] !== DIA) continue;
  const prev = C.slice(-(R.mediaN + 1), -1).map(x => x[1]);
  if (prev.length < R.mediaN) continue;
  const media = prev.reduce((a, b) => a + b, 0) / prev.length;
  const maT = ult[1] / media - 1;
  if (maT < R.umbral && maT >= R.roto) seniales.push({ tk, ma: maT, spot: ult[1] });
}
seniales.sort((a, b) => a.ma - b.ma || a.tk.localeCompare(b.tk));
console.log("  Palanca: " + seniales.length + " señales" + (seniales.length ? "  →  " +
  seniales.slice(0, 8).map(s => s.tk + " " + (100 * s.ma).toFixed(1) + "%").join("  ") : ""));

for (const s of seniales) {
  if (vivasPalanca().length >= HUECOS_P) break;
  if (abiertosTk.has(s.tk)) continue;
  const cad = await calls(s.tk, DIA);
  if (!cad) { console.log("    ⚠️ " + s.tk + ": sin cadena, no se opera"); continue; }
  const c = elegir(cad, s.spot, DIA);
  if (!c) { console.log("    · " + s.tk + ": ningún contrato dentro de las tolerancias"); continue; }
  const tope = P0 * TAM_P, coste1 = c.ask * 100;
  financiar(Math.min(tope, P0));
  const n = Math.floor(Math.min(tope, E.caja) / coste1);
  if (n < 1) {
    const m = "no llega para un contrato entero (" + D(coste1) + " contra " + D(Math.min(tope, E.caja)) + ")";
    E.estorbos.push({ dia: DIA, quien: "palanca", ticker: s.tk, motivo: m, tope: Math.round(tope), caja: Math.round(E.caja) });
    console.log("    ⛔ ESTORBO · " + s.tk + ": " + m);
    continue;
  }
  const coste = n * coste1;
  E.caja -= coste;
  const horq = 2 * (c.ask - c.bid) / (c.ask + c.bid);   // ← se APUNTA, no se filtra
  E.abiertas.push({ estrategia: "palanca", tk: s.tk, dia: DIA, exp: c.exp, K: c.K, n, ask0: c.ask, bid0: c.bid,
    horquilla: horq, coste, spot: s.spot, ma: s.ma, prof: c.prof, dte: c.dte, ultBid: c.bid,
    mult: c.bid / c.ask, estado: "abierta", abiertaEn: new Date().toISOString(), origen: origen() });
  abiertosTk.add(s.tk); abiertasHoy++;
  console.log("    ✅ ABRE palanca " + s.tk + " " + c.exp + " K" + c.K + " × " + n + " · " + D(coste) +
    " · " + (100 * c.prof).toFixed(1) + "% dentro · " + c.dte + "d · horquilla " + (100 * horq).toFixed(2) + "%");
}

// ══ 5. EL OCIOSO A SPY ════════════════════════════════════════════════════════════════════
if (E.caja > SPYP) {
  const compra = Math.floor(E.caja / SPYP);
  E.spyAcc += compra; E.caja -= compra * SPYP;
  if (compra) console.log("    💤 el ocioso a SPY: " + compra + " participaciones");
}

// ══ 6. GUARDAR Y REPORTAR ═════════════════════════════════════════════════════════════════
// El día se apunta SIEMPRE, haya señal o no. Si sólo se apuntaran las entradas, «hoy no
// cumplía» y «llevo nueve días muerto» se verían exactamente igual — que es lo que le pasó a
// la mariposa durante nueve días sin que nadie se enterara.
if (!abiertasHoy) E.sinSenal.push({ dia: DIA, missile: notaMissile || "sin señal", palancaSenales: seniales.length });
E.ultimoDia = DIA;
const cer = E.operaciones, gan = cer.filter(o => o.resultado > 0);
const porE = (n) => cer.filter(o => o.estrategia === n);
const suma = (a) => a.reduce((x, o) => x + o.resultado, 0);
const patrFin = patr();
const reporte =
  "COMBINADO · La Palanca + TSLA's Missile · " + iso(DIA) + "\n" +
  "patrimonio $" + Math.round(patrFin).toLocaleString("en-US") + "  (partió de $" + CAPITAL.toLocaleString("en-US") + ")\n" +
  "abiertas " + E.abiertas.length + " (palanca " + vivasPalanca().length + "/" + HUECOS_P +
  " · missile " + E.abiertas.filter(p => p.estrategia === "missile").length + "/" + HUECOS + ")\n" +
  "cerradas " + cer.length + (cer.length ? " · acierta " + Math.round(100 * gan.length / cer.length) + "%" +
    " · palanca " + D(suma(porE("palanca"))) + " · missile " + D(suma(porE("missile"))) : "") + "\n" +
  "estorbos acumulados: " + E.estorbos.length + "\n" +
  "hoy: " + abiertasHoy + " abiertas, " + cerradasHoy + " cerradas, " + seniales.length + " señales de palanca";
await guardar(E, reporte, iso(DIA) + ": " + abiertasHoy + " abiertas, " + cerradasHoy + " cerradas, " +
  E.abiertas.length + " vivas, " + E.estorbos.length + " estorbos");
console.log("\n  " + reporte.split("\n").join("\n  ") + "\n");
await cerrar();
