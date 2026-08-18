/**
 * Selector de fecha del módulo.
 *
 * ── Por qué no un `input[type="date"]` ──────────────────────────────────
 * Porque su aspecto lo decide el sistema operativo y no hay forma de que se
 * parezca al resto del módulo: en Windows es una caja gris con un icono azul, en
 * macOS un stepper, y en Android una rueda a pantalla completa. Tres experiencias
 * distintas para el campo que más se usa del formulario.
 *
 * ── Lo que SÍ conserva del nativo ──────────────────────────────────────
 * Todo lo que importa: se puede ESCRIBIR la fecha —quien viene de Excel teclea
 * más rápido de lo que apunta—, se maneja entero con el teclado, y el foco entra
 * y sale como debe. Un calendario bonito que obliga a usar el ratón es peor que la
 * caja gris.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { DURACION, CURVA, useMovimientoReducido } from "./DocMotion";

const DIAS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function dos(n: number): string {
  return String(n).padStart(2, "0");
}

function aIso(anio: number, mes: number, dia: number): string {
  return `${anio}-${dos(mes + 1)}-${dos(dia)}`;
}

function hoyIso(): string {
  const d = new Date();
  return aIso(d.getFullYear(), d.getMonth(), d.getDate());
}

/** `yyyy-mm-dd` a sus tres números, o `null` si no es una fecha real. */
function partes(iso: string): { anio: number; mes: number; dia: number } | null {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").slice(0, 10));
  if (!coincide) return null;
  const anio = Number(coincide[1]);
  const mes = Number(coincide[2]) - 1;
  const dia = Number(coincide[3]);
  // Se valida contra un `Date` real: `2026-02-31` cumple la expresión regular y
  // no existe.
  const fecha = new Date(anio, mes, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes || fecha.getDate() !== dia) return null;
  return { anio, mes, dia };
}

/** Texto legible: «15 de marzo de 2026». */
export function fechaLarga(iso: string): string {
  const p = partes(iso);
  if (!p) return "";
  return `${p.dia} de ${MESES[p.mes]} de ${p.anio}`;
}

/**
 * Interpreta lo que alguien escribe a mano.
 *
 * Se admiten `15/03/2026`, `15-3-2026`, `15.03.26` y el propio `2026-03-15`. El
 * año de dos cifras se resuelve al siglo actual: en un formulario de
 * incorporaciones, `26` es 2026 y no 1926.
 */
export function interpretarFecha(texto: string): string {
  const limpio = String(texto || "").trim();
  if (!limpio) return "";
  if (partes(limpio)) return limpio.slice(0, 10);

  const piezas = limpio.split(/[/\-. ]+/).filter(Boolean);
  if (piezas.length !== 3) return "";

  // Si la primera pieza tiene cuatro cifras, viene en orden ISO.
  const iso = piezas[0].length === 4;
  let anio = Number(iso ? piezas[0] : piezas[2]);
  const mes = Number(iso ? piezas[1] : piezas[1]);
  const dia = Number(iso ? piezas[2] : piezas[0]);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) return "";
  if (anio < 100) anio += Math.floor(new Date().getFullYear() / 100) * 100;

  const candidato = aIso(anio, mes - 1, dia);
  return partes(candidato) ? candidato : "";
}

