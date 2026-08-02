# -*- coding: utf-8 -*-
"""Genera el Informe de EVA (PDF): mejoras, pruebas, edge, Victor vs Eva, estimado."""
import os
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, HRFlowable, Image)
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
import re

HERE = os.path.dirname(os.path.abspath(__file__))
_AR = r"C:\Windows\Fonts\arial.ttf"; _ARB = r"C:\Windows\Fonts\arialbd.ttf"
if os.path.exists(_AR):
    pdfmetrics.registerFont(TTFont("Arial", _AR)); pdfmetrics.registerFont(TTFont("Arial-Bold", _ARB if os.path.exists(_ARB) else _AR))
    registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial", boldItalic="Arial-Bold")
    BF, BB = "Arial", "Arial-Bold"
else:
    BF, BB = "Helvetica", "Helvetica-Bold"

TEAL = colors.HexColor("#0F9E75"); TEALD = colors.HexColor("#0B5D46"); INK = colors.HexColor("#101828")
MUTED = colors.HexColor("#667085"); RED = colors.HexColor("#E24B4A"); AMBER = colors.HexColor("#B54708")
BGINFO = colors.HexColor("#E1F5EE"); BGWARN = colors.HexColor("#FEF0C7"); BGDANGER = colors.HexColor("#FEE4E2")
BGROW = colors.HexColor("#F1F5F4")

