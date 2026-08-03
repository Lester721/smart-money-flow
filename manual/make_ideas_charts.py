# -*- coding: utf-8 -*-
"""Dibujo del EMBUDO de Ideas para el manual: flujo del mercado → 2 filtros → operables + aprendizaje."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, FancyBboxPatch

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "img")
os.makedirs(IMG, exist_ok=True)

TEAL = "#0F9E75"; TEALD = "#0B5D46"; INK = "#101828"; MUTED = "#667085"
GREEN = "#12B76A"; RED = "#E24B4A"; AMBER = "#B54708"; BLUE = "#2F6BFF"; BG = "#FFFFFF"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "figure.facecolor": BG,
                     "axes.facecolor": BG, "text.color": INK})


def funnel():
    fig, ax = plt.subplots(figsize=(7.8, 4.6))
    ax.axis("off"); ax.set_xlim(0, 10); ax.set_ylim(0, 10)
    cx = 4.4

    def trap(y0, y1, w_top, w_bot, color):
        pts = [(cx - w_top / 2, y1), (cx + w_top / 2, y1), (cx + w_bot / 2, y0), (cx - w_bot / 2, y0)]
        ax.add_patch(Polygon(pts, closed=True, fc=color, ec="white", lw=1.6))

    trap(6.9, 9.4, 8.2, 5.8, BLUE)    # todo el flujo
    trap(4.0, 6.5, 5.8, 3.2, TEAL)    # calidad
    trap(1.2, 3.7, 3.2, 1.5, GREEN)   # operables

    ax.text(cx, 8.15, "~5,000 operaciones ≥ $500K", ha="center", va="center", color="white", fontsize=10, fontweight="bold")
    ax.text(cx, 7.5, "TODO el flujo institucional del mercado", ha="center", va="center", color="white", fontsize=8)
    ax.text(cx, 5.25, "~24 ideas de CALIDAD", ha="center", va="center", color="white", fontsize=10.5, fontweight="bold")
    ax.text(cx, 2.9, "9", ha="center", va="center", color="white", fontsize=15, fontweight="bold")
    ax.text(cx, 2.15, "OPERABLES", ha="center", va="center", color="white", fontsize=8.5, fontweight="bold")

    # Filtros (a la izquierda, entre bandas)
    ax.text(0.15, 6.7, "FILTRO 1 · CALIDAD", ha="left", fontsize=8.5, color=RED, fontweight="bold")
    ax.text(0.15, 6.25, "quita: no-inusuales,\nvencidos, lotería (theta)", ha="left", fontsize=7.5, color=MUTED, va="top")
    ax.text(0.15, 3.85, "FILTRO 2 · TU CUENTA", ha="left", fontsize=8.5, color=AMBER, fontweight="bold")
    ax.text(0.15, 3.4, "quita: las que no caben\nen tu presupuesto de riesgo", ha="left", fontsize=7.5, color=MUTED, va="top")

    # Aprendizaje (a la derecha)
    ax.add_patch(FancyBboxPatch((7.55, 3.7), 2.35, 2.6, boxstyle="round,pad=0.12", fc=TEAL, ec="none", alpha=0.13))
    ax.text(8.72, 5.75, "Y DE PASO:", ha="center", fontsize=8, color=TEALD, fontweight="bold")
    ax.text(8.72, 4.95, "EVA guarda cada\nescaneo → arma el\nhistorial por ticker\n→ aprende el hit-rate", ha="center", va="center", fontsize=7.8, color=TEALD)
    ax.annotate("", xy=(7.5, 5.0), xytext=(6.4, 5.0), arrowprops=dict(arrowstyle="-|>", color=TEAL, lw=1.6))

    ax.set_title("El embudo de Ideas: del mercado entero a lo que TÚ puedes operar",
                 fontsize=11, fontweight="bold", color=TEALD, pad=10)
    save = lambda: fig.savefig(os.path.join(IMG, "ideas_funnel.png"), dpi=200, bbox_inches="tight", facecolor=BG)
    save(); plt.close(fig)


if __name__ == "__main__":
    funnel()
    print("OK -> ideas_funnel.png")
