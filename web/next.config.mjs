/** @type {import('next').NextConfig} */
const nextConfig = {
  // Quita la insignia flotante de Next.js abajo a la izquierda ("static route"). Es puramente
  // informativa —solo aparece con `npm run dev`, nunca en Railway— y estorbaba a la vista.
  devIndicators: { appIsrStatus: false },
};

export default nextConfig;
