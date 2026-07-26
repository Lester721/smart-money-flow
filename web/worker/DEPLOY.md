# Worker de /ideas — Deploy en Railway

El worker (`web/worker/ideasWorker.ts`) se conecta al WebSocket de Massive, suscribe
**todos los trades del mercado** (`T.*`), se queda con los notables (premium ≥
`IDEAS_MIN_PREMIUM`), calcula agresor+griegas exactos y los escribe a **Redis**. La ruta
`/api/ideas` lee ese búfer. Nada se baja a tu disco.

```
Massive WS (T.*) ─► Worker (Railway, 24/5) ─► Redis ◄─ lee /api/ideas (app)
```

## Requisitos previos
- Los cambios deben estar **commiteados y pusheados** a `Lester721/smart-money-flow`
  (rama `feat/massive-migration`). Railway deploya desde GitHub.
- `web/.env.local` **NO** se commitea (tiene secretos). Railway usa sus propias Variables.

## Pasos en Railway (una vez)
1. Entra a **railway.app** y crea cuenta (login con GitHub recomendado). Plan **Hobby
   (~$5/mes)** para tener el servicio siempre encendido.
2. **New Project → Deploy from GitHub repo →** elige `Lester721/smart-money-flow`,
   rama `feat/massive-migration`.
3. En el servicio → **Settings → Root Directory =** `web`.
   Railway lee `web/railway.json` y usa como arranque `npm run worker`.
4. **New → Database → Add Redis** (dentro del mismo proyecto).
5. En el servicio del worker → **Variables**, añade:
   - `MASSIVE_API_KEY` = tu key de Massive  *(márcala como secreta)*
   - `REDIS_URL` = `${{Redis.REDIS_URL}}`  *(referencia al Redis del proyecto)*
   - `IDEAS_MIN_PREMIUM` = `500000`  *(opcional; este es el default)*
6. **Deploy.** En los **Logs** deberías ver:
   `Socket abierto` → `auth_success` → `Suscrito a T.*`, y en horario de mercado
   líneas `[salud] … notables N … a Redis N`.

## Conectar tu app local al mismo Redis
Para que `/api/ideas` (que corres local) lea el búfer:
1. En Railway: servicio **Redis → Connect →** copia la **URL pública** (`redis://…`).
2. Ponla en `web/.env.local`:
   ```
   REDIS_URL=redis://default:PASSWORD@HOST_PUBLICO:PUERTO
   ```
3. Reinicia `npm run dev` y abre `/ideas`.

## Notas
- El worker **reconecta solo** (backoff) si el socket se cae.
- Fuera de horario de mercado el stream está callado (0 notables) — es normal.
- El piso de premium (`IDEAS_MIN_PREMIUM`) debe coincidir con `MIN_PREMIUM` en
  `app/api/ideas/route.ts` (ambos 500000 por defecto).
- Ajusta `IDEAS_CONCURRENCY` (default 8) si quieres más/menos llamadas REST en paralelo.
