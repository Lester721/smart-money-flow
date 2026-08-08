// ¿Ya hay muestra suficiente para juzgar el forward-test?
//
// El 8 ago 2026 la tabla por celda mostraba las 4 celdas del Top⅓ en positivo (+6,7% / +2,5% /
// +7,9% / +2,8%) y las 4 en negativo sin filtrar. Alentador — pero con n = 11, 5, 3 y 4. Con
// n=3 un solo resultado mueve la celda entera, así que no se concluye nada todavía.
//
// LA ARITMÉTICA QUE IMPORTA: el "Top⅓" del informe es literalmente ⌊cerradas/3⌋ (ver
// app/api/credit-spread/route.ts). Así que **100 cierres de alta convicción ≈ 300 cierres
// totales**, no 100. Es la clase de detalle que, mal contado, hace que uno se declare listo con
// un tercio de la muestra que creía tener.
//
// Uso: npx tsx scripts/estado-cierres.ts
// Requiere REDIS_URL (está en .env.local). Sin él, cae al JSON semilla y lo dice.

import { readFileSync } from "node:fs";
import Redis from "ioredis";

const REDIS_KEY = process.env.FWD_REDIS_KEY || "forward:ledger";
const META = 100;   // cierres de ALTA CONVICCIÓN que pedimos para juzgar

interface Trade {
  ticker: string; dte: number; sigma: number; evaComp: number;
  status: "open" | "closed"; retOnRisk?: number; exitDate?: string; expiryDate: string;
}

const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

async function cargar(): Promise<{ ledger: Trade[]; fuente: string }> {
  if (process.env.REDIS_URL) {
    let redis: Redis | null = null;
    try {
      redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 4000, lazyConnect: true });
      await redis.connect();
      const raw = await redis.get(REDIS_KEY);
      if (raw) return { ledger: JSON.parse(raw) as Trade[], fuente: "Redis (VIVO)" };
    } catch { /* cae al archivo */ } finally {
      try { await redis?.quit(); } catch { /* noop */ }
    }
  }
  return { ledger: JSON.parse(readFileSync("data/forward/ledger.json", "utf8")) as Trade[], fuente: "semilla de git (NO es el vivo)" };
}

(async () => {
  const { ledger, fuente } = await cargar();
  const cerradas = ledger.filter((t) => t.status === "closed");
  const abiertas = ledger.filter((t) => t.status === "open");

  // El corte del Top⅓, calculado igual que en la API: una vez sobre TODAS las cerradas.
  const k = Math.max(1, Math.floor(cerradas.length / 3));
  const porEva = [...cerradas].sort((a, b) => a.evaComp - b.evaComp);
  const alta = porEva.slice(cerradas.length - k);
  const baja = porEva.slice(0, k);
  const ret = (a: Trade[]) => a.map((t) => t.retOnRisk).filter((x): x is number => x != null);

  console.log(`\n## Estado del forward-test — fuente: ${fuente}\n`);
  console.log(`   cerradas totales      : ${cerradas.length}`);
  console.log(`   de ellas ALTA convicc.: ${alta.length}   ← la que cuenta (es ⌊total/3⌋)`);
  console.log(`   abiertas              : ${abiertas.length}`);

  if (alta.length) {
    // OJO: retOnRisk se guarda YA EN PORCENTAJE (−100.3 = −100,3%), no como fracción. Multiplicar
    // por 100 daba "−1448%", que es imposible en un credit spread: la pérdida está capada cerca
    // del −100% del riesgo. Ese absurdo fue lo que delató el error.
    const mA = media(ret(alta)), mB = media(ret(baja)), mT = media(ret(cerradas));
    console.log(`\n   alta convicción: ${mA >= 0 ? "+" : ""}${mA.toFixed(2)}%  ·  baja: ${mB >= 0 ? "+" : ""}${mB.toFixed(2)}%  ·  separa: ${mA > mB ? "SÍ" : "NO"}`);
    console.log(`   sin filtrar    : ${mT >= 0 ? "+" : ""}${mT.toFixed(2)}%`);
  }

  // Ritmo real, medido — no estimado a ojo.
  const porDia = new Map<string, number>();
  for (const t of cerradas) if (t.exitDate) porDia.set(t.exitDate, (porDia.get(t.exitDate) ?? 0) + 1);
  const dias = [...porDia.keys()].sort();
  const ultimos = dias.slice(-5).map((d) => porDia.get(d)!);
  const ritmo = media(ultimos);

  console.log(`\n   ritmo (últimos ${ultimos.length} días con cierres): ${ritmo.toFixed(1)} cierres/día → ${(ritmo / 3).toFixed(1)} de alta convicción/día`);

  const faltan = META - alta.length;
  if (faltan <= 0) {
    console.log(`\n   ✅ META ALCANZADA: ${alta.length} cierres de alta convicción (pedíamos ${META}).`);
    console.log(`      Toca volver a mirar la tabla por celda y decidir con esta muestra.`);
  } else {
    const diasHabiles = ritmo > 0 ? Math.ceil(faltan / (ritmo / 3)) : NaN;
    console.log(`\n   ⏳ Faltan ${faltan} cierres de alta convicción (≈ ${faltan * 3} cierres totales).`);
    console.log(`      Al ritmo actual: ~${diasHabiles} días hábiles.`);
    // Aviso honesto: el ritmo no se mantiene solo. Las celdas de 5d/7d se renuevan a diario,
    // pero las de 60d/90d tardan meses — si el flujo de señales baja, esto se alarga.
    const largas = abiertas.filter((t) => t.dte >= 60).length;
    if (largas) console.log(`      (${largas} abiertas son de 60d/90d y no cierran hasta oct-nov: no cuentan para llegar antes.)`);
  }
  console.log("");
})();
