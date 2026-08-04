# -*- coding: utf-8 -*-
"""Genera el Manual de Eva en PDF (a color) y Markdown (editable) desde UN solo contenido."""
import os, re
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, HRFlowable, Image)
from reportlab.lib.utils import ImageReader

HERE = os.path.dirname(os.path.abspath(__file__))

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
_AR = r"C:\Windows\Fonts\arial.ttf"; _ARB = r"C:\Windows\Fonts\arialbd.ttf"
if os.path.exists(_AR):
    pdfmetrics.registerFont(TTFont("Arial", _AR))
    pdfmetrics.registerFont(TTFont("Arial-Bold", _ARB if os.path.exists(_ARB) else _AR))
    registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial", boldItalic="Arial-Bold")
    BASEFONT, BASEBOLD = "Arial", "Arial-Bold"
else:
    BASEFONT, BASEBOLD = "Helvetica", "Helvetica-Bold"

# ---- Paleta de marca (Eva = verde/teal) ----
TEAL = colors.HexColor("#0F9E75")
TEALD = colors.HexColor("#0B5D46")
INK = colors.HexColor("#101828")
MUTED = colors.HexColor("#667085")
RED = colors.HexColor("#E24B4A")
GREEN = colors.HexColor("#12B76A")
AMBER = colors.HexColor("#B54708")
BGINFO = colors.HexColor("#E1F5EE")
BGWARN = colors.HexColor("#FEF0C7")
BGDANGER = colors.HexColor("#FEE4E2")
BGHOWTO = colors.HexColor("#EAF0FF"); BLUE = colors.HexColor("#2F6BFF")
BGROW = colors.HexColor("#F1F5F4")

