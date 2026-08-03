import type { Metadata } from "next";
import NavTabs from "../components/NavTabs";
import EvaLogo from "../components/EvaLogo";
import CreditSpreadView from "../components/CreditSpreadView";

export const metadata: Metadata = {
  title: "EVA Credit Spread — la estrategia validada (paper)",
  description: "La estrategia de credit spread filtrada por convicción de EVA: qué probamos, el forward-test en vivo (paper) y las 5 mejoras de EVA.",
};

export default function CreditSpreadPage() {
  return (
    <main className="ideas-page">
      <div className="hb">
        <div className="hb-brand">
          <div className="hb-logo"><EvaLogo /></div>
          <div className="hb-name">EVA</div>
          <div className="hb-chip">Credit Spread · en prueba</div>
        </div>
        <NavTabs />
      </div>

      <div className="wrap page-stack">
        <CreditSpreadView />
      </div>
    </main>
  );
}
