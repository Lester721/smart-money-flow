// FLOW TAPE — las operaciones grandes de SPX, una a una, con QUIÉN LLEVÓ LA INICIATIVA.
//
// ⛔ NO ENCHUFADO EN LA WEB TODAVÍA — CLASIFICA MAL. (2026-08-15)
//
// El problema es la granularidad de las cotizaciones: se piden con `interval=1m`, así que una
// operación de las 12:24:10 se compara contra la cotización de las 12:24:00 — hasta 60 segundos
// de antigüedad. En un mercado que se mueve, el precio se sale de esa horquilla vieja de forma
// perfectamente legítima, y el panel lo marcaba como "fuera de horquilla".
//
// Medido el 2026-08-14: de las 40 mayores de una sola pata, 36 salían "fuera de horquilla". Eso
// NO es estructura de mercado, es cotización rancia. Antes de enchufarlo hay que pedir las
// cotizaciones con granularidad fina (tick o 1s) para las impresiones que se vayan a clasificar.
//
// Lo que SÍ quedó bien y hay que conservar: el detector de VARIAS PATAS. Medido: de las 40
// mayores del día, 31 eran estrategias reportadas como piernas sueltas. Es lo que significa el
// `Cond: ML / SL` de MarketSnack, y sin ese filtro la cinta se llena de spreads donde "compra" o
// "venta" no significa nada porque la contrapartida está en la otra pierna.
//
// Es el panel de MarketSnack que faltaba. Lo que enseña que ningún otro panel nuestro da: no
// cuánta gamma hay ni dónde, sino **quién está poniendo el dinero ahora mismo y de qué lado**.
//
// EL DATO QUE IMPORTA ES EL LADO, y no viene en la operación. El endpoint de trades da symbol,
// expiration, strike, right, timestamp, size, price… **pero no bid ni ask**. Sin ellos no se sabe
// si la operación se cruzó contra la oferta (alguien COMPRÓ con prisa) o contra la demanda
// (alguien VENDIÓ con prisa), que es toda la información.
//
// Así que se cruza con la cotización del instante — **la última EN O ANTES**, nunca posterior:
// usar una de después sería mirar al futuro.
//
// Coste: una llamada trae el día entero de operaciones; luego una cotización por cada contrato
// notable. Con el tope de 40 son ~10 s.

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";

