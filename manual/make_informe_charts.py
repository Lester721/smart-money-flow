# -*- coding: utf-8 -*-
"""Charts para el Informe de Eva (edge, filtro, proyeccion $10k)."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "img")
os.makedirs(IMG, exist_ok=True)

TEAL = "#0F9E75"; TEALD = "#0B5D46"; INK = "#101828"; MUTED = "#667085"
GREEN = "#12B76A"; RED = "#E24B4A"; AMBER = "#E8940A"; BLUE = "#2F6BFF"; BG = "#FFFFFF"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "figure.facecolor": BG,
                     "axes.facecolor": BG, "text.color": INK, "axes.edgecolor": "#D9E2DF",
                     "xtick.color": MUTED, "ytick.color": MUTED, "axes.labelcolor": INK})


def save(fig, name):
    fig.savefig(os.path.join(IMG, name), dpi=200, bbox_inches="tight", facecolor=BG)
    plt.close(fig)


# ---- 1. DONDE ESTA EL EDGE (credit spread, Top-conviccion, retorno % por plazo/distancia) ----
def edge_chart():
    dtes = ["3d", "5d", "7d", "30d", "60d", "90d", "180d"]
    s1 = [3.1, 5.3, 4.4, 4.5, 4.5, 8.7, 11.0]    # 1 sigma
    s15 = [2.7, 1.3, 2.3, 2.5, 0.8, 4.3, 4.0]     # 1.5 sigma
    robust1 = [True]*7
    robust15 = [True, True, True, True, False, True, True]  # 60d@1.5s fallo
    x = np.arange(len(dtes)); w = 0.38
    fig, ax = plt.subplots(figsize=(7.2, 3.3))
    b1 = ax.bar(x - w/2, s1, w, color=[GREEN if r else RED for r in robust1], label="1σ (más cerca)")
    b15 = ax.bar(x + w/2, s15, w, color=[TEAL if r else RED for r in robust15], alpha=0.55, label="1.5σ (más lejos)")
    for bars, vals in [(b1, s1), (b15, s15)]:
        for bar, v in zip(bars, vals):
            ax.text(bar.get_x()+bar.get_width()/2, v+0.15, f"{v}%", ha="center", fontsize=8, color=INK)
    ax.set_xticks(x); ax.set_xticklabels(dtes)
    ax.set_ylabel("Retorno sobre riesgo (%)")
    ax.set_title("Dónde está el edge: retorno del Top-Convicción por plazo (DTE) y distancia (σ)",
                 fontsize=10.5, fontweight="bold", color="#0B5D46", loc="left", pad=8)
    ax.axhline(0, color="#D9E2DF", lw=1)
    ax.legend(fontsize=8, loc="upper left", frameon=False)
    ax.text(0.99, 0.96, "13 de 14 combinaciones: positivas y robustas ✓", transform=ax.transAxes,
            ha="right", va="top", fontsize=8.5, color=GREEN, fontweight="bold")
    for sp in ["top", "right"]:
        ax.spines[sp].set_visible(False)
    save(fig, "informe_edge.png")


# ---- 2. EL FILTRO DE EVA (todas vs alta conviccion vs baja conviccion) ----
def filter_chart():
    labels = ["TODAS\nlas señales", "Top⅓\nconvicción Eva", "Bottom⅓\nconvicción Eva"]
    vals = [3.3, 5.9, -1.5]
    colors = [MUTED, GREEN, RED]
    fig, ax = plt.subplots(figsize=(5.2, 3.0))
    bars = ax.bar(labels, vals, color=colors, width=0.6)
    for bar, v in zip(bars, vals):
        ax.text(bar.get_x()+bar.get_width()/2, v + (0.2 if v >= 0 else -0.5), f"{v}%",
                ha="center", fontsize=10, fontweight="bold", color=INK)
    ax.axhline(0, color="#B9C4D8", lw=1)
    ax.set_ylabel("Retorno sobre riesgo (%)")
    ax.set_title("El valor de Eva: filtrar por convicción separa lo bueno de lo malo\n(credit spread 5 días, a 1σ)",
                 fontsize=10, fontweight="bold", color="#0B5D46", loc="left", pad=8)
    for sp in ["top", "right"]:
        ax.spines[sp].set_visible(False)
    save(fig, "informe_filtro.png")


# ---- 3. PROYECCION $10k 2018 -> jul 2026 (8.5 anos), 3 escenarios ----
def projection_chart():
    years = np.linspace(0, 8.5, 100)
    scen = {"Pesimista (6%/año)": 0.06, "Central (10%/año)": 0.10, "Optimista (15%/año)": 0.15}
    cols = {"Pesimista (6%/año)": MUTED, "Central (10%/año)": TEAL, "Optimista (15%/año)": GREEN}
    fig, ax = plt.subplots(figsize=(7.0, 3.4))
    for name, r in scen.items():
        vals = 10000 * (1 + r) ** years
        ax.plot(2018 + years, vals, color=cols[name], lw=2.2,
                label=f"{name} → ${vals[-1]/1000:.1f}k")
    ax.axhline(10000, color="#D9E2DF", lw=1, ls="--")
    ax.text(2018.1, 10300, "Inicio: $10,000", fontsize=8, color=MUTED)
    ax.set_ylabel("Valor de la cuenta ($)")
    ax.set_title("Estimado ilustrativo: $10k con Eva, 2018 → jul 2026 (compuesto liso)",
                 fontsize=10.5, fontweight="bold", color="#0B5D46", loc="left", pad=8)
    ax.legend(fontsize=8.5, loc="upper left", frameon=False)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, p: f"${v/1000:.0f}k"))
    # zona de advertencia: los meses de crash (2018, 2020, 2022)
    for yr, lbl in [(2018.1, "vol\n2018"), (2020.2, "COVID\n2020"), (2022.4, "bear\n2022")]:
        ax.axvline(yr, color=RED, lw=1, ls=":", alpha=0.5)
    ax.text(0.99, 0.05, "⚠ Líneas rojas = meses de crash donde vender prima puede perder fuerte.\nEl camino REAL sería con caídas grandes, no esta curva lisa.",
            transform=ax.transAxes, ha="right", va="bottom", fontsize=7.5, color=RED)
    for sp in ["top", "right"]:
        ax.spines[sp].set_visible(False)
    save(fig, "informe_proyeccion.png")


# ---- 4. EL CONO DE σ (movimiento esperado) ----
def sigma_cone():
    fig, ax = plt.subplots(figsize=(6.6, 3.1))
    t = np.linspace(0, 1, 120)
    price = 100.0; vol = 16.0
    up1 = price + vol*np.sqrt(t); dn1 = price - vol*np.sqrt(t)
    up15 = price + 1.5*vol*np.sqrt(t); dn15 = price - 1.5*vol*np.sqrt(t)
    ax.fill_between(t, dn15, up15, color=TEAL, alpha=0.10)
    ax.fill_between(t, dn1, up1, color=TEAL, alpha=0.22)
    ax.plot(t, [price]*len(t), color=INK, ls="--", lw=1.2)
    ax.plot(t, up1, color=TEAL, lw=1.5); ax.plot(t, dn1, color=TEAL, lw=1.5)
    ax.plot(t, up15, color=TEAL, lw=1, alpha=0.6); ax.plot(t, dn15, color=TEAL, lw=1, alpha=0.6)
    ax.scatter([0], [price], color=INK, zorder=6, s=30)
    ax.text(0, price+2.5, "HOY\n(precio actual)", fontsize=8.5, color=INK, fontweight="bold")
    ax.scatter([1, 1], [dn1[-1], up1[-1]], color=RED, zorder=6, s=40)
    ax.text(1.01, dn1[-1], "  vendes\n  el spread\n  aquí (1σ)", fontsize=8.5, color=RED, va="center", fontweight="bold")
    ax.text(1.01, up1[-1], "  borde del\n  rango normal", fontsize=8, color=TEAL, va="center")
    ax.text(1.01, dn15[-1]-1, "  1.5σ (más lejos,\n  más seguro)", fontsize=7.5, color=MUTED, va="center")
    ax.text(0.5, price-vol*0.72-3, "1σ = ~68% del tiempo el precio se queda AQUÍ dentro", fontsize=8, color=TEALD, ha="center", fontweight="bold")
    ax.set_xlim(-0.02, 1.28); ax.set_ylim(price-vol*1.7, price+vol*1.7)
    ax.set_xlabel("Tiempo →  (de hoy al vencimiento)")
    ax.set_yticks([]); ax.set_title("El cono de σ: el rango donde el precio 'normalmente' se queda",
                                    fontsize=10.5, fontweight="bold", color="#0B5D46", loc="left", pad=8)
    for sp in ["top", "right", "left"]:
        ax.spines[sp].set_visible(False)
    save(fig, "informe_cono.png")


if __name__ == "__main__":
    edge_chart(); filter_chart(); projection_chart(); sigma_cone()
    print("OK -> edge, filtro, proyeccion, cono")
