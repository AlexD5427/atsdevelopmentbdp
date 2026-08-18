/**
 * Guardia de interfaz viva: que la pantalla nunca se quede muerta.
 *
 * ── El problema, tal como lo vive una persona ────────────────────────────────
 * «Entro a Documentación, abro Configuración, le doy a guardar y salir, y la
 * página se queda congelada: el ratón y el teclado ya no hacen nada. Tengo que
 * recargar.» El mismo síntoma aparecía en Perfiles y en otros menús.
 *
 * Y la página NO está congelada. React sigue respondiendo, los temporizadores
 * corren, la red funciona. Lo que pasa es que algo se quedó puesto por encima o
 * por delante, y los eventos de entrada no llegan a los controles:
 *
 *   1. `pointer-events: none` en el cuerpo o en la raíz, puesto por una animación
 *      de salida que no llegó a limpiar su propio estilo;
 *   2. `inert` o `aria-hidden="true"` en `#root`, que un modal pone para atrapar
 *      el foco y quita al cerrarse... salvo que se desmonte antes de su
 *      animación de salida, y entonces no lo quita nadie;
 *   3. `overflow: hidden` huérfano, que no bloquea el ratón pero sí el
 *      desplazamiento, y con una pantalla larga se siente igual de roto;
 *   4. `position: fixed` en el cuerpo, el truco clásico contra el rebote de iOS,
 *      que si sobrevive al cierre deja la página anclada;
 *   5. un `::view-transition` abortado, que es una capa a pantalla completa que
 *      se come TODO el input. Este era el de Documentación (ver
 *      `DocViewTransitions.ts`).
 *
 * ── Por qué un guardia global y no un arreglo en cada modal ─────────────────
 * Porque son cinco causas distintas repartidas por una docena de componentes, y
 * cada arreglo puntual deja vivas las otras once puertas. Este archivo no impide
 * que un componente se deje algo puesto: DESHACE el estado inerte en cuanto
 * alguien intenta usar la página. Es una red, no un sustituto de la limpieza.
 *
 * ── La regla que hace que esto sea seguro ───────────────────────────────────
 * Un modal legítimo TAMBIÉN bloquea el desplazamiento y el `pointer-events` del
 * fondo, y desbloquearlo por debajo lo rompería. Así que el guardia no actúa
 * nunca mientras haya una capa modal de verdad en el documento
 * (`[aria-modal="true"]`, `dialog[open]`, `[data-bloqueo-scroll="activo"]`).
 * Solo limpia lo que quedó huérfano.
 *
 * Sin dependencias y sin React a propósito: se instala una vez en `main.tsx` y
 * cubre todos los módulos, incluidos los que ni conocen este archivo.
 */

/** Capas que SÍ tienen derecho a dejar la página quieta. */
const SELECTOR_MODAL = '[aria-modal="true"], dialog[open], [data-bloqueo-scroll="activo"]';

/** Marca con la que este archivo firma lo que él mismo ha tocado. */
const MARCA = "data-interfaz-viva";

export interface Desbloqueo {
  /** ¿Se deshizo algo? */
  liberado: boolean;
  /** Qué se deshizo, en términos legibles. Alimenta el diagnóstico. */
  motivos: string[];
}

/** ¿Hay una capa modal legítima en el documento? */
export function hayCapaModal(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.querySelector(SELECTOR_MODAL) !== null;
  } catch {
    return false;
  }
}

/** Lectura de estilo tolerante: en jsdom y en navegadores viejos puede fallar. */
function estilo(elemento: Element | null): CSSStyleDeclaration | null {
  if (!elemento || typeof window === "undefined" || typeof window.getComputedStyle !== "function") return null;
  try {
    return window.getComputedStyle(elemento);
  } catch {
    return null;
  }
}

/**
 * Termina las animaciones de una transición de vista que se quedó a medias.
 *
 * El pseudo-elemento `::view-transition` no se puede quitar del DOM —no está en
 * el DOM—, pero termina de existir en cuanto sus animaciones acaban. Por eso se
 * llama a `finish()` y, si el navegador se queja, a `cancel()`.
 */
