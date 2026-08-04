# -*- coding: utf-8 -*-
"""Genera ilustraciones (mockups) para el Manual de EVA con la paleta de marca.
Salida: manual/img/*.png  (200 dpi, ancho ~6.8in para caber a 174mm)."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon
from matplotlib import font_manager

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "img")
os.makedirs(IMG, exist_ok=True)

# Paleta EVA
TEAL = "#0F9E75"; INK = "#101828"; MUTED = "#667085"
RED = "#E24B4A"; GREEN = "#12B76A"; AMBER = "#E8940A"; GOLD = "#F5C542"; PURPLE = "#6B5CD6"
BG = "#FFFFFF"; SOFT = "#EEF2F1"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10,
    "axes.edgecolor": "#D9E2DF", "text.color": INK, "axes.labelcolor": INK,
    "xtick.color": MUTED, "ytick.color": MUTED, "figure.facecolor": BG, "axes.facecolor": BG,
})


def save(fig, name):
    fig.savefig(os.path.join(IMG, name), dpi=200, bbox_inches="tight", facecolor=BG)
    plt.close(fig)


def subagentes():
    # Ordenados por PESO de EVA (recalibrado): Convicción manda. Victor quedó obsoleto.
    cats = ["Convicción", "Inusualidad", "Estructura", "Contexto IV", "Agresividad", "Confirmación\nde Precio"]
    scores = [7, 6, 5, 7, 8, 4]
    weights = ["30%", "20%", "15%", "15%", "10%", "10%"]
    colors = [GREEN if s >= 7 else (AMBER if s >= 5 else RED) for s in scores]
    fig, ax = plt.subplots(figsize=(6.8, 2.9))
    y = range(len(cats))
    ax.barh(y, scores, color=colors, height=0.62, zorder=3)
    ax.barh(y, [10] * len(cats), color=SOFT, height=0.62, zorder=1)
    ax.set_yticks(list(y)); ax.set_yticklabels(cats, fontsize=9.5)
    ax.invert_yaxis()
    ax.set_xlim(0, 11.6); ax.set_xticks([0, 5, 10])
    for i, (s, w) in enumerate(zip(scores, weights)):
        ax.text(s + 0.2, i, f"{s}/10", va="center", ha="left", fontsize=9, fontweight="bold", color=INK, zorder=4)
        ax.text(11.5, i, f"peso {w}", va="center", ha="right", fontsize=8, color=MUTED)
    for sp in ["top", "right", "left"]:
        ax.spines[sp].set_visible(False)
    ax.set_title("Los 6 sub-agentes (pesos de EVA) — ejemplo de lectura",
                 fontsize=10.5, fontweight="bold", color="#0B5D46", pad=10, loc="left")
    ax.tick_params(length=0)
    save(fig, "subagentes.png")


def walls():
    fig, ax = plt.subplots(figsize=(6.8, 3.0))
    price = 100
    strikes = list(range(88, 113, 2))
    call_oi = [0, 0, 0, 0, 1, 2, 3, 5, 9, 4, 2, 1, 1]   # arriba del precio
    put_oi = [1, 2, 4, 8, 3, 2, 1, 0, 0, 0, 0, 0, 0]     # abajo del precio
    w = 1.5
    ax.bar(strikes, call_oi, width=w, color=GOLD, zorder=3, label="Calls (resistencia)")
    ax.bar(strikes, [-v for v in put_oi], width=w, color=PURPLE, zorder=3, label="Puts (soporte)")
    # cono ±1σ
    ax.axvspan(price - 6, price + 6, color=TEAL, alpha=0.07, zorder=0)
    ax.axvline(price, color=INK, ls="--", lw=1.3, zorder=4)
    ax.text(price, 9.6, "Precio actual", ha="center", fontsize=8.5, color=INK, fontweight="bold")
    ax.text(104, 9.2, "Muro de CALLS\n(resistencia)", ha="center", fontsize=8.5, color="#9A7A00")
    ax.text(94, -8.6, "Muro de PUTS\n(soporte)", ha="center", fontsize=8.5, color="#4B3FA0")
    ax.annotate("Nivel imán", xy=(104, 9), xytext=(108, 6.5), fontsize=8, color=MUTED,
                arrowprops=dict(arrowstyle="->", color=MUTED))
    ax.text(price + 6.2, 0, "±1σ (≈68%)", fontsize=7.5, color=TEAL, va="center")
    ax.set_yticks([]); ax.set_xlabel("Strike", fontsize=9)
    for sp in ["top", "right", "left"]:
        ax.spines[sp].set_visible(False)
    ax.set_title("Muros de strikes (GEX) — dónde se acumula el dinero",
                 fontsize=10.5, fontweight="bold", color="#0B5D46", pad=10, loc="left")
    ax.tick_params(length=0)
    save(fig, "walls.png")


def sentiment():
    # DOS preguntas DISTINTAS, en dos paneles separados para que no se confundan:
    #   1) DIRECCIÓN (¿hacia dónde?) -> el triángulo sobre la barra bajista↔alcista
    #   2) FUERZA    (¿qué tan fuerte?) -> un medidor 0-100 aparte (el total del scorecard)
    fig, (axd, axf) = plt.subplots(2, 1, figsize=(6.8, 2.7),
                                   gridspec_kw={"height_ratios": [1, 1], "hspace": 1.15})

    # --- Panel 1: DIRECCIÓN ---
    segs = [RED, "#D9A0A0", "#D0D5DD", "#9ADBB9", GREEN]
    for i, c in enumerate(segs):
        axd.add_patch(plt.Rectangle((i * 2, 0), 2, 1, color=c))
    mx = 7.6  # inclinado a alcista
    axd.add_patch(Polygon([[mx, 1.05], [mx - 0.28, 1.55], [mx + 0.28, 1.55]], color=INK))
    axd.text(0.1, -0.62, "Bearish (bajista)", fontsize=8, color=RED, fontweight="bold")
    axd.text(5, -0.62, "Neutral", fontsize=8, color=MUTED, ha="center")
    axd.text(9.9, -0.62, "Bullish (alcista)", fontsize=8, color=GREEN, fontweight="bold", ha="right")
    axd.text(0, 2.15, "① DIRECCIÓN — ¿hacia dónde apunta el flujo?",
             fontsize=9.2, color=INK, fontweight="bold")
    axd.text(mx, 1.78, "el triángulo se mueve por dirección", fontsize=7.3, color=MUTED, ha="center", style="italic")
    axd.set_xlim(-0.2, 10.2); axd.set_ylim(-0.95, 2.5); axd.axis("off")

    # --- Panel 2: FUERZA ---
    val = 63
    axf.add_patch(plt.Rectangle((0, 0), 10, 1, color=SOFT))
    axf.add_patch(plt.Rectangle((0, 0), val / 10, 1, color=TEAL))
    axf.text(val / 10 + 0.18, 0.5, f"{val}/100", va="center", ha="left",
             fontsize=9.5, fontweight="bold", color=INK)
    axf.text(0, 2.15, "② FUERZA — ¿qué tan fuerte/convincente? (= total del scorecard)",
             fontsize=9.2, color=INK, fontweight="bold")
    axf.text(0.1, -0.62, "0 = señal débil", fontsize=7.3, color=MUTED)
    axf.text(9.9, -0.62, "100 = señal fuerte", fontsize=7.3, color=MUTED, ha="right")
    axf.text(mx, 1.78, "un número aparte — el triángulo NO lo muestra", fontsize=7.3, color=MUTED, ha="center", style="italic")
    axf.set_xlim(-0.2, 11.6); axf.set_ylim(-0.95, 2.5); axf.axis("off")

    save(fig, "sentiment.png")


def modo_toggle():
    # Dos toggles apilados: arriba el MOTOR (Original|EVA), abajo la VISTA (Estudiante|Pro).
    fig, ax = plt.subplots(figsize=(6.8, 2.5))
    ax.set_xlim(0, 10); ax.set_ylim(0, 6); ax.axis("off")

    def pill(y, segs, active_idx, x0=2.7, w=4.6, h=0.92):
        seg_w = w / len(segs)
        ax.add_patch(FancyBboxPatch((x0, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.46",
                                    linewidth=0, facecolor=SOFT, zorder=1))
        for i, s in enumerate(segs):
            cx = x0 + i * seg_w
            if i == active_idx:
                ax.add_patch(FancyBboxPatch((cx + 0.07, y + 0.09), seg_w - 0.14, h - 0.18,
                             boxstyle="round,pad=0.02,rounding_size=0.4", linewidth=0, facecolor=TEAL, zorder=2))
                ax.text(cx + seg_w / 2, y + h / 2, s, ha="center", va="center", color="white",
                        fontsize=11.5, fontweight="bold", zorder=3)
            else:
                ax.text(cx + seg_w / 2, y + h / 2, s, ha="center", va="center", color=MUTED,
                        fontsize=11.5, fontweight="bold", zorder=3)

    ax.text(2.7, 5.45, "1º  el MOTOR", fontsize=9.5, color=INK, fontweight="bold")
    pill(4.25, ["Original", "EVA"], 1)
    ax.text(2.7, 3.35, "2º  la VISTA", fontsize=9.5, color=INK, fontweight="bold")
    pill(2.15, ["Estudiante", "Pro"], 1)
    ax.annotate("cambia TODO el\nscorecard de la página",
                xy=(7.3, 4.7), xytext=(7.7, 4.7), fontsize=8.3, color="#0B5D46",
                va="center", ha="left", fontweight="bold",
                arrowprops=dict(arrowstyle="->", color=TEAL))
    save(fig, "toggle_modo.png")


if __name__ == "__main__":
    subagentes(); walls(); sentiment(); modo_toggle()
    print("OK -> img/subagentes.png, img/walls.png, img/sentiment.png, img/toggle_modo.png")
