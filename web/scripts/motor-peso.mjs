// ══ EL MOTOR DE CARTERA ══ extraído de r120 SIN TOCAR NADA, para que r120 y r121
// midan con el mismo código y no se separen por copiar y pegar.
// Marca a mercado cada día. Arrastra el último multiplicador conocido (coger el final
// sería mirar al futuro). El P&L del corto de SPY entra en caja el mismo día.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const { ops: OPS, spy: SPY } = JSON.parse(readFileSync(join(CACHE, process.env.CAMINOS || "caminos-120d.json"), "utf8"));
const DD = Object.keys(SPY).sort();
const ms = (d) => Date.parse(d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T00:00:00Z");
const ANOS = (ms(DD[DD.length - 1]) - ms(DD[0])) / (365.25 * 86400000);
const DIV_SPY = 0.013;
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const pct = (x, n = 1) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(n) + "%";
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };

const SECTOR = { AAPL:"tec", AMD:"tec", MSFT:"tec", NVDA:"tec", INTC:"tec", CSCO:"tec", ORCL:"tec",
  CRM:"tec", META:"tec", PYPL:"tec", QQQ:"idx", SPY:"idx", JPM:"fin", BAC:"fin", BA:"ind", GE:"ind",
  DIS:"con", COST:"con", WMT:"con", NKE:"con", KO:"con", F:"con", XOM:"ene", PFE:"sal", UNH:"sal",
  WBA:"sal", T:"tel" };

