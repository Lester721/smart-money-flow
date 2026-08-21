// SEGUIR EL PRINT — comprar el contrato exacto que la cinta acaba de imprimir.
//
// ═══ LO QUE ESTO CAMBIA RESPECTO A TODO LO ANTERIOR ═════════════════════════════════════════
//
// Todas las mediciones de MarketSnack hasta hoy —las 11 métricas, el score, las patas solas, el
// corte por tamaño— preguntaban lo mismo: *¿predice la cinta el movimiento de la ACCIÓN?* Y la
// respuesta fue que no.
//
// Pero eso no es lo que hace un operador con MS. Ve un print grande y **compra ese mismo
// contrato**. Y un contrato no es la acción: tiene apalancamiento y convexidad. Un 1% en la acción
// puede ser un 20% en la opción. Una señal demasiado débil para verse en la acción puede pagar
// perfectamente en el contrato.
//
// Y encima el mapa de liquidez dice que ESE contrato —el que la cinta acaba de imprimir— se compra
// con un peaje del 1,81% en vez del 12,75%. Es el único contrato de toda la cadena que se puede
// comprar barato.
//
// Nunca se midió. Esto lo mide.
//
// ═══ LOS PRECIOS SON REALES, LOS DOS ════════════════════════════════════════════════════════
//
//   ENTRADA: el `ask_price` que la propia cinta registró en el momento del print. Es el precio al
//            que se podía comprar, contemporáneo, sin modelo.
//   SALIDA:  el BID de la cadena N días después. Si el contrato ya no cotiza, vale CERO.
//
// Nada de punto medio en la entrada y nada de teórico en ningún sitio.
//
// ═══ SÓLO SE SIGUEN COMPRAS ═════════════════════════════════════════════════════════════════
//
// Si alguien COMPRÓ una call, nosotros compramos esa call. Las ventas no se replican: vender
// requiere colateral y cambia el riesgo por completo.
//
// ═══ LO QUE DECIDE ══════════════════════════════════════════════════════════════════════════
//
// El listón NO es cero. Comprar opciones al azar tiene un retorno propio, y hay que ganarle. Por
// eso se mide en paralelo el CONTROL: contratos de la misma cadena, mismo tipo y plazo parecido,
// que NADIE imprimió ese día. Si seguir el print no le gana al control, no hay señal.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/seguir-el-print.mjs

