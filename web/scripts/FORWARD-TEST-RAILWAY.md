# Forward-test en Railway (cron diario)

El **forward-test** (paper trading del credit spread filtrado por convicción de EVA) corre
como **servicio cron** en Railway — independiente de Claude, con la compu apagada, usando la
`MASSIVE_API_KEY` que Railway ya guarda como secreto.

```
Cron diario (Railway) ─► forward-test.ts ─► Redis (key "forward:ledger")
                          abre señales nuevas · liquida vencidas
```

## Almacenamiento (importante)

El ledger ya **no vive en git**; vive en **Redis** (el mismo servicio que usa el worker):

- **En Railway** (hay `REDIS_URL`): el script autodetecta y guarda en la key `forward:ledger`
  (+ el reporte en `forward:ledger:report`). La **primera** corrida, si la key está vacía,
  **siembra** desde el `data/forward/ledger.json` committeado (las 64 jugadas iniciales) para
  no perder nada.
- **En local**: si corres con `--env-file=.env.local` (que tiene `REDIS_URL`), también escribe
  al **mismo Redis** → ledger unificado. Para una prueba local aislada en archivo, fuerza
  `FWD_STORE=file`.

## Pasos en Railway (una vez) — proyecto "secure-analysis"

1. **New → GitHub Repo →** elige `Lester721/smart-money-flow` (el mismo repo del worker).
2. En **Settings** del nuevo servicio:
   - **Root Directory:** `web`
   - **Config File Path:** `railway.forward.json`  ← clave: usa esta config, NO la del worker.
     (Trae ya el `startCommand: npm run forward-test`, el `cronSchedule` y `restartPolicyType: NEVER`.)
   - Si tu versión de Railway no lee `cronSchedule` del archivo, ponlo a mano en
     **Settings → Cron Schedule:** `0 22 * * 1-5` (weekdays 22:00 UTC = 6:00 PM GMT-4, tras el cierre US).
3. **Variables** del servicio:
   - `MASSIVE_API_KEY` → la misma que el worker (agrégala o compártela).
   - `REDIS_URL` → **referencia** al servicio Redis (igual que el worker). En Railway:
     `Add Variable Reference → Redis → REDIS_URL` (o `REDIS_PUBLIC_URL` si aplica).
   - (opcional) `MASSIVE_MAX_PAGES=40`, `FWD_STORE=redis`.
4. **Deploy.** Como es cron con `restartPolicyType: NEVER`, corre a su hora y termina; no
   queda encendido 24/7 (costo mínimo).

## Verificar

- **Logs** del servicio tras una corrida: debe imprimir `store=redis`, cuántas jugadas nuevas
  se abrieron y cuántas se liquidaron.
- **Correr a mano ya** (sin esperar): en Railway, `... → Deploy` / "Run now", o localmente:
  `cd web && npm run forward-test` (con `.env.local`).
- Leer el reporte guardado: es la key de Redis `forward:ledger:report`.

## Notas

- 100% **papel** — no coloca órdenes reales. Idempotente (dedupe por `ticker|fecha|dte|σ`),
  así que correr de más no duplica nada.
- El `data/forward/ledger.json` en git queda como **semilla** (ya no se actualiza solo; la
  fuente viva es Redis).

---

# Migrar los cron a ThetaData (Terminal efímero)

**Por qué así:** ThetaData sólo permite **una conexión por cuenta** — un segundo Terminal
*expulsa* al primero. Por eso el cron **arranca el Terminal, corre el job y lo apaga**: la
ventana de colisión con tu Terminal local es de ~5 min al día, no permanente.

Ya está en el repo: `scripts/with-theta.mjs` (lanzador) y el `startCommand` de
`railway.forward.json` / `railway.wheel.json` ya lo usan. **Si `DATA_PROVIDER` no es `theta`,
el lanzador NO arranca nada y corre el job igual que antes (Massive)** — así que el cambio es
seguro y reversible con una sola variable.

## Pasos en Railway (en CADA servicio cron: forward-test y wheel)

1. **Variables** → agregar:
   - `DATA_PROVIDER` = `theta`
   - `THETADATA_API_KEY` = tu key de ThetaData
   - `NIXPACKS_PKGS` = `jdk21`  ← instala Java (el Terminal lo necesita)
   - Deja `REDIS_URL` como está. Mantén `MASSIVE_API_KEY` hasta verificar (fallback).
2. **ESCALONAR LOS HORARIOS** (crítico): si los dos cron corren a la vez, cada uno levanta su
   propio Terminal y **se expulsan entre sí**. Deja al menos 30 min entre ellos, por ejemplo:
   - forward-test → `0 22 * * 1-5`
   - wheel        → `30 22 * * 1-5`
3. **Deploy** y revisar logs: debe verse `[with-theta] arrancando el Theta Terminal…`,
   luego `Terminal listo en Ns`, el job, y `apagando el Terminal…`.

## Para volver atrás
Borra (o pon en `massive`) la variable `DATA_PROVIDER`. El lanzador vuelve a modo passthrough
y el cron corre con Massive, sin tocar código.

## Ojo con tu Terminal local
Durante esos ~5 minutos diarios el Terminal de Railway te puede expulsar el local (y viceversa,
si tú estás corriendo un backtest pesado a esa hora). Por eso los cron van tras el cierre.
El jar (40 MB) **no está en el repo**: `with-theta.mjs` lo descarga solo de
`download-stable.thetadata.us` la primera vez.
