// ╔══════════════════════════════════════════════════════════════════════════════════════════╗
// ║  LA PALANCA — forward-test EN PAPEL                                                       ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════╝
//
// NO ejecuta órdenes. Registra en papel lo que la regla habría hecho, día a día.
//
// ╔═══ PRE-REGISTRO · 2026-08-30 · NO TOCAR NADA DE ESTE BLOQUE ═══╗
//   UNIVERSO     las 60 grandes capitalizaciones de los grupos A y B. NO los 27 de tecnología:
//                ganan a SPY en 2016-2021 y PIERDEN en 2021-2026 en las siete configuraciones.
//   LA SEÑAL     la acción cierra más de un 7% por debajo de su media de 50 sesiones.
//                Se descarta por debajo de −30%: eso es un split, no una caída.
//   EL CONTRATO  CALL 10% dentro del dinero (tolerancia 5,5%-14,5%) · ~400 días naturales
//                (tolerancia 180-620) · bid>0 y ask>0. Si ninguna cumple, no se opera ese día
//                ese ticker. NO se coge «la más parecida».
//   CUÁL PRIMERO si hay más señales que huecos: la MÁS hundida. Empate → alfabético.
//   COMPRA       al ASK del cierre. Una posición por ticker.
//   TAMAÑO       2,4% del patrimonio por hueco · 10 huecos · contratos enteros.
//                Si no llega para uno entero, no se opera.
//   SALIDA       lo que ocurra PRIMERO: 120 sesiones desde la compra, o que la opción caiga
//                a 0,50x lo pagado. Sin tope de ganancia. Se vende al BID.
//   EL OCIOSO    en SPY.
// ╚════════════════════════════════════════════════════════════════════════════════════════╝
//
// ╔═══ POR QUÉ EXISTE ═══╗
// Aprobó el examen fuera de muestra el 2026-08-30: afinada en 24 empresas dio 17,6% al año y
// en 36 que nunca había visto dio 17,6%, con criterios escritos ANTES de mirar los datos.
// En el histórico completo: $36.702/año contra los $19.039 de comprar SPY, Sharpe 0,73 contra
// 0,70, caída −47% contra −34%, 281 operaciones, acierta el 46%.
// Todo eso es BACKTEST. Este cuaderno es la única prueba hacia adelante.
//
// ╔═══ LA HORQUILLA VA PEGADA A CADA SEÑAL ═══╗
// Lester, 2026-08-30. Con horquilla menor del 3% la regla da Sharpe 0,80-0,82 y caída −36% en
// los DOS universos — lo único medido que bate a SPY en riesgo ajustado con la caída del índice.
// Pero son 65-80 operaciones (~6 al año) y no decide nada todavía.
// Por eso NO se filtra al escribir: se APUNTA la horquilla real de cada entrada y dentro de un
// año se lee el mismo cuaderno de las dos maneras. Así no se pierde ninguna señal y el umbral
// se puede decidir con datos.
import Redis from "ioredis";
import {
  B, CLAVE, STORE, R, TK, iso, ms, dias, hoyYMD, csv, cierres, calls, elegir,
} from "./palanca-lib.mjs";


// ── almacén ───────────────────────────────────────────────────────────────────────────────
let _r=null;
async function redis(){ if(_r) return _r;
  if(!process.env.REDIS_URL) throw new Error("PALANCA_STORE=redis pero falta REDIS_URL");
  _r=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:3}); return _r; }
const origen=()=>process.env.RAILWAY_SERVICE_NAME?("railway:"+process.env.RAILWAY_SERVICE_NAME):"local";
async function leer(){
  if(STORE!=="redis"){ const {readFileSync}=await import("node:fs");
    try{ return JSON.parse(readFileSync("data/forward/la-palanca.json","utf8")); }catch{ return null; } }
  const c=await (await redis()).get(CLAVE); return c?JSON.parse(c):null; }
