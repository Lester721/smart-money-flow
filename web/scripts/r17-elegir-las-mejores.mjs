// ¿Y SI EN VEZ DE COGER LAS QUE LLEGAN PRIMERO, ELIGES LAS MEJORES?
//
// Lester: «prueba elegir las mejores en vez de las que llegan primero».
//
// El problema real: hay 72 señales al año y sólo caben 4 posiciones a la vez. Hasta ahora se
// cogían **por orden de llegada**, que dentro de un mismo día es prácticamente al azar. Con 205
// señales y sitio para 10, eso significa quedarse con el 5% escogido a suertes.
//
// ═══ LA REGLA QUE NO SE PUEDE ROMPER ═══════════════════════════════════════════════════════
// El criterio de orden SÓLO puede usar cosas que se saben AL COMPRAR: el múltiplo del interés
// abierto, el tamaño del golpe, lo dentro del dinero que esté, el plazo, lo que cuesta, la
// horquilla. **Nada del resultado.** Ordenar por lo que acabó pasando sería mirar al futuro.
//
// ═══ EL AVISO ══════════════════════════════════════════════════════════════════════════════
// Se prueban 8 criterios sobre ~13 operaciones. Elegir el mejor DESPUÉS de verlos es sobreajuste
// casi garantizado. Por eso cada uno se mira también partido en dos: enero-marzo contra
// abril-agosto. El que sólo gane en una mitad no vale.

import { cargar, simular } from "./consultar.mjs";

const R = { objetivo: 1.50, suelo: 0.50 };
const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const T = cargar();

const MAGICA = (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const AMPLIA = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 5000 && f.vsOI >= 12;

/** Simula la cuenta ordenando las señales de CADA DÍA por `puntua` (mayor primero). */
function cuentaOrdenada(filas, puntua, { capital = 60000, porOp = 15000, maxAbiertas = 4 } = {}) {
  const L = filas.map((f) => ({ f, r: simular(f, R) }));
  const porDia = new Map();
  for (const x of L) {
    if (!porDia.has(x.f.dC)) porDia.set(x.f.dC, []);
    porDia.get(x.f.dC).push(x);
  }
  let caja = capital, ab = [], tomadas = [], minCaja = capital;
  const fechas = [...new Set([...L.map((x) => x.f.dC), ...L.map((x) => x.r.dSal)])].sort();
  for (const hoy of fechas) {
    for (const a of ab.filter((a) => a.r.dSal === hoy)) caja += a.n * a.r.mult * a.f.ask * 100;
    ab = ab.filter((a) => a.r.dSal !== hoy);
    const candidatos = (porDia.get(hoy) ?? []).slice().sort((a, b) => puntua(b.f) - puntua(a.f));
    for (const x of candidatos) {
      if (ab.length >= maxAbiertas) break;
      const precio = x.f.ask * 100;
      const n = Math.floor(porOp / precio);
      if (n < 1 || n * precio > caja) continue;
      caja -= n * precio; ab.push({ ...x, n }); tomadas.push({ ...x, n });
    }
    if (caja < minCaja) minCaja = caja;
  }
  for (const a of ab) caja += a.n * a.r.mult * a.f.ask * 100;
  return { final: caja, ganancia: caja - capital, pct: 100 * (caja / capital - 1), tomadas, minCaja,
           gana: tomadas.filter((x) => x.r.mult > 1).length, pierde: tomadas.filter((x) => x.r.mult < 1).length };
}

// ── los criterios, TODOS con datos conocidos al comprar ──
const CRITERIOS = [
  ["por orden de llegada (lo de ahora)", () => 0],
  ["el múltiplo de OI más alto", (f) => f.vsOI],
  ["el múltiplo de OI más bajo", (f) => -f.vsOI],
  ["el golpe más grande en dólares", (f) => f.prima],
  ["el contrato más barato", (f) => -f.ask],
  ["el contrato más caro", (f) => f.ask],
  ["lo más DENTRO del dinero", (f) => f.prof],
  ["lo menos dentro del dinero", (f) => -f.prof],
  ["el plazo más corto", (f) => -f.dte],
  ["el plazo más largo", (f) => f.dte],
  ["la horquilla más estrecha", (f) => -(f.horq ?? 1)],
  ["más golpes en el contrato ese día", (f) => f.golpes],
];

function bloque(nombre, filtro, porOp, maxAb) {
  const filas = T.filter(filtro);
  console.log(`\n═══ ${nombre} · ${filas.length} señales · $${porOp.toLocaleString("en-US")} por posición · máximo ${maxAb} ═══\n`);
  console.log(`  ${"criterio de orden".padEnd(36)}  ops  gana/pierde   termina en    ganancia      ene-mar    abr-ago`);
  const res = [];
  for (const [nom, p] of CRITERIOS) {
    const c = cuentaOrdenada(filas, p, { porOp, maxAbiertas: maxAb });
    // partido en dos mitades del año
    const a = cuentaOrdenada(filas.filter((f) => f.dC < "202604"), p, { porOp, maxAbiertas: maxAb });
    const b = cuentaOrdenada(filas.filter((f) => f.dC >= "202604"), p, { porOp, maxAbiertas: maxAb });
    res.push({ nom, c, a, b });
    console.log(`  ${nom.padEnd(36)} ${String(c.tomadas.length).padStart(4)}  ${`${c.gana} / ${c.pierde}`.padEnd(11)} ${$(c.final).padEnd(12)} ${$(c.ganancia).padEnd(11)} ${$(a.ganancia).padStart(11)} ${$(b.ganancia).padStart(10)}`);
  }
  const mejor = res.slice().sort((x, y) => y.c.ganancia - x.c.ganancia)[0];
  const orden = res.find((x) => x.nom.startsWith("por orden"));
  console.log(`\n  mejor: "${mejor.nom}" con ${$(mejor.c.ganancia)} contra ${$(orden.c.ganancia)} del orden de llegada`);
  const gananLasDos = res.filter((x) => x.a.ganancia > 0 && x.b.ganancia > 0);
  console.log(`  criterios que ganan en LAS DOS mitades del año: ${gananLasDos.length ? gananLasDos.map((x) => `"${x.nom}"`).join(", ") : "NINGUNO"}`);
}

bloque("LA TABLA MÁGICA", MAGICA, 15000, 4);
bloque("LA TABLA MÁGICA", MAGICA, 12000, 5);
bloque("LA VERSIÓN AMPLIA (12x · $5,000+ · sin plazo)", AMPLIA, 15000, 4);
bloque("LA VERSIÓN AMPLIA", AMPLIA, 10000, 6);
console.log("");
