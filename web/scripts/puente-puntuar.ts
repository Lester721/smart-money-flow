// ¿ALGUNO DE LOS SIETE INDICADORES SEPARA LOS MESES BUENOS DE LOS MALOS?
//
// Uso: npx tsx scripts/puente-puntuar.ts
// Entrada: scripts/puente-filas.json (lo produce puente-se-veia-venir.mjs)
//
// ═══ EL CRITERIO, ESCRITO ANTES DE MIRAR NINGÚN NÚMERO ════════════════════════════════════
//
// SIETE PRUEBAS, una por indicador. Listón de Bonferroni para 7.
//
// Cada una parte los (acción, mes) en tercios por el indicador y compara lo que devolvieron las
// calls largas y fuera del dinero compradas en el tercio alto contra el tercio bajo. Pasa si, y
// sólo si, las cuatro cribas de `pasarBarrera()`: muestra, concentración por ticker, mismo signo
// en los tres tercios de TIEMPO, y |t| sobre el listón.
//
// ⚠️ LO QUE ESTE TEST NO PUEDE DAR, Y HAY QUE DECIRLO ANTES: los 8 símbolos se mueven juntos, así
// que 960 ticker-meses NO son 960 observaciones independientes — son ~120 períodos. La criba de
// concentración por ticker no protege de eso. Un positivo aquí es una PISTA que hay que confirmar
// con más símbolos, nunca una conclusión.

import { readFileSync } from "node:fs";
import { pasarBarrera, potencia, informe, type FilaHallazgo } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const PRUEBAS = 22;   // 7 indicadores x 2 medidas del resultado (media y frecuencia)
const INDICADORES = [
  ["oiLejos", "% del OI en strikes >60% arriba"],
  // LA MISMA IDEA PESADA POR DOLARES. Contar contratos ignora que mil contratos sobre un strike de
  // $500 obligan a mover 25 veces mas dinero que mil sobre uno de $20. Si el mecanismo es la
  // cobertura del creador de mercado, esto tiene que separar MAS que contar contratos.
  ["nocLejos", "% del NOCIONAL en strikes >60% arriba"],
  ["nocLejosD3", "cambio del nocional en 3 meses"],
  // LOS DOS ULTIMOS ESCALONES. gamLejos ES el GEX aplicado a acciones y a plazo largo.
  ["dolLejos", "% del DELTA-DOLAR en strikes >60% arriba"],
  ["gamLejos", "% de la GAMMA-DOLAR en strikes >60% arriba"],
  ["oiLejosD3", "cambio de eso en 3 meses"],
  ["ratioCP", "OI de calls / OI de puts"],
  ["ratioCPD3", "cambio de eso en 3 meses"],
  ["skew", "call 30% fuera / put 30% fuera"],
  ["barata", "prima del cubo / precio"],
  ["momento3m", "subida de la acción en 3 meses"],
] as const;

interface Fila {
  ticker: string; mes: string; n: number; resultado: number;
  nocLejos: number | null; nocLejosD3: number | null; dolLejos: number | null; gamLejos: number | null;
  oiLejos: number | null; oiLejosD3: number | null; ratioCP: number | null; ratioCPD3: number | null;
  skew: number | null; barata: number | null; momento3m: number | null;
}

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