C = [
 ("cover",),
 ("h1", "1. Victor vs EVA — quién es quién"),
 ("p", "**Victor** es el sistema original que bajamos de su GitHub. Lo dejamos **CONGELADO** como punto de comparación (nuestro 'pasado'). **EVA** es lo que estamos mejorando (el 'futuro'). Nunca tocamos el código de Victor."),
 ("table", ["", "Victor (referencia)", "EVA (lo mejorado)"], [
   ["Qué es", "El sistema original, congelado", "La versión mejorada + 5 mejoras nuevas"],
   ["Pesos del scorecard", "Fijos (20/20/20/15/10/15)", "Recalibrados: Convicción ↑, Agresividad ↓"],
   ["Rankea mejor (prueba OOS)", "separación +15", "separación +21 (gana)"],
   ["Como FILTRO de trades", "sirve", "separa mejor bueno de malo (§5)"],
   ["Aprende con el tiempo", "No (estático)", "Sí (mejora #3)"],
 ]),

 ("h1", "2. Las 5 mejoras de EVA"),
 ("p", "Son las cinco cosas que separan a EVA de un simple lector de flujo. Se construyen y validan con datos."),
 ("table", ["Mejora", "Qué añade"], [
   ["1. Conciencia de régimen", "Sabe en qué 'clima' está el mercado (tranquilo/volátil) y ajusta. Una señal-ruido en promedio puede ser fuerte en un régimen."],
   ["2. Lado del dealer (GEX)", "Ve hacia dónde los market makers están forzados a comprar/vender. Anticipa squeezes ('Power Monday')."],
   ["3. Bucle de aprendizaje", "Mide sus aciertos y se re-calibra sola. Victor es estático; EVA aprende."],
   ["4. Resultados como distribución", "En vez de '80/100', dice '45% aciertos, 5% chance de +300%'. Honestidad para el riesgo."],
   ["5. Señal → vehículo", "No solo 'alcista'; dice 'la mejor forma es este spread'. Del qué al cómo."],
 ]),

 ("h1", "3. Las pruebas que hicimos"),
 ("p", "Probamos la idea contra datos del pasado (un 'backtest'). Primero, los términos en simple:"),
 ("table", ["Término", "Qué significa"], [
   ["Backtest", "Probar la estrategia con datos del pasado, como un simulador."],
   ["Credit spread", "Vendes una opción y compras otra más lejos: cobras prima y tu pérdida queda CAPADA."],
   ["Vender prima", "Cobrar por dar una especie de 'seguro'; ganas si el precio NO llega a cierto nivel."],
   ["σ (sigma) / mov. esperado", "El rango típico que se espera que se mueva el precio. '1σ' = un rango normal."],
   ["DTE", "Días al vencimiento de la opción (Days To Expiration)."],
   ["Alta convicción (Top⅓)", "El tercio de señales donde EVA está MÁS segura."],
   ["Out-of-sample (OOS)", "Probar en datos que NO usaste para afinar. Evita engañarte a ti mismo."],
   ["Slippage", "Lo que pierdes por no llenar exacto al precio medio (cruzar el bid/ask)."],
   ["Retorno sobre riesgo", "La ganancia como % de lo máximo que podías perder en ese trade."],
 ]),
 ("callout", "info", "El hallazgo: vender credit spreads SOLO en los días de alta convicción de EVA. Le pusimos 3 pruebas duras y las pasó todas:"),
 ("table", ["Prueba (gate)", "Pregunta", "Resultado"], [
   ["Out-of-sample", "¿Aguanta en el tiempo o fue un régimen de suerte?", "PASA — positivo en las 2 mitades"],
   ["Amplitud", "¿Suerte de una celda o algo amplio?", "PASA — 13 de 14 combinaciones"],
   ["Costos", "¿El slippage se lo come?", "PASA — sobrevive hasta 15% slippage"],
 ]),

 ("h1", "4. Dónde está el edge"),
 ("p", "Cada barra es una combinación de plazo (DTE) y distancia (σ). Verde = el edge aguantó; rojo = falló. El edge es **amplio**: vive en casi todos los plazos, más fuerte a **1σ** (más cerca) y en plazos largos (90-180 días)."),
 ("image", "informe_edge.png", "Retorno del Top-Convicción por plazo y distancia. 13 de 14 combinaciones positivas y robustas."),

 ("h1", "5. El valor de EVA: el filtro"),
 ("p", "Aquí se ve para qué sirve EVA. Operar **todas** las señales apenas empata (+3.3%). Pero filtrar por la **alta convicción de EVA** sube el retorno (+5.9%); la **baja convicción pierde** (−1.5%). EVA de verdad separa las buenas ventas de las malas."),
 ("image", "informe_filtro.png", "Filtrar por convicción de EVA separa lo bueno de lo malo (credit spread 5 días, 1σ)."),

 ("h1", "6. Estimado de ganancias: $10k, 2018 → jul 2026"),
 ("p", "Cuánto habría hecho una cuenta de $10,000 usando esto. **IMPORTANTE: es una estimación ILUSTRATIVA, no una promesa.** Solo validamos ~1 año de datos reales; esto **supone** que el edge se mantuvo 8.5 años (un supuesto grande)."),
 ("table", ["Supuesto", "Valor"], [
   ["Edge por trade (tras costos)", "~ +5% sobre riesgo"],
   ["Trades de alta convicción / año", "~ 60"],
   ["Riesgo por trade", "~ 4% de la cuenta"],
   ["Rendimiento anual estimado", "~ 10% (rango 6% – 15%)"],
   ["Período", "ene 2018 – jul 2026 (8.5 años)"],
 ]),
 ("image", "informe_proyeccion.png", "Estimado ilustrativo bajo 3 escenarios. El camino REAL tendría caídas grandes, no esta curva lisa."),
 ("callout", "danger", "Ojo con esto: la curva es LISA, pero la realidad NO. 2018, 2020 y 2022 tuvieron crashes donde vender prima puede perder 20-40% en semanas. El camino real tendría caídas fuertes. Y NADA de esto está probado en vivo todavía."),
 ("p", "**Rango:** pesimista ~$16k · **central ~$22k** · optimista ~$33k. La ganancia central sería **≈ +$12k** sobre los $10k. Léelo como 'orden de magnitud', no como número exacto."),

 ("h1", "7. El próximo paso"),
 ("p", "Falta el **último gate: probarlo EN VIVO** (forward-test / paper trading). Usar el panel de 12 acciones para que EVA marque los días de alta convicción hacia adelante, registrar el credit spread que abriría, y medir el resultado con **datos reales**. Después de unas semanas que aguanten → recién ahí, plata real y **empezando chico**."),
 ("disclaimer", "EVA y yo no somos asesores financieros. Todo esto es análisis y simulación; las decisiones y el riesgo son tuyos. Ningún resultado pasado garantiza ganancias futuras."),
]


def rl(t): return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)