export function SelectorFecha({
  valor,
  onCambio,
  etiqueta,
  descripcion,
  minimo,
  maximo,
  requerido,
  error,
  permiteLimpiar = true,
}: {
  valor: string;
  onCambio: (iso: string) => void;
  etiqueta: string;
  descripcion?: string;
  minimo?: string;
  maximo?: string;
  requerido?: boolean;
  error?: string;
  permiteLimpiar?: boolean;
}) {
  const idBase = useId();
  const reducido = useMovimientoReducido();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const contenedor = useRef<HTMLDivElement | null>(null);
  const disparador = useRef<HTMLButtonElement | null>(null);
  const rejilla = useRef<HTMLDivElement | null>(null);

  const elegida = partes(valor);
  const referencia = elegida ?? partes(hoyIso())!;
  const [visible, setVisible] = useState({ anio: referencia.anio, mes: referencia.mes });
  /** Día con el foco dentro de la rejilla. Es lo que mueven las flechas. */
  const [cursor, setCursor] = useState(referencia.dia);

  // Al abrirse, el calendario se sitúa en el mes de la fecha elegida (o en el
  // actual) y no donde se quedó la vez anterior: esto último obliga a reorientarse
  // cada vez.
  useEffect(() => {
    if (!abierto) return;
    const base = partes(valor) ?? partes(hoyIso())!;
    setVisible({ anio: base.anio, mes: base.mes });
    setCursor(base.dia);
  }, [abierto, valor]);

  useEffect(() => {
    setTexto(valor ? fechaLarga(valor) : "");
  }, [valor]);

  /* Cierre por clic fuera y por Escape, con devolución del foco. */
  useEffect(() => {
    if (!abierto) return;

    const fuera = (evento: MouseEvent) => {
      if (!contenedor.current) return;
      if (!contenedor.current.contains(evento.target as Node)) setAbierto(false);
    };
    const teclado = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.stopPropagation();
      setAbierto(false);
      disparador.current?.focus();
    };

    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", teclado);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", teclado);
    };
  }, [abierto]);

  /* El foco entra en la rejilla al abrir: sin esto las flechas no hacen nada. */
  useEffect(() => {
    if (!abierto) return;
    const foco = window.setTimeout(() => {
      const activo = rejilla.current?.querySelector<HTMLButtonElement>('[data-cursor="si"]');
      activo?.focus();
    }, reducido ? 0 : 60);
    return () => window.clearTimeout(foco);
  }, [abierto, reducido, visible.anio, visible.mes]);

  const dias = useMemo(() => {
    const total = new Date(visible.anio, visible.mes + 1, 0).getDate();
    // `getDay()` cuenta el domingo como 0; la semana del área empieza en lunes.
    const desplazamiento = (new Date(visible.anio, visible.mes, 1).getDay() + 6) % 7;
    const celdas: (number | null)[] = [];
    for (let i = 0; i < desplazamiento; i++) celdas.push(null);
    for (let d = 1; d <= total; d++) celdas.push(d);
    while (celdas.length % 7 !== 0) celdas.push(null);
    return celdas;
  }, [visible.anio, visible.mes]);

  function fueraDeRango(iso: string): boolean {
    if (minimo && iso < minimo) return true;
    if (maximo && iso > maximo) return true;
    return false;
  }

  function elegir(dia: number) {
    const iso = aIso(visible.anio, visible.mes, dia);
    if (fueraDeRango(iso)) return;
    onCambio(iso);
    setAbierto(false);
    disparador.current?.focus();
  }

  function moverMes(delta: number) {
    setVisible((prev) => {
      const fecha = new Date(prev.anio, prev.mes + delta, 1);
      return { anio: fecha.getFullYear(), mes: fecha.getMonth() };
    });
  }

  /** Mueve el cursor `delta` días, cambiando de mes si hace falta. */
  function moverCursor(delta: number) {
    const fecha = new Date(visible.anio, visible.mes, cursor + delta);
    setVisible({ anio: fecha.getFullYear(), mes: fecha.getMonth() });
    setCursor(fecha.getDate());
  }

  function tecladoRejilla(evento: React.KeyboardEvent<HTMLDivElement>) {
    const teclas: Record<string, () => void> = {
      ArrowLeft: () => moverCursor(-1),
      ArrowRight: () => moverCursor(1),
      ArrowUp: () => moverCursor(-7),
      ArrowDown: () => moverCursor(7),
      PageUp: () => moverMes(-1),
      PageDown: () => moverMes(1),
      Home: () => moverCursor(-(((new Date(visible.anio, visible.mes, cursor).getDay() + 6) % 7))),
      End: () => moverCursor(6 - ((new Date(visible.anio, visible.mes, cursor).getDay() + 6) % 7)),
    };
    const accion = teclas[evento.key];
    if (accion) {
      evento.preventDefault();
      accion();
      return;
    }
    if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      elegir(cursor);
    }
  }

  const hoy = hoyIso();
  const idEtiqueta = `${idBase}-etiqueta`;
  const idError = `${idBase}-error`;

  return (
    <div className="doc-campo" ref={contenedor}>
      <span className="doc-eyebrow" id={idEtiqueta}>
        {etiqueta}
        {requerido && (
          <span aria-hidden style={{ color: "var(--doc-danger)" }}>
            {" "}*
          </span>
        )}
      </span>

      <div className="ne-fecha-fila">
        {/*
          El campo de texto y el botón del calendario son dos caminos al mismo dato.
          Se escribe y se confirma al salir del campo (`blur`) o con Enter: validar
          en cada pulsación marcaría en rojo «15/0» mientras alguien teclea
          «15/03/2026».
        */}
        <input
          type="text"
          inputMode="numeric"
          className="doc-input ne-fecha-texto"
          value={texto}
          placeholder="dd/mm/aaaa"
          aria-labelledby={idEtiqueta}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            if (!texto.trim()) {
              if (valor) onCambio("");
              return;
            }
            const interpretada = interpretarFecha(texto);
            if (interpretada && !fueraDeRango(interpretada)) onCambio(interpretada);
            else setTexto(valor ? fechaLarga(valor) : "");
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }}
        />

        <button
          ref={disparador}
          type="button"
          className="doc-tap ne-fecha-boton"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-label={valor ? `Cambiar la fecha, ahora ${fechaLarga(valor)}` : "Abrir el calendario"}
          onClick={() => setAbierto((v) => !v)}
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
        </button>

        {permiteLimpiar && valor && (
          <button type="button" className="doc-tap ne-fecha-boton" aria-label="Quitar la fecha" onClick={() => onCambio("")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {descripcion && !error && <p className="ne-ayuda">{descripcion}</p>}
      {error && (
        <p className="ne-error" id={idError}>
          {error}
        </p>
      )}

      <AnimatePresence>
        {abierto && (
          <motion.div
            className="ne-calendario"
            role="dialog"
            aria-label={`Calendario, ${MESES[visible.mes]} de ${visible.anio}`}
            initial={reducido ? false : { opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducido ? undefined : { opacity: 0, y: -4, scale: 0.99 }}
            transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
          >
            <div className="ne-calendario-cabecera">
              <button type="button" className="doc-tap ne-calendario-nav" onClick={() => moverMes(-1)} aria-label="Mes anterior">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <p aria-live="polite">
                {MESES[visible.mes]} <span className="ne-calendario-anio">{visible.anio}</span>
              </p>
              <button type="button" className="doc-tap ne-calendario-nav" onClick={() => moverMes(1)} aria-label="Mes siguiente">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="ne-calendario-dias" aria-hidden>
              {DIAS.map((dia) => (
                <span key={dia}>{dia}</span>
              ))}
            </div>

            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
            <div className="ne-calendario-rejilla" ref={rejilla} role="grid" onKeyDown={tecladoRejilla}>
              {dias.map((dia, indice) => {
                if (dia === null) return <span key={`v-${indice}`} className="ne-calendario-hueco" aria-hidden />;
                const iso = aIso(visible.anio, visible.mes, dia);
                const esElegida = valor.slice(0, 10) === iso;
                const esHoy = iso === hoy;
                const bloqueada = fueraDeRango(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    aria-selected={esElegida}
                    aria-current={esHoy ? "date" : undefined}
                    disabled={bloqueada}
                    data-cursor={dia === cursor ? "si" : undefined}
                    data-elegida={esElegida ? "si" : undefined}
                    data-hoy={esHoy ? "si" : undefined}
                    tabIndex={dia === cursor ? 0 : -1}
                    className="doc-tap ne-calendario-dia"
                    onClick={() => elegir(dia)}
                    onFocus={() => setCursor(dia)}
                  >
                    {dia}
                  </button>
                );
              })}
            </div>

            <div className="ne-calendario-pie">
              <button
                type="button"
                className="doc-tap ne-calendario-atajo"
                onClick={() => {
                  if (fueraDeRango(hoy)) return;
                  onCambio(hoy);
                  setAbierto(false);
                  disparador.current?.focus();
                }}
              >
                Hoy
              </button>
              {permiteLimpiar && (
                <button
                  type="button"
                  className="doc-tap ne-calendario-atajo"
                  onClick={() => {
                    onCambio("");
                    setAbierto(false);
                    disparador.current?.focus();
                  }}
                >
                  Limpiar
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
