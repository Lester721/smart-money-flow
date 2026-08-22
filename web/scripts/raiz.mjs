// LA RAÍZ DEL PROYECTO, DEDUCIDA — nunca escrita a mano.
//
// ═══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════════════════════
//
// Había quince scripts con la ruta absoluta metida dentro:
//
//     const RAIZ = "C:/Users/leste/dev/agente-<nombre-viejo>/web";
//
// El día que se renombra la carpeta, los quince dejan de encontrar sus datos — y no fallan
// de golpe con un error claro: fallan leyendo un directorio que no existe, que es la clase de
// avería que este proyecto ya ha pagado varias veces.
//
// Una ruta escrita a mano es una promesa de que nada se moverá nunca. Aquí se deduce del sitio
// donde vive este propio fichero, así que la carpeta se puede renombrar o mover y todo sigue.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** La carpeta `web/` del proyecto, salga de donde salga el script que la pida. */
export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** La carpeta de datos descargados. Es la que más se referencia. */
export const CACHE = resolve(RAIZ, "scripts/cache-theta");

export default RAIZ;
