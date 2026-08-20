// ═══════════════════════════════════════════════════════════════════════════════════════════
// OPERAR · OPCIONES (4) — EL PUENTE: de qué está hecho el peaje y qué le faltaría a esto.
//
// 1 · DE QUÉ ESTÁ HECHO EL COSTE. El encargo suponía que la horquilla (3-13% de la prima) era
//     lo que mataba al comprador de 0DTE. Medido: a las 09:35 la horquilla es el 1,5% de la
//     prima. Lo que mata al comprador es OTRA cosa, y aquí se separan las dos.
// 2 · ¿LLEGA EL PRECIO AL IMÁN? El nivel promete 54,8 puntos y el punto muerto está en 16,1.
//     Sobre el papel sobra. Se mide cuántas veces el precio llega de verdad — y se compara con
//     una línea al azar a la misma distancia.
// 3 · EL TAMAÑO. El cuello de botella no es el efectivo, es la caída acumulada.
// 4 · QUÉ HARÍA FALTA para que el mejor candidato pasara el listón.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/opc-4-puente.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { writeFileSync } from "node:fs";
import { cargar, operar, señal, listonT, exigir, media, sd, tOf, pctl, med, f2, f0, rng, rachas, CUENTA, EFECTIVO } from "./opc-lib.mjs";

const LISTON = listonT(32);
const { nivPorFecha, CACHE } = cargar();
console.log("\n" + "═".repeat(97));
console.log(`OPERAR · OPCIONES (4) — EL PUENTE`);
console.log("═".repeat(97));

// ═══ 1 · DE QUÉ ESTÁ HECHO EL COSTE DE UNA 0DTE ATM ═════════════════════════════════════════
console.log(`\n## 1 · DE QUÉ ESTÁ HECHO EL COSTE — se compra al ASK una ATM a las 09:35\n`);
{
  const filas = [];
  for (const d of CACHE) {
    const f = nivPorFecha.get(d.f); if (!f) continue;
    const S0 = d.S[0]; if (!(S0 > 0)) continue;
    let iA = -1, mejor = Infinity;
    for (let i = 0; i < d.K.length; i++) { const x = Math.abs(d.K[i] - S0); if (x < mejor) { mejor = x; iA = i; } }
    const ask = d.ca[iA][0], bid = d.cb[iA][0];
    if (!(ask > 0) || !(bid > 0)) continue;
    const K = d.K[iA];
    const intrinseco = Math.max(0, S0 - K);
    const extrinseco = ask - intrinseco;             // lo que se paga por el TIEMPO
    const horquilla = ask - bid;
    filas.push({ ask, bid, K, S0, intrinseco, extrinseco, horquilla, mov: Math.abs(d.S[d.S.length - 1] - S0) });
  }
  exigir(filas.length > 900, `pocas filas para descomponer el coste: ${filas.length}`);
  const A = med(filas.map((x) => x.ask)), E = med(filas.map((x) => x.extrinseco)), H = med(filas.map((x) => x.horquilla));
  console.log(`   n=${filas.length} días · prima ATM pagada (ASK) p50 ${f2(A)} pts = $${f0(A * 100)}`);
  console.log(`      de eso, VALOR TIEMPO (extrínseco) ...... ${f2(E)} pts = $${f0(E * 100)}  → ${(100 * E / A).toFixed(0)}% del coste`);
  console.log(`      de eso, HORQUILLA (ask − bid) .......... ${f2(H)} pts = $${f0(H * 100)}  → ${(100 * H / A).toFixed(1)}% del coste`);
  console.log(`\n   El peaje que se lleva el dinero NO es la horquilla: es el VALOR TIEMPO.`);
  console.log(`   Comprar la ATM obliga a que el índice se mueva ${f2(E)} pts A FAVOR sólo para empatar.`);
  console.log(`   El índice se mueve (|cierre − 09:35|) p50 ${f2(med(filas.map((x) => x.mov)))} pts — y la mitad de las veces`);
  console.log(`   hacia el otro lado. Por eso la ATM larga gana el 37,5% de las veces.`);
}

// ═══ 2 · ¿LLEGA EL PRECIO AL IMÁN? ═════════════════════════════════════════════════════════
console.log(`\n\n## 2 · ¿LLEGA EL PRECIO AL NIVEL? — el imán contra una línea al azar a la misma distancia\n`);
{
  const rnd = rng(5150);
  const filas = [];
  for (const d of CACHE) {
    const f = nivPorFecha.get(d.f); if (!f) continue;
    const s = señal(f, "S1"); if (!s) continue;
    const S0 = d.S[0], dist = Math.abs(s.objetivo - f.apertura);
    if (!(S0 > 0) || !(dist > 0)) continue;
    const toca = (obj, lado) => d.S.some((S, j) => j > 0 && (lado > 0 ? S >= obj : S <= obj));
    filas.push({ dist, real: toca(s.objetivo, s.lado), azar: toca(S0 + (rnd() < 0.5 ? 1 : -1) * dist, 0) || false,
      azarLado: (() => { const L = rnd() < 0.5 ? 1 : -1; return toca(S0 + L * dist, L); })() });
  }
  exigir(filas.length > 400, `pocas filas de toque: ${filas.length}`);
  const tocaReal = 100 * filas.filter((x) => x.real).length / filas.length;
  const tocaAzar = 100 * filas.filter((x) => x.azarLado).length / filas.length;
  console.log(`   n=${filas.length} días de gamma neta negativa · distancia al imán p50 ${f2(med(filas.map((x) => x.dist)))} pts`);
  console.log(`   el precio LLEGA al imán en el ${tocaReal.toFixed(1)}% de los días`);
  console.log(`   una línea AL AZAR a la misma distancia se toca el ${tocaAzar.toFixed(1)}% de los días`);
  console.log(`   diferencia: ${(tocaReal - tocaAzar).toFixed(1)} puntos porcentuales`);
  console.log(`\n   → el imán NO atrae más que una línea cualquiera puesta igual de lejos.`);
  console.log(`     Lo poco que hay no está en que el precio LLEGUE, está en el LADO al que se inclina.`);
}

