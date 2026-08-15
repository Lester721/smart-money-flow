// GEX INTRADÍA — cómo se movieron el precio y los muros a lo largo de la sesión.
//
// LA PREGUNTA QUE RESPONDE, y que la foto del momento no puede: ¿el precio RESPETÓ los muros o
// los cruzó? Saber que el muro está en 7790 no es lo mismo que ver si el precio rebotó tres veces
// ahí o lo atravesó sin despeinarse. Es la diferencia entre saber dónde está la pared y saber si
// aguanta.
//
// LO BARATO QUE ES, que fue la sorpresa: el endpoint de IV con `interval=5m` devuelve TODAS las
// marcas del día en una sola petición — la vista de la foto actual se quedaba sólo con la última
// y tiraba el resto. Así que la serie entera cuesta lo mismo que el instante: cuatro peticiones,
// no setenta y ocho. No hace falta grabar nada por adelantado ni esperar días a que se llene.
//
// Y por eso se puede pedir CUALQUIER día pasado — incluidos los del forward-test del cóndor, para
// ver qué hizo el precio contra los muros en las operaciones que ya están apuntadas.
//
// El open interest se sella a las 06:30 y no cambia en la sesión: se pide una vez y vale para
// todas las marcas. Lo que sí cambia cada 5 minutos es la IV y el precio, y de ahí que los muros
// se muevan durante el día.

const B = process.env.THETA_BASE || "http://127.0.0.1:25503/v3";
const SYM = "SPXW";

const phi = (x: number) => 0.3989423 * Math.exp((-x * x) / 2);
const d1f = (S: number, K: number, T: number, v: number) => (Math.log(S / K) + ((v * v) / 2) * T) / (v * Math.sqrt(T));
const gammaBS = (S: number, K: number, T: number, v: number) => phi(d1f(S, K, T, v)) / (S * v * Math.sqrt(T));

type Csv = { cab: string[]; filas: string[][] } | null;
async function csv(ruta: string): Promise<Csv> {
  try {
    const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(90_000), cache: "no-store" });
    const txt = await r.text();
    if (!r.ok || txt.length < 200 || txt.split("\n")[0].includes(" ")) return null;
    const lin = txt.trim().split("\n");
    return { cab: lin[0].split(","), filas: lin.slice(1).map((l) => l.split(",")) };
  } catch { return null; }
}

export interface PuntoIntradia {
  hora: string;          // HH:MM ET
  spx: number;
  gexNeto: number;       // millones de $ por movimiento del 1%
  gexCalls: number;
  gexPuts: number;
  muroCall: number | null;
  muroPut: number | null;
}

export interface SerieIntradia {
  dia: string;
  puntos: PuntoIntradia[];
  // Cuántas veces el precio CRUZÓ cada muro. Es el número que convierte el gráfico en una
  // conclusión: un muro que no se cruzó ni una vez aguantó; uno cruzado tres veces, no.
  crucesMuroCall: number;
  crucesMuroPut: number;
}

/**
 * Serie intradía del día `dia` (AAAA-MM-DD). Devuelve `null` si el Terminal no responde o el día
 * no tiene datos — nunca se rellena con un supuesto.
 *
 * `pasoMin` agrupa las marcas: 5 son todas (~78 puntos), 15 deja ~26. Menos puntos = gráfico más
 * legible y el mismo coste de red, porque la petición ya trae todo.
 */
