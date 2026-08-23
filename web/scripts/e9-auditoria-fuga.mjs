// AUDITORÍA DE e9-prima-barata.mjs — LENTE 1: fuga del futuro.
//
// Uso:  node --import tsx scripts/e9-auditoria-fuga.mjs
//
// Reconstruye el candidato titular (momento 10:00→15:55 SÓLO los días de prima barata) con
// el mismo banco de pruebas, y le pasa las pruebas que el script original NO le pasa:
//
//   A) INTEGRIDAD DEL DATO: ¿la etiqueta de tiempo de la opción y la del subyacente son la
//      misma? ¿hay un solo precio de subyacente por barra? ¿existen las barras 09:35/10:00/15:55?
//   B) ORDEN DE ÍNDICES: ¿la salida es SIEMPRE posterior a la entrada?
//   C) CALIBRAR CÓMO SE VE UNA FUGA: la misma regla pero leyendo la dirección del FUTURO.
//   D) EL PLACEBO DEL FILTRO: definir "barato" con los 20 días SIGUIENTES en vez de los 20
//      anteriores. Si el resultado es parecido, el filtro no lleva información temporal, sólo
//      marca régimen de volatilidad baja.
//   E) BARAJADO COMPLETO: los 1.037 desplazamientos posibles, no cinco elegidos.
//   F) EL DENOMINADOR: el % por operación contra los dólares por operación.
//   G) CONCENTRACIÓN: qué queda si se quitan los k mejores días.
//   H) SIMETRÍA DE VERDAD: en los días baratos, comprar SIEMPRE call y comprar SIEMPRE put.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diasDisponibles, cargarDia, operar, idxHora, rejilla, compraEn, resumen, DIR_CADENA }
  from "./lib0dte.mjs";

const pc = (x) => (x * 100).toFixed(2).replace(".", ",") + "%";
const d0 = (x) => "$" + Math.round(x).toLocaleString("es-ES");
const n2 = (x) => x.toFixed(2).replace(".", ",");
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A) INTEGRIDAD DEL DATO — leer los CSV en crudo, sin pasar por el lector del banco.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("══ A) INTEGRIDAD DEL DATO (muestra de 60 días repartidos) ══════════════════════");
const todos = diasDisponibles();
const muestra = [];
for (let i = 0; i < 60; i++) muestra.push(todos[Math.floor((i * (todos.length - 1)) / 59)]);