// ═══ 3 · EL TAMAÑO ══════════════════════════════════════════════════════════════════════════
console.log(`\n\n## 3 · EL TAMAÑO — el cuello de botella no es el efectivo, es la caída acumulada\n`);
let cand = null;
{
  const ops = [];
  for (const d of CACHE) {
    const f = nivPorFecha.get(d.f); if (!f) continue;
    const s = señal(f, "S1"); if (!s) continue;
    const o = operar(d, s.lado, s.objetivo, "VERT", "VENC");
    if (o.fuera) continue;
    ops.push({ ...o, fecha: d.f, ano: +d.f.slice(0, 4) });
  }
  ops.sort((a, b) => a.fecha.localeCompare(b.fecha));
  cand = ops;
  const pnl = ops.map((o) => o.pnl);
  const porAno = 252 * (ops.length / CACHE.length);
  const r = rachas(pnl);
  const riesgoP50 = med(ops.map((o) => o.riesgo));
  console.log(`   vertical ATM→0,5% hacia el imán, dejada vencer · n=${ops.length} · $${f2(media(pnl))}/op`);
  console.log(`   riesgo por contrato p50 $${f0(riesgoP50)} · efectivo disponible $${f0(EFECTIVO)}\n`);
  console.log(`   ${"contratos".padStart(9)} ${"efectivo".padStart(10)} ${"$/año".padStart(11)} ${"% cuenta".padStart(9)} ${"peor caída".padStart(12)} ${"% cuenta".padStart(9)}  ¿aguanta?`);
  for (const c of [1, 2, 3, 4, 5, 8]) {
    const necesita = riesgoP50 * c, anual = media(pnl) * porAno * c, caida = r.caida * c;
    const ok = necesita <= EFECTIVO && Math.abs(caida) < CUENTA * 0.25;
    console.log(`   ${String(c).padStart(9)} ${("$" + f0(necesita)).padStart(10)} ${("$" + f0(anual)).padStart(11)} ${(f2(100 * anual / CUENTA) + "%").padStart(9)} ${("$" + f0(caida)).padStart(12)} ${(f2(100 * Math.abs(caida) / CUENTA) + "%").padStart(9)}  ${ok ? "sí" : "NO"}`);
  }
  console.log(`\n   Con 8 contratos (lo que permite el efectivo) la peor caída son $${f0(Math.abs(r.caida) * 8)} sobre una`);
  console.log(`   cuenta de $${f0(CUENTA)}: ruina. El tamaño que la caída tolera es 1-2 contratos, no 8.`);
}

// ═══ 4 · QUÉ HARÍA FALTA ════════════════════════════════════════════════════════════════════
console.log(`\n\n## 4 · QUÉ LE FALTARÍA PARA PASAR EL LISTÓN\n`);
{
  const pnl = cand.map((o) => o.pnl);
  const porAno = 252 * (cand.length / CACHE.length);
  const s = sd(pnl), m = media(pnl), t = tOf(pnl);
  const nNec = Math.ceil((LISTON * s / m) ** 2);
  console.log(`   hoy: n=${cand.length} · $${f2(m)}/op · desviación $${f2(s)} · t=${f2(t)} · listón ${LISTON}`);
  console.log(`   (a) MÁS MUESTRA con el mismo tamaño de efecto:`);
  console.log(`       hacen falta n=${f0(nNec)} operaciones → ${f0(nNec / porAno)} años más de días de gamma negativa.`);
  console.log(`       No es una vía: el propio efecto ya se parte por la mitad de A a B ($88,99 → $45,91).`);
  const mNec = LISTON * s / Math.sqrt(cand.length);
  console.log(`   (b) MÁS EFECTO con la muestra que hay:`);
  console.log(`       harían falta $${f2(mNec)}/op — ${f2(mNec / m)}× lo que da ($${f2(m)}).`);
  console.log(`   (c) MENOS RUIDO: la desviación es $${f2(s)} contra una media de $${f2(m)}.`);
  console.log(`       La vertical ya recortó la cola (peor día $${f0(Math.min(...pnl))} contra $-7.610 de la ATM larga).`);
  console.log(`       Estrechar más el ancho baja el ruido pero también el techo — es el mismo trato.`);
  console.log(`\n   LO QUE SÍ SE APRENDE, y es reutilizable:`);
  console.log(`     · el contenedor importa más que la señal: MISMA dirección, la ATM larga da t=0,20 y`);
  console.log(`       la vertical t=1,31. La diferencia es el valor tiempo que no se paga.`);
  console.log(`     · tomar beneficio EN el nivel destruye valor (t=−2,2 a −2,5 en la rejilla): el nivel`);
  console.log(`       recorta a los ganadores y deja correr a los perdedores.`);
  console.log(`     · el imán no ATRAE (0,2 pp sobre el azar en toques); si algo hay, es el LADO.`);
}

writeFileSync("scripts/opc-4-resultado.json", JSON.stringify({ generado: new Date().toISOString(), liston: LISTON }, null, 1), "utf8");
console.log("\n" + "═".repeat(97) + "\n");
