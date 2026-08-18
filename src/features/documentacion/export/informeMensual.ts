/**
 * Informe mensual de avance documental.
 *
 * ── Qué lo distingue de una exportación ─────────────────────────────────
 * Una exportación vuelca filas. Esto LEE cada expediente del mes y lo interpreta:
 * agrupa por categoría, dentro de cada categoría por persona, y dentro de cada
 * persona resuelve el cumplimiento requisito a requisito con sus observaciones y
 * el estado real de sus prórrogas.
 *
 * ── El coste, dicho de frente ──────────────────────────────────────────
 * El detalle de un expediente solo se puede pedir de uno en uno
 * (`expediente.obtener`), así que un mes con treinta incorporaciones son treinta
 * peticiones. Van EN SERIE y con progreso visible. En paralelo iría más rápido y
 * sería también la forma más segura de que Apps Script empiece a responder «libro
 * ocupado» a mitad de camino: tiene un límite de seis minutos por ejecución y un
 * `LockService` que serializa las escrituras. Tarda más y termina.
 *
 * ── Un modelo, tres formatos ──────────────────────────────────────────
 * Excel, Word y PDF salen del mismo `InformeMensual`. Es la única forma de que las
 * cifras coincidan entre los tres archivos; tres generadores que calculan por su
 * cuenta acaban discrepando, y una discrepancia en un informe firmado significa
 * que nadie vuelve a creerse ninguno.
 */

import { docApi } from "../api/acciones";
import { CATEGORIAS, categoria as buscarCategoria } from "../domain/categorias";
import { diasHasta, fechaCorta, type ExpedienteCabecera, type RequisitoVista } from "../domain/progreso";
import { ETIQUETA_DOCUMENTO, ETIQUETA_EXPEDIENTE, type EstadoDocumento, type EstadoExpediente } from "../domain/vocabulario";
import { descargarXlsx, type Libro } from "./xlsx";
import { descargarDocx, type BloqueDocx } from "./docx";

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

/* ------------------------------------------------------------------ */
/* Modelo                                                              */
/* ------------------------------------------------------------------ */

export interface RequisitoInforme {
  codigo: string;
  nombre: string;
  seccion: string;
  estado: string;
  estadoEtiqueta: string;
  observaciones: string;
  estadoRevision: string;
  prorrogaFecha: string;
  prorrogaSituacion: string;
  diasProrroga: number | null;
}

export interface PersonaInforme {
  expedienteId: string;
  identificador: string;
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  fechaIngreso: string;
  estado: string;
  estadoEtiqueta: string;
  porcentaje: number;
  categoria: string;
  categoriaEtiqueta: string;
  garantiaEtiqueta: string;
  requisitos: RequisitoInforme[];
  entregados: number;
  pendientes: number;
  noEntregados: number;
  noAplica: number;
  observados: number;
  prorrogasVigentes: number;
  prorrogasVencidas: number;
  /** Frase que resume la situación. Es lo que se lee en la fila del informe. */
  veredicto: string;
  /** `true` cuando solo se pudo leer la cabecera. */
  parcial: boolean;
}

export interface CategoriaInforme {
  codigo: string;
  etiqueta: string;
  color: string;
  personas: PersonaInforme[];
  expedientes: number;
  completos: number;
  avancePromedio: number;
  pendientes: number;
  noEntregados: number;
  observados: number;
}

export interface InformeMensual {
  anio: number;
  mes: number;
  etiquetaMes: string;
  generado: string;
  desde: string;
  hasta: string;
  categorias: CategoriaInforme[];
  expedientes: number;
  avancePromedio: number;
  completos: number;
  incompletos: number;
  totalObservaciones: number;
  prorrogasVencidas: number;
  /** Expedientes cuyo detalle no se pudo leer. Se dice en el informe. */
  incompletosDeLectura: string[];
}

/* ------------------------------------------------------------------ */
/* Construcción                                                        */
/* ------------------------------------------------------------------ */

function dos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Primer y último día del mes, en `yyyy-mm-dd`. */
export function rangoDelMes(anio: number, mes: number): { desde: string; hasta: string } {
  const ultimo = new Date(anio, mes + 1, 0).getDate();
  return { desde: `${anio}-${dos(mes + 1)}-01`, hasta: `${anio}-${dos(mes + 1)}-${dos(ultimo)}` };
}