// cada camino, indexado por fecha, para poder marcar a mercado cualquier día
for (const o of OPS) { o.m = new Map(o.camino); o.dSal = o.camino[o.camino.length - 1][0]; }
const POR_DIA = new Map();
for (const o of OPS) { if (!POR_DIA.has(o.dC)) POR_DIA.set(o.dC, []); POR_DIA.get(o.dC).push(o); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// EL MOTOR. Idéntico a r109 en cómo elige y compra. Lo que cambia: las posiciones abiertas
// se valoran al PRECIO DE HOY, no a lo que costaron.
// ══════════════════════════════════════════════════════════════════════════════════════════
export function simular({ capital = 60000, tam = 0.15, huecos = 6, modo = "spy",
                   cubrir = false, volObj = 0, cadencia = 0, topeSector = 0, hasta = null, desdeD = null,
                   plazo = 0, frenoSPY = 0, reentrada = 0, castigo = 0,
                   suelo = 0, topeGanancia = 0, costeMin = 0, arrastre = 0, minArrastre = 0,
                   usarRec = false } = {}) {
  // `usarRec`: salir el día que la ACCIÓN recupera su media (índice precalculado en o.iRec).
  //   Es el mecanismo de la estrategia: compramos una caída, salimos cuando se acabó.
  // `arrastre`: STOP QUE SIGUE AL MÁXIMO. Se vende cuando el multiplicador cae esa
  //   fracción desde su propio máximo. Es la aproximación honesta a «vender en el máximo»,
  //   cuyo techo se midió en +0,510 de Sharpe (r158) — cinco veces el del régimen.
  // `minArrastre`: no activar el arrastre hasta que la posición haya subido a este nivel.
  // `suelo`  : vender si el multiplicador cae a ese valor (el camino guardado ya está
  //            cortado en 0,50x, así que SÓLO se puede subir, nunca bajar de 0,50)
  // `topeGanancia`: vender si sube hasta ese multiplicador.
  //   ⚠️ NO llamarlo `tope`: ya hay una variable local `tope` (el tamaño máximo de la
  //   posición en DÓLARES) que lo tapaba en silencio. El mando no hacía nada y el
  //   barrido salía «plano». Fallo del 2026-08-29.
  // `costeMin`: no comprar contratos por debajo de ese coste (el fichero ya filtra $5.000,
  //            así que SÓLO se puede subir)
  // `castigo` = fracción de la horquilla que te comen POR ENCIMA de la cotizada.
  //   entras pagando ask×(1+c/2) y sales cobrando bid×(1−c/2).
  //   Como el camino guardado es bid_i/ask_entrada, el multiplicador queda
  //   mult × (1−c/2)/(1+c/2), y el coste de entrada sube (1+c/2).
  const kC = 1 + castigo / 2, kM = (1 - castigo / 2) / (1 + castigo / 2);
  const intD = Math.pow(1.033, 1 / 252) - 1, divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const dias = DD.filter((d) => (!hasta || d <= hasta) && (!desdeD || d >= desdeD));
  let caja = capital, acc = 0, ab = [], tom = [];
  let cortoSPY = 0, betaHat = 0;
  const V = [], RB = [], RS = [], nuevas = [];
  // ATRIBUCIÓN: P&L diario de cada parte por separado. `v = caja + acc*p + libro`, así que
  // el SPY aporta acc_ayer × (precio de hoy con dividendo − precio de ayer), y las opciones
  // aportan `despues − antes` del marcado a mercado. Las compras/ventas de SPY para financiar
  // posiciones son TRASPASOS, no P&L, y por eso no entran aquí.
  const pnlS = [], pnlO = [];
  let pico = capital, peor = 0, sInv = 0;
  let picoSPY = 0, parado = false;   // freno: no abrir mientras SPY esté hundido

  for (let t = 0; t < dias.length; t++) {
    const hoy = dias[t], p = SPY[hoy];
    const accAnt = acc, pAnt = t > 0 ? SPY[dias[t - 1]] : p;
    // ── FRENO DE LESTER: si SPY cae más de X% desde su máximo, no se ABRE nada nuevo.
    //    Lo ya abierto sigue su curso (vender en el pánico es el error que ya medimos).
    //    Se reanuda cuando SPY recupera hasta `reentrada`% de su máximo (por defecto, el mismo).
    if (frenoSPY > 0) { if (p > picoSPY) picoSPY = p;
      const caidaSPY = 1 - p / picoSPY;
      if (!parado && caidaSPY >= frenoSPY) parado = true;
      else if (parado && caidaSPY <= (reentrada > 0 ? reentrada : frenoSPY)) parado = false; }
    if (modo === "spy") acc *= (1 + divD); else caja *= (1 + intD);
    if (cubrir && t > 0) caja += cortoSPY * (SPY[dias[t - 1]] - p);   // P&L del corto de SPY

    // ── 1. marcar a mercado. Si un día falta en el camino se ARRASTRA el último conocido:
    //       coger el multiplicador final sería mirar al futuro.
    const antes = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
    for (const o of ab) { const m = o.m.get(hoy); if (m != null) o.ultMult = m * kM; }
    const despues = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
    if (antes > 0) { RB.push(despues / antes - 1); RS.push(t > 0 ? p / SPY[dias[t - 1]] - 1 : 0); }
    pnlS.push(accAnt * ((modo === "spy" ? (1 + divD) : 1) * p - pAnt));
    pnlO.push(despues - antes);

    // ── 2. cerrar lo que sale hoy ──
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].ultMult; ab.splice(i, 1); }

    // ── 3. recolocar la cobertura los lunes, con beta de ventana MÓVIL ──
    if (cubrir) {
      if (t % 5 === 0 && RB.length >= 120) {
        const b = RB.slice(-120), s = RS.slice(-120);
        const mb = b.reduce((a, x) => a + x, 0) / b.length, msp = s.reduce((a, x) => a + x, 0) / s.length;
        let num = 0, den = 0;
        for (let i = 0; i < b.length; i++) { num += (b[i] - mb) * (s[i] - msp); den += (s[i] - msp) ** 2; }
        betaHat = den > 0 ? Math.max(0, num / den) : 0; }
      cortoSPY = betaHat * ab.reduce((a, o) => a + o.dinero * o.ultMult, 0) / p; }

    // ── 4. objetivo de volatilidad: encoger lo NUEVO cuando la cuenta va agitada ──
    let escala = 1;
    if (volObj > 0 && V.length >= 60) {
      const r = [];
      for (let i = V.length - 59; i < V.length; i++) r.push(V[i] / V[i - 1] - 1);
      const m = r.reduce((a, x) => a + x, 0) / r.length;
      const sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252);
      escala = Math.max(0.20, Math.min(1, volObj / Math.max(0.01, sd))); }

    // ── 5. abrir ──
    const corte = dias[Math.max(0, t - 21)];
    for (const x of (POR_DIA.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (parado) break;                // el freno del SPY está activo
      if (x.ma >= 0) continue;          // no elegible (r122 marca con 999)
      if (costeMin > 0 && x.coste < costeMin) continue;
      if (ab.some((o) => o.tk === x.tk)) continue;
      if (cadencia > 0 && nuevas.filter((f) => f > corte).length >= cadencia) break;
      if (topeSector > 0 && ab.filter((o) => SECTOR[o.tk] === SECTOR[x.tk]).length >= topeSector) continue;
      const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
      const patr = caja + acc * p + libro;
      // PESO POR OPERACION: permite dar mas dinero a unas señales que a otras sin excluir a
      // nadie. x.peso lo pone quien llama, antes de simular. Por defecto 1 = como siempre.
      const tope = patr * tam * escala * (x.peso ?? 1);
      if (modo === "spy") { const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; } }
      const costeR = x.coste * kC;
      const n = Math.floor(Math.min(tope, caja) / costeR);
      if (n < 1) continue;
      const dinero = n * costeR;
      caja -= dinero;
      // ── EL DIAL DEL AGUANTE: se recorta el camino guardado. El suelo del 0,50x ya está
      //    aplicado al construirlo, así que recortar da la salida correcta en los dos casos.
      let iFin = (plazo > 0 && plazo < x.camino.length) ? plazo - 1 : x.camino.length - 1;
      if (usarRec && x.iRec != null && x.iRec < iFin) iFin = x.iRec;
      // ⚠️ Aquí ponía `tope > 0` — la variable LOCAL de dólares (línea 107), que siempre es
      //    mayor que cero, así que el bucle corría siempre. Funcionaba por accidente.
      //    Segunda vez en un día con el mismo nombre tapado. Ahora usa los parámetros de verdad.
      if (suelo > 0 || topeGanancia > 0 || arrastre > 0) {
        let mx = 1, armado = !(minArrastre > 1);
        for (let j = 0; j <= iFin; j++) { const m = x.camino[j][1];
          if (m > mx) mx = m;
          if (minArrastre > 1 && mx >= minArrastre) armado = true;
          if ((suelo > 0 && m <= suelo) ||
              (topeGanancia > 0 && m >= topeGanancia) ||
              (arrastre > 0 && armado && m <= mx * (1 - arrastre))) { iFin = j; break; } } }
      const nS = x.camino[iFin][0];
      // El castigo de ejecución se paga AL ENTRAR: se compra a ask×(1+c/2) y la posición vale
      // ya sólo dinero×kM. Esa pérdida instantánea ocurre DESPUÉS del marcado del día, así que
      // no la recoge `despues − antes`. Sin esto la atribución dejaba $9.068 sin explicar.
      if (pnlO.length) pnlO[pnlO.length - 1] -= dinero * (1 - kM);
      ab.push({ ...x, dinero, ultMult: kM, dSal: nS });
      tom.push({ tk: x.tk, dC: x.dC, y: x.dC.slice(0, 4), dinero, mult: x.camino[x.camino.length - 1][1] });
      nuevas.push(hoy); }

    if (modo === "spy" && caja > 0) { acc += caja / p; caja = 0; }
    const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
    const v = caja + acc * p + libro;     // el corto ya está contado: su P&L entra en caja cada día
    V.push(v); sInv += libro / v;
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }

  const final = V[V.length - 1];
  const R = []; for (let i = 1; i < V.length; i++) R.push(V[i] / V[i - 1] - 1);
  const m = R.reduce((a, x) => a + x, 0) / R.length;
  const sd = Math.sqrt(R.reduce((a, x) => a + (x - m) ** 2, 0) / (R.length - 1));
  const anos = (ms(dias[dias.length-1]) - ms(dias[0])) / (365.25 * 86400000);
  return { final, cagr: 100 * (Math.pow(Math.max(final, 1) / capital, 1 / anos) - 1), caida: 100 * peor,
    sharpe: sd > 0 ? (m * 252 - 0.033) / (sd * Math.sqrt(252)) : 0, ops: tom.length, tom,
    invertido: 100 * sInv / V.length, V, R, RB, RS, betaHat, pnlS, pnlO, dias }; }