# ---- Contenido (fuente única) ----
# ("h1"|"h2"|"p"|"disclaimer"|"spacer", texto)
# ("callout", "info"|"warn"|"danger", texto)
# ("table", [encabezados], [[fila], ...])
# ("band",)   -> ilustración de la barra direccional (solo PDF; nota en MD)
C = [
 ("cover",),
 ("h1", "1. ¿Qué es Eva?"),
 ("p", "Eva es un agente de análisis de **opciones**. Su trabajo es detectar **actividad inusual del dinero institucional** y darte **contexto accionable**: hacia dónde apuesta el dinero grande, con cuánta convicción, dónde están los muros de precio, y qué tan fiable es la señal."),
 ("p", "Eva **no predice el futuro** ni **ejecuta órdenes**, y **no es asesoría de inversión**. Te da inteligencia; las decisiones y el riesgo son tuyos."),

 ("h1", "2. Las 6 secciones del navegador"),
 ("table", ["Sección", "Para qué sirve"], [
   ["Ticker", "Análisis completo de una acción: sentiment, flujo, muros y sub-agentes."],
   ["Ideas", "Radar de TODO el mercado: dónde hay flujo institucional notable ahora mismo (§8)."],
   ["Wheel", "Screener de la estrategia Wheel (venta de puts cash-secured para ingreso)."],
   ["Time & Sales", "El tape en crudo: cada operación notable con su agresor y griegas."],
   ["0DTE", "Opciones que expiran el mismo día (sección en construcción)."],
   ["EVA Credit Spread", "La estrategia validada: forward-test en vivo del credit spread filtrado por convicción de EVA."],
 ]),

 ("h1", "3. La vista Ticker: motor y vista"),
 ("p", "Arriba de todo hay **dos toggles**, uno encima del otro. Primero eliges el **motor** (Original o EVA); debajo, la **vista** (Estudiante o Pro)."),
 ("h2", "El toggle Original | EVA — elige qué motor manda"),
 ("image", "toggle_modo.png", "Dos toggles apilados: arriba el MOTOR (Original o EVA), abajo la VISTA (Estudiante o Pro). El motor que elijas cambia el scorecard de TODA la página."),
 ("p", "**Original** es el sistema base de Victor, congelado como referencia del pasado. **EVA** es la versión recalibrada (la Convicción pesa más — ver §6). Al cambiarlo, se actualizan a la vez la **fuerza del AI Sentiment**, el **scorecard** y el texto de señales del veredicto — tanto en Estudiante como en Pro."),
 ("callout", "info", "**Qué cambia y qué NO al mover Original ⇄ EVA.** CAMBIA todo lo que depende de los **pesos del scorecard**: la fuerza, el scorecard y el texto de «señales fuertes/débiles». NO cambia los **precios objetivo** (alcista/base/bajista, que salen de los muros de gamma / GEX) ni la **dirección** del triángulo (que sale del flujo). Es a propósito: a nivel de un ticker, EVA y Victor se diferencian solo en los **6 pesos**. Victor no se borra — EVA se pone al lado como respaldo."),
 ("p", "Y dentro de cualquiera de los dos motores, eliges la vista:"),
 ("table", ["Modo", "Qué ves"], [
   ["Estudiante", "Lo esencial y simple: un veredicto, 3 escenarios (alcista/base/bajista) y el precio esperado."],
   ["Pro", "Todo el detalle: el resumen, el sentiment, los 6 sub-agentes, los muros y el feed de operaciones."],
 ]),
 ("p", "Recomendación: empieza en **Estudiante**; sube a **Pro** cuando quieras el detalle."),
 ("callout", "howto", "**CÓMO USAR ESTA DIVISIÓN — Ticker**<br/>**Qué ves:** el análisis COMPLETO de UNA acción: dirección del flujo, fuerza, los 6 sub-agentes, muros y precio esperado.<br/>**Qué haces:** léela de arriba abajo — primero el resumen y el veredicto, luego el detalle. Es tu 'segunda opinión' antes de tocar un ticker (muchas veces llegas aquí desde una idea de la división Ideas).<br/>**NO es:** una orden de compra ni una predicción garantizada. Es contexto sobre hacia dónde apunta el dinero y qué tan fiable es.<br/>**Crúzala con:** **(1) el aviso de liquidez (§10)** — *por qué:* una señal sobre datos ilíquidos no vale nada; *cómo:* si ves «datos poco fiables», PARA ahí. **(2) los muros/GEX (§7)** — *por qué:* dicen dónde el precio suele frenar; *cómo:* si el flujo es alcista y hay un muro de calls justo arriba, ese muro es tu techo probable (buen sitio para tomar ganancia). **(3) el historial (§11)** — *por qué:* mide si el patrón funcionó antes; *cómo:* un hit-rate verde alto da confianza, uno rojo es bandera. *Ejemplo:* flujo bullish fuerte en AAPL + muro de calls en $240 + historial 80% → el escenario alcista hacia $240 tiene respaldo real, no es corazonada."),

 ("h1", "4. El resumen en lenguaje sencillo"),
 ("p", "Al **tope del modo Pro** hay un párrafo que traduce todos los números a una frase que puedes leer en 5 segundos. Ejemplo real (AAPL):"),
 ("callout", "danger", "El flujo se inclina bajista — Flujo institucional pesado en AAPL ($24.1M notable), concentrado en calls y puts, ejecutado agresivo (comprando al ask) — 73% del dinero entró al ask, Convicción 8/10. El posicionamiento se inclina BAJISTA."),
 ("p", "Léelo primero; luego baja y ata cada dato con el detalle. **Este resumen se arma solo con los datos reales, no lo inventa ningún modelo.**"),

 ("h1", "5. AI Sentiment Score (direccional)"),
 ("p", "Este medidor te dice **dos cosas separadas** — y es normal confundirlas, porque las dos son 'intensidades'. La clave: son intensidades de **cosas distintas**."),
 ("table", ["Qué es", "Qué mide", "Qué intensidad es"], [
   ["El triángulo (posición en la barra)", "Hacia qué lado se inclina el flujo, y cuánto: bien bajista → bajista → neutral → alcista → bien alcista.", "Intensidad de la **dirección**"],
   ["La «fuerza» (el número 0-100)", "Cuánto respaldo real tiene esa lectura, sin importar el lado.", "Intensidad de la **convicción / calidad**"],
 ]),
 ("image", "sentiment.png", "Dos barras, dos preguntas: ① la barra de dirección (el triángulo se mueve por hacia dónde apunta el flujo) y ② el medidor de fuerza (cuánto respaldo hay detrás, un número aparte)."),
 ("p", "**La prueba de que son distintas:** el triángulo y la fuerza pueden ir por separado."),
 ("table", ["Escenario del flujo", "Triángulo", "Fuerza", "Cómo leerlo"], [
   ["90% alcista, pero son 3 contratos ilíquidos de un centavo", "bien a la derecha", "baja (20)", "Apunta alcista… pero no te fíes."],
   ["90% alcista con millones en primas, agresivo, inusual", "bien a la derecha", "alta (85)", "Apunta alcista **y con respaldo**."],
   ["Muchísimo dinero real y agresivo, mitad a calls / mitad a puts", "al centro (neutral)", "alta (80)", "Batalla enorme, pero nadie gana todavía."],
 ]),
 ("p", "Fíjate: en los dos primeros el **triángulo está en el mismo sitio** pero la **fuerza cambia** — si el triángulo midiera la fuerza, no podría. Y en el tercero hay **mucha fuerza con el triángulo al centro**. Son ejes independientes."),
 ("callout", "info", "**¿Te confunde la palabra «fuerza»? Se puede renombrar (opcional).** El triángulo y el número miden dos intensidades distintas, y «fuerza» se presta a confusión. Si prefieres, cambiamos solo las **etiquetas** en la app (no toca ningún cálculo): el **triángulo** → «**Inclinación del flujo**» (cuán alcista/bajista); el **número** → «**Respaldo**», «**Convicción**» o «**Calidad de la señal**» en vez de «fuerza». Dime si te gusta alguna o lo dejamos igual."),

 ("h1", "6. Los 6 sub-agentes (el corazón de Eva)"),
 ("p", "El sentiment sale del promedio de estos 6. Cada uno mira una cosa distinta:"),
 ("table", ["Sub-agente", "Qué mide / qué buscar", "Peso · Victor → EVA"], [
   ["Agresividad", "¿Compran al ASK con fuerza? Mucho dinero al ask = urgencia direccional.", "20% → **10%** ↓"],
   ["Convicción", "Calidad del flujo: spread apretado, un solo lado dominante, ejecución fuerte.", "20% → **30%** ↑"],
   ["Inusualidad", "¿Griegas de grado institucional? Tamaño, delta alta, vencimientos, gamma.", "20% → 20%"],
   ["Estructura", "¿Dónde se acumula el dinero? (muros GEX) y la liquidez de la cadena.", "15% → 15%"],
   ["Contexto IV", "¿La volatilidad implícita está limpia o inflada? Evita pagar prima cara.", "10% → **15%** ↑"],
   ["Confirmación de Precio", "¿El precio VALIDÓ flujos pasados o los absorbió? (el backtest, ver §11).", "15% → **10%** ↓"],
 ]),
 ("image", "subagentes.png", "Cada sub-agente puntúa 0-10; el AI Sentiment Score es su promedio ponderado por los pesos de EVA (la calibración recalibrada — la Convicción manda con 30%)."),
 ("callout", "info", "**¿Por qué la columna muestra dos pesos (Victor → EVA)?** «Victor» es la calibración ORIGINAL, que dejamos **congelada** como referencia del pasado. «EVA» es la **recalibrada**. Lo que hicimos: backtesteamos cada sub-agente sobre ~1 año para ver cuál de verdad **separa** los trades ganadores de los perdedores. La **Convicción** (liquidez + calidad del flujo) fue la que mejor lo hizo → le **subimos** el peso (20→30%). La **Agresividad** casi no separaba → la **bajamos** (20→10%). Contexto IV subió y Confirmación bajó por lo mismo. Para elegir cuál ves: vista Ticker → **Pro** → «Detalle de sub-agentes» → toggle **Original | EVA**."),

 ("h2", "El scorecard puesto a prueba (bitácora — se actualiza)"),
 ("p", "No basta con saber qué mira cada sub-agente: hay que medir cuáles de verdad dan ventaja. Aquí anoto cada avance de backtest, con números reales, para irte enseñando el score. (n = tamaño de la muestra: cuántos casos entraron en la prueba; mientras más grande, más confiable el %.)"),
 ("table", ["Fecha", "Qué se probó", "Resultado"], [
   ["2026-07-31", "Comprar el contrato del flujo (**calls y puts**, en largo; sostener 10 sesiones) filtrando por la señal **Inusualidad** — que ya junta 6 sub-señales: **tamaño + delta + theta + gamma + patas + vencimiento** — y cruzándola con el **Agresor** (compra al ask).", "**55% de win** con Inusualidad alta (vs 39% baja). El cruce con el agresor apuntó igual, con muestra chica. Preliminar: **n = 29 casos**, 3 tickers; falta re-correr limpio."],
 ]),
 ("disclaimer", "Resultados preliminares de backtest, NO promesas ni consejo. El fin es didáctico: aprender, con evidencia, qué señales separan ganadores de perdedores. Un número prometedor con muestra chica puede evaporarse con más datos."),

 ("h1", "7. Muros de strikes (GEX) y movimiento esperado"),
 ("p", "En la tarjeta PRO 'Strike Walls' ves:"),
 ("table", ["Elemento", "Qué significa"], [
   ["Muro de calls (dorado)", "Strike con mucho dinero en calls arriba del precio = suele actuar de RESISTENCIA."],
   ["Muro de puts (morado)", "Strike con mucho dinero en puts abajo del precio = suele actuar de SOPORTE."],
   ["Nivel imán", "El nivel de mayor peso: hacia donde el precio tiende a gravitar."],
   ["Cono de movimiento esperado", "El rango estadístico (±1σ ≈ 68%, ±2σ ≈ 95%) según IV y tiempo."],
 ]),
 ("image", "walls.png", "Oro = muros de calls (resistencia) arriba del precio; morado = muros de puts (soporte) abajo; la franja es el cono ±1σ."),

 ("h2", "De dónde salen los 3 precios (alcista, base, bajista)"),
 ("p", "Esos mismos muros arman la tarjeta '¿Cómo se podría mover?', con 3 precios. No es un pronóstico mágico — es la mecánica de los muros de gamma. Desde cero:"),
 ("image", "ref_precios_semana.png", "La tarjeta en EVA (HOOD): alcista $92, base $90, bajista $85. Esto es lo que vamos a explicar."),
 ("p", "**Quién te vende la opción:** del otro lado hay un **dealer** (la casa). No apuesta dirección; para no arriesgarse, cada vez que el precio se mueve compra o vende la acción para equilibrarse. Ese movimiento **obligado** empuja el precio."),
 ("image", "gamma_dealer.png", "El dealer está obligado a mover la acción — es mecánica, no opinión."),
 ("p", "**El muro (imán):** en los strikes con MUCHAS opciones, el dealer se cubre fuerte: si el precio sube, vende (lo baja); si baja, compra (lo sube). Como las paredes de un valle, el precio rueda al fondo y se queda. Ese es el **muro** o **imán**."),
 ("image", "gamma_muro.png", "El muro imanta el precio hacia su fondo."),
 ("image", "gamma_signo.png", "Gamma + = el precio se frena (hay muro). Gamma − = se acelera (no hay muro — cuidado)."),
 ("p", "**Los 3 precios salen de los muros:** **Base** = el imán dominante (el strike con más gamma). **Alcista** = el muro más fuerte por encima. **Bajista** = el muro más fuerte por debajo. Si no hay muro de un lado, cae al borde de **±1σ** del cono."),
 ("image", "gamma_tres.png", "Los 3 precios = los muros; el más grueso (más gamma) es el imán."),
 ("callout", "info", "Para ti: el muro es donde el precio suele FRENAR (buen lugar para tomar ganancia o vender prima por fuera); la zona γ− es donde ACELERA (ahí no vendas prima corta). Son niveles REALES (miles de contratos), no líneas a ojo — solo fiables con liquidez."),

 ("h2", "¿Por qué los 3 plazos dan el MISMO precio?"),
 ("p", "Porque los muros son precios **fijos** — no dependen del tiempo. Cambiar el plazo mueve el ancho del cono y las probabilidades, pero **no** los muros. Si están pegados al precio actual (como en HOOD), caben hasta en 'esta semana' → los 3 plazos dan lo mismo. Míralo: la misma tarjeta, 3 pestañas, los mismos precios."),
 ("image", "ref_precios_2sem.png", "La MISMA tarjeta de HOOD en '2 semanas': los precios NO cambian ($92 / $90 / $85)."),
 ("image", "ref_precios_1mes.png", "Y en '1 mes': otra vez idénticos. Los muros son fijos → no se mueven con el plazo."),
 ("image", "gamma_plazos.png", "Por qué: el cono crece con el tiempo, pero los muros no se mueven → mismos 3 precios."),
 ("callout", "warn", "PENDIENTE de mejora: que los plazos largos puedan alcanzar muros más lejanos, para que los 3 botones se sientan distintos. Hoy los precios son correctos como muros, pero se ven iguales."),

 ("h1", "8. La vista Ideas: el radar del mercado"),
 ("p", "Mientras la vista **Ticker** analiza UNA acción, **Ideas** es un **radar de TODO el mercado a la vez**: te muestra dónde está entrando el dinero grande AHORA. Un worker escucha el flujo de opciones en vivo (24/5) y guarda cada operación **notable** (prima ≥ **$500,000** = dinero institucional). Ideas lee eso y lo pasa por un **embudo de 2 filtros**:"),
 ("image", "ideas_funnel.png", "De miles de operaciones del mercado a las pocas que TÚ puedes operar — y de paso, EVA aprende."),
 ("callout", "howto", "**CÓMO USAR ESTA DIVISIÓN — Ideas**<br/>**Qué ves:** dónde entra el dinero institucional grande AHORA, en todo el mercado.<br/>**Qué haces:** úsala como RADAR / punto de partida — **NO como lista de compra**. Elige un ticker que te llame (prima grande + historial verde) y pásalo a la vista **Ticker** para el análisis completo antes de decidir.<br/>**NO es:** «compra exactamente estos contratos». Es flujo que hizo OTRO; tú validas si tiene sentido para TI y tu cuenta.<br/>**Crúzala con:** **(1) el HISTORIAL de la idea** — *por qué:* te dice si ese patrón ya funcionó en ese ticker; *cómo:* prioriza las verdes (hit-rate alto) y desconfía de las rojas. **(2) la vista Ticker del símbolo** — *por qué:* Ideas ve solo UN flujo, Ticker te da la foto completa; *cómo:* abre el ticker y revisa si el sentiment (§5) y los muros (§7) apoyan la misma dirección del flujo. **(3) tu perfil de riesgo** — *cómo:* confirma cuántos contratos caben. *Ejemplo:* Ideas marca flujo bajista grande en INTC con historial 19% (rojo) → ese patrón casi nunca funcionó antes; mejor pásalo aunque la prima sea jugosa."),

 ("h2", "El embudo: los 2 filtros"),
 ("p", "**Filtro 1 — CALIDAD (en el servidor):** de las ~5,000 operaciones notables, quita lo que no sirve para operar (4 razones, abajo). **Filtro 2 — TU CUENTA (en tu navegador):** de las que quedan, deja solo las que caben en tu presupuesto de riesgo. Por eso el encabezado dice, por ejemplo, «9 ideas operables · 15 descartadas»."),
 ("image", "ideas_cards.png", "Ejemplo real: 5,000 escaneadas → el filtro de calidad tumbó 1,934 por no ser inusuales y 170 por vencer pronto → quedan ~24 de calidad → 9 caben en la cuenta."),
 ("table", ["El Filtro 1 tumba por…", "Qué significa"], [
   ["No inusual", "Es grande pero NORMAL (no supera el umbral de rareza). La mayoría cae aquí."],
   ["Vencido / vence hoy", "No hay tiempo para que el movimiento se desarrolle."],
   ["Lotería (theta alto)", "Pierde >5% de su valor al día: se derrite, no es posición."],
   ["Sin theta", "El feed no trajo el dato para poder dimensionarlo."],
 ]),

 ("h2", "Tu perfil de riesgo (el 2º filtro)"),
 ("p", "Arriba pones el **tamaño de tu cuenta** y el **riesgo por trade** (% máximo a arriesgar). EVA calcula cuántos contratos caben SIN pasarte de ese límite. Tu saldo **nunca sale de tu navegador** — el servidor no lo ve."),
 ("image", "ideas_perfil.png", "Cuenta $100,000 · riesgo 4% → máximo $4,000 por trade. Los números son un TECHO, no una sugerencia de compra."),
 ("p", "Por eso una idea puede quedar **descartada aunque sea buena**: es demasiado grande para tu cuenta. En la tabla lo ves en la columna **FRENO**: «prima» = te frenó el capital (cabe poco); «no alcanza» = ni un contrato entra (típico de SPX, que cuesta decenas de miles por contrato)."),

 ("h2", "Cómo leer cada idea"),
 ("p", "En **Estudiante** cada idea es una tarjeta; en **Pro** es una fila de tabla con todo el detalle. Lo que muestra:"),
 ("image", "ideas_tabla.png", "Vista Pro: cada fila es una idea — contrato, prima del flujo, cuántos contratos caben, el freno, el % de tu cuenta y el HISTORIAL. Abajo, las SPX con FRENO «no alcanza» (no entra ni una)."),
 ("table", ["Dato", "Qué te dice"], [
   ["Contrato + vencimiento", "El strike, si es call o put, y cuándo vence (ej. AMZN $335C, 165 días)."],
   ["Prima del flow", "Cuánto dinero movió ese flujo institucional (ej. $7.1M). Más grande = más convicción del dinero."],
   ["Máx. contratos / % cuenta", "Cuántos caben en tu riesgo y qué % de tu cuenta arriesgas con ellos."],
   ["Freno", "Qué te limitó: «prima» (el capital) o «no alcanza» (no entra ni uno)."],
   ["Historial", "Lo más importante (↓ siguiente sección): si ese patrón funcionó antes en ese ticker."],
 ]),

 ("h2", "Cómo EVA aprende de cada escaneo"),
 ("p", "**Cada escaneo guarda el flujo que vio, por ticker.** Con el tiempo eso arma un **historial**, y EVA mide: cuando apareció flujo así antes en este ticker, ¿el precio lo confirmó? Ese es el **hit-rate** de la columna HISTORIAL:"),
 ("table", ["Lo que ves", "Qué significa"], [
   ["sin historial todavía", "Aún no hay suficientes flujos guardados de ese ticker. Se llena con el uso."],
   ["100% · ~3 ses (verde)", "Ese patrón acertó el 100% de las veces, y tardó ~3 sesiones en confirmarse."],
   ["19% · ~1 ses (rojo)", "Ese patrón casi nunca funcionó antes. Bandera roja."],
 ]),
 ("p", "O sea: Ideas no solo dice «hay flujo aquí», sino «y este tipo de flujo en este ticker históricamente sí/no funcionó». Es el **bucle de aprendizaje** en acción (ver §11). Mientras más uses EVA, más historial acumula y más fiable se vuelve su lectura."),

 ("h2", "Cómo se conecta con el resto del agente"),
 ("p", "Ideas no vive aislada — se apoya en el resto y lo alimenta:"),
 ("table", ["Se conecta con…", "Cómo"], [
   ["El sub-agente Inusualidad (§6)", "El Filtro 1 de calidad ES la nota de Inusualidad: tamaño, delta, theta, gamma, vencimiento. Solo pasa lo genuinamente raro."],
   ["Los muros / GEX (§7)", "Cuando analizas un ticker que salió en Ideas, ves sus muros de gamma y el movimiento esperado: el contexto de dónde puede frenar el precio."],
   ["La memoria / aprendizaje (§11)", "Cada escaneo alimenta el historial por-ticker que usa el sub-agente 'Confirmación de Precio'."],
   ["EVA Credit Spread", "El flujo de alta convicción que detecta Ideas es la materia prima de la estrategia de credit spread validada."],
 ]),
 ("image", "ideas_walls.png", "Al analizar un ticker que salió en Ideas, ves sus muros de gamma (Ticker/Pro): dónde el precio suele frenar o acelerar."),

 ("h1", "9. Wheel, y las otras divisiones"),
 ("p", "Wheel merece detalle (es una estrategia entera); las otras tres las repaso en breve. Todas comparten el mismo bloque **«cómo usar»** (el recuadro azul), y en «Crúzala con» te explico **por qué** y **cómo** cruzarlas, con ejemplos."),

 ("h2", "Wheel — la estrategia de ingreso vendiendo prima"),
 ("p", "La **Wheel** («la rueda») es una estrategia de INGRESO con **dos patas**: **(A)** vendes un **put cash-secured** — cobras prima y dejas efectivo de colateral (strike × 100); si el precio baja y te **asignan**, te quedas la acción a descuento. **(B)** Con esas acciones, vendes **calls cubiertas** encima — cobras más prima; si te las **llaman**, las vendes con ganancia y vuelves a empezar. Cobras prima en todo el ciclo."),
 ("callout", "warn", "OJO — hoy la app solo hace la PATA A (vender puts). La PATA B (calls cubiertas sobre acciones que YA tienes) NO está construida todavía. Si tienes acciones (ej. 500 de HOOD = hasta 5 contratos de calls cubiertas), Wheel aún no te ayuda con eso — es una pieza pendiente de desarrollar."),
 ("p", "**Cómo elige qué put vender:** primero eliges un **preset de riesgo**, que fija el |delta| del put (≈ probabilidad de que te asignen) y los días al vencimiento (DTE):"),
 ("table", ["Preset", "|Delta|", "DTE", "Perfil"], [
   ["Conservador", "0.10–0.20", "30–45", "~10-20% chance de asignación, strike lejos del precio."],
   ["Balanceado", "0.20–0.30", "30–45", "Punto medio: más prima, más chance."],
   ["Agresivo", "0.30–0.40", "7–21", "Más prima y más chance de asignación, corto plazo."],
 ]),
 ("p", "De la cadena se queda con los puts en esa banda que pasan **liquidez** (hay bid, spread ≤25%, OI ≥100), y los **puntúa de 0 a 100** con 5 criterios. Qué es cada uno y **qué mira Wheel**:"),
 ("table", ["Criterio (puntos máx.)", "Qué es y qué mira Wheel"], [
   ["Rendimiento anualizado (30)", "La prima que cobras frente al efectivo inmovilizado, llevada a un año. Premia el rango SANO (15-35% → 30 pts) y **castiga lo demasiado alto** (>60% → solo 10 pts): una prima altísima suele significar que el mercado espera un desplome. No busca la prima más grande, sino la **mejor pagada por el riesgo**."],
   ["IV Rank (20)", "Qué tan cara está la volatilidad frente a su propio año. Como Wheel VENDE prima, quiere IV CARA: >70 → 20 pts; <30 → 4 pts («te pagan poco por el riesgo»). Es la banda INVERTIDA del resto del agente (que compra opciones y quiere IV barata)."],
   ["Colchón / soporte (25)", "Qué tan protegido queda el strike si el precio cae. Máximo (25) si el strike está **bajo un soporte fuerte** (donde el precio ya rebotó antes); 12 si solo hay >10% de colchón sin soporte; 5 si no hay colchón (te asignan fácil)."],
   ["Liquidez (15)", "Qué tan fácil entras y sales sin regalar dinero: OI≥500 y spread≤10% → 15 (excelente); OI≥100 y spread≤25% → 5 (justa); menos → 0 (bloqueado)."],
   ["Earnings (10)", "Si hay reporte de resultados DENTRO del trade (un reporte puede mover la acción de golpe): fuera del vencimiento → 10 pts; dentro (estimado) → 3; dentro confirmado por la volatilidad → 0."],
 ]),
 ("callout", "info", "Dato clave: **Wheel NO usa el scorecard de flujo — ni Victor ni EVA.** Es un sistema APARTE, con su propio score (los 5 criterios de arriba) y su propio universo de acciones. No mira el dinero institucional ni el sentiment — solo «¿esta prima paga bien, con poco riesgo, en una acción sólida?». Conectarle el filtro de convicción de EVA sería algo NUEVO a probar."),
 ("callout", "warn", "PENDIENTE — Wheel NO está validado: es solo un screener hacia adelante, SIN backtest. No sabemos aún si de verdad da ventaja. Plan: backtestear la rueda (con los mismos gates que el credit spread: out-of-sample, amplitud, costos), y si aguanta → forward-test en vivo. Antes de arriesgar con esto, hay que probarlo."),
 ("callout", "howto", "**CÓMO USAR ESTA DIVISIÓN — Wheel**<br/>**Qué ves:** candidatos para vender puts cash-secured (ingreso), con su score 0-100 y cuántos contratos costeas.<br/>**Qué haces:** eliges un candidato cuyo strike te gustaría poseer si te asignan, y usas los números como TECHO de sizing (no como sugerencia de compra).<br/>**NO es:** una recomendación validada (sin backtest aún), y no cubre las calls sobre acciones que ya tienes.<br/>**Crúzala con:** **(1) la vista Ticker del símbolo** — *por qué:* el score de Wheel NO mira el flujo institucional; *cómo:* revisa si el sentiment y los muros GEX apoyan el strike. *Ejemplo:* si vas a vender un put $80 en HOOD, mira si hay un muro de puts / soporte cerca de $80 — si lo hay, el precio tiende a frenarse ahí y baja tu riesgo de asignación. **(2) Tu perfil de riesgo** — *cómo:* confirma que el colateral (strike × 100 por contrato) cabe sin pasarte de tu % máximo por trade."),

 ("h2", "Time & Sales — el tape en crudo"),
 ("p", "Cada operación notable según va pasando, con su agresor (¿compró al bid o al ask?) y sus griegas. Es la materia prima SIN filtrar de la que salen Ideas y el sentiment."),
 ("callout", "howto", "**CÓMO USAR ESTA DIVISIÓN — Time & Sales**<br/>**Qué ves:** el flujo bruto en vivo, operación por operación, con agresor y griegas.<br/>**Qué haces:** confirmas con tus ojos lo que los scores resumen — ¿de verdad compran calls al ask con urgencia?<br/>**NO es:** una señal ya masticada; es data cruda para verificar.<br/>**Crúzala con:** **el AI Sentiment (§5) y los sub-agentes (§6)** del mismo ticker — *por qué:* los scores RESUMEN el tape; aquí verificas con tus ojos que el resumen es fiel y no ruido; *cómo:* si el sentiment dice «bajista fuerte», deberías VER en el tape puts comprándose al ask con tamaño. *Ejemplo:* el score marca Convicción 8/10 alcista — bajas al tape y ves 3 bloques de calls al ask de $2M cada uno → confirmado."),

 ("h2", "0DTE — expiran hoy"),
 ("p", "Opciones que vencen el MISMO día (0 días al vencimiento). Sección en construcción; el contenido lo definimos juntos."),
 ("callout", "howto", "**CÓMO USAR ESTA DIVISIÓN — 0DTE**<br/>**Qué ves:** (próximamente) el flujo y los niveles de las opciones que expiran hoy.<br/>**Qué haces:** — en construcción.<br/>**NO es:** funcional todavía.<br/>**Crúzala con:** (cuando esté) **los muros/GEX intradía (§7)** — *por qué:* en 0DTE el gamma de los dealers domina el precio hora a hora, más que en cualquier otro plazo; *cómo:* el precio tiende a imantarse al muro más grande del día, así que ese muro es tu nivel clave para entrar/salir."),

 ("h2", "EVA Credit Spread — la estrategia validada"),
 ("p", "El forward-test EN VIVO (paper) de la estrategia que probamos: vender credit spreads en los días de alta convicción de EVA. Muestra las pruebas, las 5 mejoras y cada jugada registrada."),
 ("callout", "howto", "**CÓMO USAR ESTA DIVISIÓN — EVA Credit Spread**<br/>**Qué ves:** la estrategia validada en prueba en vivo: qué entró, su estatus y su resultado.<br/>**Qué haces:** la SIGUES para ver si el edge se sostiene hacia adelante — es observación, no operación (aún).<br/>**NO es:** una lista de trades para copiar hoy; está en fase de prueba.<br/>**Crúzala con:** nada por ahora — esta división ES la prueba, no una herramienta de operar. *Cómo seguirla:* mira si el «Top⅓ de convicción» rinde mejor que el «Bottom⅓» a medida que se acumulan cierres; ese es el edge que queremos confirmar hacia adelante antes de arriesgar dinero real."),

 ("h1", "10. Reglas de liquidez (aviso clave)"),
 ("callout", "warn", "Si la cadena de opciones es POCO LÍQUIDA (bajo volumen/OI, spreads anchos), Eva marca la señal como 'datos poco fiables' y recomienda NO operarla. SIEMPRE lee este aviso primero — una señal sobre datos malos no vale nada."),

 ("h1", "11. Cómo Eva 'aprende' todos los días"),
 ("p", "Sí, Eva aprende — y aquí está exactamente cómo, dónde y en qué acciones:"),
 ("table", ["Paso", "Qué pasa / dónde"], [
   ["1. Guarda", "CADA vez que analizas un ticker (y cada vez que corre el radar /ideas), Eva guarda los flujos que vio."],
   ["2. Espera", "Deja pasar las sesiones siguientes (hasta ~20 días de mercado)."],
   ["3. Valida", "Mira qué hizo el precio DESPUÉS: ¿validó el flujo (se movió a favor) o lo absorbió? Mide cuánto se movió a favor y en contra, y cuántas sesiones tardó."],
   ["4. Puntúa", "De ahí sale el sub-agente 'Confirmación de Precio' y la 'Memoria': el HIT RATE histórico de ese ticker."],
 ]),
 ("p", "**En cuáles acciones corre:** al cargar cualquier ticker (rutas de validación y predicción) y en el radar de Ideas. **Mientras más uses Eva en un ticker, más historial acumula y más confiable se vuelve su lectura de '¿este patrón ha funcionado antes?'.**"),
 ("callout", "info", "Esto es la base de la CONFIANZA: no 'creemos' que la señal funciona — Eva lo mide contra lo que el precio realmente hizo. (Próximo paso pendiente: un 'chequeo de confianza' que mida el backtest de los 6 sub-agentes uno por uno.)"),

 ("h1", "12. Ejemplos de estrategia (educativo, NO consejo)"),
 ("p", "Cómo la información de Eva **suele mapearse** a estrategias comunes de opciones. Son ejemplos educativos, no recomendaciones:"),
 ("table", ["Lo que Eva muestra", "Estrategia que algunos usan"], [
   ["Sesgo alcista + convicción alta", "Comprar calls, o un call debit spread (direccional, riesgo definido)."],
   ["Sesgo bajista + convicción alta", "Comprar puts, o un put debit spread."],
   ["Muro de calls fuerte arriba (resistencia)", "Call credit spread por debajo del muro (apuesta a que no lo rompe)."],
   ["Muro de puts fuerte abajo (soporte)", "Cash-secured put en el soporte (la Wheel) para cobrar prima."],
   ["IV inflada (Contexto IV bajo)", "Vender prima (credit spreads); comprar prima sale caro."],
   ["IV baja + señal direccional", "Comprar prima (calls/puts) sale más barato."],
 ]),
 ("disclaimer", "Ninguna de estas es una recomendación. Cada estrategia tiene riesgo; el tamaño y la decisión son tuyos."),

 ("h1", "13. Mis recomendaciones (de Claude)"),
 ("table", ["Recomendación", "Por qué"], [
   ["Lee SIEMPRE el aviso de liquidez primero", "Una señal sobre datos poco fiables no sirve, por buena que se vea."],
   ["El flujo es una pista, no una confesión", "Ese call/put institucional PUEDE ser un hedge, no una apuesta. No lo sigas a ciegas."],
   ["Gestión de riesgo > cualquier señal", "La consistencia se gana NO perdiendo: tamaño de posición, no arriesgues lo que no puedes perder."],
   ["Usa la Memoria / Confirmación de Precio", "Deja que el backtest te diga cuánto confiar en cada ticker, con números."],
   ["Empieza chico, valida, escala", "Prueba la señal con tamaño pequeño antes de apostar en serio."],
 ]),
 ("disclaimer", "Eva y yo no somos asesores financieros. Damos contexto y análisis; las decisiones de inversión — y su riesgo — son enteramente tuyas."),

 ("h1", "14. Hacia dónde va EVA — 5 mejoras en desarrollo"),
 ("p", "Estas cinco mejoras son las que separarían a EVA de un simple lector de flujo estático (como el sistema base). No son magia garantizada — son las apuestas donde hay MÁS chance de un salto real. Cada una se construye y se valida con backtest y forward-test antes de confiar en ella."),
 ("table", ["Mejora", "Qué hace", "Qué añade a tu análisis"], [
   ["1. Conciencia de régimen", "EVA sabe en qué 'clima' está el mercado (tranquilo, volátil, en tendencia) y ajusta su lectura según eso.", "Una señal que en promedio es ruido puede ser FUERTE en un régimen específico. Deja de tratar todos los días igual."],
   ["2. Lado del dealer (GEX)", "Ve hacia dónde los market makers están FORZADOS a comprar/vender para cubrirse (gamma), no solo quién opera.", "Anticipa squeezes (gamma negativa acelera el precio) y frenos (gamma positiva lo revierte) que el flujo por sí solo no muestra. Es la base del 'Power Monday'."],
   ["3. Bucle de aprendizaje", "Mide sus propios aciertos y RE-CALIBRA sus pesos sola con el tiempo.", "Mejora continua. El sistema base es estático; EVA aprende de lo que funcionó y lo que no."],
   ["4. Resultados como distribución", "En vez de un '80/100', dice: '45% de aciertos, resultado típico 0%, y 5% de chance de +300%'.", "Honestidad para dimensionar el riesgo. Un número solo engaña; la distribución te dice la verdad de lo que puede pasar."],
   ["5. Motor señal → vehículo", "No solo dice 'alcista'; dice 'y dada esta IV, la mejor forma de jugarlo es este spread', no un call pelado.", "Convierte el análisis en una acción concreta: del QUÉ (dirección) al CÓMO (la estructura óptima)."],
 ]),
 ("disclaimer", "Mejoras en desarrollo, NO promesas. Cada una se valida con datos antes de confiar en ella. El objetivo es un salto real y medido, no una ilusión — y si los datos dicen que una no sirve, se descarta con honestidad."),

 ("h1", "15. Glosario"),
 ("table", ["Término", "Qué es"], [
   ["Agresor (ask/bid)", "Quién forzó la operación: al ASK = comprador agresivo; al BID = vendedor agresivo."],
   ["Premium", "El dinero total de una operación (precio × contratos × 100)."],
   ["Notional", "El valor nominal expuesto (OI × 100 × strike)."],
   ["Open Interest (OI)", "Contratos abiertos vivos en ese strike."],
   ["Delta", "Cuánto se mueve la opción por $1 del subyacente. Cerca de ±1 = muy direccional."],
   ["Gamma", "Qué tan rápido cambia la delta. Zona institucional ~0.01-0.08."],
   ["Theta", "El decaimiento diario por el paso del tiempo (juega en contra del comprador)."],
   ["IV (volatilidad implícita)", "La volatilidad que el mercado le pone al precio de la opción."],
   ["GEX (Gamma Exposure)", "Dónde se concentra la gamma de la cadena = los 'muros' de soporte/resistencia."],
   ["Muro", "Un strike con tanto dinero/gamma que el precio tiende a frenarse ahí."],
   ["Cono (±1σ/±2σ)", "El rango de precio esperado por estadística (68% / 95%)."],
   ["Multileg", "Una operación de varias patas a la vez (spread) — más difícil de leer que una sola pata."],
   ["LEAP", "Opción de vencimiento largo (~1 año o más)."],
   ["Hit rate", "% de veces que el precio validó el flujo históricamente (el backtest de Eva)."],
   ["n (tamaño de muestra)", "Cuántos casos entraron en una prueba. Un % sobre n grande es más confiable que sobre n chico."],
 ]),

 ("h1", "16. Herramientas y plataformas que usamos"),
 ("p", "Todo lo que hace funcionar a EVA, y para qué sirve cada pieza. Con honestidad marcamos cuáles están **en vivo** en la app y cuáles usamos **alrededor** del proyecto o estamos **evaluando** — para no dar por conectado lo que aún no lo está."),
 ("table", ["Plataforma", "Para qué la usamos", "Estado"], [
   ["Claude / Claude Code (Anthropic)", "El agente que construye, analiza y explica: escribe el código, corre los backtests y arma este manual.", "En vivo (EVA)"],
   ["Massive (ex-Polygon.io)", "Fuente PRIMARIA de datos de opciones: cadenas, Time & Sales (el firehose de operaciones), barras diarias, logos y fundamentales. De aquí sale casi todo el flujo.", "En vivo (EVA)"],
   ["Redis", "Memoria rápida en la nube: el búfer de flujo notable de Ideas y los ledgers de los forward-tests (credit spread y wheel).", "En vivo (EVA)"],
   ["Railway", "El hosting en la nube: sirve la app y corre los cron (los forward-tests que registran operaciones de papel cada día). También provee el Redis.", "En vivo (EVA)"],
   ["RSS (feeds de noticias)", "Titulares y catalizadores del activo (la tarjeta de Noticias). Las fuentes están en docs/RSS-Feed.md.", "En vivo (EVA)"],
   ["Databento", "Datos de mercado de grado institucional (Time & Sales). Es la fuente de datos del fork de Victor (smart-money-flow); en la web EVA hoy usamos Massive.", "Fork de Victor"],
   ["FMP (Financial Modeling Prep)", "Fundamentales y estados financieros de empresas (earnings, ratios).", "Evaluada — no cableada aún"],
   ["FRED (St. Louis Fed)", "Datos macro oficiales (tasas, inflación, empleo) para el contexto de mercado.", "Evaluada — no cableada aún"],
   ["Finnhub", "Datos de mercado, noticias y fundamentales — alternativa/complemento para cubrir huecos de datos.", "Evaluada — no cableada aún"],
   ["Dribbble", "Inspiración de diseño (UI/UX): de ahí salen ideas visuales como el rediseño 'Agente MK II'. No es fuente de datos.", "Diseño"],
 ]),
 ("disclaimer", "«Evaluada — no cableada aún» = la consideramos o probamos, pero HOY no alimenta la app en vivo. Lo aclaramos para no vender humo: si un dato no viene de una fuente conectada, todavía no está dentro de EVA."),
]


