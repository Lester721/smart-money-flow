// COSTE-REAL · paso 1 — reconstruir los 1.123 días desde las cadenas (NO desde regimen-filas.json,
// que sólo cubre 653). Deja en disco una foto por día: camino de 5 min, patas reales del cóndor
// a las 11:00 (bid de lo vendido, ask de lo comprado) y liquidación contra el spot real de cierre.
//
// Nada de lo que se guarda con prefijo `z` es observable a las 11:00. Los demás campos SÍ lo son.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00";
const DIST = 25;      // distancia de las patas vendidas al spot, en puntos
const ALA  = 50;      // ancho de las alas, en puntos

/** Lee un fichero de un lado (C o P): filas a las 11:00 + camino de 5 min + cierre real. */
function leerLado(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const txt = readFileSync(f, "utf8");
  const lin = txt.split("\n");
  if (lin.length < 3) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
        iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price"), iIV = cab.indexOf("implied_vol");
  // un campo que no existe se lee como 0 — aquí se para
  for (const [n, i] of [["strike",iK],["timestamp",iT],["bid",iB],["ask",iA],["underlying_price",iU],["implied_vol",iIV]])
    if (i < 0) throw new Error(`${f}: falta la columna "${n}"`);

  const enHora = [];
  const camino = new Map();   // hora -> spot
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j];
    if (L.length < 20) continue;
    const c = L.split(",");
    const hora = c[iT].slice(11, 16);
    const sp = +c[iU];
    if (sp > 0 && !camino.has(hora)) camino.set(hora, sp);
    if (hora !== HORA) continue;
    const K = +c[iK], bid = +c[iB], ask = +c[iA], iv = +c[iIV];
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, iv, sp });
  }
  if (!enHora.length || !camino.size) return null;
  return { enHora, camino };
}

const cerca = (fs, obj) => fs.reduce((a, b) => (Math.abs(b.K - obj) < Math.abs(a.K - obj) ? b : a));

