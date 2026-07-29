import type { Metadata } from "next";
import NavTabs from "../components/NavTabs";

export const metadata: Metadata = {
  title: "0DTE — EVA",
  description: "Análisis de opciones que expiran el mismo día (0 días al vencimiento).",
};

// Placeholder — el contenido de esta sección lo define el usuario más adelante.
export default function ZeroDtePage() {
  return (
    <main className="ideas-page">
      <div className="hb">
        <div className="hb-brand">
          <div className="hb-logo">E</div>
          <div className="hb-name">EVA</div>
          <div className="hb-chip">0DTE · expiran hoy</div>
        </div>
        <NavTabs />
      </div>

      <div className="wrap page-stack">
        <div className="card" style={{ alignItems: "center", padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>0DTE — próximamente 🎯</div>
          <div className="card-sub" style={{ maxWidth: 520 }}>
            Sección en construcción. Aquí irá el análisis de opciones que <strong>expiran el mismo día</strong>
            {" "}(0 días al vencimiento). El contenido lo definimos juntos.
          </div>
        </div>
      </div>
    </main>
  );
}
