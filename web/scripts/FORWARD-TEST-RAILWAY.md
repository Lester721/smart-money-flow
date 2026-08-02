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