def md_inline(t):
    return t  # el markdown ya usa **negrita**

def rl_inline(t):
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)


def build_pdf(path):
    doc = SimpleDocTemplate(path, pagesize=LETTER, topMargin=18*mm, bottomMargin=16*mm,
                            leftMargin=18*mm, rightMargin=18*mm, title="Manual de Eva")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Heading1"], textColor=TEALD, fontName=BASEBOLD, fontSize=15, spaceBefore=14, spaceAfter=6, leading=18)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], textColor=TEALD, fontName=BASEBOLD, fontSize=11.5, spaceBefore=10, spaceAfter=4, leading=15)
    body = ParagraphStyle("body", parent=ss["Normal"], textColor=INK, fontName=BASEFONT, fontSize=10.2, leading=15, spaceAfter=5)
    cap = ParagraphStyle("cap", parent=ss["Normal"], textColor=MUTED, fontName=BASEFONT, fontSize=8.4, leading=11, alignment=1, spaceBefore=3, spaceAfter=2)
    disc = ParagraphStyle("disc", parent=body, textColor=MUTED, fontSize=8.6, leading=12)
    cellh = ParagraphStyle("cellh", parent=body, textColor=colors.white, fontSize=9.4, leading=12)
    cell = ParagraphStyle("cell", parent=body, fontSize=9.2, leading=12, spaceAfter=0)
    callp = ParagraphStyle("callp", parent=body, fontSize=9.6, leading=13, spaceAfter=0)
    story = []

    for blk in C:
        kind = blk[0]
        if kind == "cover":
            story.append(Spacer(1, 40*mm))
            story.append(Paragraph('<font color="#0F9E75"><b>Eva</b></font>', ParagraphStyle("ct", parent=ss["Title"], fontSize=44, leading=48, alignment=1)))
            story.append(Spacer(1, 4*mm))
            story.append(Paragraph("Guía del agente de opciones", ParagraphStyle("cs", parent=ss["Title"], fontSize=17, leading=22, alignment=1, textColor=INK)))
            story.append(Spacer(1, 3*mm))
            story.append(Paragraph("Cómo leer el flujo institucional para tomar decisiones informadas", ParagraphStyle("css", parent=body, alignment=1, textColor=MUTED, fontSize=11)))
            story.append(Spacer(1, 30*mm))
            story.append(_callout_table("info", "Eva no es asesor financiero ni ejecuta órdenes. Te da contexto y señales; las decisiones — y el riesgo — son tuyas.", callp))
            story.append(PageBreak())
        elif kind == "h1":
            story.append(Paragraph(rl_inline(blk[1]), h1))
            story.append(HRFlowable(width="100%", thickness=1.2, color=TEAL, spaceBefore=1, spaceAfter=6))
        elif kind == "h2":
            story.append(Paragraph(rl_inline(blk[1]), h2))
        elif kind == "image":
            p = os.path.join(HERE, "img", blk[1])
            iw, ih = ImageReader(p).getSize()
            W = 150 * mm
            im = Image(p, width=W, height=W * ih / iw)
            im.hAlign = "CENTER"
            story.append(im)
            if len(blk) > 2 and blk[2]:
                story.append(Paragraph(rl_inline(blk[2]), cap))
            story.append(Spacer(1, 8))
        elif kind == "p":
            story.append(Paragraph(rl_inline(blk[1]), body))
        elif kind == "disclaimer":
            story.append(Paragraph(rl_inline(blk[1]), disc))
        elif kind == "callout":
            story.append(_callout_table(blk[1], blk[2], callp))
            story.append(Spacer(1, 5))
        elif kind == "band":
            story.append(_band())
            story.append(Spacer(1, 6))
        elif kind == "table":
            headers, rows = blk[1], blk[2]
            data = [[Paragraph(rl_inline(h), cellh) for h in headers]]
            for r in rows:
                data.append([Paragraph(rl_inline(c), cell) for c in r])
            ncol = len(headers)
            widths = _col_widths(ncol)
            t = Table(data, colWidths=widths, hAlign="LEFT")
            style = [
                ("BACKGROUND", (0,0), (-1,0), TEAL),
                ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                ("TOPPADDING", (0,0), (-1,-1), 5),
                ("BOTTOMPADDING", (0,0), (-1,-1), 5),
                ("LEFTPADDING", (0,0), (-1,-1), 7),
                ("RIGHTPADDING", (0,0), (-1,-1), 7),
                ("LINEBELOW", (0,0), (-1,-2), 0.4, colors.HexColor("#D9E2DF")),
            ]
            for i in range(1, len(data)):
                if i % 2 == 0:
                    style.append(("BACKGROUND", (0,i), (-1,i), BGROW))
            t.setStyle(TableStyle(style))
            story.append(t)
            story.append(Spacer(1, 6))

    doc.build(story)


