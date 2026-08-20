// ═══════════════════════════════════════════════════════════════════════════════════════════
// OPERAR · OPCIONES (3) — EL CONTROL QUE DECIDE.
//
// La rejilla dejó UN positivo con algo de cuerpo: la vertical de débito en la dirección del
// imán, dejada vencer (t=1,31 · $7.606/año). Aquí se le hacen las tres preguntas que lo matan
// o lo dejan vivo, con EL MISMO motor (opc-lib.mjs), no con una copia parecida:
//
//   C1 · LADO AL AZAR — la misma vertical, el mismo día, el lado a cara o cruz.
//   C2 · NIVEL AL AZAR A LA MISMA DISTANCIA — se conserva |distancia| al nivel y se sortea el
//        signo: si el imán no le gana a una línea puesta al azar igual de lejos, no existe.
//   C3 · SIEMPRE LARGO — el control honesto de la DERIVA: el SPX sube más días de los que baja,
//        así que un "acierto" direccional puede ser sólo eso. ¿Aporta el nivel algo por encima
//        de comprar la vertical alcista todos los días?
//
// Y la contabilidad final: peor día, peor racha, cuántos contratos caben, y años necesarios.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/opc-3-control.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { writeFileSync } from "node:fs";
import { cargar, operar, señal, listonT, exigir, media, sd, tOf, pctl, med, f2, f0, rng, rachas, CUENTA, EFECTIVO } from "./opc-lib.mjs";

const SORTEOS = 400;
const LISTON = listonT(32);
const { nivPorFecha, CACHE } = cargar();

console.log("\n" + "═".repeat(97));
console.log(`OPERAR · OPCIONES (3) — EL CONTROL · ${SORTEOS} sorteos · listón |t| ≥ ${LISTON}`);
console.log("═".repeat(97));

// ── construir las operaciones reales de un caso ────────────────────────────────────────────
function correr(sid, vid, xid, ladoDe, objDe) {
  const ops = [];
  for (const d of CACHE) {
    const f = nivPorFecha.get(d.f); if (!f) continue;
    const s = señal(f, sid); if (!s) continue;
    const lado = ladoDe ? ladoDe(d, f, s) : s.lado;
    const obj = objDe ? objDe(d, f, s, lado) : s.objetivo;
    if (!lado) continue;
    const o = operar(d, lado, obj, vid, xid);
    if (o.fuera) continue;
    ops.push({ ...o, fecha: d.f, ano: +d.f.slice(0, 4) });
  }
  return ops;
}

const CASOS = [["S1", "VERT", "VENC", "vertical ATM→0,5% hacia el imán, dejada vencer"],
               ["S1", "ATM", "VENC", "call/put ATM hacia el imán, dejada vencer"],
               ["S2", "ATM", "VENC", "call/put ATM hacia el giro, dejada vencer"]];