function situacionProrroga(fecha: string): { situacion: string; dias: number | null } {
  if (!fecha) return { situacion: "", dias: null };
  const dias = diasHasta(fecha);
  if (dias === null) return { situacion: "", dias: null };
  if (dias < 0) return { situacion: "vencida", dias };
  if (dias <= 3) return { situacion: "por vencer", dias };
  return { situacion: "vigente", dias };
}

/**
 * Frase que resume el expediente de una persona.
 *
 * Un porcentaje no dice qué hacer. «86 %, faltan dos y una prórroga venció» sí.
 * El orden de las cláusulas es el de urgencia: lo vencido primero.
 */
function veredictoDe(persona: Omit<PersonaInforme, "veredicto">): string {
  const partes: string[] = [];
  if (persona.prorrogasVencidas > 0) partes.push(`${persona.prorrogasVencidas} prórroga(s) vencida(s)`);
  if (persona.noEntregados > 0) partes.push(`${persona.noEntregados} no entregado(s)`);
  if (persona.observados > 0) partes.push(`${persona.observados} observado(s)`);
  if (persona.pendientes > 0) partes.push(`${persona.pendientes} pendiente(s)`);
  if (!partes.length) return persona.porcentaje >= 100 ? "Expediente completo." : "Sin faltantes registrados.";
  return `${persona.porcentaje} % de avance · ${partes.join(", ")}.`;
}

function aPersona(cabecera: ExpedienteCabecera, requisitos: RequisitoVista[], parcial: boolean): PersonaInforme {
  const def = buscarCategoria(cabecera.tipoFuncionario);
  const detalle: RequisitoInforme[] = [];

  let entregados = 0;
  let pendientes = 0;
  let noEntregados = 0;
  let noAplica = 0;
  let observados = 0;
  let prorrogasVigentes = 0;
  let prorrogasVencidas = 0;

  for (const requisito of requisitos) {
    if (requisito.archivado) continue;

    // La prórroga que importa es la más lejana de las que siguen abiertas: es la
    // que marca hasta cuándo hay plazo de verdad.
    const abiertas = (requisito.prorrogas ?? []).filter((p) => p.situacion !== "cerrada");
    const vigente = abiertas.slice().sort((a, b) => String(b.fechaProrroga).localeCompare(String(a.fechaProrroga)))[0];
    const situacion = situacionProrroga(vigente?.fechaProrroga ?? "");

    if (situacion.situacion === "vencida") prorrogasVencidas += 1;
    else if (situacion.situacion) prorrogasVigentes += 1;

    if (requisito.estado === "ENTREGADO") entregados += 1;
    else if (requisito.estado === "PENDIENTE") pendientes += 1;
    else if (requisito.estado === "NO_ENTREGADO") noEntregados += 1;
    else if (requisito.estado === "NO_APLICA") noAplica += 1;

    const estaObservado =
      requisito.estadoRevision === "OBSERVADO" ||
      requisito.estadoRevision === "REQUIERE_CORRECCION" ||
      requisito.estadoRevision === "RECHAZADO";
    if (estaObservado) observados += 1;

    detalle.push({
      codigo: requisito.codigo,
      nombre: requisito.nombre,
      seccion: requisito.seccion,
      estado: requisito.estado,
      estadoEtiqueta: ETIQUETA_DOCUMENTO[requisito.estado as EstadoDocumento] ?? requisito.estado,
      observaciones: requisito.observaciones ?? "",
      estadoRevision: requisito.estadoRevision ?? "",
      prorrogaFecha: vigente?.fechaProrroga ?? "",
      prorrogaSituacion: situacion.situacion,
      diasProrroga: situacion.dias,
    });
  }

  const base: Omit<PersonaInforme, "veredicto"> = {
    expedienteId: cabecera.expedienteId,
    identificador: cabecera.identificador,
    nombre: cabecera.nombre,
    cargo: cabecera.cargo ?? "",
    agencia: cabecera.agencia ?? "",
    gerencia: cabecera.gerencia ?? "",
    fechaIngreso: cabecera.fechaIngreso ?? "",
    estado: cabecera.estado,
    estadoEtiqueta: ETIQUETA_EXPEDIENTE[cabecera.estado as EstadoExpediente] ?? cabecera.estado,
    porcentaje: cabecera.porcentaje ?? 0,
    categoria: def?.codigo ?? cabecera.tipoFuncionario ?? "GENERAL",
    categoriaEtiqueta: def?.etiqueta ?? cabecera.tipoFuncionarioEtiqueta ?? cabecera.tipoFuncionario ?? "",
    garantiaEtiqueta: cabecera.tipoGarantia && cabecera.tipoGarantia !== "NINGUNA" ? (cabecera.tipoGarantiaEtiqueta ?? cabecera.tipoGarantia) : "",
    requisitos: detalle,
    entregados,
    pendientes,
    noEntregados,
    noAplica,
    observados,
    prorrogasVigentes,
    prorrogasVencidas,
    parcial,
  };

  return { ...base, veredicto: veredictoDe(base) };
}