import { readFileSync, existsSync, readdirSync, createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const CINTA = "data/marketsnack/flujo-prima1000k.jsonl";
const CDIR = "scripts/cache-theta/cadenas";
const SALIDA = "scripts/seguir-el-print-resultado.json";
const HORIZONTES = [1, 3, 5, 10];
const VENTANA_MS = 2000;

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => (v.length > 2 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const pct = (x) => (isFinite(x) ? (x * 100).toFixed(1) + "%" : "—");

// ── índice de cadenas en disco ──────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v); if (cache.size > 120) cache.delete(cache.keys().next().value);
  return v;
}

/** NVDA260918C00180000 → { root, exp:'20260918', right:'C', strike:180 } */
function parseOCC(s) {
  const m = String(s || "").match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return { root: m[1], exp: `20${m[2]}${m[3]}${m[4]}`, right: m[5], strike: Number(m[6]) / 1000 };
}

// EL FALLO QUE ESTO ARREGLA, ESCRITO PARA NO REPETIRLO:
// la versión anterior devolvía 0 cuando el vencimiento no aparecía en el fichero de cadena — o sea,
// trataba "no tengo el dato" como "expiró sin valor" = −100%. Y el CONTROL se elige de la propia
// cadena, así que a él nunca le pasaba. Esa asimetría fabricaba una diferencia de −49,7% ella sola.
//
// Ahora se distinguen los tres casos:
//   · la salida cae DESPUÉS del vencimiento  → ya venció: se descarta (su valor depende del precio
//     del subyacente al vencer, y eso es otra medición distinta)
//   · el vencimiento sigue vivo pero NO está en el fichero → hueco en mis datos: null, se descarta
//   · el vencimiento está y el strike no                   → ése sí es un cero legítimo
let faltaVencimiento = 0, yaVencidos = 0;
function bidFuturo(root, diaEntrada, h, exp, strike, right) {
  const dias = diasPorSim.get(root);
  if (!dias) return null;
  const i = dias.indexOf(diaEntrada);
  if (i < 0 || i + h >= dias.length) return null;
  const diaSalida = dias[i + h];
  if (diaSalida > exp) { yaVencidos++; return null; }
  const c = cadena(root, diaSalida);
  if (!c) return null;
  const g = c[exp];
  if (!g) { faltaVencimiento++; return null; }
  return g[`${strike}|${right}`]?.[0] ?? 0;
}

// ── leer la cinta ───────────────────────────────────────────────────────────
console.log("\n## Leyendo la cinta\n");
const compras = [];
{
  const rl = createInterface({ input: createReadStream(CINTA) });
  for await (const linea of rl) {
    if (!linea.trim()) continue;
    let o; try { o = JSON.parse(linea); } catch { continue; }
    const p = parseOCC(o.symbol);
    if (!p || !diasPorSim.has(p.root)) continue;
    // SÓLO COMPRAS. Vender cambia el riesgo por completo y no se replica.
    if (!["ASKSIDE", "ABOVE_ASK", "AT_ASK"].includes(o.side)) continue;
    const ask = Number(o.ask_price);
    if (!(ask > 0.05)) continue;                     // por debajo de 5 centavos el % es ruido
    compras.push({
      ...p,
      dia: String(o.timestamp).slice(0, 10).replace(/-/g, ""),
      ts: Date.parse(o.timestamp),
      size: o.size, premium: o.premium, ask, lado: o.side,
      // EL PRECIO AL QUE DE VERDAD SE CRUZÓ. Es la pieza del mapa de liquidez: si te pegas al
      // print puedes comprar ahí en vez de al ask de la cadena, que es mucho más caro.
      precioPrint: Number(o.price) > 0 ? Number(o.price) : null,
      bidPrint: Number(o.bid_price) > 0 ? Number(o.bid_price) : null,
      dte: Math.round((Date.parse(`${p.exp.slice(0, 4)}-${p.exp.slice(4, 6)}-${p.exp.slice(6, 8)}`) - Date.parse(String(o.timestamp).slice(0, 10))) / 86_400_000),
      moneyness: o.asset_price > 0 ? (p.strike - o.asset_price) / o.asset_price : null,
    });
  }
}
console.log(`  ${compras.length.toLocaleString("es-ES")} COMPRAS de la cinta con cadena en disco\n`);

// ── pata sola o pata de estructura ──────────────────────────────────────────
{
  const g = new Map();
  for (const c of compras) { const k = `${c.root}|${c.size}`; if (!g.has(k)) g.set(k, []); g.get(k).push(c); }
  for (const lista of g.values()) {
    lista.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < lista.length; i++) {
      const antes = i > 0 && lista[i].ts - lista[i - 1].ts <= VENTANA_MS;
      const desp = i < lista.length - 1 && lista[i + 1].ts - lista[i].ts <= VENTANA_MS;
      lista[i].pataSola = !antes && !desp;
    }
  }
}

// ── EL CONTROL: un contrato parecido que NADIE imprimió ese día ─────────────
// Mismo subyacente, mismo tipo, mismo vencimiento, y el strike más cercano al del print
// entre los que NO aparecen en la cinta ese día. Se compra a su ASK real.
const impresosPorDia = new Map();
for (const c of compras) {
  const k = `${c.root}|${c.dia}`;
  if (!impresosPorDia.has(k)) impresosPorDia.set(k, new Set());
  impresosPorDia.get(k).add(`${c.exp}|${c.strike}|${c.right}`);
}
function control(c) {
  const ch = cadena(c.root, c.dia);
  const g = ch?.[c.exp];
  if (!g) return null;
  const yaImpresos = impresosPorDia.get(`${c.root}|${c.dia}`) ?? new Set();
  let mejor = null, mejorD = Infinity;
  for (const [clave, ba] of Object.entries(g)) {
    if (clave.slice(-1) !== c.right) continue;
    const K = Number(clave.slice(0, -2));
    if (yaImpresos.has(`${c.exp}|${K}|${c.right}`)) continue;   // ése lo imprimió alguien
    if (!(ba[1] > 0.05)) continue;
    const d = Math.abs(K - c.strike);
    if (d > 0 && d < mejorD) { mejorD = d; mejor = { K, ask: ba[1] }; }
  }
  return mejor;
}