const salida = {};
for (const [sid, vid, xid, nombre] of CASOS) {
  const real = correr(sid, vid, xid);
  const pnl = real.map((o) => o.pnl);
  exigir(real.length > 300, `muestra corta en ${sid}|${vid}|${xid}: ${real.length}`);
  const porAno = 252 * (real.length / CACHE.length);

  console.log(`\n${"─".repeat(97)}`);
  console.log(`## ${nombre}`);
  console.log(`   n=${real.length} · $${f2(media(pnl))}/op · t=${f2(tOf(pnl))} · $${f0(media(pnl) * porAno)}/año · gana el ${(100 * pnl.filter((x) => x > 0).length / pnl.length).toFixed(1)}%`);

  const rnd = rng(9137);
  const nubes = { C1: [], C2: [], C3: [] };
  for (let s = 0; s < SORTEOS; s++) {
    // C1 · lado al azar
    const c1 = correr(sid, vid, xid, () => (rnd() < 0.5 ? 1 : -1));
    nubes.C1.push(media(c1.map((o) => o.pnl)));
    // C2 · nivel al azar a la MISMA distancia (se conserva |dist|, se sortea el signo)
    const c2 = correr(sid, vid, xid,
      (d, f, sg) => (rnd() < 0.5 ? 1 : -1),
      (d, f, sg, lado) => f.apertura + lado * Math.abs(sg.objetivo - f.apertura));
    nubes.C2.push(media(c2.map((o) => o.pnl)));
  }
  // C3 · siempre largo (determinista, no hace falta sortear)
  const c3 = correr(sid, vid, xid, () => 1);
  const c3pnl = c3.map((o) => o.pnl);

  const pctilDe = (nube, v) => 100 * nube.filter((x) => x < v).length / nube.length;
  const real$ = media(pnl);
  for (const [k, et] of [["C1", "lado al azar"], ["C2", "nivel al azar a la misma distancia"]]) {
    const nb = nubes[k], m = media(nb), s = sd(nb);
    console.log(`   ${et.padEnd(38)} azar $${f2(m).padStart(8)}/op (sd ${f2(s)}) · real $${f2(real$)} · z=${f2((real$ - m) / s).padStart(6)} · percentil ${f2(pctilDe(nb, real$))}`);
  }
  console.log(`   ${"siempre largo (la deriva)".padEnd(38)} $${f2(media(c3pnl)).padStart(8)}/op · t=${f2(tOf(c3pnl))} · el nivel aporta $${f2(real$ - media(c3pnl))}/op`);
  const ladoLargo = 100 * real.filter((o) => o.lado > 0).length / real.length;
  console.log(`   (el nivel manda comprar CALL el ${ladoLargo.toFixed(1)}% de los días)`);

  // cruce
  const A = real.filter((o) => o.ano <= 2023).map((o) => o.pnl), B = real.filter((o) => o.ano >= 2024).map((o) => o.pnl);
  const c3A = c3.filter((o) => o.ano <= 2023).map((o) => o.pnl), c3B = c3.filter((o) => o.ano >= 2024).map((o) => o.pnl);
  console.log(`   CRUCE  A(22-23) n=${A.length} $${f2(media(A))}/op t=${f2(tOf(A))} · B(24-26) n=${B.length} $${f2(media(B))}/op t=${f2(tOf(B))} · mismo signo ${Math.sign(media(A)) === Math.sign(media(B)) ? "SÍ" : "no"}`);
  console.log(`          contra la deriva: A ${f2(media(A) - media(c3A))} · B ${f2(media(B) - media(c3B))}`);

  // contabilidad
  const ord = real.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const r = rachas(ord.map((o) => o.pnl));
  const peorDia = Math.min(...pnl);
  const ic = 1.96 * sd(pnl) / Math.sqrt(pnl.length);
  const nAnos = Math.ceil(((2 * sd(pnl) / (media(pnl) || 1e-9)) ** 2) / porAno);
  const contratos = Math.max(1, Math.floor(EFECTIVO / med(real.map((o) => o.riesgo))));
  console.log(`   DINERO 1 contrato: $${f0(media(pnl) * porAno)}/año · IC95 [$${f0((media(pnl) - ic) * porAno)}, $${f0((media(pnl) + ic) * porAno)}]`);
  console.log(`          riesgo/op p50 $${f0(med(real.map((o) => o.riesgo)))} · con $${f0(EFECTIVO)} de efectivo caben ${contratos} contratos`);
  console.log(`          peor día $${f0(peorDia)} · peor racha ${r.peor} días · peor caída acumulada $${f0(r.caida)}`);
  console.log(`          sobre la cuenta de $${f0(CUENTA)}: ${f2(100 * media(pnl) * porAno / CUENTA)}%/año con 1 contrato`);
  console.log(`          AÑOS necesarios para que |t| llegue a 2: ${nAnos}`);

  salida[`${sid}|${vid}|${xid}`] = {
    nombre, n: real.length, mediaOp: media(pnl), t: tOf(pnl), anual: media(pnl) * porAno, porAno,
    ganaPct: 100 * pnl.filter((x) => x > 0).length / pnl.length,
    C1: { azar: media(nubes.C1), z: (real$ - media(nubes.C1)) / sd(nubes.C1), pctil: pctilDe(nubes.C1, real$) },
    C2: { azar: media(nubes.C2), z: (real$ - media(nubes.C2)) / sd(nubes.C2), pctil: pctilDe(nubes.C2, real$) },
    C3: { deriva: media(c3pnl), aporte: real$ - media(c3pnl), tDeriva: tOf(c3pnl) },
    cruce: { nA: A.length, mA: media(A), tA: tOf(A), nB: B.length, mB: media(B), tB: tOf(B), mismoSigno: Math.sign(media(A)) === Math.sign(media(B)) },
    riesgoP50: med(real.map((o) => o.riesgo)), contratos, peorDia, peorRacha: r.peor, peorCaida: r.caida,
    ic95: [(media(pnl) - ic) * porAno, (media(pnl) + ic) * porAno], anosNecesarios: nAnos,
  };
}

writeFileSync("scripts/opc-3-resultado.json", JSON.stringify({ generado: new Date().toISOString(), sorteos: SORTEOS, liston: LISTON, cuenta: CUENTA, casos: salida }, null, 1), "utf8");
console.log(`\n   escrito scripts/opc-3-resultado.json`);
console.log("\n" + "═".repeat(97) + "\n");