def _col_widths(ncol):
    total = 174*mm
    if ncol == 2: return [total*0.34, total*0.66]
    if ncol == 3: return [total*0.24, total*0.60, total*0.16]
    return [total/ncol]*ncol


def _callout_table(kind, text, style):
    bg = {"info": BGINFO, "warn": BGWARN, "danger": BGDANGER, "howto": BGHOWTO}[kind]
    bar = {"info": TEAL, "warn": AMBER, "danger": RED, "howto": BLUE}[kind]
    t = Table([[Paragraph(rl_inline(text), style)]], colWidths=[174*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("LINEBEFORE", (0,0), (0,-1), 3, bar),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ]))
    return t


def _band():
    # Barra Bearish->Bullish con el marcador (ilustración del sentiment direccional)
    segs = ["#F97066", "#D9A0A0", "#D0D5DD", "#9ADBB9", "#32D583"]
    row = [""]*5
    t = Table([row], colWidths=[174*mm/5]*5, rowHeights=[8*mm])
    st = [("VALIGN",(0,0),(-1,-1),"MIDDLE")]
    for i,c in enumerate(segs):
        st.append(("BACKGROUND",(i,0),(i,0), colors.HexColor(c)))
    t.setStyle(TableStyle(st))
    lbls = Table([[Paragraph('<font color="#E24B4A"><b>Bearish</b></font> (bajista)', _sm()),
                   Paragraph('Neutral', _sm()),
                   Paragraph('<font color="#12B76A"><b>Bullish</b></font> (alcista)', _smr())]],
                  colWidths=[174*mm/3]*3)
    lbls.setStyle(TableStyle([("TOPPADDING",(0,0),(-1,-1),3)]))
    return Table([[t],[lbls]], colWidths=[174*mm])