export interface ProgresoInforme {
  fase: string;
  hechos: number;
  total: number;
}

/**
 * Construye el informe del mes.
 *
 * `onProgreso` no es un adorno: con treinta expedientes esto tarda, y una barra
 * quieta durante un minuto se interpreta como que se ha colgado.
 */
export async function construirInformeMensual(
  anio: number,
  mes: number,
  onProgreso?: (progreso: ProgresoInforme) => void,
): Promise<InformeMensual> {
  const { desde, hasta } = rangoDelMes(anio, mes);

  /* ── 1 · Las cabeceras del mes, paginando hasta agotar ────────────────── */
  onProgreso?.({ fase: "Buscando los expedientes del mes…", hechos: 0, total: 0 });

  const cabeceras: ExpedienteCabecera[] = [];
  let pagina = 1;
  // Techo de seguridad: sin él, un backend que devuelve siempre la misma página
  // deja este bucle girando para siempre.
  for (let vuelta = 0; vuelta < 40; vuelta++) {
    const respuesta = await docApi.listarExpedientes({
      ingresoDesde: desde,
      ingresoHasta: hasta,
      incluirArchivados: true,
      porPagina: 100,
      pagina,
      orden: "reciente",
    });
    const lote = respuesta.expedientes ?? [];
    cabeceras.push(...lote);
    if (lote.length === 0 || pagina >= (respuesta.paginas || 1)) break;
    pagina += 1;
  }

  /* ── 2 · El detalle, de uno en uno ────────────────────────────────── */
  const personas: PersonaInforme[] = [];
  const incompletosDeLectura: string[] = [];

  for (let i = 0; i < cabeceras.length; i++) {
    const cabecera = cabeceras[i];
    onProgreso?.({ fase: `Leyendo el expediente de ${cabecera.nombre}…`, hechos: i, total: cabeceras.length });
    try {
      const operativo = await docApi.obtenerExpediente(cabecera.expedienteId);
      personas.push(aPersona(operativo.expediente ?? cabecera, operativo.requisitos ?? [], false));
    } catch {
      // Un expediente que no se puede leer NO invalida el informe: entra con lo que
      // se sabe de su cabecera y queda marcado como parcial. Un informe con una
      // laguna declarada es útil; uno que falla entero, no.
      personas.push(aPersona(cabecera, [], true));
      incompletosDeLectura.push(`${cabecera.identificador} · ${cabecera.nombre}`);
    }
  }

  onProgreso?.({ fase: "Armando el informe…", hechos: cabeceras.length, total: cabeceras.length });

  /* ── 3 · Agrupación por categoría ───────────────────────────────── */
  const categorias: CategoriaInforme[] = [];
  for (const def of CATEGORIAS) {
    const suyas = personas.filter((p) => p.categoria === def.codigo);
    if (!suyas.length) continue;
    const avance = Math.round(suyas.reduce((s, p) => s + p.porcentaje, 0) / suyas.length);
    categorias.push({
      codigo: def.codigo,
      etiqueta: def.etiqueta,
      color: def.color,
      // Dentro de la categoría, primero lo que peor va: un informe se lee de arriba
      // abajo y lo urgente tiene que estar arriba.
      personas: suyas.slice().sort((a, b) => a.porcentaje - b.porcentaje || a.nombre.localeCompare(b.nombre)),
      expedientes: suyas.length,
      completos: suyas.filter((p) => p.porcentaje >= 100).length,
      avancePromedio: avance,
      pendientes: suyas.reduce((s, p) => s + p.pendientes, 0),
      noEntregados: suyas.reduce((s, p) => s + p.noEntregados, 0),
      observados: suyas.reduce((s, p) => s + p.observados, 0),
    });
  }

  const totalObservaciones = personas.reduce(
    (suma, persona) => suma + persona.requisitos.filter((r) => r.observaciones.trim().length > 0).length,
    0,
  );

  return {
    anio,
    mes,
    etiquetaMes: `${MESES[mes]} de ${anio}`,
    generado: new Date().toISOString(),
    desde,
    hasta,
    categorias,
    expedientes: personas.length,
    avancePromedio: personas.length ? Math.round(personas.reduce((s, p) => s + p.porcentaje, 0) / personas.length) : 0,
    completos: personas.filter((p) => p.porcentaje >= 100).length,
    incompletos: personas.filter((p) => p.porcentaje < 100).length,
    totalObservaciones,
    prorrogasVencidas: personas.reduce((s, p) => s + p.prorrogasVencidas, 0),
    incompletosDeLectura,
  };
}

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