type Csv = { cab: string[]; filas: string[][] } | null;
async function csv(ruta: string, ms = 120_000): Promise<Csv> {
  try {
    const r = await fetch(`${B}${ruta}`, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    if (!r.ok) return null;
    const t = await r.text();
    const l = t.trim().split("\n");
    if (l.length < 2 || l[0].includes(" ")) return null;
    return { cab: l[0].split(","), filas: l.slice(1).map((x) => x.split(",")) };
  } catch { return null; }
}
const num = (s: string) => Number(String(s).replace(/"/g, ""));
const txt = (s: string) => String(s).replace(/"/g, "");

export interface Impresion {
  hora: string;               // HH:MM:SS ET
  strike: number;
  right: "C" | "P";
  size: number;
  price: number;
  prima: number;
  bid: number | null;
  ask: number | null;
  /** Quién llevó la iniciativa. `null` cuando no hay cotización: NO se adivina.
   *  "fuera de horquilla" = el precio cae MUY por encima del ask o por debajo del bid, así que
   *  no es un cruce agresivo simple: casi siempre es una operación de varias patas reportada
   *  como piernas sueltas. Se marca y se EXCLUYE del desequilibrio. */
  lado: "COMPRA" | "VENTA" | "entre medias" | "fuera de horquilla" | "varias patas" | null;
  condition: number;
  /** Hubo impresiones en OTRO strike en el mismo segundo → es una estrategia, no un cruce simple. */
  variasPatas: boolean;
  spot: number | null;
}

/** Última cotización EN O ANTES del instante. Nunca posterior — sería mirar al futuro. */
function bboAsOf(serie: [number, number, number][], ms: number) {
  let lo = 0, hi = serie.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (serie[m][0] <= ms) { r = m; lo = m + 1; } else hi = m - 1; }
  return r < 0 ? null : { bid: serie[r][1], ask: serie[r][2] };
}

export async function flowTape(
  dia: string, symbol = "SPXW", minPrima = 250_000, tope = 40,
): Promise<{ impresiones: Impresion[]; totalNotables: number; totalSimples: number; totalEstructuras: number; primaTotal: number } | null> {
  const d = dia.replace(/-/g, "");
  const tr = await csv(`/option/history/trade?symbol=${symbol}&expiration=*&start_date=${d}&end_date=${d}`, 180_000);
  if (!tr) return null;

  const c = Object.fromEntries(tr.cab.map((k, i) => [k, i]));
  const todas: Impresion[] = [];
  for (const f of tr.filas) {
    const size = num(f[c.size]), price = num(f[c.price]);
    if (!(size > 0) || !(price > 0)) continue;
    const prima = size * price * 100;
    if (prima < minPrima) continue;
    todas.push({
      hora: txt(f[c.timestamp]).slice(11, 19),
      strike: num(f[c.strike]), right: txt(f[c.right]).startsWith("C") ? "C" : "P",
      size, price, prima: Math.round(prima),
      condition: num(f[c.condition]), variasPatas: false,
      bid: null, ask: null, lado: null, spot: null,
    });
  }
  if (!todas.length) return { impresiones: [], totalNotables: 0, totalSimples: 0, totalEstructuras: 0, primaTotal: 0 };

  // DETECTOR DE VARIAS PATAS, estructural y sin adivinar códigos: si en el MISMO segundo hay
  // impresiones en dos o más strikes distintos, es una estrategia reportada como piernas sueltas
  // — un spread, un roll, una mariposa. Su precio contra el NBBO de UNA pierna no dice nada sobre
  // quién llevó la iniciativa: la contrapartida está en la otra pierna.
  const strikesPorInstante = new Map<string, Set<number>>();
  for (const x of todas) {
    if (!strikesPorInstante.has(x.hora)) strikesPorInstante.set(x.hora, new Set());
    strikesPorInstante.get(x.hora)!.add(x.strike);
  }
  for (const x of todas) if ((strikesPorInstante.get(x.hora)?.size ?? 1) > 1) x.variasPatas = true;

  const primaTotal = todas.reduce((a, x) => a + x.prima, 0);

  // EL TOP SE ELIGE ENTRE LAS DE UNA SOLA PATA. Medido el 2026-08-14: de las 40 mayores del día,
  // **31 eran estrategias de varias patas**. Ordenar por prima a secas llenaba la cinta de
  // spreads y rolls, donde "compra" o "venta" no significa nada porque la contrapartida está en
  // la otra pierna. Las grandes de SPX casi nunca son apuestas direccionales.
  //
  // Las de varias patas se conservan al final, marcadas, para que se vea cuántas hubo — no se
  // esconden, sólo dejan de ocupar el sitio de las que sí informan.
  const simples = todas.filter((x) => !x.variasPatas).sort((a, b) => b.prima - a.prima);
  const estructuras = todas.filter((x) => x.variasPatas).sort((a, b) => b.prima - a.prima);
  const top = [...simples.slice(0, tope), ...estructuras.slice(0, Math.max(3, Math.floor(tope / 8)))];

  // Cotizaciones sólo de los contratos del top, de 4 en 4 (el Terminal admite 4 a la vez).
  const contratos = new Map<string, Impresion[]>();
  for (const x of top) {
    const k = `${x.strike}|${x.right}`;
    if (!contratos.has(k)) contratos.set(k, []);
    contratos.get(k)!.push(x);
  }
  const ent = [...contratos.entries()];
  for (let i = 0; i < ent.length; i += 4) {
    const tanda = ent.slice(i, i + 4);
    const series = await Promise.all(tanda.map(([k]) => {
      const [strike, right] = k.split("|");
      return csv(`/option/history/quote?symbol=${symbol}&expiration=${d}&strike=${strike}&right=${right}&start_date=${d}&end_date=${d}&interval=1m`, 45_000);
    }));
    tanda.forEach(([, lista], j) => {
      const q = series[j];
      if (!q) return;
      const iT = q.cab.indexOf("timestamp"), iB = q.cab.indexOf("bid"), iA = q.cab.indexOf("ask"),
        iU = q.cab.indexOf("underlying_price");
      if (iT < 0 || iB < 0 || iA < 0) return;
      const serie: [number, number, number][] = [];
      const spots: [number, number][] = [];
      for (const f of q.filas) {
        const bid = num(f[iB]), ask = num(f[iA]);
        const ms = Date.parse(txt(f[iT]) + "Z");
        if (ask > 0) serie.push([ms, bid, ask]);
        if (iU >= 0 && num(f[iU]) > 0) spots.push([ms, num(f[iU])]);
      }
      serie.sort((a, b) => a[0] - b[0]); spots.sort((a, b) => a[0] - b[0]);
      for (const x of lista) {
        const ms = Date.parse(`${dia}T${x.hora}Z`);
        const bbo = bboAsOf(serie, ms);
        if (!bbo) continue;                       // sin cotización se queda en null: no se adivina
        x.bid = bbo.bid; x.ask = bbo.ask;
        // El lado: pegado al ask = alguien compró con prisa; pegado al bid = vendió con prisa.
        // Se usa el punto medio como frontera, con un margen del 5% de la horquilla para no
        // clasificar como agresivo lo que sólo fue un cruce en el medio.
        const mid = (bbo.bid + bbo.ask) / 2, h = bbo.ask - bbo.bid;
        // FUERA DE HORQUILLA primero. Una compra agresiva de verdad se imprime AL ask, no muy por
        // encima. El 2026-08-14 las cuatro mayores del día eran SPXW 6000C y 7000C a la misma
        // hora, mismo tamaño y 30 puntos por encima del ask: una operación de varias patas
        // reportada como piernas sueltas. Clasificarlas por precio contra el NBBO de UNA pierna
        // daba "$241M de compra agresiva y $0 de venta", que es imposible.
        // El umbral es UNA HORQUILLA ENTERA más allá de la cotización. Un % del precio no sirve:
        // en un contrato a $1812 el 2% son 36 puntos, más que la desviación real de 30, y el
        // bloque se colaba. "Más de una horquilla fuera" es anómalo en cualquier escala.
        x.lado = x.variasPatas ? "varias patas"
          : x.price > bbo.ask + h || x.price < bbo.bid - h ? "fuera de horquilla"
          : h <= 0 ? "entre medias"
          : x.price >= mid + h * 0.05 ? "COMPRA"
          : x.price <= mid - h * 0.05 ? "VENTA" : "entre medias";
        const sp = spots.length ? bboAsOf(spots.map(([m, v]) => [m, v, v]), ms) : null;
        if (sp) x.spot = Math.round(sp.bid * 100) / 100;
      }
    });
  }

  // Se devuelven por hora, de la más reciente a la más antigua — como una cinta.
  return {
    impresiones: top.sort((a, b) => b.hora.localeCompare(a.hora)),
    totalNotables: todas.length,
    totalSimples: simples.length,
    totalEstructuras: estructuras.length,
    primaTotal: Math.round(primaTotal),
  };
}