const fechas = [...new Set(readdirSync(DIR)
  .map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
console.log(`ficheros de CALL encontrados: ${fechas.length}`);

const out = [];
const descartes = { sinFichero: 0, sinHora11: 0, sinSpot11: 0, sinCierre: 0, sinStrikes: 0, credNeg: 0 };
let hecho = 0;

for (const fecha of fechas) {
  const C = leerLado(fecha, "C"), P = leerLado(fecha, "P");
  if (!C || !P) { descartes.sinFichero++; continue; }

  // spot a las 11:00: el de las propias filas de esa hora (mediana, por si alguna viene a 0)
  const sps = C.enHora.map((x) => x.sp).filter((x) => x > 0).sort((a, b) => a - b);
  const spot = sps.length ? sps[sps.length >> 1] : 0;
  if (!(spot > 0)) { descartes.sinSpot11++; continue; }

  // camino de la mañana + cierre real
  const horas = [...C.camino.keys()].sort();
  const cierre = C.camino.get(horas[horas.length - 1]);
  if (!(cierre > 0)) { descartes.sinCierre++; continue; }

  const cCorto = cerca(C.enHora, spot + DIST), pCorto = cerca(P.enHora, spot - DIST);
  if (!(cCorto.K > spot && pCorto.K < spot)) { descartes.sinStrikes++; continue; }

  // las patas vendidas son SIEMPRE las mismas (±25); lo único que cambia es el ANCHO DEL ALA,
  // que es la única palanca sobre el riesgo por contrato — y por tanto sobre el tamaño que cabe.
  const S = cierre, comis = 4 * 0.03;
  const porAncho = {};
  for (const A of [10, 20, 30, 50]) {
    const cL = cerca(C.enHora, cCorto.K + A), pL = cerca(P.enHora, pCorto.K - A);
    if (!(cL.K > cCorto.K && pL.K < pCorto.K)) continue;
    const cr = cCorto.bid + pCorto.bid - cL.ask - pL.ask;
    if (!(cr > 0)) continue;
    const aC = cL.K - cCorto.K, aP = pCorto.K - pL.K;
    const pC = Math.min(Math.max(S - cCorto.K, 0), aC), pP = Math.min(Math.max(pCorto.K - S, 0), aP);
    porAncho[A] = { credito: cr, anchoC: aC, anchoP: aP, kLarC: cL.K, kLarP: pL.K,
                    pl: (cr - pC - pP) * 100 - comis,
                    riesgo: Math.max(aC, aP) * 100 - cr * 100 };
  }
  if (!porAncho[50]) { descartes.credNeg++; continue; }
  const cLargo = { K: porAncho[50].kLarC }, pLargo = { K: porAncho[50].kLarP };
  const credito = porAncho[50].credito, anchoC = porAncho[50].anchoC, anchoP = porAncho[50].anchoP;
  const pl = porAncho[50].pl;

  // IV del dinero a las 11:00 (viene DENTRO de la cadena — no hace falta VIX).
  // OJO: la columna implied_vol de Theta usa reloj de CALENDARIO (horas/24/365), no de sesiones;
  // sale 2,31x la convención de 252 días. Comprobado contra el straddle en 11 días: ratio 2,31 clavado.
  const aC = cerca(C.enHora, spot), aP = cerca(P.enHora, spot);
  const ivAtm = (aC.iv > 0 && aP.iv > 0) ? ((aC.iv + aP.iv) / 2) * 100 : null;
  // σ DE MERCADO en puntos, sin convención ninguna: el straddle del dinero ≈ 0,7979 × σ restante.
  const straddle = (aC.bid + aC.ask) / 2 + (aP.bid + aP.ask) / 2;
  const sigmaPts = straddle / 0.7979;

  // camino de la mañana hasta las 11:00 (observable a las 11:00)
  const hM = horas.filter((h) => h <= HORA);
  const sM = hM.map((h) => C.camino.get(h));
  const ap = sM[0], maxM = Math.max(...sM), minM = Math.min(...sM);
  let recorrido = 0; const rets = [];
  for (let j = 1; j < sM.length; j++) { recorrido += Math.abs(sM[j] - sM[j-1]); rets.push(Math.log(sM[j]/sM[j-1])); }
  const m = rets.length ? rets.reduce((a,b)=>a+b,0)/rets.length : 0;
  const rv = rets.length > 1 ? Math.sqrt(rets.reduce((a,x)=>a+(x-m)**2,0)/(rets.length-1)) * Math.sqrt(78*252) * 100 : null;

  // el camino de la TARDE, sólo para explicar (prefijo z, jamás para decidir)
  const hT = horas.filter((h) => h >= HORA);
  const sT = hT.map((h) => C.camino.get(h));
  const zMaxT = Math.max(...sT), zMinT = Math.min(...sT);

  out.push({
    fecha,
    ap, spot, cierre,
    maxM, minM,
    movManana: (spot / ap - 1) * 100,
    rangoMananaPts: maxM - minM,
    recorridoPts: recorrido,
    rvManana: rv,
    ivAtm, straddle, sigmaPts,
    sigmasCorto: sigmaPts > 0 ? 25 / sigmaPts : null,
    creditoEnSigma: sigmaPts > 0 ? credito / sigmaPts : null,
    // distancia de las patas en SIGMAS de lo que queda de sesión (observable: iv de la cadena)
    kCorC: cCorto.K, kCorP: pCorto.K, kLarC: cLargo.K, kLarP: pLargo.K,
    credito, anchoC, anchoP,
    pl, porAncho,
    riesgoMax: Math.max(anchoC, anchoP) * 100 - credito * 100,
    // desenlace
    zMovTarde: (cierre / spot - 1) * 100,
    zExcursionMax: zMaxT - spot,
    zExcursionMin: zMinT - spot,
    zRotoC: cierre > cCorto.K, zRotoP: cierre < pCorto.K,
  });
  if (++hecho % 100 === 0) console.log(`  ${hecho} días…`);
}

console.log(`\ndías construidos: ${out.length}  ·  descartes:`, descartes);
const porAno = {};
for (const d of out) porAno[d.fecha.slice(0,4)] = (porAno[d.fecha.slice(0,4)] ?? 0) + 1;
console.log("por año:", porAno);
writeFileSync("scripts/coste-real-base.json", JSON.stringify(out));
console.log("→ scripts/coste-real-base.json");
