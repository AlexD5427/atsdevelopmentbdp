/**
 * Iconos de categoría.
 *
 * ── Por qué dibujados a mano y no tomados de la librería ───────────────────
 * `lucide-react` tiene iconos de sobra, pero ninguno significa «funcionario del
 * área de cumplimiento». Con iconos genéricos, las cuatro tarjetas del formulario
 * se parecen entre sí y hay que leer el texto para distinguirlas —que es
 * exactamente lo que un icono debería evitar. Estos cuatro son distintos de un
 * vistazo por su silueta, no solo por su color: es la misma razón por la que un
 * estado nunca se comunica solo con color.
 *
 * Se dibujan sobre la misma rejilla de 24, con trazo de 1,5 y extremos
 * redondeados, para que conserven el aire del resto del sistema. `currentColor`
 * en todo: el color lo pone la categoría, no el icono.
 */

import type { SVGProps } from "react";
import type { CategoriaDef } from "../domain/categorias";

type Props = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Comercial: mostrador de agencia con la curva de colocación subiendo. */
export function IconoComercial(props: Props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 20h18" />
      <path d="M5 20v-8.5L12 7l7 4.5V20" />
      <path d="M9.5 20v-4.5h5V20" />
      <path d="M8 11.5 10.5 9l2 1.75L16 7.5" />
      <path d="M16 7.5h-2.25M16 7.5v2.25" />
    </svg>
  );
}

/** Auditoría: expediente bajo lupa. La lupa mira dentro, no por encima. */
export function IconoAuditoria(props: Props) {
  return (
    <svg {...base} {...props}>
      <path d="M14.5 3H6a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 6 21h8" />
      <path d="M14.5 3 19 7.5v3" />
      <path d="M8 8h4M8 11.5h3" />
      <circle cx="15.25" cy="15.25" r="3.25" />
      <path d="m17.75 17.75 2.5 2.5" />
    </svg>
  );
}

/** Cumplimiento: escudo con el visto de la acreditación. */
export function IconoCumplimiento(props: Props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s7-3.2 7-9V5.6L12 3 5 5.6V12c0 5.8 7 9 7 9Z" />
      <path d="m9 11.8 2.1 2.2L15.2 9.7" />
    </svg>
  );
}

/** Ejecutivo o directorio: mesa de directorio con tres asientos. */
export function IconoEjecutivo(props: Props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12h18" />
      <path d="M6 12v2.5M12 12v2.5M18 12v2.5" />
      <circle cx="6" cy="8" r="1.9" />
      <circle cx="12" cy="6.75" r="2.15" />
      <circle cx="18" cy="8" r="1.9" />
      <path d="M5 21h14" />
      <path d="M12 14.5V21" />
    </svg>
  );
}

/** Heredada: carpeta simple, sin rasgo de área. */
export function IconoGeneral(props: Props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4L10 8h9.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" />
      <path d="M7 12.5h10" />
    </svg>
  );
}

/** El icono que corresponde a una categoría, resuelto por su declaración. */
export function IconoCategoria({ categoria, ...props }: Props & { categoria: CategoriaDef }) {
  switch (categoria.icono) {
    case "comercial":
      return <IconoComercial {...props} />;
    case "auditoria":
      return <IconoAuditoria {...props} />;
    case "cumplimiento":
      return <IconoCumplimiento {...props} />;
    case "ejecutivo":
      return <IconoEjecutivo {...props} />;
    default:
      return <IconoGeneral {...props} />;
  }
}

/** Icono por código, para pintar donde solo llega el código del expediente. */
export function IconoPorCodigo({ codigo, ...props }: Props & { codigo: string }) {
  const clave = String(codigo || "").toUpperCase();
  if (clave === "COMERCIAL") return <IconoComercial {...props} />;
  if (clave === "AUDITORIA") return <IconoAuditoria {...props} />;
  if (clave === "CUMPLIMIENTO") return <IconoCumplimiento {...props} />;
  if (clave === "EJECUTIVO" || clave === "DIRECTORIO") return <IconoEjecutivo {...props} />;
  return <IconoGeneral {...props} />;
}
