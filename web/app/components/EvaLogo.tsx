/**
 * Logo de EVA — foto de EVE (WALL-E) provista por el usuario (web/public/eva-eve.png).
 * Uso personal/local. Llena el recuadro `.hb-logo` (30px), recortada y con esquinas
 * redondeadas heredadas. Tamaño pequeño, igual que el logo anterior.
 */
export default function EvaLogo({ size = "100%" }: { size?: number | string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/eva-eve.png"
      alt="EVA"
      style={{ width: size, height: size, objectFit: "cover", borderRadius: "inherit", display: "block" }}
    />
  );
}