// ── medir ───────────────────────────────────────────────────────────────────
console.log("  calculando retornos…\n");
const res = [];
let n = 0;
for (const c of compras) {
  if (++n % 5000 === 0) process.stdout.write(`\r   ${n}/${compras.length}   `);
  // LAS DOS ENTRADAS DE LA MISMA FUENTE. El `ask_price` de la cinta es intradía y el del control
  // es de cierre: compararlos sería tramposo a favor del print. Los dos salen de la cadena.
  // (Que en la vida real el print se compre MÁS barato por el mapa de liquidez es una ventaja
  //  añadida encima de lo que salga aquí, no parte de la medición.)
  const chEnt = cadena(c.root, c.dia)?.[c.exp];
  const askEnt = chEnt?.[`${c.strike}|${c.right}`]?.[1];
  if (!(askEnt > 0.05)) continue;
  const ctrl = control(c);
  if (!ctrl) continue;                               // sin control no hay comparación: fuera
  const fila = { ...c, askEnt, askCtrl: ctrl.ask, strikeCtrl: ctrl.K };
  let sirve = false;
  for (const h of HORIZONTES) {
    const b = bidFuturo(c.root, c.dia, h, c.exp, c.strike, c.right);
    const bc = bidFuturo(c.root, c.dia, h, c.exp, ctrl.K, c.right);
    // SÓLO cuentan los horizontes donde EXISTEN LOS DOS. Si a uno le falta el dato y al otro no,
    // la diferencia mide mis huecos, no el mercado.
    if (b == null || bc == null) continue;
    fila[`r${h}`] = (b - askEnt) / askEnt;
    fila[`c${h}`] = (bc - ctrl.ask) / ctrl.ask;
    // LA TERCERA COLUMNA: el mismo contrato, comprado al precio al que se cruzó el print.
    // Es la única entrada que el mapa de liquidez dice que está a tu alcance.
    if (c.precioPrint > 0.05) fila[`p${h}`] = (b - c.precioPrint) / c.precioPrint;
    sirve = true;
  }
  if (!sirve) continue;
  res.push(fila);
}
console.log(`\r  ${res.length.toLocaleString("es-ES")} operaciones medidas con precios reales`);
console.log(`  descartadas: ${yaVencidos.toLocaleString("es-ES")} por haber vencido antes de la salida · ${faltaVencimiento.toLocaleString("es-ES")} por hueco en la cadena\n`);
if (res.length < 500) { console.error("Muestra insuficiente."); process.exit(1); }

function tabla(titulo, sub) {
  if (sub.length < 100) { console.log(`| ${titulo} | ${sub.length} | muestra corta | | | |`); return; }
  const cel = [];
  for (const h of HORIZONTES) {
    const sigue = sub.map((x) => x[`r${h}`]).filter((x) => x != null);
    const ctrl = sub.map((x) => x[`c${h}`]).filter((x) => x != null);
    if (sigue.length < 50) { cel.push("—"); continue; }
    const dif = ctrl.length >= 50 ? media(sigue) - media(ctrl) : NaN;
    cel.push(`${pct(media(sigue))} vs ${pct(media(ctrl))} = **${pct(dif)}**`);
  }
  console.log(`| ${titulo} | ${sub.length.toLocaleString("es-ES")} | ${cel.join(" | ")} |`);
}

