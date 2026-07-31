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

 ("h1", "2. Las 4 secciones del navegador"),
 ("table", ["Sección", "Para qué sirve"], [
   ["Ticker", "Análisis completo de una acción: sentiment, flujo, muros y sub-agentes."],
   ["Ideas", "Radar de TODO el mercado: dónde hay flujo institucional notable ahora mismo."],
   ["Wheel", "Screener de la estrategia Wheel (venta de puts cash-secured para ingreso)."],
   ["Time & Sales", "El tape en crudo: cada operación notable con su agresor y griegas."],
 ]),

 ("h1", "3. La vista Ticker: Estudiante vs Pro"),
 ("p", "Arriba de todo eliges el modo:"),
 ("table", ["Modo", "Qué ves"], [
   ["Estudiante", "Lo esencial y simple: un veredicto, 3 escenarios (alcista/base/bajista) y el precio esperado."],
   ["Pro", "Todo el detalle: el resumen, el sentiment, los 6 sub-agentes, los muros y el feed de operaciones."],
 ]),
 ("p", "Recomendación: empieza en **Estudiante**; sube a **Pro** cuando quieras el detalle."),

 ("h1", "4. El resumen en lenguaje sencillo"),
 ("p", "Al **tope del modo Pro** hay un párrafo que traduce todos los números a una frase que puedes leer en 5 segundos. Ejemplo real (AAPL):"),
 ("callout", "danger", "El flujo se inclina bajista — Flujo institucional pesado en AAPL ($24.1M notable), concentrado en calls y puts, ejecutado agresivo (comprando al ask) — 73% del dinero entró al ask, Convicción 8/10. El posicionamiento se inclina BAJISTA."),
 ("p", "Léelo primero; luego baja y ata cada dato con el detalle. **Este resumen se arma solo con los datos reales, no lo inventa ningún modelo.**"),

 ("h1", "5. AI Sentiment Score (direccional)"),
 ("p", "Este medidor te dice **dos cosas separadas**:"),
 ("table", ["Qué es", "Qué mide"], [
   ["DIRECCIÓN (etiqueta + marcador)", "Hacia dónde apuesta el flujo: Bearish (bajista) · Neutral · Bullish (alcista)."],
   ["FUERZA (0-100)", "Qué tan fuerte es la señal (promedio de los 6 sub-agentes). Alta ≥60, media 45-59, baja <45."],
 ]),
 ("image", "sentiment.png", "El medidor: la barra va de Bearish a Bullish y el marcador señala la DIRECCIÓN del flujo; la fuerza (0-100) es un dato aparte."),
 ("p", "**Importante:** una señal puede ser **fuerte pero bajista** (mucho dinero comprando puts agresivo). Por eso Eva separa dirección de fuerza — no confundas 'fuerte' con 'alcista'."),

 ("h1", "6. Los 6 sub-agentes (el corazón de Eva)"),
 ("p", "El sentiment sale del promedio de estos 6. Cada uno mira una cosa distinta:"),
 ("table", ["Sub-agente", "Qué mide / qué buscar", "Peso"], [
   ["Agresividad", "¿Compran al ASK con fuerza? Mucho dinero al ask = urgencia direccional.", "20%"],
   ["Convicción", "Calidad del flujo: spread apretado, un solo lado dominante, ejecución fuerte.", "20%"],
   ["Inusualidad", "¿Griegas de grado institucional? Tamaño, delta alta, vencimientos, gamma.", "20%"],
   ["Estructura", "¿Dónde se acumula el dinero? (muros GEX) y la liquidez de la cadena.", "15%"],
   ["Contexto IV", "¿La volatilidad implícita está limpia o inflada? Evita pagar prima cara.", "10%"],
   ["Confirmación de Precio", "¿El precio VALIDÓ flujos pasados o los absorbió? (el backtest, ver §9).", "15%"],
 ]),
 ("image", "subagentes.png", "Cada sub-agente puntúa 0-10; el AI Sentiment Score es su promedio ponderado por los pesos."),

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

 ("h1", "8. Reglas de liquidez (aviso clave)"),
 ("callout", "warn", "Si la cadena de opciones es POCO LÍQUIDA (bajo volumen/OI, spreads anchos), Eva marca la señal como 'datos poco fiables' y recomienda NO operarla. SIEMPRE lee este aviso primero — una señal sobre datos malos no vale nada."),

 ("h1", "9. Cómo Eva 'aprende' todos los días"),
 ("p", "Sí, Eva aprende — y aquí está exactamente cómo, dónde y en qué acciones:"),
 ("table", ["Paso", "Qué pasa / dónde"], [
   ["1. Guarda", "CADA vez que analizas un ticker (y cada vez que corre el radar /ideas), Eva guarda los flujos que vio."],
   ["2. Espera", "Deja pasar las sesiones siguientes (hasta ~20 días de mercado)."],
   ["3. Valida", "Mira qué hizo el precio DESPUÉS: ¿validó el flujo (se movió a favor) o lo absorbió? Mide cuánto se movió a favor y en contra, y cuántas sesiones tardó."],
   ["4. Puntúa", "De ahí sale el sub-agente 'Confirmación de Precio' y la 'Memoria': el HIT RATE histórico de ese ticker."],
 ]),
 ("p", "**En cuáles acciones corre:** al cargar cualquier ticker (rutas de validación y predicción) y en el radar de Ideas. **Mientras más uses Eva en un ticker, más historial acumula y más confiable se vuelve su lectura de '¿este patrón ha funcionado antes?'.**"),
 ("callout", "info", "Esto es la base de la CONFIANZA: no 'creemos' que la señal funciona — Eva lo mide contra lo que el precio realmente hizo. (Próximo paso pendiente: un 'chequeo de confianza' que mida el backtest de los 6 sub-agentes uno por uno.)"),

 ("h1", "10. Ejemplos de estrategia (educativo, NO consejo)"),
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

 ("h1", "11. Mis recomendaciones (de Claude)"),
 ("table", ["Recomendación", "Por qué"], [
   ["Lee SIEMPRE el aviso de liquidez primero", "Una señal sobre datos poco fiables no sirve, por buena que se vea."],
   ["El flujo es una pista, no una confesión", "Ese call/put institucional PUEDE ser un hedge, no una apuesta. No lo sigas a ciegas."],
   ["Gestión de riesgo > cualquier señal", "La consistencia se gana NO perdiendo: tamaño de posición, no arriesgues lo que no puedes perder."],
   ["Usa la Memoria / Confirmación de Precio", "Deja que el backtest te diga cuánto confiar en cada ticker, con números."],
   ["Empieza chico, valida, escala", "Prueba la señal con tamaño pequeño antes de apostar en serio."],
 ]),
 ("disclaimer", "Eva y yo no somos asesores financieros. Damos contexto y análisis; las decisiones de inversión — y su riesgo — son enteramente tuyas."),

 ("h1", "12. Glosario"),
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
    bg = {"info": BGINFO, "warn": BGWARN, "danger": BGDANGER}[kind]
    bar = {"info": TEAL, "warn": AMBER, "danger": RED}[kind]
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
            icon = {"info":"💡","warn":"⚠️","danger":"📉"}[blk[1]]
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
