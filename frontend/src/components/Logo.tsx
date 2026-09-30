import { CONJUNTO_NAME } from "../labels";

/** Logotipo provisional (blanco sobre verde). Para usar el real: reemplazar public/favicon.svg
 * y este SVG, o cambiar el nombre con VITE_CONJUNTO_NAME en frontend/.env. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Logo del conjunto">
      <rect width="64" height="64" rx="15" fill="#fff" />
      <path d="M15 50V30a17 17 0 0 1 34 0v20" fill="none" stroke="#0d5c3a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 50l2.6-13h4.8L37 50z" fill="#0d5c3a" />
      <path d="M32 12c6 1 9 5 8 11-6-1-9-5-8-11z" fill="#2f9e62" />
    </svg>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo__name">{CONJUNTO_NAME}</span>
    </span>
  );
}
