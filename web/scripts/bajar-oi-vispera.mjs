// EL INTERÉS ABIERTO DE LA VÍSPERA — la variable que este proyecto nunca ha usado.
//
// ═══ POR QUÉ HACE FALTA ═════════════════════════════════════════════════════════════════════
//
// Todo lo que hemos medido del GEX usa la FOTO del interés abierto de la mañana del
// vencimiento: cuántos contratos hay acumulados en cada strike. Esa foto no distingue dos
// situaciones que no son la misma cosa:
//
//     una montaña VIEJA, construida a lo largo de semanas
//     una montaña RECIÉN HECHA, que alguien levantó anoche
//
// Y el día de Eduardo enseña que la diferencia existe. La call 7700 que vencía el 21 de agosto:
//
//     11 ago  2.803 · 12 ago 2.829 · 13 ago 2.936 · 14 ago 2.462 · 17 ago 2.467
//     18 ago  2.471 · 19 ago 2.557 · 20 ago 2.603 · 21 ago 8.404   ← +5.801 de golpe
//
// La montaña no llevaba semanas ahí. Apareció durante la sesión del 20. Eso es posicionamiento
// FRESCO, y una foto estática no lo puede ver.
//
// ═══ QUÉ SE BAJA ════════════════════════════════════════════════════════════════════════════
//
// Para cada uno de los 1.123 vencimientos que ya tenemos en cadena, el interés abierto de ESE
// vencimiento tal como estaba el día de mercado ANTERIOR. Restándolo del que ya tenemos en
// oi-spxw/ sale el cambio de la última sesión, strike por strike.
//
// ThetaData NO tiene el producto Cboe Open-Close (comprobado: `option/history/open_close` da
// 404). Esto no lo sustituye — el cambio del OI es NETO y no separa aperturas de cierres — pero
// es la mitad de la información y ya está pagada. La otra mitad (de qué lado cruzó cada
// operación) sale de `trade_quote`, que también tenemos.
//
// ═══ CUÁNTO TARDA ══════════════════════════════════════════════════════════════════════════
//
// Medido con reloj antes de lanzar: una cadena entera de un día son ~1.000 filas en 11 segundos.
// A 1.123 vencimientos, unas 3,4 horas. Se probó pedir todas las expiraciones de un día en una
// sola llamada y NO se puede: el endpoint responde 400, «An expiration must be specified».
//
// VA EN ORDEN INVERSO, del más reciente al más antiguo, a propósito: así se puede empezar a
// medir con los días recientes —que es donde el mercado de 0DTE es grande— sin esperar a que
// termine. Y es reanudable: lo que ya está en disco no se vuelve a pedir.
//
// Uso:  node scripts/with-theta.mjs node scripts/bajar-oi-vispera.mjs
//       (o el .cmd, que además comprueba el entorno y pone cerrojo)

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const CADENAS = "scripts/cache-theta/gex-2026";
const DIR = "scripts/cache-theta/oi-vispera";
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

// EL CHEQUEO QUE NO SE PUEDE SALTAR. Sin DATA_PROVIDER=theta el lanzador no levanta el
// Terminal, las peticiones van a un puerto vacío y el script sale con CÓDIGO 0 habiendo bajado
// cero. Ya pasó: 876 peticiones a la nada y un «terminó bien» en el log.
if ((process.env.DATA_PROVIDER || "").toLowerCase() !== "theta") {
  console.error(`ABORTA: DATA_PROVIDER='${process.env.DATA_PROVIDER}', esperaba 'theta'.`);
  process.exit(2);
}