async function guardar(E, reporte, resumen){
  const s=JSON.stringify(E);
  if(STORE!=="redis"){ const {writeFileSync,mkdirSync}=await import("node:fs");
    mkdirSync("data/forward",{recursive:true}); writeFileSync("data/forward/la-palanca.json",s); return; }
  const r=await redis();
  await r.set(CLAVE,s);
  if(reporte) await r.set(CLAVE+":report",reporte);
  // ⚠️ La firma es (redis, servicio, resultado). Llamarla con un argumento daba
  //    "redis.set is not a function" y el latido no se escribía: el vigilante habría visto
  //    este servicio como MUERTO aunque corriera bien.
  await latir(resumen || "corrida");
}
// ⚠️ EL LATIDO, EN TODAS LAS SALIDAS Y SIN TRAGARSE EL ERROR.
// Faltaba `latido:la-palanca` en Redis mientras los otros NUEVE cuadernos dejaban el suyo, y
// eran dos fallos juntos:
//   1. las salidas tempranas ("ya se procesó este día", "sin cierres de SPY") terminaban ANTES
//      de llamar a guardar(), o sea que el servicio parecía muerto justo los días en que hacía
//      lo correcto. Sin latido, «corrió y no encontró nada» y «lleva días muerto» se ven IGUAL.
//   2. el catch estaba VACÍO, así que si fallaba tampoco se enteraba nadie.
async function latir(resultado) {
  if (STORE !== "redis") return;
  try { const {escribirLatido} = await import("../lib/origenEjecucion.ts");
        await escribirLatido(await redis(), "la-palanca", resultado); }
  catch(e) { console.error("  ⛔ NO SE PUDO ESCRIBIR EL LATIDO: " + (e?.message ?? e));
             process.exitCode = 3; }
}
// ⚠️ Y HAY QUE CERRAR REDIS. Sin esto el proceso no termina NUNCA: ioredis deja el socket
//    abierto y en Railway, con restartPolicyType NEVER, el cron se quedaría colgado para
//    siempre en vez de acabar. Cazado el 2026-08-30: la corrida salió con código 4 por esto.
async function cerrar(){ if(_r){ try{ await _r.quit(); }catch{} _r=null; } }

// ══ EL DÍA ═══════════════════════════════════════════════════════════════════════════════
const HOY = process.env.PALANCA_DIA || hoyYMD();
const desde = (()=>{const d=new Date(ms(HOY)-140*86400000); return d.toISOString().slice(0,10).replace(/-/g,"");})();

console.log("\n  ╔═══ LA PALANCA · forward-test ═══╗   día " + iso(HOY) +
  "   ·   origen " + origen() + "   ·   store " + STORE + "\n");

// el calendario de sesiones sale de SPY: es la referencia de "días de mercado"
const spyC = await cierres("SPY", desde, HOY);
if (!spyC) { console.log("  ⛔ sin cierres de SPY — no hay datos hoy. No se escribe nada.");
  await latir("sin cierres de SPY: no había datos"); await cerrar(); process.exit(0); }
const SES = spyC.map(x=>x[0]);
const DIA = SES[SES.length-1];                    // la última sesión REAL con datos
const SPYP = spyC[spyC.length-1][1];
console.log("  última sesión con datos: " + iso(DIA) + "   ·   SPY $" + SPYP.toFixed(2));

let E = await leer();
if (!E) {                                          // primera corrida: se siembra
  E = { creado:new Date().toISOString(), regla:R, capital:R.capital,
        caja:R.capital, spyAcc:0, abiertas:[], operaciones:[], ultimoDia:null, sesiones:[] };
  console.log("  cuaderno NUEVO: se siembra con $" + R.capital.toLocaleString("en-US")); }
if (E.ultimoDia === DIA) { console.log("  ya se procesó " + iso(DIA) + " — no se repite. Salgo.");
  await latir(iso(DIA) + " ya estaba procesado — nada que hacer hoy"); await cerrar(); process.exit(0); }
if (!E.sesiones.includes(DIA)) E.sesiones.push(DIA);
E.sesiones.sort();
const nSes = (d)=>{ const i=E.sesiones.indexOf(d); return i<0?0:E.sesiones.length-1-i; };