def _sm():
    return ParagraphStyle("sm", fontName=BASEFONT, fontSize=8.5, textColor=colors.HexColor("#667085"))
def _smr():
    return ParagraphStyle("smr", parent=_sm(), alignment=2)


def build_md(path):
    out = ["# Manual de Eva\n", "### Guía del agente de opciones\n",
           "_Cómo leer el flujo institucional para tomar decisiones informadas._\n",
           "> Eva no es asesor financiero ni ejecuta órdenes. Te da contexto; las decisiones y el riesgo son tuyas.\n"]
    for blk in C:
        k = blk[0]
        if k == "cover": continue
        if k == "h1": out.append("\n## " + blk[1] + "\n")
        elif k == "h2": out.append("\n### " + blk[1] + "\n")
        elif k == "image":
            out.append("![" + blk[2] + "](img/" + blk[1] + ")\n")
            out.append("_" + blk[2] + "_\n")
        elif k == "p": out.append(md_inline(blk[1]) + "\n")
        elif k == "disclaimer": out.append("_" + md_inline(blk[1]) + "_\n")
        elif k == "callout":
            icon = {"info":"💡","warn":"⚠️","danger":"📉","howto":"🧭"}[blk[1]]
            out.append("> " + icon + " " + md_inline(blk[2]) + "\n")
        elif k == "band":
            out.append("`Bearish (bajista) ———|——— Neutral ———|——— Bullish (alcista)`  — el marcador se mueve por la DIRECCIÓN del flujo.\n")
        elif k == "table":
            headers, rows = blk[1], blk[2]
            out.append("| " + " | ".join(headers) + " |")
            out.append("|" + "|".join(["---"]*len(headers)) + "|")
            for r in rows:
                out.append("| " + " | ".join(cell.replace("\n"," ") for cell in r) + " |")
            out.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out))


if __name__ == "__main__":
    pdf = os.path.join(HERE, "Eva-Manual.pdf")
    md = os.path.join(HERE, "Eva-Manual.md")
    build_pdf(pdf)
    build_md(md)
    print("OK ->", pdf)
    print("OK ->", md)