let filasLeidas = 0, tsDistinto = 0, spotDoble = 0, barrasConDosSpots = 0;
const ejemplos = [];
for (const d of muestra) {
  for (const letra of ["C", "P"]) {
    const txt = readFileSync(join(DIR_CADENA, `iv_${d}_${letra}.csv`), "utf8");
    const lin = txt.split("\n");
    const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
    const iTs = cab.indexOf("timestamp"), iUts = cab.indexOf("underlying_timestamp"), iUp = cab.indexOf("underlying_price");
    if (iUts < 0) { console.log("   (este fichero no trae underlying_timestamp)"); break; }
    const porBarra = new Map();
    for (let k = 1; k < lin.length; k++) {
      const l = lin[k];
      if (!l) continue;
      const c = l.split(",");
      filasLeidas++;
      if (c[iTs] !== c[iUts]) {
        tsDistinto++;
        if (ejemplos.length < 5) ejemplos.push(`${d}${letra}  opcion=${c[iTs]}  subyacente=${c[iUts]}`);
      }
      const t = c[iTs].slice(11, 16);
      const s = c[iUp];
      const y = porBarra.get(t);
      if (y === undefined) porBarra.set(t, s);
      else if (y !== s) { spotDoble++; if (ejemplos.length < 10) ejemplos.push(`${d}${letra} ${t}: dos spots ${y} vs ${s}`); }
    }
    for (const [, v] of porBarra) if (Array.isArray(v)) barrasConDosSpots++;
  }
}
console.log(`   filas leídas ......................... ${filasLeidas.toLocaleString("es-ES")}`);
console.log(`   filas con timestamp ≠ underlying_ts .. ${tsDistinto}`);
console.log(`   filas con un 2º precio de subyacente . ${spotDoble}   (misma barra, precio distinto)`);
if (ejemplos.length) console.log("   ejemplos:\n     " + ejemplos.join("\n     "));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASADA — una ficha por día, con TODO lo que hace falta para las pruebas.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const fichas = [];
const fallos = { sinStraddle: 0, sin1000: 0, sin1555: 0, salidaNoPosterior: 0 };
for (const d of todos) {
  const D = cargarDia(d);
  if (!D) continue;
  const i0 = idxHora(D, "09:35");
  if (i0 < 0) continue;
  const b0 = D.barras[i0], spot0 = b0.spot, K = rejilla(spot0);
  const askC = compraEn(b0, K, "C"), askP = compraEn(b0, K, "P");
  if (!(askC > 0) || !(askP > 0)) { fallos.sinStraddle++; continue; }

  const iE = idxHora(D, "10:00");
  const i55 = idxHora(D, "15:55");
  if (iE < 0) fallos.sin1000++;
  if (i55 < 0) fallos.sin1555++;
  const iFin = i55 >= 0 ? i55 : D.barras.length - 1;
  if (iE >= 0 && iFin <= iE) fallos.salidaNoPosterior++;

  const f = {
    dia: d, ano: d.slice(0, 4), spot0, K, rel: (askC + askP) / spot0,
    iE, iFin, cae1555: i55 >= 0,
    spot10: iE >= 0 ? D.barras[iE].spot : null,
    spot1555: i55 >= 0 ? D.barras[i55].spot : null,
  };
  if (iE >= 0 && iFin > iE) {
    const bm = D.barras[iE], Km = rejilla(bm.spot);
    const ladoReal = bm.spot >= spot0 ? "C" : "P";
    f.mom = operar(D, iE, iFin, Km, ladoReal);                       // el titular
    f.momCall = operar(D, iE, iFin, Km, "C");                        // simetría: siempre call
    f.momPut = operar(D, iE, iFin, Km, "P");                         // simetría: siempre put
    // (C) FUGA DELIBERADA — dirección leída del cierre. Es la calibración de "cómo se ve una fuga".
    if (f.spot1555 != null) {
      const ladoFuturo = f.spot1555 >= bm.spot ? "C" : "P";
      f.momFuga = operar(D, iE, iFin, Km, ladoFuturo);
    }
  }
  fichas.push(f);
}
console.log(`\n══ B) ORDEN DE ÍNDICES Y BARRAS ════════════════════════════════════════════════`);
console.log(`   fichas .................................... ${fichas.length}`);
console.log(`   días sin straddle a las 09:35 (descartados) ${fallos.sinStraddle}`);
console.log(`   días SIN barra 10:00 ...................... ${fallos.sin1000}`);
console.log(`   días SIN barra 15:55 (caerían al cierre) .. ${fallos.sin1555}`);
console.log(`   casos con salida NO posterior a la entrada . ${fallos.salidaNoPosterior}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// EL FILTRO — igual que el original (causal) y su placebo (mirando adelante).
// ═══════════════════════════════════════════════════════════════════════════════════════════
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const MIN_HIST = 60, VENTANA = 250;

function etiquetar(campoRatio, campoCubo, ventanaAtras) {
  for (let i = 0; i < fichas.length; i++) {
    const prev = ventanaAtras
      ? fichas.slice(Math.max(0, i - 20), i).map((f) => f.rel)
      : fichas.slice(i + 1, i + 21).map((f) => f.rel);       // PLACEBO: los 20 días SIGUIENTES
    fichas[i][campoRatio] = prev.length >= 20 ? fichas[i].rel / mediana(prev) : null;
  }
  for (let i = 0; i < fichas.length; i++) {
    if (fichas[i][campoRatio] == null) { fichas[i][campoCubo] = null; continue; }
    const hist = [];
    for (let j = Math.max(0, i - VENTANA); j < i; j++) if (fichas[j][campoRatio] != null) hist.push(fichas[j][campoRatio]);
    if (hist.length < MIN_HIST) { fichas[i][campoCubo] = null; continue; }
    const p = hist.filter((x) => x < fichas[i][campoRatio]).length / hist.length;
    fichas[i][campoCubo] = Math.min(4, Math.floor(p * 5));
  }
}
etiquetar("ratio", "cubo", true);
etiquetar("ratioF", "cuboF", false);

const conCubo = fichas.filter((f) => f.cubo != null);
const ANOS = (new Date(fichas[fichas.length - 1].dia) - new Date(fichas[0].dia)) / (365.25 * 24 * 3600 * 1000);

function medir(grupo, ex) {
  const r = [], dd = [];
  let nulos = 0;
  for (const f of grupo) { const o = ex(f); if (!o) { nulos++; continue; } r.push(o.ret); dd.push(o.dolares); }
  const R = resumen(r);
  const dm = dd.length ? media(dd) : NaN;
  const Rd = resumen(dd);
  return { n: R.n, media: R.media, t: R.t, aciertos: R.aciertos, dolMedio: dm, tDol: Rd.t, dolAno: (dd.length / ANOS) * dm, nulos, dd };
}
const exMom = (f) => f.mom ?? null;
const fila = (e, m) => `${e.padEnd(38)} n=${String(m.n).padStart(4)}  ${pc(m.media).padStart(9)}  t=${n2(m.t).padStart(6)}  ${d0(m.dolMedio).padStart(7)}/op  t$=${n2(m.tDol).padStart(6)}  ${d0(m.dolAno).padStart(10)}/año  huecos ${m.nulos}`;

const barato = conCubo.filter((f) => f.cubo === 0);
console.log(`\n══ EL TITULAR RECONSTRUIDO ═════════════════════════════════════════════════════`);
console.log(fila("momento 10:00→15:55 · BARATOS", medir(barato, exMom)));
console.log(fila("momento 10:00→15:55 · TODOS (listón)", medir(fichas, exMom)));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C) CÓMO SE VE UNA FUGA DE VERDAD
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n══ C) CALIBRACIÓN — la MISMA regla con la dirección leída del CIERRE (fuga real) ═`);
console.log(fila("fuga deliberada · BARATOS", medir(barato, (f) => f.momFuga ?? null)));
console.log(fila("fuga deliberada · TODOS", medir(fichas, (f) => f.momFuga ?? null)));
console.log("   → si el titular tuviera fuga, se parecería a ESTO, no a lo que da.");