export async function gexIntradia(dia: string, pasoMin = 15): Promise<SerieIntradia | null> {
  const [oi, ivC, ivP] = await Promise.all([
    csv(`option/history/open_interest?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}`),
    csv(`option/history/greeks/implied_volatility?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}&right=C&interval=5m`),
    csv(`option/history/greeks/implied_volatility?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}&right=P&interval=5m`),
  ]);
  if (!oi || !ivC || !ivP) return null;

  // Open interest: constante en la sesión.
  const iK = oi.cab.indexOf("strike"), iR = oi.cab.indexOf("right"), iO = oi.cab.indexOf("open_interest");
  if (iK < 0 || iR < 0 || iO < 0) return null;
  const OI = { C: new Map<number, number>(), P: new Map<number, number>() };
  for (const c of oi.filas) {
    const v = +c[iO];
    if (v > 0) OI[c[iR].replace(/"/g, "") === "CALL" ? "C" : "P"].set(+c[iK], v);
  }

  /** Agrupa las filas de IV por marca de tiempo: { "10:15": [[strike, iv, subyacente], …] }. */
  function porHora(d: NonNullable<Csv>) {
    const jK = d.cab.indexOf("strike"), jT = d.cab.indexOf("timestamp"), jV = d.cab.indexOf("implied_vol"),
      jU = d.cab.indexOf("underlying_price"), jA = d.cab.indexOf("ask"), jM = d.cab.indexOf("midpoint");
    const m = new Map<string, [number, number, number][]>();
    for (const c of d.filas) {
      const iv = +c[jV], u = +c[jU], ask = +c[jA], mid = +c[jM];
      // Mismos filtros que la vista del instante: se exige ASK y no bid, porque una opción muy
      // fuera del dinero cotiza 0,00 × 0,05 y seguiría teniendo gamma y open interest.
      if (!(u > 0) || !(iv > 0.01) || iv > 4 || !(ask > 0) || !(mid > 0)) continue;
      const h = c[jT].slice(11, 16);
      if (!m.has(h)) m.set(h, []);
      m.get(h)!.push([+c[jK], iv, u]);
    }
    return m;
  }
  const hC = porHora(ivC), hP = porHora(ivP);

  // Sólo las marcas que tienen los DOS lados: con uno solo el neto saldría sesgado.
  const horas = [...hC.keys()].filter((h) => hP.has(h)).sort();
  if (!horas.length) return null;

  const puntos: PuntoIntradia[] = [];
  for (const h of horas) {
    const [hh, mm] = h.split(":").map(Number);
    if (pasoMin > 5 && mm % pasoMin !== 0) continue;
    // Tiempo hasta el cierre (16:00), con suelo de 1 hora: sin él, la gamma de la última marca
    // se dispara y aplasta la escala de todo el resto del día.
    const T = Math.max((16 * 60 - (hh * 60 + mm)) / 60 / 24 / 365, 1 / 24 / 365);

    let gC = 0, gP = 0, U = 0;
    const porStrike = { C: new Map<number, number>(), P: new Map<number, number>() };
    for (const [lado, filas] of [["C", hC.get(h)!] as const, ["P", hP.get(h)!] as const]) {
      for (const [K, iv, u] of filas) {
        if (u > 0) U = u;
        const o = OI[lado].get(K);
        if (!o) continue;
        const g = gammaBS(u, K, T, iv);
        if (!isFinite(g) || g <= 0) continue;
        const $ = g * o * 100 * u * u * 0.01;
        if (!isFinite($)) continue;
        if (lado === "C") gC += $; else gP += $;
        porStrike[lado].set(K, $);
      }
    }
    if (!(U > 0) || (gC === 0 && gP === 0)) continue;

    const mayor = (m: Map<number, number>) => {
      let k: number | null = null, v = 0;
      for (const [kk, vv] of m) if (vv > v) { v = vv; k = kk; }
      return k;
    };
    puntos.push({
      hora: h, spx: Math.round(U * 100) / 100,
      gexNeto: Math.round((gC - gP) / 1e6), gexCalls: Math.round(gC / 1e6), gexPuts: Math.round(gP / 1e6),
      muroCall: mayor(porStrike.C), muroPut: mayor(porStrike.P),
    });
  }
  if (!puntos.length) return null;

  // CRUCES: cuántas veces el precio pasó de un lado a otro del muro. Es lo que convierte el
  // gráfico en una conclusión — cero cruces significa que el muro aguantó toda la sesión.
  const cruces = (lado: "muroCall" | "muroPut") => {
    let n = 0;
    for (let i = 1; i < puntos.length; i++) {
      const k = puntos[i][lado];
      if (k == null) continue;
      const antes = puntos[i - 1].spx - k, ahora = puntos[i].spx - k;
      if (antes !== 0 && ahora !== 0 && Math.sign(antes) !== Math.sign(ahora)) n++;
    }
    return n;
  };

  return { dia, puntos, crucesMuroCall: cruces("muroCall"), crucesMuroPut: cruces("muroPut") };
}
