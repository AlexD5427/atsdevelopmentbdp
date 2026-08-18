/**
 * Una fila de requisito: chips de estado, observaciones y prórroga.
 *
 * ── El chip de un toque ────────────────────────────────────────────────
 * Un clic deja el requisito resuelto: no hay desplegable que abrir ni confirmar.
 * En un expediente comercial son veintisiete requisitos, y un desplegable por
 * requisito son cincuenta y cuatro clics de más.
 *
 * El grupo es un `radiogroup` de verdad: las flechas recorren las opciones y un
 * lector de pantalla lo anuncia como una elección única, que es lo que es. Y el
 * color nunca comunica solo: cada chip lleva su etiqueta escrita, porque un
 * expediente impreso en blanco y negro tiene que seguir leyendose.
 *
 * ── La prórroga ────────────────────────────────────────────────────────
 * Solo se ofrece donde el requisito la admite (certificados de trabajo, título
 * legalizado, examen de la UIF) y solo mientras el documento no esté entregado:
 * una prórroga de algo que ya llegó es un error de captura. Con prórroga puesta,
 * la fila se pinta en ámbar y muestra los días que quedan; el día del vencimiento
 * pasa a rojo. Los días se calculan al leer y no se guardan, porque un número de
 * días guardado en una celda miente a la mañana siguiente.
 */

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, ChevronDown, MessageSquare, TimerReset } from "lucide-react";
import type { EstadoDoc, RequisitoDef } from "../domain/categorias";
import { ETIQUETA_CHIP, TOKEN_CHIP, estadosDe } from "../domain/categorias";
import { diasHasta, textoPlazo } from "../domain/progreso";
import { DURACION, CURVA, useMovimientoReducido } from "./DocMotion";
import { SelectorFecha } from "./SelectorFecha";

/** Lo que el formulario guarda de cada requisito. */
export interface ValorRequisito {
  estado: EstadoDoc;
  observaciones: string;
  /** Fecha de prórroga en `yyyy-mm-dd`. Vacía cuando no hay prórroga. */
  prorroga: string;
  prorrogaMotivo: string;
}

export const VALOR_INICIAL: ValorRequisito = {
  estado: "PENDIENTE",
  observaciones: "",
  prorroga: "",
  prorrogaMotivo: "",
};

/** Situación de una prórroga, para decidir el color de la fila. */
function situacionProrroga(fecha: string): "sin" | "vigente" | "por_vencer" | "vencida" {
  if (!fecha) return "sin";
  const dias = diasHasta(fecha);
  if (dias === null) return "sin";
  if (dias < 0) return "vencida";
  if (dias <= 3) return "por_vencer";
  return "vigente";
}

export function ChipsEstado({
  requisito,
  valor,
  onCambio,
  compacto,
}: {
  requisito: RequisitoDef;
  valor: EstadoDoc;
  onCambio: (estado: EstadoDoc) => void;
  compacto?: boolean;
}) {
  const reducido = useMovimientoReducido();
  const opciones = estadosDe(requisito);

  /** Flechas dentro del grupo: es lo que un `radiogroup` promete. */
  function teclado(evento: React.KeyboardEvent<HTMLDivElement>) {
    const avance = evento.key === "ArrowRight" || evento.key === "ArrowDown" ? 1 : evento.key === "ArrowLeft" || evento.key === "ArrowUp" ? -1 : 0;
    if (!avance) return;
    evento.preventDefault();
    const actual = opciones.indexOf(valor);
    const siguiente = (actual + avance + opciones.length) % opciones.length;
    onCambio(opciones[siguiente]);
  }

  return (
    <div
      className={compacto ? "ne-chips ne-chips-compacto" : "ne-chips"}
      role="radiogroup"
      aria-label={`Estado de ${requisito.nombre}`}
      onKeyDown={teclado}
    >
      {opciones.map((estado) => {
        const activo = valor === estado;
        const token = TOKEN_CHIP[estado];
        return (
          <motion.button
            key={estado}
            type="button"
            role="radio"
            aria-checked={activo}
            tabIndex={activo ? 0 : -1}
            className="doc-tap ne-chip"
            data-activo={activo ? "si" : undefined}
            style={
              activo
                ? { background: token.fondo, color: token.texto, borderColor: token.borde }
                : undefined
            }
            onClick={() => onCambio(estado)}
            whileTap={reducido ? undefined : { scale: 0.96 }}
            transition={reducido ? { duration: 0 } : { duration: DURACION.rapida, ease: CURVA.salidaQuint }}
          >
            {/* El punto es redundante con el color a propósito: en alto contraste el
                fondo se aplana y el punto sigue distinguiendo el estado. */}
            <span className="ne-chip-punto" style={{ background: activo ? token.borde : "var(--doc-border)" }} aria-hidden />
            {ETIQUETA_CHIP[estado]}
          </motion.button>
        );
      })}
    </div>
  );
}

