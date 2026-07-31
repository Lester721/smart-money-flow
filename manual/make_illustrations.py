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
    cats = ["Agresividad", "Convicción", "Inusualidad", "Estructura", "Contexto IV", "Confirmación\nde Precio"]
    scores = [8, 7, 6, 5, 7, 4]
    weights = ["20%", "20%", "20%", "15%", "10%", "15%"]
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
    ax.set_title("Los 6 sub-agentes — ejemplo de lectura (el sentiment es su promedio)",
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
    fig, ax = plt.subplots(figsize=(6.8, 1.5))
    segs = [RED, "#D9A0A0", "#D0D5DD", "#9ADBB9", GREEN]
    for i, c in enumerate(segs):
        ax.add_patch(plt.Rectangle((i * 2, 0), 2, 1, color=c))
    marker_x = 7.4  # inclinado a bullish
    ax.add_patch(Polygon([[marker_x, 1.05], [marker_x - 0.28, 1.5], [marker_x + 0.28, 1.5]], color=INK))
    ax.text(0.1, -0.5, "Bearish (bajista)", fontsize=8.5, color=RED, fontweight="bold")
    ax.text(5, -0.5, "Neutral", fontsize=8.5, color=MUTED, ha="center")
    ax.text(9.9, -0.5, "Bullish (alcista)", fontsize=8.5, color=GREEN, fontweight="bold", ha="right")
    ax.text(marker_x, 1.75, "DIRECCIÓN del flujo", fontsize=8, color=INK, ha="center")
    ax.text(5, 2.35, "Fuerza 72/100  ·  la barra marca la DIRECCIÓN, no la fuerza",
            fontsize=8.5, color=MUTED, ha="center", style="italic")
    ax.set_xlim(-0.2, 10.2); ax.set_ylim(-0.9, 2.7); ax.axis("off")
    save(fig, "sentiment.png")


if __name__ == "__main__":
    subagentes(); walls(); sentiment()
    print("OK -> img/subagentes.png, img/walls.png, img/sentiment.png")