function cerrarTransicionesDeVista(motivos: string[]): void {
  if (typeof document === "undefined") return;
  const documento = document as unknown as { getAnimations?: () => Animation[] };
  if (typeof documento.getAnimations !== "function") return;

  let cerradas = 0;
  let animaciones: Animation[] = [];
  try {
    animaciones = documento.getAnimations();
  } catch {
    return;
  }

  for (const animacion of animaciones) {
    const efecto = animacion.effect as (AnimationEffect & { pseudoElement?: string | null }) | null;
    const pseudo = String(efecto?.pseudoElement ?? "");
    if (pseudo.indexOf("view-transition") < 0) continue;
    try {
      animacion.finish();
      cerradas += 1;
    } catch {
      try {
        animacion.cancel();
        cerradas += 1;
      } catch {
        /* una animación que no se deja cerrar no puede tumbar el guardia */
      }
    }
  }

  if (cerradas > 0) motivos.push(`transicion-de-vista-abortada (${cerradas})`);
}

/**
 * Deshace el estado inerte de la página.
 *
 * `forzar` salta la comprobación del modal. Solo lo usa la salida de emergencia:
 * si alguien pulsa Escape tres veces es porque la pantalla no responde, y en ese
 * momento su criterio vale más que el nuestro.
 */
export function desbloquearInterfaz(opciones: { forzar?: boolean } = {}): Desbloqueo {
  const motivos: string[] = [];
  if (typeof document === "undefined") return { liberado: false, motivos };

  const forzar = opciones.forzar === true;
  if (!forzar && hayCapaModal()) return { liberado: false, motivos: ["hay-una-capa-modal-abierta"] };

  const cuerpo = document.body;
  const raiz = document.documentElement;
  const contenedor = document.getElementById("root");

  cerrarTransicionesDeVista(motivos);

  for (const elemento of [cuerpo, raiz]) {
    if (!elemento) continue;
    const calculado = estilo(elemento);

    if (calculado?.pointerEvents === "none") {
      elemento.style.pointerEvents = "auto";
      elemento.setAttribute(MARCA, "pointer-events");
      motivos.push(`pointer-events-none-en-${elemento === cuerpo ? "body" : "html"}`);
    }

    if (calculado?.overflow === "hidden" || elemento.style.overflow === "hidden") {
      elemento.style.removeProperty("overflow");
      elemento.style.removeProperty("overflow-y");
      motivos.push(`overflow-hidden-huerfano-en-${elemento === cuerpo ? "body" : "html"}`);
    }
  }

  if (cuerpo && (cuerpo.style.position === "fixed" || estilo(cuerpo)?.position === "fixed")) {
    cuerpo.style.removeProperty("position");
    cuerpo.style.removeProperty("top");
    cuerpo.style.removeProperty("width");
    motivos.push("body-anclado-en-position-fixed");
  }

  for (const elemento of [contenedor, cuerpo]) {
    if (!elemento) continue;
    if (elemento.hasAttribute("inert")) {
      elemento.removeAttribute("inert");
      motivos.push("inert-huerfano");
    }
    if (elemento.getAttribute("aria-hidden") === "true") {
      elemento.removeAttribute("aria-hidden");
      motivos.push("aria-hidden-huerfano");
    }
  }

  // Un `view-transition-name` que sobrevive a su transición deja el elemento
  // promocionado a su propia capa y puede taparlo todo.
  if (raiz?.style.getPropertyValue("view-transition-name")) {
    raiz.style.removeProperty("view-transition-name");
    motivos.push("nombre-de-vista-huerfano");
  }

  return { liberado: motivos.length > 0, motivos };
}

/**
 * ¿La página parece inerte AHORA MISMO?
 *
 * Se usa antes y después de desbloquear: si después sigue diciendo que sí, el
 * problema no es ninguno de los cinco conocidos y toca ofrecer el botón de
 * rescate en lugar de fingir que está resuelto.
 */