function main() {
  const filas: Fila[] = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8"));
  if (!filas.length) { console.error("puente-filas.json vacío"); process.exit(1); }

  console.log(`${filas.length} observaciones (acción, mes)\n`);
  // ANTES DE MEDIR NADA: ¿de qué están hechos estos datos? Lanza si algún campo está muerto.
  // Esto es lo que faltaba el 2026-08-16, cuando `oiLejos` tenía 570 ceros de 573 y produjo una
  // separación con t=5,59 que pareció el mejor hallazgo del proyecto durante media hora.
  radiografia(filas, ["resultado", ...INDICADORES.map(([c]) => c)], "puente",
    // El CERO es el resultado normal aqui: la opcion expira sin valor. Con los 28 tickers —ya con
    // perdedores dentro— pasa en el 57% de los meses. Eso es la tasa base de la estrategia, no un
    // hueco. Los PREDICTORES siguen protegidos.
    { cerosLegitimos: ["resultado"] });

  const porTicker = new Map<string, number>();
  for (const f of filas) porTicker.set(f.ticker, (porTicker.get(f.ticker) ?? 0) + 1);
  console.log("reparto: " + [...porTicker].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join(" · "));
  const r = filas.map((f) => f.resultado);
  console.log(`resultado a explicar: media ${media(r).toFixed(2)}x · mediana ${[...r].sort((a, b) => a - b)[r.length >> 1].toFixed(2)}x` +
              ` · meses que perdieron dinero: ${r.filter((x) => x < 1).length} de ${r.length}\n`);

  // ── DOS MEDIDAS DEL RESULTADO, Y LA SEGUNDA ES LA IMPORTANTE ──────────────
  //
  // El resultado tiene media 4,98x y MEDIANA 0,17x: 356 de 573 meses pierden dinero y el promedio
  // lo cargan unos pocos meses explosivos. Comparar MEDIAS de una distribución así es inestable —
  // un solo mes de 50x en el tercio equivocado da una separación de −1340%, que es exactamente lo
  // que salió en el primer tercio de tiempo y lo que hizo parecer que el indicador "se invertía".
  //
  // La forma correcta de analizar pagos de lotería es por FRECUENCIA: ¿en qué fracción de los meses
  // la apuesta acabó por encima de lo invertido? Eso no lo mueve un solo mes extremo.
  const MEDIDAS = [
    ["multiplo", "media del múltiplo", (f: Fila) => f.resultado],
    ["ganadores", "% de meses que ganaron", (f: Fila) => (f.resultado > 1 ? 1 : 0)],
  ] as const;

  const res: { nombre: string; v: ReturnType<typeof pasarBarrera>; n: number }[] = [];
  for (const [, etiqueta, medir] of MEDIDAS) {
    for (const [campo, nombre] of INDICADORES) {
      const sel = filas.filter((f) => f[campo] != null && Number.isFinite(f[campo] as number));
      if (sel.length < 60) continue;
      const hall: FilaHallazgo[] = sel.map((f) => ({
        pnl: medir(f), ticker: f.ticker,
        fecha: `${f.mes.slice(0, 4)}-${f.mes.slice(4, 6)}-01`,
      }));
      const clave = new Map(hall.map((h, i) => [h, sel[i][campo] as number]));
      res.push({ nombre: `${nombre}  [${etiqueta}]`, n: sel.length,
                 v: pasarBarrera(hall, (h) => clave.get(h)!, { pruebas: PRUEBAS, nMinimo: 60 }) });
    }
  }

  console.log(`═══ LAS ${PRUEBAS} PRUEBAS ═══`);
  console.log(`(listón de Bonferroni: |t| ≥ ${res[0]?.v.detalle.listonT ?? "?"})\n`);
  console.log("indicador                              n     separación       t    ¿pasa?");
  for (const x of res) {
    const d = x.v.detalle;
    console.log(`${x.nombre.padEnd(36)} ${String(x.n).padStart(4)}   ` +
                `${(d.sep == null ? "—" : (d.sep >= 0 ? "+" : "−") + Math.abs(d.sep).toFixed(2) + "x").padStart(10)}   ` +
                `${(d.t == null ? "—" : d.t.toFixed(2)).padStart(6)}    ${x.v.pasa ? "✅ SÍ" : "no"}`);
  }

  const pasan = res.filter((x) => x.v.pasa);
  console.log(`\n${pasan.length} de ${res.length} pasan las cuatro cribas.`);
  // Se imprime el informe de TODOS los que superan el estadístico, pasen o no las cuatro cribas.
  // Saber POR QUÉ falla un candidato fuerte es la información útil: no es lo mismo "no separa" que
  // "separa, pero el efecto vive en un solo ticker o en un solo período".
  for (const x of res) {
    const d = x.v.detalle;
    if (!x.v.pasa && Math.abs(d.t ?? 0) < d.listonT) continue;
    console.log("\n" + informe(x.v, x.nombre));
  }

  if (!pasan.length) {
    console.log("\n═══ POTENCIA — ¿podía esta muestra ver algo? ═══");
    const hall: FilaHallazgo[] = filas.map((f) => ({ pnl: f.resultado, ticker: f.ticker, fecha: `${f.mes.slice(0, 4)}-${f.mes.slice(4, 6)}-01` }));
    const p = potencia(hall, 1.0);
    console.log(`  n=${filas.length} · separación detectable ${p.detectable.toFixed(2)}x · ${p.concluyente ? "concluyente" : "NO concluyente"}`);
    console.log(`  (el resultado varía entre 0,11x y 22,66x según el año: hace falta separar MUCHO`);
    console.log(`   para que un indicador valga, y la muestra es de ~120 períodos independientes)`);
  } else {
    console.log(`\n⚠️ UN POSITIVO AQUÍ ES UNA PISTA, NO UNA CONCLUSIÓN. Los 8 símbolos se mueven juntos:`);
    console.log(`   960 ticker-meses son ~120 períodos independientes y la criba de concentración no`);
    console.log(`   protege de eso. Confirmar con la descarga de 20 símbolos más antes de operarlo.`);
  }
}

main();
