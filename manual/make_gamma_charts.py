# -*- coding: utf-8 -*-
"""Dibujos SIMPLES (para alguien que no sabe nada) — sección Muros de Gamma del manual."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyBboxPatch, Circle, Rectangle

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "img")
os.makedirs(IMG, exist_ok=True)

TEAL = "#0F9E75"; TEALD = "#0B5D46"; INK = "#101828"; MUTED = "#667085"
GREEN = "#12B76A"; RED = "#E24B4A"; AMBER = "#E8940A"; BLUE = "#2F6BFF"; BG = "#FFFFFF"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "figure.facecolor": BG,
                     "axes.facecolor": BG, "text.color": INK})


def save(fig, name):
    fig.savefig(os.path.join(IMG, name), dpi=200, bbox_inches="tight", facecolor=BG)
    plt.close(fig)


# 1. ¿Quién te vende la opción? El dealer se cubre moviendo la acción.
def dealer():
    fig, ax = plt.subplots(figsize=(7.6, 2.4))
    ax.axis("off"); ax.set_xlim(0, 10); ax.set_ylim(0, 3)

    def box(x, label, sub, color):
        ax.add_patch(FancyBboxPatch((x, 0.75), 2.3, 1.45, boxstyle="round,pad=0.1", fc=color, ec="none", alpha=0.16))
        ax.text(x + 1.15, 1.72, label, ha="center", fontsize=12, fontweight="bold", color=INK)
        ax.text(x + 1.15, 1.08, sub, ha="center", fontsize=8.5, color=MUTED)

    box(0.2, "TÚ", "compras\nuna opción", BLUE)
    box(3.85, "EL DEALER", "te la vende\n(la casa)", TEAL)
    box(7.5, "LA ACCIÓN", "la compra o vende\npara equilibrarse", AMBER)
    ax.annotate("", xy=(3.75, 1.45), xytext=(2.6, 1.45), arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.8))
    ax.annotate("", xy=(7.4, 1.45), xytext=(6.25, 1.45), arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.8))
    ax.text(3.17, 1.72, "opción", ha="center", fontsize=7.5, color=MUTED)
    ax.text(6.83, 1.72, "se cubre", ha="center", fontsize=7.5, color=MUTED)
    ax.text(5, 0.18, "El dealer NO apuesta dirección: está OBLIGADO a mover la acción para no perder. Eso empuja el precio.",
            ha="center", fontsize=9, color=TEALD, fontweight="bold")
    save(fig, "gamma_dealer.png")


# 2. El muro = un valle: el precio (pelota) cae al fondo y se queda.
def muro():
    fig, ax = plt.subplots(figsize=(6.8, 3.0))
    x = np.linspace(-3, 3, 200)
    ax.plot(x, 0.5 * x**2, color=TEAL, lw=3)
    ax.fill_between(x, 0.5 * x**2, 5, color=TEAL, alpha=0.05)
    ax.add_patch(Circle((0, 0.13), 0.17, color=BLUE, zorder=6))
    ax.text(0, -0.55, "El precio cae aquí\ny se queda (el imán)", ha="center", fontsize=9.5, color=BLUE, fontweight="bold")
    ax.annotate("", xy=(-0.55, 0.28), xytext=(-1.9, 1.35), arrowprops=dict(arrowstyle="-|>", color=RED, lw=1.7))
    ax.annotate("", xy=(0.55, 0.28), xytext=(1.9, 1.35), arrowprops=dict(arrowstyle="-|>", color=RED, lw=1.7))
    ax.text(-2.0, 1.6, "si sube →\nel dealer vende\n(lo baja)", ha="center", fontsize=8, color=RED)
    ax.text(2.0, 1.6, "si baja →\nel dealer compra\n(lo sube)", ha="center", fontsize=8, color=RED)
    ax.set_title("El MURO de gamma = un valle: el precio rueda al fondo y se queda ahí",
                 fontsize=11, fontweight="bold", color=TEALD, pad=10)
    ax.set_xlim(-3.3, 3.3); ax.set_ylim(-1.0, 5); ax.axis("off")
    save(fig, "gamma_muro.png")


# 3. Gamma + (valle, se frena) vs Gamma - (loma, se acelera).
def signo():
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(7.6, 2.9))
    x = np.linspace(-2, 2, 200)
    a1.plot(x, 0.6 * x**2, color=GREEN, lw=3)
    a1.add_patch(Circle((0, 0.1), 0.15, color=INK, zorder=6))
    a1.set_title("Gamma +  (γ+)", fontsize=12, fontweight="bold", color=GREEN)
    a1.text(0, -0.85, "se FRENA\n= hay MURO", ha="center", fontsize=10, color=GREEN, fontweight="bold")
    a1.set_xlim(-2, 2); a1.set_ylim(-1.4, 3); a1.axis("off")
    a2.plot(x, -0.6 * x**2 + 2.4, color=RED, lw=3)
    a2.add_patch(Circle((0.05, 2.33), 0.15, color=INK, zorder=6))
    a2.annotate("", xy=(1.35, 1.25), xytext=(0.35, 2.3), arrowprops=dict(arrowstyle="-|>", color=RED, lw=1.7))
    a2.set_title("Gamma −  (γ−)", fontsize=12, fontweight="bold", color=RED)
    a2.text(0, -0.85, "se ACELERA\n= NO hay muro", ha="center", fontsize=10, color=RED, fontweight="bold")
    a2.set_xlim(-2, 2); a2.set_ylim(-1.4, 3); a2.axis("off")
    save(fig, "gamma_signo.png")


# 4. Los 3 precios = muros arriba / abajo / imán (grosor = cuánto gamma).
def tres():
    fig, ax = plt.subplots(figsize=(6.9, 3.3))
    spot = 86.25
    ax.set_xlim(0, 10); ax.set_ylim(82, 95)

    def wall(y, color, label, th):
        ax.add_patch(Rectangle((1.6, y - th / 2), 5.6, th, color=color, alpha=0.85))
        ax.text(7.5, y, f"{label}   ${y:.2f}", va="center", fontsize=10.5, fontweight="bold", color=color)

    wall(92, GREEN, "Alcista", 0.42)
    wall(90, BLUE, "Base (imán)", 0.85)
    wall(85, RED, "Bajista", 0.42)
    ax.plot([1.6, 7.2], [spot, spot], color=INK, ls="--", lw=1.4)
    ax.text(1.6, spot + 0.4, f"Ahora  ${spot:.2f}", fontsize=9.5, color=INK)
    ax.set_yticks([85, 90, 92]); ax.set_xticks([])
    ax.set_title("Los 3 precios = los muros más fuertes (arriba, abajo y el imán del medio)",
                 fontsize=10.5, fontweight="bold", color=TEALD, loc="left", pad=8)
    ax.text(5, 82.7, "Barra más gruesa = más gamma acumulado = imán más fuerte", ha="center", fontsize=8, color=MUTED)
    for sp in ["top", "right", "bottom"]:
        ax.spines[sp].set_visible(False)
    save(fig, "gamma_tres.png")


# 5. Por qué dan igual en los 3 plazos: el cono crece, los muros NO se mueven.
def plazos():
    fig, ax = plt.subplots(figsize=(6.9, 3.1))
    t = np.linspace(0, 1, 120); spot = 86.25
    up = spot + 8 * np.sqrt(t); dn = spot - 8 * np.sqrt(t)
    ax.fill_between(t, dn, up, color=MUTED, alpha=0.12, label="cono (rango normal)")
    ax.plot(t, up, color=MUTED, lw=1); ax.plot(t, dn, color=MUTED, lw=1)
    for y, c, l in [(92, GREEN, "Alcista"), (90, BLUE, "Base"), (85, RED, "Bajista")]:
        ax.axhline(y, color=c, ls="--", lw=1.7)
        ax.text(1.02, y, f"{l} ${y}", va="center", fontsize=8.5, color=c, fontweight="bold")
    ax.scatter([0], [spot], color=INK, zorder=6, s=28)
    ax.text(0.02, spot - 1.3, "Ahora", fontsize=8.5, color=INK)
    ax.set_xticks([0, 0.5, 1]); ax.set_xticklabels(["1 semana", "2 semanas", "1 mes"])
    ax.set_yticks([])
    ax.set_title("El cono CRECE con el tiempo, pero los muros NO se mueven → mismos 3 precios",
                 fontsize=10, fontweight="bold", color=TEALD, loc="left", pad=8)
    ax.set_xlim(0, 1.32); ax.set_ylim(77, 99)
    for sp in ["top", "right", "left"]:
        ax.spines[sp].set_visible(False)
    save(fig, "gamma_plazos.png")


if __name__ == "__main__":
    dealer(); muro(); signo(); tres(); plazos()
    print("OK -> dealer, muro, signo, tres, plazos")