console.log("=".repeat(110));
console.log("  SEGUIR EL PRINT vs UN CONTRATO VECINO QUE NADIE IMPRIMIÓ");
console.log("  (retorno del print · retorno del control · diferencia)");
console.log("=".repeat(110) + "\n");
console.log(`| población | n | ${HORIZONTES.map((h) => `${h} día${h > 1 ? "s" : ""}`).join(" | ")} |`);
console.log(`|---|---|${HORIZONTES.map(() => "---").join("|")}|`);
tabla("TODAS las compras", res);
tabla("patas SOLAS", res.filter((x) => x.pataSola));
tabla("patas de ESTRUCTURA", res.filter((x) => !x.pataSola));
tabla("calls", res.filter((x) => x.right === "C"));
tabla("puts", res.filter((x) => x.right === "P"));
tabla("plazo corto (≤14d)", res.filter((x) => x.dte <= 14));
tabla("plazo medio (15–60d)", res.filter((x) => x.dte > 14 && x.dte <= 60));
tabla("plazo largo (>60d)", res.filter((x) => x.dte > 60));
tabla("prima ≥ $5M", res.filter((x) => x.premium >= 5e6));

// ── el t de la diferencia, que es lo que decide ────────────────────────────
console.log("\n" + "=".repeat(110));
console.log("  ¿ES SIGNIFICATIVA LA DIFERENCIA? — pareado: cada print contra SU propio control");
console.log("=".repeat(110) + "\n");
console.log("| población | horizonte | n pares | diferencia media | t |");
console.log("|---|---|---|---|---|");
for (const [nom, sub] of [
  ["todas", res],
  ["patas SOLAS", res.filter((x) => x.pataSola)],
  ["patas de ESTRUCTURA", res.filter((x) => !x.pataSola)],
]) {
  for (const h of HORIZONTES) {
    const pares = sub.filter((x) => x[`r${h}`] != null && x[`c${h}`] != null).map((x) => x[`r${h}`] - x[`c${h}`]);
    if (pares.length < 100) continue;
    console.log(`| ${nom} | ${h}d | ${pares.length.toLocaleString("es-ES")} | ${pct(media(pares))} | **${tDe(pares).toFixed(2)}** |`);
  }
}

// ── las dos mitades ─────────────────────────────────────────────────────────
const dias = [...new Set(res.map((x) => x.dia))].sort();
const corte = dias[Math.floor(dias.length / 2)];
console.log("\n" + "=".repeat(110));
console.log(`  LAS DOS MITADES · corte en ${corte}`);
console.log("=".repeat(110) + "\n");
console.log("| población | horizonte | primera mitad | segunda mitad | ¿mismo signo? |");
console.log("|---|---|---|---|---|");
for (const [nom, sub] of [["todas", res], ["patas SOLAS", res.filter((x) => x.pataSola)], ["patas de ESTRUCTURA", res.filter((x) => !x.pataSola)]]) {
  for (const h of HORIZONTES) {
    const p = (f) => f.filter((x) => x[`r${h}`] != null && x[`c${h}`] != null).map((x) => x[`r${h}`] - x[`c${h}`]);
    const a = p(sub.filter((x) => x.dia < corte)), b = p(sub.filter((x) => x.dia >= corte));
    if (a.length < 100 || b.length < 100) continue;
    const ok = Math.sign(media(a)) === Math.sign(media(b));
    console.log(`| ${nom} | ${h}d | ${pct(media(a))} (t ${tDe(a).toFixed(2)}) | ${pct(media(b))} (t ${tDe(b).toFixed(2)}) | ${ok ? "**sí**" : "NO"} |`);
  }
}