// ── 1. marcar y cerrar lo abierto ─────────────────────────────────────────────────────────
let cerradas = 0;
for (let i = E.abiertas.length-1; i >= 0; i--) {
  const p = E.abiertas[i];
  const cad = await calls(p.tk, DIA);
  const q = cad ? cad.find(o=>o.exp===p.exp && Math.abs(o.K-p.K)<1e-6) : null;
  if (!q) { console.log("    ⚠️ " + p.tk + " " + p.exp + " " + p.K + ": sin cotización hoy, se arrastra la última"); continue; }
  p.ultBid = q.bid; p.ultAsk = q.ask; p.mult = q.bid / p.ask0;
  const edad = nSes(p.dia);
  const porSuelo = p.mult <= R.suelo, porPlazo = edad >= R.aguante;
  if (porSuelo || porPlazo) {
    const cobro = p.n * q.bid * 100;
    E.caja += cobro;
    E.operaciones.push({ ...p, estado: "cerrada", diaSalida: DIA, bidSalida: q.bid, multSalida: p.mult,
      cobro, resultado: cobro - p.coste, motivo: porSuelo ? "suelo 0,50x" : "120 sesiones",
      sesionesVivo: edad, cerradaEn: new Date().toISOString(), origen: origen() });
    E.abiertas.splice(i,1); cerradas++;
    console.log("    ✂️ CIERRA " + p.tk + " " + p.exp + " K" + p.K + " · " + p.mult.toFixed(2) +
      "x · " + (cobro-p.coste>=0?"+$":"−$") + Math.abs(Math.round(cobro-p.coste)).toLocaleString("en-US") +
      " · " + (porSuelo?"suelo":"plazo")); } }

// ── 2. patrimonio ─────────────────────────────────────────────────────────────────────────
const libro = E.abiertas.reduce((a,p)=>a + p.n*(p.ultBid??p.ask0)*100, 0);
if (E.spyAcc > 0) { /* el SPY se valora abajo */ }
const patr = E.caja + E.spyAcc*SPYP + libro;
console.log("  patrimonio $" + Math.round(patr).toLocaleString("en-US") +
  "   (caja $" + Math.round(E.caja).toLocaleString("en-US") +
  " · SPY $" + Math.round(E.spyAcc*SPYP).toLocaleString("en-US") +
  " · opciones $" + Math.round(libro).toLocaleString("en-US") + ")");

// ── 3. buscar señales ─────────────────────────────────────────────────────────────────────
const abiertosTk = new Set(E.abiertas.map(p=>p.tk));
const seniales = [];
for (const tk of TK) {
  const C = await cierres(tk, desde, DIA);
  if (!C || C.length < R.mediaN+1) continue;
  const últ = C[C.length-1];
  if (últ[0] !== DIA) continue;                    // sin cierre de hoy, no se juzga
  const prev = C.slice(-(R.mediaN+1), -1).map(x=>x[1]);
  if (prev.length < R.mediaN) continue;
  const media = prev.reduce((a,b)=>a+b,0)/prev.length;
  const ma = últ[1]/media - 1;
  if (ma < R.umbral && ma >= R.roto) seniales.push({ tk, ma, spot: últ[1] }); }
seniales.sort((a,b)=> a.ma - b.ma || a.tk.localeCompare(b.tk));
console.log("  señales hoy: " + seniales.length + (seniales.length?"  →  "+
  seniales.slice(0,8).map(s=>s.tk+" "+(100*s.ma).toFixed(1)+"%").join("  "):""));