// mediana de 21 capitales de partida: un solo punto baila hasta 4 puntos
export function banda(cfg) {
  const A = [], C = [], S = [];
  for (let k = -10; k <= 10; k++) { const q = simular({ ...cfg, capital: 60000 * (1 + k * 0.0083) });
    A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); }
  return { a: med(A), c: med(C), s: med(S) }; }


export function spyApalancado(L) {
  const iD = Math.pow(1.05, 1/252) - 1, divD = Math.pow(1 + DIV_SPY, 1/252) - 1;
  let cap = 60000, exp = cap * L, deuda = exp - cap;
  const V = [cap]; let pico = cap, peor = 0;
  for (let t = 1; t < DD.length; t++) {
    const r = SPY[DD[t]] / SPY[DD[t-1]] - 1 + divD;
    exp *= (1 + r); deuda *= (1 + iD);
    cap = exp - deuda;
    if (cap <= 0) { for (let k = t; k < DD.length; k++) V.push(0); return { V, final: 0, cagr: -100, caida: 100, sharpe: -9 }; }
    if (t % 21 === 0) { exp = cap * L; deuda = exp - cap; }
    V.push(cap);
    if (cap > pico) pico = cap; const dd = 1 - cap / pico; if (dd > peor) peor = dd; }
  const R = []; for (let i = 1; i < V.length; i++) R.push(V[i] / V[i-1] - 1);
  const m = R.reduce((a,x)=>a+x,0)/R.length;
  const sd = Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1));
  return { V, final: cap, cagr: 100 * (Math.pow(cap/60000, 1/ANOS) - 1), caida: 100 * peor,
           sharpe: (m*252 - 0.033)/(sd*Math.sqrt(252)) }; }

export { OPS, SPY, DD, ANOS, D, pct, med, SECTOR };