export function pareceInerte(): boolean {
  if (typeof document === "undefined") return false;
  if (hayCapaModal()) return false;
  const cuerpo = document.body;
  const raiz = document.documentElement;
  const contenedor = document.getElementById("root");
  if (estilo(cuerpo)?.pointerEvents === "none") return true;
  if (estilo(raiz)?.pointerEvents === "none") return true;
  if (contenedor?.hasAttribute("inert")) return true;
  if (contenedor?.getAttribute("aria-hidden") === "true") return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Botón de rescate                                                    */
/* ------------------------------------------------------------------ */

let nodoRescate: HTMLElement | null = null;
let temporizadorRescate: number | null = null;

/**
 * Botón flotante «Desbloquear pantalla».
 *
 * Se construye a mano, sin React y con estilos en línea, por una razón concreta:
 * si el árbol de React fuera el problema, un botón dibujado por React no
 * aparecería. Este vive fuera, con el `z-index` más alto de la página y
 * `pointer-events` propios, así que se puede pulsar incluso con el fondo inerte.
 */
function mostrarRescate(): void {
  if (typeof document === "undefined" || nodoRescate) return;

  const boton = document.createElement("button");
  boton.type = "button";
  boton.textContent = "Desbloquear pantalla";
  boton.setAttribute("aria-live", "polite");
  boton.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "bottom:1.25rem",
    "left:50%",
    "transform:translateX(-50%)",
    "pointer-events:auto",
    "padding:0.6rem 1.1rem",
    "border:1px solid rgba(255,255,255,0.28)",
    "border-radius:999px",
    "background:rgba(17,24,39,0.86)",
    "backdrop-filter:blur(12px)",
    "color:#fff",
    "font:600 13px/1.2 system-ui,-apple-system,Segoe UI,sans-serif",
    "box-shadow:0 12px 32px rgba(0,0,0,0.38)",
    "cursor:pointer",
  ].join(";");

  boton.addEventListener("click", () => {
    const resultado = desbloquearInterfaz({ forzar: true });
    ocultarRescate();
    // Si ni forzando se libera nada, el problema está en otra parte y recargar es
    // la única salida honesta. Se avisa antes de hacerlo.
    if (!resultado.liberado && pareceInerte() && typeof window !== "undefined") {
      window.location.reload();
    }
  });

  document.body.appendChild(boton);
  nodoRescate = boton;

  // Se retira solo: un botón de emergencia permanente en pantalla es ruido.
  if (typeof window !== "undefined") {
    temporizadorRescate = window.setTimeout(ocultarRescate, 12000);
  }
}

function ocultarRescate(): void {
  if (temporizadorRescate !== null && typeof window !== "undefined") {
    window.clearTimeout(temporizadorRescate);
    temporizadorRescate = null;
  }
  if (nodoRescate?.parentNode) nodoRescate.parentNode.removeChild(nodoRescate);
  nodoRescate = null;
}

/* ------------------------------------------------------------------ */
/* Instalación                                                         */
/* ------------------------------------------------------------------ */

let instalado = false;

/** Últimos desbloqueos, para poder contarlos en el diagnóstico de conexión. */
const bitacora: { fecha: string; motivos: string[] }[] = [];

export function bitacoraDesbloqueos(): { fecha: string; motivos: string[] }[] {
  return bitacora.slice(-20);
}

function registrar(resultado: Desbloqueo): void {
  if (!resultado.liberado) return;
  bitacora.push({ fecha: new Date().toISOString(), motivos: resultado.motivos });
  if (bitacora.length > 40) bitacora.splice(0, bitacora.length - 40);
}

/**
 * Instala el guardia. Idempotente: llamarlo dos veces no duplica escuchas.
 *
 * Los tres disparadores son eventos de entrada, no un temporizador: sondear el
 * DOM cada segundo para siempre gastaría batería el 99,99 % del tiempo en el que
 * no hay nada que arreglar. La comprobación ocurre exactamente cuando alguien
 * intenta usar la página, que es el único momento en que importa.
 */
export function instalarGuardiaDeInterfaz(): () => void {
  if (instalado || typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }
  instalado = true;

  let escapes = 0;
  let ventanaEscape = 0;

  const alIntentarUsar = () => {
    if (!pareceInerte()) return;
    const resultado = desbloquearInterfaz();
    registrar(resultado);
    // Si sigue inerte tras limpiar lo conocido, se ofrece la salida manual.
    if (pareceInerte()) mostrarRescate();
  };

  const alTeclado = (evento: KeyboardEvent) => {
    if (evento.key !== "Escape") {
      alIntentarUsar();
      return;
    }
    const ahora = Date.now();
    if (ahora - ventanaEscape > 1200) escapes = 0;
    ventanaEscape = ahora;
    escapes += 1;
    if (escapes >= 3) {
      escapes = 0;
      registrar(desbloquearInterfaz({ forzar: true }));
      ocultarRescate();
    }
  };

  // Al volver a la pestaña: una transición de vista interrumpida por un cambio de
  // pestaña es uno de los caminos más fáciles para dejar la capa colgada.
  const alVolver = () => {
    if (document.visibilityState !== "visible") return;
    registrar(desbloquearInterfaz());
  };

  window.addEventListener("pointerdown", alIntentarUsar, true);
  window.addEventListener("keydown", alTeclado, true);
  document.addEventListener("visibilitychange", alVolver);

  return () => {
    window.removeEventListener("pointerdown", alIntentarUsar, true);
    window.removeEventListener("keydown", alTeclado, true);
    document.removeEventListener("visibilitychange", alVolver);
    ocultarRescate();
    instalado = false;
  };
}