// ── 4. abrir ──────────────────────────────────────────────────────────────────────────────
let abiertasHoy = 0;
for (const s of seniales) {
  if (E.abiertas.length >= R.huecos) break;
  if (abiertosTk.has(s.tk)) continue;
  const cad = await calls(s.tk, DIA);
  if (!cad) { console.log("    ⚠️ " + s.tk + ": sin cadena, no se opera"); continue; }
  const c = elegir(cad, s.spot, DIA);
  if (!c) { console.log("    · " + s.tk + ": ningún contrato dentro de las tolerancias, no se opera"); continue; }
  const tope = patr * R.tam;
  const coste1 = c.ask * 100;
  // ⚠️ SE VENDE SPY PARA FINANCIAR, igual que el motor del backtest (línea 116 de
  //    motor-cartera.mjs). Sin esto, como todo el ocioso va a SPY, la caja es cero al día
  //    siguiente y el cuaderno no abriría NUNCA una posición. Fallo cazado en la primera prueba.
  const falta = Math.min(tope, patr) - E.caja;
  if (falta > 0 && E.spyAcc > 0) {
    const vender = Math.min(E.spyAcc, falta / SPYP);
    E.spyAcc -= vender; E.caja += vender * SPYP; }
  const n = Math.floor(Math.min(tope, E.caja) / coste1);
  if (n < 1) { console.log("    · " + s.tk + ": no llega para un contrato entero ($" +
    Math.round(coste1).toLocaleString("en-US") + " contra $" + Math.round(Math.min(tope,E.caja)).toLocaleString("en-US") + ")"); continue; }
  const coste = n * coste1;
  E.caja -= coste;
  const horq = 2*(c.ask-c.bid)/(c.ask+c.bid);      // ← se APUNTA, no se filtra
  E.abiertas.push({ tk:s.tk, dia:DIA, exp:c.exp, K:c.K, n, ask0:c.ask, bid0:c.bid,
    horquilla:horq, coste, spot:s.spot, ma:s.ma, prof:c.prof, dte:c.dte,
    ultBid:c.bid, ultAsk:c.ask, mult:c.bid/c.ask, estado:"abierta",
    abiertaEn:new Date().toISOString(), origen:origen() });
  abiertosTk.add(s.tk); abiertasHoy++;
  console.log("    ✅ ABRE " + s.tk + " " + c.exp + " K" + c.K + " × " + n +
    " · $" + Math.round(coste).toLocaleString("en-US") + " · " + (100*c.prof).toFixed(1) + "% dentro · " +
    c.dte + "d · horquilla " + (100*horq).toFixed(2) + "%"); }

// ── 5. el ocioso, a SPY ───────────────────────────────────────────────────────────────────
if (E.caja > SPYP) { const compra = Math.floor(E.caja / SPYP);
  E.spyAcc += compra; E.caja -= compra*SPYP;
  if (compra) console.log("    💤 el ocioso a SPY: " + compra + " participaciones"); }

// ── 6. guardar y reportar ─────────────────────────────────────────────────────────────────
E.ultimoDia = DIA;
const cerr = E.operaciones, gan = cerr.filter(o=>o.resultado>0);
const patrFin = E.caja + E.spyAcc*SPYP + E.abiertas.reduce((a,p)=>a+p.n*(p.ultBid??p.ask0)*100,0);
const reporte =
  "LA PALANCA · forward-test · " + iso(DIA) + "\n" +
  "patrimonio $" + Math.round(patrFin).toLocaleString("en-US") +
  "  (partió de $" + R.capital.toLocaleString("en-US") + ")\n" +
  "abiertas " + E.abiertas.length + "/" + R.huecos + " · cerradas " + cerr.length +
  (cerr.length ? " · acierta " + Math.round(100*gan.length/cerr.length) + "%" +
    " · suma " + (cerr.reduce((a,o)=>a+o.resultado,0)>=0?"+$":"−$") +
    Math.abs(Math.round(cerr.reduce((a,o)=>a+o.resultado,0))).toLocaleString("en-US") : "") + "\n" +
  "hoy: " + abiertasHoy + " abiertas, " + cerradas + " cerradas, " + seniales.length + " señales";
await guardar(E, reporte, iso(DIA) + ": " + abiertasHoy + " abiertas, " + cerradas +
  " cerradas, " + seniales.length + " señales, " + E.abiertas.length + "/" + R.huecos + " vivas");
console.log("");
console.log("  " + reporte.split("\n").join("\n  "));
console.log("");