export function FilaRequisito({
  requisito,
  valor,
  onCambio,
  indice,
}: {
  requisito: RequisitoDef;
  valor: ValorRequisito;
  onCambio: (patch: Partial<ValorRequisito>) => void;
  indice: number;
}) {
  const reducido = useMovimientoReducido();
  const idBase = useId();
  const hayObservacion = valor.observaciones.trim().length > 0;
  const [abierto, setAbierto] = useState(hayObservacion);
  const situacion = situacionProrroga(valor.prorroga);

  // La prórroga no se ofrece sobre un documento ya entregado: no hay nada que
  // prorrogar y ofrecerlo invita a un dato contradictorio.
  const puedeProrroga = requisito.prorroga === true && valor.estado !== "ENTREGADO";

  return (
    <motion.li
      className="ne-requisito"
      data-estado={valor.estado}
      data-prorroga={situacion === "sin" ? undefined : situacion}
      initial={reducido ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reducido
          ? { duration: 0 }
          : // El escalonado se corta a los diez elementos: en una lista de veintisiete,
            // esperar a que entre el último es medio segundo mirando cómo aparece algo.
            { duration: DURACION.normal, ease: CURVA.salidaExpo, delay: Math.min(indice, 10) * 0.022 }
      }
    >
      <div className="ne-requisito-cabecera">
        <div className="ne-requisito-texto">
          <p className="ne-requisito-nombre">
            <span className="ne-requisito-orden" aria-hidden>
              {String(indice + 1).padStart(2, "0")}
            </span>
            {requisito.nombre}
          </p>
          {requisito.detalle && <p className="ne-requisito-detalle">{requisito.detalle}</p>}
        </div>

        <ChipsEstado requisito={requisito} valor={valor.estado} onCambio={(estado) => onCambio({ estado })} />
      </div>

      <div className="ne-requisito-acciones">
        <button
          type="button"
          className="doc-tap ne-enlace"
          aria-expanded={abierto}
          aria-controls={`${idBase}-obs`}
          onClick={() => setAbierto((v) => !v)}
          data-lleno={hayObservacion ? "si" : undefined}
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          {hayObservacion ? "Observación escrita" : "Añadir observación"}
          <ChevronDown className="h-3.5 w-3.5 ne-enlace-flecha" data-abierto={abierto ? "si" : undefined} aria-hidden />
        </button>

        {puedeProrroga && !valor.prorroga && (
          <button type="button" className="doc-tap ne-enlace" onClick={() => setAbierto(true)}>
            <TimerReset className="h-3.5 w-3.5" aria-hidden />
            Registrar prórroga
          </button>
        )}

        {valor.prorroga && (
          <span className="ne-prorroga-sello" data-situacion={situacion}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {textoPlazo(valor.prorroga)}
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            id={`${idBase}-obs`}
            className="ne-requisito-cuerpo"
            initial={reducido ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducido ? undefined : { opacity: 0, height: 0 }}
            transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
          >
            <label className="doc-campo">
              <span className="doc-eyebrow">{requisito.observacion}</span>
              <textarea
                className="doc-input ne-textarea"
                rows={2}
                value={valor.observaciones}
                maxLength={2000}
                placeholder="Lo que haya que dejar dicho sobre este documento"
                onChange={(e) => onCambio({ observaciones: e.target.value })}
              />
            </label>

            {puedeProrroga && (
              <div className="ne-prorroga">
                <SelectorFecha
                  etiqueta={`Fecha de prórroga para ${requisito.nombre.toLowerCase()}`}
                  valor={valor.prorroga}
                  minimo={new Date().toISOString().slice(0, 10)}
                  descripcion="Hasta cuándo se concede el plazo. El módulo avisa tres días antes."
                  onCambio={(iso) => onCambio({ prorroga: iso })}
                />
                {valor.prorroga && (
                  <label className="doc-campo">
                    <span className="doc-eyebrow">Motivo de la prórroga</span>
                    <input
                      type="text"
                      className="doc-input"
                      value={valor.prorrogaMotivo}
                      maxLength={300}
                      placeholder="Por qué se concede"
                      onChange={(e) => onCambio({ prorrogaMotivo: e.target.value })}
                    />
                  </label>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
