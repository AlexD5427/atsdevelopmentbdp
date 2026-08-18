/**
 * View Transitions API, con red debajo.
 *
 * ── Para qué se usa aquí ────────────────────────────────────────────────────
 * Para dos saltos donde la continuidad visual ayuda a no perder el sitio: de la
 * fila de la tabla al expediente abierto, y del cambio de sección del módulo.
 * En ambos casos el navegador interpola entre el antes y el después sin que la
 * pantalla parpadee.
 *
 * ── El fallo que este archivo tenía y por qué congelaba la página ───────────
 * La versión anterior llamaba a `document.startViewTransition(actualizar)` y no
 * miraba ninguna de las tres promesas que devuelve (`ready`,
 * `updateCallbackDone`, `finished`). Mientras la transición vive, el navegador
 * monta el pseudo-elemento `::view-transition`: una capa a pantalla completa,
 * por encima de todo, que recibe los eventos de entrada. Normalmente se retira
 * al resolverse `finished`.
 *
 * Si la transición se ABORTA, no. Y se abortaba sola en un caso muy alcanzable:
 * dos elementos con el mismo `view-transition-name`. `vistaDeExpediente()`
 * quitaba del identificador todo lo que no fuera alfanumérico, así que dos
 * expedientes distintos podían acabar con el mismo nombre y bastaba con que
 * coincidieran en pantalla. Resultado: capa colgada, ratón y teclado sin efecto,
 * página aparentemente muerta, y una promesa rechazada sin capturar.
 *
 * Tres cambios lo cierran:
 *
 *   1. **se escuchan las promesas**, y su rechazo se traga a propósito: una
 *      transición abortada no es un error de la aplicación;
 *   2. **hay un vigilante**: si a los 1,2 s la transición no ha terminado, se
 *      corta a mano (`skipTransition`) y se desbloquea la interfaz. Ninguna
 *      transición honesta de este módulo pasa de 0,42 s;
 *   3. **los nombres son únicos por construcción**, repartidos desde un registro
 *      en memoria en lugar de derivarse de un texto que puede colisionar.
 */

import type { CSSProperties } from "react";
import { desbloquearInterfaz } from "../../../shared/interfazViva";

/** Lo que devuelve `startViewTransition`, en lo que aquí se usa. */
interface TransicionDeVista {
  ready?: Promise<void>;
  finished?: Promise<void>;
  updateCallbackDone?: Promise<void>;
  skipTransition?: () => void;
}

type IniciarTransicion = (actualizar: () => void) => TransicionDeVista | undefined;

/** Cuánto se le concede a una transición antes de darla por colgada. */
const VIGILANTE_MS = 1200;

/**
 * Devuelve la función del navegador si existe.
 *
 * Se accede por una vista `unknown` en lugar de declarar una interfaz que
 * extienda `Document`: la firma exacta de `startViewTransition` ha cambiado entre
 * versiones de los tipos del DOM, y este módulo solo necesita «una función que
 * recibe una actualización».
 */
function iniciarTransicion(): IniciarTransicion | undefined {
  if (typeof document === "undefined") return undefined;
  const documento = document as unknown as { startViewTransition?: IniciarTransicion };
  if (typeof documento.startViewTransition !== "function") return undefined;
  return documento.startViewTransition.bind(document) as IniciarTransicion;
}

/** ¿El navegador puede animar entre dos estados del DOM? */
export function soportaTransicionesDeVista(): boolean {
  return !!iniciarTransicion();
}

function movimientoReducido(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const porSistema = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const porAjuste = document.documentElement.classList.contains("reduce-motion");
  return porSistema || porAjuste;
}

/**
 * ¿Hay ya una transición en marcha?
 *
 * Encadenar transiciones es la otra forma conocida de dejar una colgada: la
 * segunda aborta la primera. Con una sola a la vez, el segundo cambio se aplica
 * sin animación en lugar de arriesgar la pantalla.
 */
let enMarcha = false;

/**
 * Aplica `actualizar()` dentro de una transición de vista si se puede.
 *
 * `actualizar` debe ser síncrono en lo que toca al DOM de React (un `setState`):
 * la API captura el estado anterior, ejecuta la función y captura el nuevo. Si se
 * pasara una promesa larga, la pantalla quedaría congelada mientras se resuelve
 * —motivo por el que aquí no se espera nada de red dentro de la transición.
 *
 * Garantía dura: `actualizar()` se ejecuta SIEMPRE, exactamente una vez, pase lo
 * que pase con la animación. Una navegación no puede depender de un efecto
 * visual.
 */