// ═══════════════════════════════════════════════════════════════════════════════════════════
// D) PLACEBO DEL FILTRO — "barato" contra los 20 días SIGUIENTES
// ═══════════════════════════════════════════════════════════════════════════════════════════
const baratoF = fichas.filter((f) => f.cuboF === 0);
console.log(`\n══ D) PLACEBO — "barato" definido con los 20 días SIGUIENTES ═══════════════════`);
console.log(fila("momento · BARATO-del-futuro", medir(baratoF, exMom)));
const solap = baratoF.filter((f) => f.cubo === 0).length;
console.log(`   días que las dos definiciones marcan iguales: ${solap} de ${baratoF.length} (${pc(solap / baratoF.length)})`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// E) BARAJADO COMPLETO — todos los desplazamientos, no cinco
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n══ E) BARAJADO COMPLETO — los ${conCubo.length - 1} desplazamientos posibles ═══════════════════`);
const real = medir(barato, exMom);
const medias = [], dolares = [];
for (let s = 1; s < conCubo.length; s++) {
  const g = conCubo.filter((f, i) => conCubo[(i + s) % conCubo.length].cubo === 0);
  const m = medir(g, exMom);
  medias.push(m.media); dolares.push(m.dolMedio);
}
const ordM = [...medias].sort((a, b) => a - b), ordD = [...dolares].sort((a, b) => a - b);
const qq = (v, p) => v[Math.floor(p * (v.length - 1))];
const pctSup = (v, x) => v.filter((y) => y >= x).length / v.length;
console.log(`   media% barajada: p05 ${pc(qq(ordM, 0.05))}  mediana ${pc(qq(ordM, 0.5))}  p95 ${pc(qq(ordM, 0.95))}  max ${pc(ordM[ordM.length - 1])}`);
console.log(`   el REAL (${pc(real.media)}) lo superan ${pc(pctSup(medias, real.media))} de los barajados`);
console.log(`   $/op barajado  : p05 ${d0(qq(ordD, 0.05))}  mediana ${d0(qq(ordD, 0.5))}  p95 ${d0(qq(ordD, 0.95))}  max ${d0(ordD[ordD.length - 1])}`);
console.log(`   el REAL (${d0(real.dolMedio)}/op) lo superan ${pc(pctSup(dolares, real.dolMedio))} de los barajados`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// F) EL DENOMINADOR — ¿el % está inflado porque el billete es barato?
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n══ F) EL DENOMINADOR ═══════════════════════════════════════════════════════════`);
const costeDe = (g) => media(g.filter((f) => f.mom).map((f) => f.mom.coste));
console.log(`   coste medio del contrato · BARATOS ${n2(costeDe(barato))} pts = ${d0(costeDe(barato) * 100)}`);
console.log(`   coste medio del contrato · TODOS   ${n2(costeDe(fichas))} pts = ${d0(costeDe(fichas) * 100)}`);
const todosM = medir(fichas, exMom);
console.log(`   BARATOS: ${pc(real.media)} sobre ${d0(costeDe(barato) * 100)} = ${d0(real.dolMedio)}/op`);
console.log(`   TODOS  : ${pc(todosM.media)} sobre ${d0(costeDe(fichas) * 100)} = ${d0(todosM.dolMedio)}/op`);
console.log(`   ventaja en % = ${n2((real.media - todosM.media) * 100)} puntos · ventaja en DÓLARES = ${d0(real.dolMedio - todosM.dolMedio)}/op`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// G) CONCENTRACIÓN — quitar los k mejores días
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n══ G) CONCENTRACIÓN — quitar los k días más ganadores ══════════════════════════`);
const dd = [...real.dd].sort((a, b) => b - a);
for (const k of [0, 1, 2, 3, 5, 10]) {
  const resto = dd.slice(k);
  const m = media(resto);
  console.log(`   sin los ${String(k).padStart(2)} mejores: n=${resto.length}  ${d0(m).padStart(7)}/op  ${d0((resto.length / ANOS) * m).padStart(9)}/año   (t$=${n2(resumen(resto).t)})`);
}
console.log(`   los 5 mejores días valen: ${dd.slice(0, 5).map(d0).join("  ")}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// H) SIMETRÍA DE VERDAD + mitades/tercios/años EN DÓLARES
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n══ H) SIMETRÍA — en los días baratos, comprar SIEMPRE call / SIEMPRE put ═══════`);
console.log(fila("BARATOS · siempre CALL 10:00→15:55", medir(barato, (f) => f.momCall ?? null)));
console.log(fila("BARATOS · siempre PUT  10:00→15:55", medir(barato, (f) => f.momPut ?? null)));

console.log(`\n══ I) MITADES / TERCIOS / AÑOS DEL TITULAR, EN DÓLARES ═════════════════════════`);
const n = barato.length;
const trozo = (g, e) => { const m = medir(g, exMom); console.log(`   ${e.padEnd(12)} n=${String(m.n).padStart(3)}  ${pc(m.media).padStart(9)}  ${d0(m.dolMedio).padStart(7)}/op  ${d0(m.dolAno).padStart(9)}/año`); };
trozo(barato.slice(0, n >> 1), "mitad 1");
trozo(barato.slice(n >> 1), "mitad 2");
trozo(barato.slice(0, Math.floor(n / 3)), "tercio 1");
trozo(barato.slice(Math.floor(n / 3), Math.floor(2 * n / 3)), "tercio 2");
trozo(barato.slice(Math.floor(2 * n / 3)), "tercio 3");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) trozo(barato.filter((f) => f.ano === a), a);
