// ESCRIBE LOS MANIFIESTOS de cada carpeta de datos. Cada texto de aquí sale de HABER LEÍDO el
// script que generó la carpeta, el 2026-08-25, no de memoria. Ver datos.mjs para el porqué.
import { writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const M = {
  "cadenas": {
    que_es: "bid y ask de cada strike y cada vencimiento, un fichero por ticker y día",
    script: "scripts/bajar-cadenas-todos-los-dias.ts",
    endpoint: "/v3/option/history/eod?symbol=X&expiration=*&start_date=D&end_date=D",
    filtros: ["ninguno — el día entero, todos los vencimientos y todos los strikes"],
    mira_al_futuro: false,
    por_que: "una petición por (ticker, día) sin ninguna selección de contratos. Nada de lo que entra o deja de entrar depende de nada posterior a D.",
    verificado: "2026-08-25",
    verificado_por: "leído el script; la única llamada es un eod con expiration=* por día",
  },
  "oi-ancho": {
    que_es: "interés abierto de cada strike y cada vencimiento, un fichero por ticker y día",
    script: "scripts/bajar-oi-ancho.mjs",
    endpoint: "/v3/option/history/open_interest?symbol=X&expiration=*&start_date=D&end_date=D",
    filtros: ["ninguno — se guarda incluso el OI cero, porque un strike listado sin posiciones es información"],
    mira_al_futuro: false,
    por_que: "una petición por (ticker, día). Este descargador se escribió PRECISAMENTE para sustituir al viejo, que recortaba a ±25% del precio y 60 días y dejaba 570 de 573 valores en cero.",
    verificado: "2026-08-25",
    verificado_por: "leído el script; trae strikes de 45 a 430 con la acción en 165, o sea hasta +160%",
  },
  "flujo-limpio": {
    que_es: "operaciones de más de $500,000, una a una, con el bid y el ask de ese instante",
    script: "scripts/r2-bajar-flujo-limpio.mjs",
    endpoint: "/v3/option/history/trade_quote?symbol=X&expiration=*&start_date=D&end_date=D",
    filtros: [
      "precio × contratos × 100 >= $500,000 — condición conocida en el instante de la operación",
      "sin selección de contratos: se pide el volcado del día entero y se filtra al leerlo",
    ],
    mira_al_futuro: false,
    por_que: "el único filtro es el tamaño de la propia operación, que se sabe cuando ocurre. Ningún contrato se elige ni se descarta por lo que hizo después.",
    verificado: "2026-08-25",
    verificado_por: "escrito hoy para sustituir a fetchFlowRange; se leyeron 5,7M de operaciones y se guardaron las de $500k+",
  },
  "oi-vispera": {
    que_es: "interés abierto del día anterior al vencimiento, para SPX/SPXW",
    script: "scripts/bajar-oi-vispera.mjs",
    endpoint: "open_interest por vencimiento",
    filtros: ["sólo la víspera de cada vencimiento — es su propósito, no una criba de contratos"],
    mira_al_futuro: false,
    por_que: "la fecha se elige por su relación con el vencimiento, que se conoce de antemano. No se elige ningún contrato por su resultado.",
    verificado: "2026-08-25",
    verificado_por: "leída la forma del fichero: {exp, vispera, oi:{strike|lado: n}}",
  },
};

// La cinta VIEJA vive suelta en cache-theta/ (TICKER_y_AAAA*.json), no en subcarpeta.
// Se le pone su propio aviso para que nadie la vuelva a usar sin verlo.
const AVISO_CINTA_VIEJA = {
  que_es: "⛔ CINTA VIEJA — TICKER_y_*.json. NO USAR PARA MEDIR.",
  script: "lib/thetadata.ts → fetchFlowRange(), llamado desde scripts/backtest-strategy.ts",
  filtros: [
    "contractCap: 60 — se pide el volumen de TODO EL AÑO, se ordena por volumen × PRECIO FINAL y se guardan los 60 mejores contratos del año",
    "el campo `delta` NO viene de ThetaData: lo calcula tradeGreeks() con Black-Scholes a partir del precio",
    "en 2016-2020 ese delta sale 0.000 en todas las filas porque le faltaba el precio del subyacente",
  ],
  mira_al_futuro: true,
  por_que: "ordenar por 'volumen × precio final del año' es elegir contratos sabiendo cómo acabaron: uno que expiró sin valor tiene precio final ~0 y nunca entra en los 60; uno que dobló sí entra. Medir '¿cuántos doblaron?' sobre eso da 88% por construcción. Costó dos días de trabajo el 2026-08-24 y 25.",
  verificado: "2026-08-25",
  verificado_por: "leídas fetchFlowRange y fetchContractVolumes línea a línea",
  sustituto: "flujo-limpio/",
};

let n = 0;
for (const [c, m] of Object.entries(M)) {
  const dir = join(CACHE, c);
  if (!existsSync(dir)) { console.log(`  ⚠ ${c}/ no existe todavía — manifiesto no escrito`); continue; }
  writeFileSync(join(dir, "_MANIFIESTO.json"), JSON.stringify(m, null, 2), "utf8");
  console.log(`  ✓ ${c}/_MANIFIESTO.json`);
  n++;
}
writeFileSync(join(CACHE, "_AVISO-CINTA-VIEJA.json"), JSON.stringify(AVISO_CINTA_VIEJA, null, 2), "utf8");
console.log(`  ✓ _AVISO-CINTA-VIEJA.json (la cinta contaminada, marcada)`);

// carpetas sin manifiesto, para que se vean
console.log(`\n  Carpetas de ${CACHE} SIN manifiesto (bloqueadas hasta que se lea su script):`);
for (const d of readdirSync(CACHE, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  if (!existsSync(join(CACHE, d.name, "_MANIFIESTO.json"))) console.log(`     ${d.name}/`);
}
console.log(`\n  ${n} manifiestos escritos.\n`);