def build(path):
    doc = SimpleDocTemplate(path, pagesize=LETTER, topMargin=18*mm, bottomMargin=16*mm, leftMargin=18*mm, rightMargin=18*mm, title="Informe de EVA")
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Heading1"], textColor=TEALD, fontName=BB, fontSize=15, spaceBefore=13, spaceAfter=6, leading=18)
    body = ParagraphStyle("body", parent=ss["Normal"], textColor=INK, fontName=BF, fontSize=10.2, leading=15, spaceAfter=5)
    disc = ParagraphStyle("disc", parent=body, textColor=MUTED, fontSize=8.6, leading=12)
    cap = ParagraphStyle("cap", parent=body, textColor=MUTED, fontSize=8.4, leading=11, alignment=1, spaceBefore=3, spaceAfter=2)
    cellh = ParagraphStyle("cellh", parent=body, textColor=colors.white, fontSize=9.2, leading=12)
    cell = ParagraphStyle("cell", parent=body, fontSize=9, leading=11.5, spaceAfter=0)
    callp = ParagraphStyle("callp", parent=body, fontSize=9.6, leading=13, spaceAfter=0)
    story = []
    for blk in C:
        k = blk[0]
        if k == "cover":
            story += [Spacer(1, 34*mm),
                      Paragraph('<font color="#0F9E75"><b>Informe EVA</b></font>', ParagraphStyle("ct", parent=ss["Title"], fontSize=38, leading=42, alignment=1)),
                      Spacer(1, 4*mm),
                      Paragraph("Qué mejoramos, qué probamos, y dónde está el edge", ParagraphStyle("cs", parent=ss["Title"], fontSize=15, leading=20, alignment=1, textColor=INK)),
                      Spacer(1, 3*mm),
                      Paragraph("Explicado simple — venta de credit spreads filtrada por la convicción de EVA", ParagraphStyle("css", parent=body, alignment=1, textColor=MUTED, fontSize=11)),
                      Spacer(1, 26*mm),
                      _call("info", "Resumen: encontramos un candidato REAL a ingreso consistente — vender credit spreads en los días de alta convicción de EVA. Pasó 3 pruebas duras (out-of-sample, amplitud, costos). Falta probarlo en vivo antes de arriesgar dinero.", callp),
                      PageBreak()]
        elif k == "h1":
            story += [Paragraph(rl(blk[1]), h1), HRFlowable(width="100%", thickness=1.2, color=TEAL, spaceBefore=1, spaceAfter=6)]
        elif k == "p":
            story.append(Paragraph(rl(blk[1]), body))
        elif k == "disclaimer":
            story.append(Paragraph(rl(blk[1]), disc))
        elif k == "callout":
            story += [_call(blk[1], blk[2], callp), Spacer(1, 5)]
        elif k == "image":
            p = os.path.join(HERE, "img", blk[1]); iw, ih = ImageReader(p).getSize()
            W = 165*mm; im = Image(p, width=W, height=W*ih/iw); im.hAlign = "CENTER"
            story.append(im)
            if len(blk) > 2 and blk[2]:
                story.append(Paragraph(rl(blk[2]), cap))
            story.append(Spacer(1, 8))
        elif k == "table":
            headers, rows = blk[1], blk[2]
            data = [[Paragraph(rl(h), cellh) for h in headers]]
            for r in rows:
                data.append([Paragraph(rl(c), cell) for c in r])
            ncol = len(headers); tot = 174*mm
            widths = [tot*0.30, tot*0.70] if ncol == 2 else ([tot*0.22, tot*0.42, tot*0.36] if ncol == 3 else [tot/ncol]*ncol)
            t = Table(data, colWidths=widths, hAlign="LEFT")
            st = [("BACKGROUND", (0,0), (-1,0), TEAL), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                  ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
                  ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
                  ("LINEBELOW", (0,0), (-1,-2), 0.4, colors.HexColor("#D9E2DF"))]
            for i in range(1, len(data)):
                if i % 2 == 0: st.append(("BACKGROUND", (0,i), (-1,i), BGROW))
            t.setStyle(TableStyle(st)); story += [t, Spacer(1, 6)]
    doc.build(story)


def _call(kind, text, style):
    bg = {"info": BGINFO, "warn": BGWARN, "danger": BGDANGER}[kind]
    bar = {"info": TEAL, "warn": AMBER, "danger": RED}[kind]
    t = Table([[Paragraph(rl(text), style)]], colWidths=[174*mm])
    t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), bg), ("LINEBEFORE", (0,0), (0,-1), 3, bar),
                           ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
                           ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10)]))
    return t


if __name__ == "__main__":
    out = os.path.join(HERE, "EVA-Informe.pdf"); build(out); print("OK ->", out)