/**
 * Cinco hojas.
 *
 * Las tres de detalle son PLANAS —una fila por hecho, con la persona repetida en
 * cada fila— a propósito: es lo que permite montar una tabla dinámica sin tocar
 * nada. Una hoja «bonita» con celdas combinadas es imposible de agregar después.
 */
export function libroDelInforme(informe: InformeMensual): Libro {
  const resumen: (string | number)[][] = [
    ["Informe mensual de avance documental"],
    ["Banco de Desarrollo Productivo S.A.M."],
    ["Mes", informe.etiquetaMes],
    ["Rango de ingreso", `${informe.desde} a ${informe.hasta}`],
    ["Generado", new Date(informe.generado).toLocaleString("es-BO")],
    [],
    ["Expedientes", informe.expedientes],
    ["Avance promedio (%)", informe.avancePromedio],
    ["Completos", informe.completos],
    ["Incompletos", informe.incompletos],
    ["Observaciones registradas", informe.totalObservaciones],
    ["Prórrogas vencidas", informe.prorrogasVencidas],
  ];

  if (informe.incompletosDeLectura.length) {
    resumen.push([], ["Expedientes cuyo detalle no se pudo leer"], ...informe.incompletosDeLectura.map((t) => [t]));
  }

  const porCategoria: (string | number)[][] = [
    ["Categoría", "Expedientes", "Completos", "Avance promedio (%)", "Pendientes", "No entregados", "Observados"],
    ...informe.categorias.map((c) => [c.etiqueta, c.expedientes, c.completos, c.avancePromedio, c.pendientes, c.noEntregados, c.observados]),
  ];

  const detalle: (string | number)[][] = [
    [
      "Categoría",
      "Garantía",
      "Identificador",
      "Nombre",
      "Cargo",
      "Agencia",
      "Gerencia",
      "Fecha de ingreso",
      "Estado",
      "Avance (%)",
      "Documento",
      "Sección",
      "Estado del documento",
      "Revisión",
      "Observaciones",
      "Prórroga",
      "Situación de la prórroga",
    ],
  ];
  const observaciones: (string | number)[][] = [
    ["Categoría", "Identificador", "Nombre", "Documento", "Estado", "Observación"],
  ];
  const prorrogas: (string | number)[][] = [
    ["Categoría", "Identificador", "Nombre", "Documento", "Fecha de prórroga", "Situación", "Días"],
  ];

  for (const categoria of informe.categorias) {
    for (const persona of categoria.personas) {
      for (const requisito of persona.requisitos) {
        detalle.push([
          categoria.etiqueta,
          persona.garantiaEtiqueta,
          persona.identificador,
          persona.nombre,
          persona.cargo,
          persona.agencia,
          persona.gerencia,
          persona.fechaIngreso,
          persona.estadoEtiqueta,
          persona.porcentaje,
          requisito.nombre,
          requisito.seccion,
          requisito.estadoEtiqueta,
          requisito.estadoRevision,
          requisito.observaciones,
          requisito.prorrogaFecha,
          requisito.prorrogaSituacion,
        ]);
        if (requisito.observaciones.trim()) {
          observaciones.push([
            categoria.etiqueta,
            persona.identificador,
            persona.nombre,
            requisito.nombre,
            requisito.estadoEtiqueta,
            requisito.observaciones,
          ]);
        }
        if (requisito.prorrogaFecha) {
          prorrogas.push([
            categoria.etiqueta,
            persona.identificador,
            persona.nombre,
            requisito.nombre,
            requisito.prorrogaFecha,
            requisito.prorrogaSituacion,
            requisito.diasProrroga ?? "",
          ]);
        }
      }
    }
  }

  return {
    Resumen: resumen,
    "Por categoría": porCategoria,
    "Detalle por persona": detalle,
    Observaciones: observaciones,
    "Prórrogas": prorrogas,
  };
}

