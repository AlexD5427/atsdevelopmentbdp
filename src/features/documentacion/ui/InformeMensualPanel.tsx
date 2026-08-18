/**
 * Panel del informe mensual.
 *
 * ── Por qué hay un paso de «generar» antes de descargar ───────────────────
 * Porque armar el informe cuesta una petición por expediente y eso tarda. Con tres
 * botones de descarga directos, cada formato repetiría el mismo trabajo: pedir
 * Excel, Word y PDF serían noventa peticiones para treinta personas. Aquí se
 * genera una vez, se muestra lo que salió —que además permite revisar las cifras
 * antes de repartir el archivo— y los tres formatos se escriben del modelo que ya
 * está en memoria, al instante.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileSpreadsheet, FileText, Loader2, Printer, RefreshCw, X } from "lucide-react";
import { DocError } from "../api/client";
import {
  construirInformeMensual,
  descargarInformeExcel,
  descargarInformeWord,
  imprimirInformePdf,
  type InformeMensual,
  type ProgresoInforme,
} from "../export/informeMensual";
import { CURVA, DURACION, useMovimientoReducido } from "./DocMotion";
import { IconoPorCodigo } from "./IconosCategoria";
import { Aviso, Boton } from "./piezas";
import "./nuevo-expediente.css";

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

export function InformeMensualPanel({
  abierto,
  onCerrar,
  avisar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  avisar: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
}) {
  const reducido = useMovimientoReducido();
  const ahora = new Date();
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth());
  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoInforme | null>(null);
  const [informe, setInforme] = useState<InformeMensual | null>(null);
  const [fallo, setFallo] = useState<string>("");

  const anios = useMemo(() => {
    const actual = ahora.getFullYear();
    return [actual + 1, actual, actual - 1, actual - 2, actual - 3];
  }, [ahora]);

  /** El informe en memoria deja de valer si se cambia de mes. */
  const vigente = informe && informe.anio === anio && informe.mes === mes ? informe : null;

  async function generar() {
    setGenerando(true);
    setFallo("");
    setProgreso({ fase: "Preparando…", hechos: 0, total: 0 });
    try {
      const resultado = await construirInformeMensual(anio, mes, setProgreso);
      setInforme(resultado);
      if (!resultado.expedientes) {
        avisar("info", `No hay expedientes con fecha de ingreso en ${MESES[mes]} de ${anio}.`);
      } else {
        avisar("exito", `Informe de ${resultado.etiquetaMes} listo.`, `${resultado.expedientes} expediente(s) analizado(s).`);
      }
    } catch (error) {
      const detalle = error instanceof DocError ? `${error.message} ${error.pista}` : String(error);
      setFallo(detalle);
    } finally {
      setGenerando(false);
      setProgreso(null);
    }
  }

  if (!abierto) return null;

  const porcentajeProgreso = progreso?.total ? Math.round((progreso.hechos / progreso.total) * 100) : 0;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/55 p-0 backdrop-blur-md sm:items-center sm:p-4"
        initial={reducido ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducido ? undefined : { opacity: 0 }}
        transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
        onMouseDown={(evento) => {
          if (evento.target === evento.currentTarget && !generando) onCerrar();
        }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Informe mensual de avance documental"
          data-bloqueo-scroll="activo"
          className="doc-console ne-form glass-heavy flex h-full w-full max-w-4xl flex-col overflow-hidden sm:h-[min(90vh,46rem)] sm:rounded-2xl"
          initial={reducido ? false : { opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducido ? undefined : { opacity: 0, y: 10, scale: 0.99 }}
          transition={reducido ? { duration: 0 } : { duration: DURACION.lenta, ease: CURVA.salidaExpo }}
        >
          <header className="flex items-start justify-between gap-3 border-b border-[color:var(--doc-border)] p-4">
            <div className="min-w-0">
              <p className="doc-eyebrow ne-revelar">Informe mensual</p>
              <h2 className="ne-revelar ne-revelar-2 mt-0.5 text-sm font-semibold text-[color:var(--doc-text)]">
                Avance documental de {MESES[mes]} de {anio}
              </h2>
              <p className="ne-revelar ne-revelar-3 ne-ayuda mt-0.5">
                Por categoría, por persona y documento a documento, con sus observaciones y prórrogas.
              </p>
            </div>
            <button type="button" className="doc-tap ne-fecha-boton" onClick={onCerrar} aria-label="Cerrar">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div className="ne-rejilla">
              <label className="doc-campo">
                <span className="doc-eyebrow">Mes</span>
                <select className="doc-input" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                  {MESES.map((nombre, indice) => (
                    <option key={nombre} value={indice}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="doc-campo">
                <span className="doc-eyebrow">Año</span>
                <select className="doc-input" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
                  {anios.map((valor) => (
                    <option key={valor} value={valor}>
                      {valor}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="ne-ayuda">
              El mes se decide por la <b>fecha de ingreso</b> del expediente, no por cuándo se registró: es como el área cuenta las
              incorporaciones.
            </p>

            {generando && progreso && (
              <div className="doc-sunken space-y-2 p-3">
                <p className="flex items-center gap-2 text-xs text-[color:var(--doc-text)]" aria-live="polite">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {progreso.fase}
                </p>
                {progreso.total > 0 && (
                  <>
                    <div className="ne-barra">
                      <span style={{ width: `${porcentajeProgreso}%` }} />
                    </div>
                    <p className="ne-ayuda">
                      {progreso.hechos} de {progreso.total} expedientes. Van de uno en uno a propósito: en paralelo, Apps Script empieza a
                      responder «libro ocupado».
                    </p>
                  </>
                )}
              </div>
            )}

            {fallo && (
              <Aviso intencion="peligro" titulo="No se pudo armar el informe">
                {fallo}
              </Aviso>
            )}

            {vigente && (
              <>
                <div className="ne-rejilla">
                  <Indicador etiqueta="Expedientes" valor={String(vigente.expedientes)} />
                  <Indicador etiqueta="Avance promedio" valor={`${vigente.avancePromedio} %`} />
                  <Indicador etiqueta="Completos" valor={String(vigente.completos)} />
                  <Indicador etiqueta="Incompletos" valor={String(vigente.incompletos)} />
                  <Indicador etiqueta="Observaciones" valor={String(vigente.totalObservaciones)} />
                  <Indicador
                    etiqueta="Prórrogas vencidas"
                    valor={String(vigente.prorrogasVencidas)}
                    alerta={vigente.prorrogasVencidas > 0}
                  />
                </div>

                {vigente.incompletosDeLectura.length > 0 && (
                  <Aviso intencion="aviso" titulo="El informe lleva una salvedad">
                    De {vigente.incompletosDeLectura.length} expediente(s) solo se pudo leer la cabecera, así que su detalle documental no
                    entra en el informe. Van marcados en los tres formatos: {vigente.incompletosDeLectura.slice(0, 3).join("; ")}
                    {vigente.incompletosDeLectura.length > 3 ? "…" : ""}.
                  </Aviso>
                )}

                {vigente.categorias.length === 0 ? (
                  <Aviso intencion="info" titulo="Sin expedientes en el mes">
                    Ningún expediente tiene fecha de ingreso entre {vigente.desde} y {vigente.hasta}.
                  </Aviso>
                ) : (
                  <ul className="ne-requisitos">
                    {vigente.categorias.map((categoria) => (
                      <li key={categoria.codigo} className="ne-requisito" style={{ ["--ne-color" as string]: categoria.color }}>
                        <div className="ne-requisito-cabecera">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="ne-categoria-icono" style={{ width: "2rem", height: "2rem" }}>
                              <IconoPorCodigo codigo={categoria.codigo} className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="ne-requisito-nombre">{categoria.etiqueta}</p>
                              <p className="ne-requisito-detalle">
                                {categoria.expedientes} expediente(s) · {categoria.completos} completo(s) · avance {categoria.avancePromedio} %
                              </p>
                            </div>
                          </div>
                          <p className="ne-resumen">
                            {categoria.pendientes > 0 && (
                              <span>
                                <b>{categoria.pendientes}</b> pend.
                              </span>
                            )}
                            {categoria.noEntregados > 0 && (
                              <span>
                                <b>{categoria.noEntregados}</b> no entr.
                              </span>
                            )}
                            {categoria.observados > 0 && (
                              <span>
                                <b>{categoria.observados}</b> obs.
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="ne-barra">
                          <span style={{ width: `${categoria.avancePromedio}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {!vigente && !generando && !fallo && (
              <Aviso intencion="info" titulo="Elige el mes y genera el informe">
                Se lee un expediente por petición, así que un mes con muchas incorporaciones tarda. Una vez generado, los tres formatos se
                escriben al instante desde el mismo modelo.
              </Aviso>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--doc-border)] p-4">
            <Boton variante="suave" cargando={generando} onClick={() => void generar()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> {vigente ? "Volver a generar" : "Generar informe"}
            </Boton>

            {vigente && vigente.expedientes > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Boton
                  variante="suave"
                  onClick={() => {
                    const salida = descargarInformeExcel(vigente);
                    avisar("exito", `Excel descargado (${Math.round(salida.bytes / 1024)} kB).`, salida.nombre);
                  }}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Excel
                </Boton>
                <Boton
                  variante="suave"
                  onClick={() => {
                    const salida = descargarInformeWord(vigente);
                    avisar("exito", `Word descargado (${Math.round(salida.bytes / 1024)} kB).`, salida.nombre);
                  }}
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden /> Word
                </Boton>
                <Boton
                  variante="primario"
                  onClick={() => {
                    const abierta = imprimirInformePdf(vigente);
                    if (!abierta) {
                      avisar(
                        "aviso",
                        "El navegador bloqueó la ventana del informe.",
                        "Permite las ventanas emergentes de este sitio y vuelve a intentarlo.",
                      );
                      return;
                    }
                    avisar(
                      "info",
                      "Informe abierto para imprimir.",
                      "En el diálogo de impresión, elige «Guardar como PDF» como destino.",
                    );
                  }}
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden /> PDF
                </Boton>
              </div>
            )}
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Indicador({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className="doc-sunken p-3">
      <p className="doc-metric text-lg font-semibold" style={{ color: alerta ? "var(--doc-danger-fg)" : "var(--doc-text)" }}>
        {valor}
      </p>
      <p className="doc-eyebrow">{etiqueta}</p>
    </div>
  );
}
