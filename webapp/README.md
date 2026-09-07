# Web interactiva — Agente Tito Metralleta

Web local para leer los datos del agente de opciones. **Cubre las 7 tareas del proceso**,
con un input de ticker y el indicador de **paso actual** durante el loading (streaming SSE).

## Las 7 tareas (todas implementadas)
1. **Open Interest** por vencimiento (ordenado mayor→menor).
2. **Volumen** máximo por expiración + **histórico** que acumula ≥5 días.
3. **Sectorial vs. individual**: compara el flujo del activo con sus 5 líderes de sector.
4. **Flujo Call/Put**: muros de OI (resistencia/soporte) + agresor heurístico (buy/sell).
5. **Notional Value** — Top 5 contratos con gráfico (líneas en los strikes).
6. **Liquidez** (regla crítica, calibrada): spread real ponderado por volumen, por contrato,
   y comparación vs. líderes del sector; 7 Magníficas como contexto.
7. **Noticias RSS** del activo (CNBC, Investing.com) filtradas por empresa.

## Fuentes de datos
- **Schwab** (solo lectura): cadena de opciones — OI, volumen, bid/ask, last.
- **Massive**: precio/histórico del subyacente, estado de mercado, nombre/sector (SIC).
- **RSS**: feeds de `docs/RSS-Feed.md`.

## Cómo correr
```
cd "C:\Users\leste\OneDrive\Desktop\Agente Tito Metralleta"
python -m uvicorn app:app --app-dir webapp/backend --port 8000
```
Abre <http://localhost:8000/> y escribe un ticker (ej. `AAPL`).

## Estructura
- `backend/app.py` — FastAPI + stream SSE (12 pasos) y resultado.
- `backend/providers.py` — Schwab (token + cadena) y Massive. Lee `API/.env`.
- `backend/liquidity.py` · `sectors.py` · `flow.py` · `storage.py` · `news.py` — lógica del proceso.
- `backend/data/` — caché diaria (histórico de volumen, perfiles de liquidez).
- `frontend/index.html` — UI (input, pasos en vivo, todas las secciones).

## Notas
- El **access token** de Schwab se renueva solo (30 min). El **refresh token** caduca
  cada ~7 días: si ves un error de token, regeneralo y pégalo en `API/.env`.
- Las llaves nunca se envían al navegador ni se imprimen.
- La 1ª corrida del día por sector baja perfiles de referencia (cacheados el resto del día).
- El histórico de volumen y el promedio de referencia se vuelven "de 5 días" a medida que
  consultas cada día.

## Ideas futuras (opcionales)
Más sectores en el mapa · export del análisis a PDF · alertas · afinar umbrales con más
días de histórico.