const limpia = (s) => String(s ?? "").replace(/"/g, "").trim();

// los días de mercado, en orden: el anterior a cada vencimiento sale de aquí
const dias = readdirSync(CADENAS)
  .filter((f) => f.startsWith("iv_") && f.endsWith("_C.csv"))
  .map((f) => f.slice(3, 13))
  .sort();

console.log(`## ${dias.length} vencimientos · bajando el OI de la VÍSPERA de cada uno`);
console.log(`   del más reciente al más antiguo, para poder medir sin esperar al final\n`);

async function pedir(exp, dia) {
  const r = await fetch(
    `${B}/option/history/open_interest?symbol=SPXW&expiration=${exp}&start_date=${dia}&end_date=${dia}`,
    { signal: AbortSignal.timeout(240_000) });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  const txt = await r.text();
  const lin = txt.trim().split("\n");
  if (lin.length < 2) return { error: "sin filas" };
  const cab = lin[0].split(",").map(limpia);
  const iK = cab.indexOf("strike"), iR = cab.indexOf("right"), iO = cab.indexOf("open_interest");
  // Si el fichero cambia de forma, esto LANZA en vez de devolver un objeto vacío que luego se
  // leería como «ese día no había interés abierto».
  if (iK < 0 || iR < 0 || iO < 0) return { error: `faltan columnas: ${cab.join("|")}` };
  const oi = {};
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const n = +c[iO];
    if (!(n > 0)) continue;
    oi[`${Number(limpia(c[iK]))}|${limpia(c[iR]).startsWith("C") ? "C" : "P"}`] = n;
  }
  return { oi, filas: lin.length - 1 };
}

let bajados = 0, yaEstaban = 0, vacios = 0, fallos = 0, sinVispera = 0;
const t0 = Date.now();
const orden = [...dias].reverse();               // del más reciente hacia atrás

for (let k = 0; k < orden.length; k++) {
  const exp = orden[k];
  const i = dias.indexOf(exp);
  if (i <= 0) { sinVispera++; continue; }          // el primero de la serie no tiene víspera
  const vispera = dias[i - 1];

  const ruta = `${DIR}/${exp}.json`;
  if (existsSync(ruta)) {
    // reanudable, pero comprobando que lo que hay sirve: un fichero de 2 bytes es un cero
    // disfrazado y volvería a leerse como «no había interés abierto».
    try {
      const v = JSON.parse(readFileSync(ruta, "utf8"));
      if (v && v.vispera && Object.keys(v.oi ?? {}).length > 50) { yaEstaban++; continue; }
    } catch { /* mal escrito: se rehace */ }
  }

  const r = await pedir(exp, vispera);
  if (r.error) {
    fallos++;
    console.log(`   ✗ ${exp} (víspera ${vispera}): ${r.error}`);
  } else if (Object.keys(r.oi).length < 50) {
    vacios++;
    console.log(`   · ${exp}: sólo ${Object.keys(r.oi).length} strikes con OI — se guarda igual y se cuenta aparte`);
    writeFileSync(ruta, JSON.stringify({ exp, vispera, oi: r.oi, pocos: true }), "utf8");
  } else {
    writeFileSync(ruta, JSON.stringify({ exp, vispera, oi: r.oi }), "utf8");
    bajados++;
  }

  if ((k + 1) % 25 === 0 || k === orden.length - 1) {
    const hechos = bajados + vacios;
    const seg = (Date.now() - t0) / 1000;
    const quedan = hechos > 0 ? Math.round((seg / hechos) * (orden.length - k - 1) / 60) : 0;
    console.log(`   ${k + 1}/${orden.length} · ${exp} · bajados ${bajados} · ya estaban ${yaEstaban} · pocos ${vacios} · fallos ${fallos} · quedan ~${quedan} min`);
  }
}

console.log(`\n## TERMINADO`);
console.log(`   bajados ${bajados} · ya estaban ${yaEstaban} · con pocos strikes ${vacios} · fallos ${fallos} · sin víspera ${sinVispera}`);
console.log(`   en disco: ${readdirSync(DIR).filter((f) => f.endsWith(".json")).length} ficheros`);
if (fallos > orden.length * 0.05) {
  console.error(`   ⚠ más del 5% de fallos: NO usar esto sin mirar por qué antes.`);
  process.exit(1);
}