export function descargarInformeExcel(informe: InformeMensual): { bytes: number; nombre: string } {
  return descargarXlsx(libroDelInforme(informe), `informe-documental-${informe.anio}-${dos(informe.mes + 1)}.xlsx`);
}

/* ------------------------------------------------------------------ */
/* Word                                                                */
/* ------------------------------------------------------------------ */

export function bloquesDelInforme(informe: InformeMensual): BloqueDocx[] {
  const bloques: BloqueDocx[] = [
    { tipo: "parrafo", texto: `Banco de Desarrollo Productivo S.A.M. · Gestión documental de incorporaciones` },
    {
      tipo: "parrafo",
      texto: `Mes: ${informe.etiquetaMes}. Ingresos entre ${fechaCorta(informe.desde)} y ${fechaCorta(informe.hasta)}. Generado el ${new Date(informe.generado).toLocaleString("es-BO")}.`,
      tenue: true,
    },
    { tipo: "titulo", nivel: 1, texto: "Resumen del mes" },
    {
      tipo: "tabla",
      cabecera: ["Indicador", "Valor"],
      anchos: [6200, 3200],
      filas: [
        ["Expedientes del mes", informe.expedientes],
        ["Avance promedio", `${informe.avancePromedio} %`],
        ["Expedientes completos", informe.completos],
        ["Expedientes incompletos", informe.incompletos],
        ["Observaciones registradas", informe.totalObservaciones],
        ["Prórrogas vencidas", informe.prorrogasVencidas],
      ],
    },
    { tipo: "titulo", nivel: 2, texto: "Distribución por categoría" },
    {
      tipo: "tabla",
      cabecera: ["Categoría", "Exp.", "Completos", "Avance", "Pend.", "No entr.", "Obs."],
      anchos: [3400, 800, 1100, 1100, 900, 1100, 900],
      filas: informe.categorias.map((c) => [
        c.etiqueta,
        c.expedientes,
        c.completos,
        `${c.avancePromedio} %`,
        c.pendientes,
        c.noEntregados,
        c.observados,
      ]),
    },
  ];

  if (informe.incompletosDeLectura.length) {
    bloques.push(
      { tipo: "titulo", nivel: 3, texto: "Salvedad de lectura" },
      {
        tipo: "parrafo",
        texto: `De ${informe.incompletosDeLectura.length} expediente(s) solo se pudo leer la cabecera, así que su detalle documental no está incluido: ${informe.incompletosDeLectura.join("; ")}.`,
      },
    );
  }

  for (const categoria of informe.categorias) {
    bloques.push({ tipo: "saltoPagina" });
    bloques.push({ tipo: "titulo", nivel: 1, texto: categoria.etiqueta });
    bloques.push({
      tipo: "parrafo",
      texto: `${categoria.expedientes} expediente(s) · ${categoria.completos} completo(s) · avance promedio ${categoria.avancePromedio} %.`,
      tenue: true,
    });

    for (const persona of categoria.personas) {
      bloques.push({ tipo: "titulo", nivel: 2, texto: `${persona.nombre} — ${persona.identificador}` });
      bloques.push({
        tipo: "tabla",
        cabecera: ["Dato", "Valor"],
        anchos: [3000, 6400],
        filas: [
          ["Cargo", persona.cargo || "—"],
          ["Agencia", persona.agencia || "—"],
          ["Gerencia", persona.gerencia || "—"],
          ["Fecha de ingreso", fechaCorta(persona.fechaIngreso)],
          ["Categoría", persona.categoriaEtiqueta + (persona.garantiaEtiqueta ? ` · ${persona.garantiaEtiqueta}` : "")],
          ["Estado del expediente", `${persona.estadoEtiqueta} (${persona.porcentaje} %)`],
          ["Situación", persona.veredicto],
        ],
      });

      if (persona.parcial) {
        bloques.push({
          tipo: "parrafo",
          texto: "No se pudo leer el detalle documental de este expediente. Las cifras provienen de su cabecera.",
          tenue: true,
        });
        continue;
      }

      bloques.push({
        tipo: "tabla",
        cabecera: ["Documento", "Estado", "Prórroga", "Observaciones"],
        anchos: [3600, 1400, 1600, 2800],
        filas: persona.requisitos.map((r) => [
          r.nombre,
          r.estadoEtiqueta,
          r.prorrogaFecha ? `${fechaCorta(r.prorrogaFecha)} (${r.prorrogaSituacion})` : "—",
          r.observaciones || "—",
        ]),
      });
    }
  }

  return bloques;
}

