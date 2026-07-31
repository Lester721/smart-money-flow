/**
 * Logo de EVA — robot estilo EVE (WALL-E): cabeza-huevo blanca, visor oscuro y
 * ojos cyan inclinados. Diseño original inspirado en esa estética (no es arte del
 * personaje). Va SIN fondo: se coloca dentro de `.hb-logo`, que aporta el degradado.
 */
export default function EvaLogo({ size = "100%" }: { size?: number | string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse cx="16" cy="14.5" rx="7.6" ry="9" fill="#ffffff" />
      <rect x="8.4" y="9.4" width="15.2" height="7" rx="3.5" fill="#0b1220" />
      <ellipse cx="13.2" cy="12.9" rx="1.1" ry="1.85" fill="#37c8ff" transform="rotate(20 13.2 12.9)" />
      <ellipse cx="18.8" cy="12.9" rx="1.1" ry="1.85" fill="#37c8ff" transform="rotate(-20 18.8 12.9)" />
    </svg>
  );
}