export function conTransicionDeVista(actualizar: () => void): void {
  const iniciar = iniciarTransicion();
  if (!iniciar || movimientoReducido() || enMarcha) {
    actualizar();
    return;
  }

  let aplicado = false;
  const aplicarUnaVez = () => {
    if (aplicado) return;
    aplicado = true;
    actualizar();
  };

  let transicion: TransicionDeVista | undefined;
  enMarcha = true;

  const cerrar = () => {
    enMarcha = false;
    // Si la transición se abortó, la capa `::view-transition` puede seguir
    // montada comiéndose el input. Esto es lo que evita el «se congeló».
    desbloquearInterfaz();
  };

  const vigilante =
    typeof window !== "undefined"
      ? window.setTimeout(() => {
          try {
            transicion?.skipTransition?.();
          } catch {
            /* si no se deja cortar, el desbloqueo de abajo se encarga */
          }
          aplicarUnaVez();
          cerrar();
        }, VIGILANTE_MS)
      : null;

  const terminar = () => {
    if (vigilante !== null && typeof window !== "undefined") window.clearTimeout(vigilante);
    cerrar();
  };

  try {
    transicion = iniciar(() => {
      aplicarUnaVez();
    });
  } catch {
    // Una transición que falla no puede costar la navegación.
    aplicarUnaVez();
    terminar();
    return;
  }

  if (!transicion) {
    aplicarUnaVez();
    terminar();
    return;
  }

  // El rechazo se traga a propósito: `finished` rechaza cuando la transición se
  // salta o se aborta, y eso no es un error del que haya que informar. Lo que no
  // se puede hacer es dejarlo sin capturar, que era el estado anterior.
  const alTerminar = () => terminar();
  transicion.finished?.then(alTerminar, alTerminar);
  transicion.updateCallbackDone?.then(aplicarUnaVez, () => aplicarUnaVez());
  transicion.ready?.then(undefined, () => {
    // `ready` rechaza cuando el navegador no pudo preparar la captura, casi
    // siempre por nombres de vista duplicados. La actualización ya está aplicada;
    // aquí solo hay que asegurarse de que no queda capa colgada.
    terminar();
  });
}

/**
 * Nombre de vista para un elemento, listo para el `style` de React.
 *
 * `viewTransitionName` todavía no está en los tipos de CSS de esta versión de
 * React, así que se construye el objeto con la propiedad como índice.
 */
export function nombreDeVista(nombre: string | null | undefined): CSSProperties {
  if (!nombre) return {};
  return { viewTransitionName: nombre } as CSSProperties;
}

/* ------------------------------------------------------------------ */
/* Registro de nombres                                                 */
/* ------------------------------------------------------------------ */

/**
 * Un nombre de vista tiene que ser único EN LA PÁGINA.
 *
 * La versión anterior lo derivaba del identificador quitándole lo que no fuera
 * alfanumérico. Dos identificadores distintos —`4821/2026` y `4821-2026`—
 * producían el mismo nombre, y dos elementos con el mismo nombre hacen que el
 * navegador aborte la transición: exactamente el fallo que congelaba la página.
 *
 * Aquí el texto solo sirve como semilla estable; la unicidad la garantiza el
 * registro, que añade un sufijo cuando hay colisión. Mismo expediente, mismo
 * nombre en toda la sesión; expedientes distintos, nombres distintos, siempre.
 */
const asignados = new Map<string, string>();
const usados = new Set<string>();

function semilla(texto: string): string {
  const limpio = String(texto).replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return limpio || "x";
}

/** Nombre estable, válido como identificador CSS y único, para un expediente. */
export function vistaDeExpediente(expedienteId: string): string {
  const clave = String(expedienteId);
  const previo = asignados.get(clave);
  if (previo) return previo;

  const base = `doc-exp-${semilla(clave)}`;
  let candidato = base;
  let sufijo = 2;
  while (usados.has(candidato)) {
    candidato = `${base}-${sufijo}`;
    sufijo += 1;
  }
  usados.add(candidato);
  asignados.set(clave, candidato);
  return candidato;
}

/**
 * Libera el nombre de un expediente.
 *
 * Se llama al desmontar la vista que lo usaba. Sin esto, una sesión larga
 * acumularía nombres para siempre: no rompe nada, pero es una fuga de memoria
 * gratuita y hace que el registro crezca sin motivo.
 */
export function liberarVistaDeExpediente(expedienteId: string): void {
  const clave = String(expedienteId);
  const nombre = asignados.get(clave);
  if (!nombre) return;
  asignados.delete(clave);
  usados.delete(nombre);
}

/** Limpia el registro. Solo lo usan las pruebas. */
export function __reiniciarVistasParaPruebas(): void {
  asignados.clear();
  usados.clear();
  enMarcha = false;
}