export function descargarInformeWord(informe: InformeMensual): { bytes: number; nombre: string } {
  return descargarDocx(
    bloquesDelInforme(informe),
    `Informe mensual de avance documental · ${informe.etiquetaMes}`,
    `informe-documental-${informe.anio}-${dos(informe.mes + 1)}.docx`,
  );
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

function escaparHtml(valor: string): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Informe en PDF, por la vía del navegador.
 *
 * Hay que decirlo sin adornos: esto NO genera un PDF en código. Abre una ventana
 * con el informe maquetado para papel y lanza el diálogo de impresión, de donde
 * sale el «Guardar como PDF» del sistema. El archivo que obtiene la persona es el
 * mismo.
 *
 * La alternativa es añadir una librería de generación de PDF —unos 300 kB en el
 * paquete— para un informe que se saca una vez al mes. No lo vale hoy. El día que
 * el informe tenga que salir sin una persona delante (adjuntarlo a un correo
 * automático, por ejemplo), ese es el momento de pagarla, y este es el punto del
 * código donde se cambia.
 */
export function imprimirInformePdf(informe: InformeMensual): boolean {
  if (typeof window === "undefined") return false;
  const ventana = window.open("", "_blank", "width=1024,height=768");
  if (!ventana) return false;

  const secciones = informe.categorias
    .map((categoria) => {
      const personas = categoria.personas
        .map((persona) => {
          const filas = persona.parcial
            ? '<tr><td colspan="4" class="tenue">Sin detalle documental legible.</td></tr>'
            : persona.requisitos
                .map(
                  (r) => `<tr>
<td>${escaparHtml(r.nombre)}</td>
<td><span class="chip ${r.estado.toLowerCase()}">${escaparHtml(r.estadoEtiqueta)}</span></td>
<td>${r.prorrogaFecha ? `${escaparHtml(fechaCorta(r.prorrogaFecha))} <small>${escaparHtml(r.prorrogaSituacion)}</small>` : "—"}</td>
<td>${escaparHtml(r.observaciones) || "—"}</td></tr>`,
                )
                .join("");

          return `<section class="persona">
<h3>${escaparHtml(persona.nombre)} <small>${escaparHtml(persona.identificador)}</small></h3>
<p class="meta">${escaparHtml(persona.cargo || "Sin cargo")} · ${escaparHtml(persona.agencia || "Sin agencia")} · ${escaparHtml(persona.gerencia || "Sin gerencia")} · ingreso ${escaparHtml(fechaCorta(persona.fechaIngreso))}</p>
<p class="veredicto">${escaparHtml(persona.estadoEtiqueta)} · ${persona.porcentaje} % · ${escaparHtml(persona.veredicto)}</p>
<table><thead><tr><th>Documento</th><th>Estado</th><th>Prórroga</th><th>Observaciones</th></tr></thead><tbody>${filas}</tbody></table>
</section>`;
        })
        .join("");

      return `<div class="categoria" style="--color:${categoria.color}">
<h2>${escaparHtml(categoria.etiqueta)}</h2>
<p class="meta">${categoria.expedientes} expediente(s) · ${categoria.completos} completo(s) · avance promedio ${categoria.avancePromedio} %</p>
${personas}</div>`;
    })
    .join("");

  ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Informe documental · ${escaparHtml(informe.etiquetaMes)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font: 11px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 0; }
  h1 { font-size: 20px; color: #004a8f; margin: 0 0 2px; }
  h2 { font-size: 15px; margin: 0 0 2px; color: var(--color, #005baa); }
  h3 { font-size: 12.5px; margin: 0 0 2px; }
  h3 small { font-weight: 400; color: #6b7280; }
  .meta, .tenue { color: #6b7280; }
  .veredicto { font-weight: 600; margin: 2px 0 6px; }
  .cabecera { border-bottom: 2px solid #004a8f; padding-bottom: 8px; margin-bottom: 12px; }
  .indicadores { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0 4px; }
  .indicador { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 10px; min-width: 96px; }
  .indicador b { display: block; font-size: 17px; color: #004a8f; }
  .indicador span { color: #6b7280; font-size: 10px; }
  /* Una categoría por página: es como se reparte el informe entre responsables. */
  .categoria { border-left: 3px solid var(--color, #005baa); padding-left: 10px; margin: 0 0 14px; break-before: page; }
  .categoria:first-of-type { break-before: auto; }
  .persona { margin: 10px 0 12px; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #d1d5db; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .02em; }
  thead { display: table-header-group; }
  /* En papel el color no se puede dar por hecho: el chip lleva su etiqueta y un
     borde sólido que se distingue también en escala de grises. */
  .chip { display: inline-block; padding: 1px 6px; border-radius: 999px; border: 1px solid #333; font-size: 9.5px; font-weight: 700; white-space: nowrap; }
  .chip.entregado { border-color: #15803d; color: #15803d; }
  .chip.pendiente { border-color: #a16207; color: #a16207; }
  .chip.no_entregado { border-color: #b91c1c; color: #b91c1c; }
  .chip.no_aplica { border-color: #6b7280; color: #6b7280; }
  .pie { margin-top: 14px; padding-top: 6px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 9.5px; }
</style></head><body>
<div class="cabecera">
  <h1>Informe mensual de avance documental</h1>
  <p class="meta">Banco de Desarrollo Productivo S.A.M. · ${escaparHtml(informe.etiquetaMes)} · ingresos entre ${escaparHtml(fechaCorta(informe.desde))} y ${escaparHtml(fechaCorta(informe.hasta))}</p>
  <div class="indicadores">
    <div class="indicador"><b>${informe.expedientes}</b><span>Expedientes</span></div>
    <div class="indicador"><b>${informe.avancePromedio} %</b><span>Avance promedio</span></div>
    <div class="indicador"><b>${informe.completos}</b><span>Completos</span></div>
    <div class="indicador"><b>${informe.incompletos}</b><span>Incompletos</span></div>
    <div class="indicador"><b>${informe.totalObservaciones}</b><span>Observaciones</span></div>
    <div class="indicador"><b>${informe.prorrogasVencidas}</b><span>Prórrogas vencidas</span></div>
  </div>
  ${
    informe.incompletosDeLectura.length
      ? `<p class="tenue">Salvedad: de ${informe.incompletosDeLectura.length} expediente(s) solo se pudo leer la cabecera.</p>`
      : ""
  }
</div>
${secciones || '<p class="tenue">No hay expedientes con fecha de ingreso en este mes.</p>'}
<p class="pie">Generado el ${escaparHtml(new Date(informe.generado).toLocaleString("es-BO"))} desde el módulo de Documentación. Los porcentajes excluyen los requisitos marcados como «no aplica».</p>
</body></html>`);
  ventana.document.close();

  // Se espera a que la ventana pinte antes de imprimir: llamar a `print()` sobre
  // un documento a medio cargar saca una página en blanco.
  ventana.focus();
  window.setTimeout(() => {
    try {
      ventana.print();
    } catch {
      /* si el navegador lo bloquea, la ventana queda abierta y se imprime a mano */
    }
  }, 350);

  return true;
}
