// El titulo de esta ruta. Va en el layout y no en la pagina porque la pagina es "use client",
// y en Next una pagina de cliente no puede exportar metadata.
//
// Sin esto, /ideas, /wheel, /flow y /estado compartian el titulo generico "EVA - Options AI" y
// no habia forma de distinguirlas entre varias pestanas abiertas.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Estado del proyecto",
  description: "Que hemos medido: lo que funciona, lo que esta en prueba y lo que se cerro.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