// ── LAS TRES ENTRADAS, LADO A LADO ─────────────────────────────────────────
// Ésta es la pregunta que junta las dos piezas: la señal (qué contrato) y el mapa de liquidez
// (a qué precio). Si comprar al precio del print cambia el signo, hay estrategia.
console.log("\n" + "=".repeat(110));
console.log("  ¿CAMBIA EL SIGNO SI COMPRAS AL PRECIO DEL PRINT EN VEZ DE AL ASK DE LA CADENA?");
console.log("=".repeat(110) + "\n");
{
  const conP = res.filter((x) => x.precioPrint > 0.05 && x.askEnt > 0);
  const ahorro = conP.map((x) => (x.askEnt - x.precioPrint) / x.askEnt);
  console.log(`  ${conP.length.toLocaleString("es-ES")} operaciones con precio de print utilizable`);
  console.log(`  el print se cruzó de media un **${pct(media(ahorro))}** por debajo del ask de la cadena\n`);
  console.log("| población | horizonte | al ASK de la cadena | al PRECIO DEL PRINT | t del print |");
  console.log("|---|---|---|---|---|");
  for (const [nom, sub] of [["todas", conP], ["patas SOLAS", conP.filter((x) => x.pataSola)], ["calls", conP.filter((x) => x.right === "C")], ["puts", conP.filter((x) => x.right === "P")]]) {
    for (const h of HORIZONTES) {
      const a = sub.map((x) => x[`r${h}`]).filter((x) => x != null);
      const p = sub.map((x) => x[`p${h}`]).filter((x) => x != null);
      if (p.length < 200) continue;
      console.log(`| ${nom} | ${h}d | ${pct(media(a))} | **${pct(media(p))}** | ${tDe(p).toFixed(2)} |`);
    }
  }
  const mejor = HORIZONTES.map((h) => ({ h, v: media(conP.map((x) => x[`p${h}`]).filter((x) => x != null)) })).sort((a, b) => b.v - a.v)[0];
  console.log("\n" + "=".repeat(110));
  if (mejor.v > 0.01) {
    console.log(`  🟢 CAMBIA DE SIGNO. A ${mejor.h} día(s) comprando al precio del print da ${pct(mejor.v)}.`);
    console.log(`     La señal sola no bastaba; la señal MÁS el precio de entrada sí. Falta el`);
    console.log(`     control contra el azar y ver si se puede ejecutar de verdad en directo.`);
  } else {
    console.log(`  🔴 NO CAMBIA DE SIGNO. Lo mejor es ${pct(mejor.v)} a ${mejor.h} día(s):`);
    console.log(`     el descuento del print no llega a cubrir lo que cuesta comprar opciones.`);
  }
  console.log("=".repeat(110));
}


// ── ¿LLEVA MÁS INFORMACIÓN EL COMPRADOR AGRESIVO? ──────────────────────────
// Quien paga POR ENCIMA del ask tiene prisa, y la prisa suele significar convicción.
// Si la señal está en algún sitio, tendría que estar aquí concentrada.
console.log("\n" + "=".repeat(110));
console.log("  ¿PAGA MÁS EL QUE TIENE PRISA? — diferencia contra el control, pareada");
console.log("=".repeat(110) + "\n");
console.log("| quién compra | n | 1d | 3d | 5d | 10d |");
console.log("|---|---|---|---|---|---|");
for (const [nom, filtro] of [
  ["POR ENCIMA del ask (prisa)", (x) => x.lado === "ABOVE_ASK"],
  ["al ask", (x) => x.lado === "ASKSIDE" || x.lado === "AT_ASK"],
  ["pata sola Y con prisa", (x) => x.lado === "ABOVE_ASK" && x.pataSola],
  ["pata sola, prisa y ≥$5M", (x) => x.lado === "ABOVE_ASK" && x.pataSola && x.premium >= 5e6],
  ["prisa, sola, ≥$5M y ≤60 días", (x) => x.lado === "ABOVE_ASK" && x.pataSola && x.premium >= 5e6 && x.dte <= 60],
]) {
  const sub = res.filter(filtro);
  const cel = HORIZONTES.map((h) => {
    const d = sub.filter((x) => x[`r${h}`] != null && x[`c${h}`] != null).map((x) => x[`r${h}`] - x[`c${h}`]);
    return d.length >= 150 ? `${pct(media(d))} (t ${tDe(d).toFixed(2)})` : "—";
  });
  console.log(`| ${nom} | ${sub.length.toLocaleString("es-ES")} | ${cel.join(" | ")} |`);
}
console.log("");

writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(), n: res.length,
  resumen: HORIZONTES.map((h) => {
    const pares = res.filter((x) => x[`r${h}`] != null && x[`c${h}`] != null).map((x) => x[`r${h}`] - x[`c${h}`]);
    return { h, n: pares.length, dif: media(pares), t: tDe(pares) };
  }),
}, null, 1), "utf8");
console.log(`\nresumen en ${SALIDA}\n`);
