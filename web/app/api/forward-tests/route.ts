// GET /api/forward-tests — el marcador de los cuadernos que corren en directo.
//
// ═══ POR QUÉ EXISTE ════════════════════════════════════════════════════════════════════════
//
// Lester preguntó cuántos forward tests había, y al mirarlo apareció que el del credit spread
// llevaba **126 operaciones cerradas y +$3.562** desde el 3 de agosto. Nadie se lo había dicho —
// yo lo tenía archivado como "cerrado" desde que el backtest dio −2,53% y dejé de mirarlo.
//
// Su respuesta fue la correcta: *"si no te pregunto no me lo dices"*. Un marcador que depende de
// que yo me acuerde de mirarlo no es un marcador. Este lee Redis cada vez que se abre la página.
//
// ═══ LA TRAMPA QUE YA ME COMIÓ UNA VEZ ═════════════════════════════════════════════════════
//
// Los cuadernos NO comparten esquema. Los del cóndor usan `dia` / `estado` / `pl`; los de credit
// spread, wheel e ideas usan `entryDate` / `status` / `retOnRisk`. Al leerlos con los nombres del
// cóndor me salieron vacíos y los di por muertos — y llegué a ofrecer borrarlos.
//
// Por eso aquí cada familia declara SUS nombres, y si un cuaderno no encaja en ninguna se dice
// en la respuesta en vez de contarlo como cero.

import { NextResponse } from "next/server";
import Redis from "ioredis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Familia = "condor" | "riesgo";

const CUADERNOS: { clave: string; nombre: string; familia: Familia; unidad: string; pega?: string }[] = [
  { clave: "forward:mariposa-15h", nombre: "Mariposa de hierro · 15:00", familia: "condor", unidad: "$ por operación",
    pega: "La mejor candidata medida: $11.405/año contra los $6.722 del cóndor, y con menos susto. PERO no cruza el listón de las muchas puertas (t=3,41 con el listón en 4) y se va apagando (primera mitad $14.872/año, segunda $7.939). Este cuaderno es la única prueba fuera de muestra que le queda. Arrancó el 22 de agosto." },
  { clave: "forward:tres-sies", nombre: "Cóndor · los tres síes", familia: "condor", unidad: "$ por operación",
    pega: "Es la regla que damos como buena. Arrancó el 21 de agosto y aún no ha operado ni una vez." },
  { clave: "forward:gex-condor", nombre: "Cóndor · filtro de GEX", familia: "condor", unidad: "$ por operación",
    pega: "Usa ±25, que es la geometría con la peor caída de las tres versiones con GEX (−$20.356 en el backtest)." },
  { clave: "forward:condor-sinfiltro", nombre: "Cóndor · sin filtro", familia: "condor", unidad: "$ por operación",
    pega: "Es el control: opera todos los días. Sirve para saber cuánto aportan los filtros, no para operarlo." },
  { clave: "forward:condor-tendencia", nombre: "Cóndor · filtro de tendencia", familia: "condor", unidad: "$ por operación" },
  { clave: "forward:ledger", nombre: "Credit spread", familia: "riesgo", unidad: "% sobre el riesgo",
    pega: "OJO: el backtest de esta estrategia con precios reales daba −2,53%, y aquí sale positivo. Uno de los dos está mal y falta averiguar cuál." },
  { clave: "forward:wheel", nombre: "Wheel", familia: "riesgo", unidad: "% sobre el riesgo",
    pega: "195 posiciones abiertas y NINGUNA cerrada. Hay vencimientos ya pasados sin liquidar: el cuaderno abre pero no cierra." },
  { clave: "forward:ideas", nombre: "Ideas (scorecard de EVA)", familia: "riesgo", unidad: "% sobre el riesgo",
    pega: "El scorecard está medido y cerrado (19.465 operaciones, no separa). Esto es la comprobación en directo de esa conclusión." },
];

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

export async function GET() {
  const url = process.env.REDIS_URL;
  if (!url) return NextResponse.json({ ok: false, motivo: "sin REDIS_URL" });

  const r = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 8000 });
  r.on("error", () => { /* que un fallo de red no tumbe la página */ });

  try {
    const salida = [];
    for (const c of CUADERNOS) {
      let filas: Record<string, unknown>[] = [];
      try { filas = JSON.parse((await r.get(c.clave)) ?? "[]"); } catch { /* se dice abajo */ }
      if (!Array.isArray(filas) || !filas.length) {
        salida.push({ ...c, filas: 0, vacio: true });
        continue;
      }

      // Cada familia con SUS nombres de campo. Nunca al revés.
      const esCondor = c.familia === "condor";
      const campoDia = esCondor ? "dia" : "entryDate";
      const campoEstado = esCondor ? "estado" : "status";
      const cerrado = esCondor ? "cerrada" : "closed";
      const campoRes = esCondor ? "pl" : "retOnRisk";

      const dias = [...new Set(filas.map((f) => f[campoDia]).filter(Boolean))].sort() as string[];
      const cerradas = filas.filter((f) => f[campoEstado] === cerrado && typeof f[campoRes] === "number");
      const vals = cerradas.map((f) => f[campoRes] as number);
      const abiertas = filas.filter((f) => f[campoEstado] === (esCondor ? "abierta" : "open")).length;
      const sinSenal = filas.filter((f) => f[campoEstado] === "sin señal").length;

      salida.push({
        ...c,
        filas: filas.length,
        desde: dias[0] ?? null,
        hasta: dias[dias.length - 1] ?? null,
        cerradas: cerradas.length,
        abiertas,
        sinSenal,
        media: vals.length ? media(vals) : null,
        total: esCondor && vals.length ? vals.reduce((a, b) => a + b, 0) : null,
        acierto: vals.length ? vals.filter((x) => x > 0).length / vals.length : null,
        vacio: false,
      });
    }
    await r.quit().catch(() => {});
    return NextResponse.json({ ok: true, generado: new Date().toISOString(), cuadernos: salida });
  } catch (e) {
    await r.quit().catch(() => {});
    return NextResponse.json({ ok: false, motivo: e instanceof Error ? e.message : "error leyendo Redis" });
  }
}
