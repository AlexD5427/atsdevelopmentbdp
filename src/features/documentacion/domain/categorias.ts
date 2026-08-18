/**
 * Categorías de funcionario: la estructura del expediente, como dato.
 *
 * ── Qué problema resuelve ──────────────────────────────────────────────
 * El expediente de un funcionario comercial y el de un auditor interno no son el
 * mismo formulario con dos preguntas de más: son dos recorridos distintos que
 * comparten los documentos generales y divergen después. Si esa divergencia se
 * escribe con condicionales dentro de la interfaz, cada categoría nueva obliga a
 * tocar el formulario, la validación, la vista del expediente y el informe, y el
 * día que alguien se olvide de uno de los cuatro sitios aparece un expediente con
 * requisitos de dos categorías mezclados. Eso ya pasó: el catálogo del libro
 * aplicaba la acreditación LGI/FT a Cumplimiento **y** a Auditoría.
 *
 * Aquí la estructura es una declaración. La interfaz la recorre; no la conoce.
 * Añadir una categoría es añadir un objeto a `CATEGORIAS`, y con eso aparece su
 * tarjeta, su color, su icono, su recorrido, su validación y su columna en el
 * informe mensual.
 *
 * ── Exclusividad ───────────────────────────────────────────────────────
 * Un expediente pertenece a UNA categoría. `requisitosDe()` devuelve los
 * generales más los de esa categoría —y, si es Comercial, los del tipo de
 * garantía elegido— y nada más. No hay forma de que un auditor acabe con una
 * pregunta de garantía comercial, porque no hay ninguna rama que las junte.
 *
 * ── Relación con el backend ──────────────────────────────────────────
 * El backend sigue siendo la autoridad: al crear un expediente, `doc2Aplicables_`
 * decide qué requisitos se siembran leyendo la hoja `CatalogoDocumentos`. Esta
 * declaración y esa hoja tienen que decir lo mismo, y por eso el `.gs`
 * `22_Categorias.gs` lleva la MISMA lista y la escribe en el libro
 * (`docActualizarCatalogoV2`). `catalogoCoincide()` compara las dos al vuelo y la
 * consola avisa si el libro se quedó en la versión anterior, en lugar de crear
 * expedientes a los que les faltan requisitos en silencio.
 */

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Categorías ofrecidas en el formulario. `GENERAL` es heredada, ver abajo. */
export type CodigoCategoria = "COMERCIAL" | "AUDITORIA" | "CUMPLIMIENTO" | "EJECUTIVO" | "GENERAL";

export type CodigoGarantia = "NINGUNA" | "COMERCIAL_1" | "COMERCIAL_2" | "COMERCIAL_3";

/** Estado documental de un requisito, en el vocabulario canónico del backend. */
export type EstadoDoc = "ENTREGADO" | "PENDIENTE" | "NO_ENTREGADO" | "NO_APLICA";

export interface RequisitoDef {
  /** Código del catálogo. Es la clave con la que viaja al libro. */
  codigo: string;
  /** Lo que se lee en pantalla. */
  nombre: string;
  /** Matiz que distingue el requisito dentro de su bloque. Puede faltar. */
  detalle?: string;
  /** Texto que acompaña al cuadro de observaciones, tal como lo pide el acta. */
  observacion: string;
  /** ¿Admite «N/A» como cuarto chip? */
  noAplica?: boolean;
  /** ¿Admite prórroga con fecha? */
  prorroga?: boolean;
  /** Sección del catálogo a la que pertenece. Define dónde se agrupa. */
  seccion: "generales" | "garantia" | "cumplimiento";
}

export interface BloqueRequisitos {
  codigo: string;
  etiqueta: string;
  descripcion?: string;
  /** Rasgos del bloque, como los enuncia el acta («Garante con bien inmueble»). */
  caracteristicas?: string[];
  requisitos: RequisitoDef[];
}

export interface GarantiaDef {
  codigo: CodigoGarantia;
  etiqueta: string;
  etiquetaCorta: string;
  descripcion: string;
  caracteristicas: string[];
  requisitos: RequisitoDef[];
}

export interface CategoriaDef {
  codigo: CodigoCategoria;
  etiqueta: string;
  etiquetaCorta: string;
  descripcion: string;
  /** Color propio de la categoría. Se usa para el borde, el icono y el informe. */
  color: string;
  /** Identificador del icono SVG. Ver `IconosCategoria.tsx`. */
  icono: "comercial" | "auditoria" | "cumplimiento" | "ejecutivo" | "general";
  /** ¿Se puede registrar un expediente con esta categoría? */
  activa: boolean;
  /** Motivo cuando no se puede. Se muestra en la tarjeta. */
  nota?: string;
  /** ¿Se ofrece en el formulario de alta? `GENERAL` no. */
  ofrecida: boolean;
  /** Punto de inflexión propio: si existe, hay que elegir uno antes de seguir. */
  garantias?: GarantiaDef[];
  /** Bloques propios de la categoría, además de los generales. */
  bloques: BloqueRequisitos[];
}

/* ------------------------------------------------------------------ */
/* Documentos generales                                                */
/* ------------------------------------------------------------------ */

/**
 * Los dieciocho generales, en el orden del acta.
 *
 * El orden NO es alfabético ni por importancia: es el orden en que el área los
 * pide y los revisa. Cambiarlo obligaría a leer la pantalla de otra forma que la
 * carpeta física, que es la peor clase de friccion posible.
 */
export const GENERALES: RequisitoDef[] = [
  {
    codigo: "foto-4x4",
    nombre: "Fotografía en formato digital 4x4",
    detalle: "Fondo blanco y vestimenta formal",
    observacion: "Observaciones (fotografía en formato digital)",
    seccion: "generales",
  },
  {
    codigo: "antecedentes-felcc",
    nombre: "Certificado de antecedentes policiales expedido por la FELCC",
    observacion: "Observaciones (Certificado de antecedentes policiales expedido por la FELCC)",
    seccion: "generales",
  },
  {
    codigo: "rejap",
    nombre: "Registro Judicial de Antecedentes Penales REJAP",
    observacion: "Observaciones (Registro Judicial de Antecedentes Penales REJAP)",
    seccion: "generales",
  },
  {
    codigo: "ci-copia",
    nombre: "Fotocopia simple o escaneado de Carnet de Identidad",
    observacion: "Observaciones (Fotocopia simple/escaneado de Carnet de Identidad)",
    seccion: "generales",
  },
  {
    codigo: "factura-servicios",
    nombre: "Fotocopia o escaneado de factura de servicios básicos",
    observacion: "Observaciones (Fotocopia/escaneado de factura de servicios básicos)",
    seccion: "generales",
  },
  {
    codigo: "croquis-domicilio",
    nombre: "Croquis domiciliario",
    observacion: "Observaciones (Croquis domiciliario)",
    seccion: "generales",
  },
  {
    codigo: "cv",
    nombre: "Curriculum Vitae actualizado",
    observacion: "Observaciones (Curriculum Vitae actualizado)",
    seccion: "generales",
  },
  {
    codigo: "cv-respaldo",
    nombre: "Documentos de respaldo del Curriculum Vitae actualizado",
    detalle: "Títulos de formación académica",
    observacion: "Observaciones (Títulos de formación académica)",
    seccion: "generales",
  },
  {
    codigo: "cert-trabajo",
    nombre: "Certificados de trabajo",
    observacion: "Observaciones (Certificados de trabajo)",
    prorroga: true,
    seccion: "generales",
  },
  {
    codigo: "titulo-legalizado",
    nombre: "Fotocopia legalizada del Título académico",
    observacion: "Observaciones (Fotocopia legalizada del Título académico)",
    noAplica: true,
    prorroga: true,
    seccion: "generales",
  },
  {
    codigo: "cuenta-bancaria",
    nombre: "Número de Cuenta Bancaria",
    observacion: "Observaciones (N° de Cuenta Bancaria)",
    seccion: "generales",
  },
  {
    codigo: "extracto-gestora",
    nombre: "Fotocopia de Extracto de la Gestora Pública",
    observacion: "Observaciones (Fotocopia de Extracto de la Gestora Pública)",
    seccion: "generales",
  },
  {
    codigo: "djj-no-vinculacion",
    nombre: "Declaración Jurada de No vinculación por parentesco ni favorecimiento crediticio",
    observacion: "Observaciones (Declaración Jurada de No vinculación por parentesco ni favorecimiento Crediticio)",
    seccion: "generales",
  },
  {
    codigo: "djj-bienes-rentas",
    nombre: "Fotocopia de la Declaración Jurada de Bienes y Rentas",
    detalle: "Recepcionada por la Contraloría General del Estado",
    observacion: "Observaciones (Fotocopia de la Declaración Jurada de Bienes y Rentas)",
    seccion: "generales",
  },
  {
    codigo: "seguro-accidentes",
    nombre: "Seguro de Accidentes Personales",
    observacion: "Observaciones (Seguro de Accidentes Personales)",
    seccion: "generales",
  },
  {
    codigo: "seguro-vida",
    nombre: "Seguro de Vida Individual",
    observacion: "Observaciones (Seguro de Vida Individual)",
    seccion: "generales",
  },
  {
    codigo: "rc-iva",
    nombre: "Fotocopia del Certificado de saldo a favor del dependiente RC-IVA",
    observacion: "Observaciones (Fotocopia del Certificado de saldo a favor del dependiente RC-IVA)",
    noAplica: true,
    seccion: "generales",
  },
  {
    codigo: "carnet-heredero",
    nombre: "Fotocopia de carnet de heredero de contrato",
    observacion: "Observaciones (Fotocopia de carnet de heredero de contrato)",
    seccion: "generales",
  },
];

/* ------------------------------------------------------------------ */
/* Garantías comerciales                                              */
/* ------------------------------------------------------------------ */

const GARANTIA_FAMILIAR = "Garante familiar (hasta 4to grado de consanguinidad)";

export const GARANTIAS: GarantiaDef[] = [
  {
    codigo: "COMERCIAL_1",
    etiqueta: "Garantías Tipo 1",
    etiquetaCorta: "Tipo 1",
    descripcion: "Garante con bien inmueble más garante familiar.",
    caracteristicas: ["Garante con bien inmueble", GARANTIA_FAMILIAR],
    requisitos: [
      {
        codigo: "garante-ci",
        nombre: "Fotocopia de CI del garante",
        observacion: "Observaciones (Fotocopia de CI del garante)",
        seccion: "garantia",
      },
      {
        codigo: "garante-inmueble",
        nombre: "Bien inmueble con o sin hipoteca",
        detalle: "Garante con bien inmueble",
        observacion: "Observaciones (Bien inmueble con o sin hipoteca)",
        seccion: "garantia",
      },
      {
        codigo: "garante-folio",
        nombre: "Fotocopia de folio o Información rápida",
        detalle: "Antigüedad no menor a un mes",
        observacion: "Observaciones (Fotocopia de folio/Información rápida con antigüedad no menor a un mes)",
        seccion: "garantia",
      },
      {
        codigo: "garante-fam-ci",
        nombre: "Fotocopia de CI del garante familiar",
        detalle: GARANTIA_FAMILIAR,
        observacion: "Observaciones (Fotocopia de CI)",
        seccion: "garantia",
      },
      {
        codigo: "garante-fam-croquis",
        nombre: "Croquis de domicilio del garante familiar",
        detalle: GARANTIA_FAMILIAR,
        observacion: "Observaciones (Croquis domicilio)",
        seccion: "garantia",
      },
    ],
  },
  {
    codigo: "COMERCIAL_2",
    etiqueta: "Garantías Tipo 2",
    etiquetaCorta: "Tipo 2",
    descripcion: "Garante que demuestre ingresos más dos garantes familiares.",
    caracteristicas: ["Garante que demuestre ingresos", GARANTIA_FAMILIAR],
    requisitos: [
      {
        codigo: "garante-ci",
        nombre: "Fotocopia de CI",
        detalle: "Garante que demuestre ingresos",
        observacion: "Observaciones (Fotocopia de CI)",
        seccion: "garantia",
      },
      {
        codigo: "garante-croquis-domicilio",
        nombre: "Croquis de domicilio del garante",
        observacion: "Observaciones (Croquis domicilio)",
        seccion: "garantia",
      },
      {
        codigo: "garante-croquis-negocio",
        nombre: "Croquis del negocio o fuente laboral",
        observacion: "Observaciones (Croquis del negocio / fuente laboral)",
        seccion: "garantia",
      },
      {
        codigo: "garante-boletas",
        nombre: "Tres últimas boletas de pago",
        detalle: "Garante dependiente",
        observacion: "Observaciones (3 últimas boletas de pago (Dependiente))",
        seccion: "garantia",
      },
      {
        codigo: "garante-form-200-400",
        nombre: "Formulario 200 - 400 de las tres últimas declaraciones juradas",
        detalle: "Garante independiente",
        observacion: "Observaciones (Formulario 200 - 400 de las tres últimas declaraciones juradas (Independiente))",
        noAplica: true,
        seccion: "garantia",
      },
      {
        codigo: "garante-fam1-ci",
        nombre: "Fotocopia de CI - Garante familiar 1",
        detalle: GARANTIA_FAMILIAR,
        observacion: "Observaciones (Fotocopia de CI - Garante familiar 1)",
        seccion: "garantia",
      },
      {
        codigo: "garante-fam1-croquis",
        nombre: "Croquis domicilio - Garante familiar 1",
        detalle: GARANTIA_FAMILIAR,
        observacion: "Observaciones (Croquis domicilio - Garante familiar 1)",
        seccion: "garantia",
      },
      {
        codigo: "garante-fam2-ci",
        nombre: "Fotocopia de CI - Garante familiar 2",
        detalle: GARANTIA_FAMILIAR,
        observacion: "Observaciones (Fotocopia de CI - Garante familiar 2)",
        seccion: "garantia",
      },
      {
        codigo: "garante-fam2-croquis",
        nombre: "Croquis domicilio - Garante familiar 2",
        detalle: GARANTIA_FAMILIAR,
        observacion: "Observaciones (Croquis domicilio - Garante familiar 2)",
        seccion: "garantia",
      },
    ],
  },
  {
    codigo: "COMERCIAL_3",
    etiqueta: "Garantías Tipo 3",
    etiquetaCorta: "Tipo 3",
    descripcion: "Postulante con inmueble propio más garante familiar.",
    caracteristicas: ["Postulante con inmueble propio", GARANTIA_FAMILIAR],
    requisitos: [
      {
        codigo: "garante-inmueble",
        nombre: "Bien inmueble con o sin hipoteca",
        detalle: "Inmueble propio del postulante",
        observacion: "Observaciones (Bien inmueble con o sin hipoteca)",
        seccion: "garantia",
      },
      {
        codigo: "garante-folio",
        nombre: "Fotocopia de folio o información rápida",
        detalle: "Antigüedad no menor a un mes",
        observacion: "Observaciones (Fotocopia de folio/información rápida con antigüedad no menor a un mes)",
        seccion: "garantia",
      },
      {
        codigo: "titular-ci",
        nombre: "Fotocopia de CI del titular del inmueble",
        observacion: "Observaciones (Fotocopia de CI)",
        seccion: "garantia",
      },
      {
        codigo: "garante-fam-ci",
        nombre: "Fotocopia de CI - Garante familiar",
        detalle: GARANTIA_FAMILIAR,
        observacion: "Observaciones (Fotocopia de CI - Garante familiar)",
        seccion: "garantia",
      },
      {
        codigo: "garante-fam-croquis",
        nombre: "Croquis domicilio - Garante familiar",
        detalle: GARANTIA_FAMILIAR,
        observacion: "Observaciones (Croquis domicilio - Garante familiar)",
        seccion: "garantia",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Categorías                                                          */
/* ------------------------------------------------------------------ */

export const CATEGORIAS: CategoriaDef[] = [
  {
    codigo: "COMERCIAL",
    etiqueta: "Funcionario área comercial",
    etiquetaCorta: "Comercial",
    descripcion: "Añade la garantía comercial según el tipo que corresponda.",
    color: "#00b0d8",
    icono: "comercial",
    activa: true,
    ofrecida: true,
    garantias: GARANTIAS,
    bloques: [],
  },
  {
    codigo: "AUDITORIA",
    etiqueta: "Funcionario área auditoría",
    etiquetaCorta: "Auditoría",
    descripcion: "Añade la declaración de impedimento para ser auditor interno.",
    color: "#7c5cff",
    icono: "auditoria",
    activa: true,
    ofrecida: true,
    bloques: [
      {
        codigo: "auditoria",
        etiqueta: "Funcionario área auditoría",
        descripcion: "Un solo requisito propio de la rama.",
        requisitos: [
          {
            codigo: "impedimento-auditor",
            nombre: "Declaración de impedimento para ser Auditor Interno",
            observacion: "Observaciones (Declaracion de impedimento para ser Auditor Interno)",
            seccion: "cumplimiento",
          },
        ],
      },
    ],
  },
  {
    codigo: "CUMPLIMIENTO",
    etiqueta: "Funcionario área cumplimiento",
    etiquetaCorta: "Cumplimiento",
    descripcion: "Añade la acreditación LGI/FT y el examen de la UIF.",
    color: "#12b886",
    icono: "cumplimiento",
    activa: true,
    ofrecida: true,
    bloques: [
      {
        codigo: "cumplimiento",
        etiqueta: "Funcionario área cumplimiento",
        descripcion: "Acreditación y examen exigidos por la UIF.",
        requisitos: [
          {
            codigo: "lgi-ft",
            nombre: "Conocimientos acreditados en temas de prevención, detección, control y reporte de LGI/FT",
            observacion: "Observaciones (Conocimientos acreditados en temas de previsión, detección, control y reporte de LGI/FT)",
            seccion: "cumplimiento",
          },
          {
            codigo: "examen-uif",
            nombre: "Presentar el examen presencial de la UIF",
            observacion: "Observaciones (Presentar el examen presencial de la UIF)",
            prorroga: true,
            seccion: "cumplimiento",
          },
        ],
      },
    ],
  },
  {
    codigo: "EJECUTIVO",
    etiqueta: "Funcionario ejecutivo o directorio",
    etiquetaCorta: "Ejecutivo o Directorio",
    descripcion: "La lista de requisitos todavía está en definición por el área.",
    color: "#f59f0a",
    icono: "ejecutivo",
    activa: false,
    nota: "En construcción",
    ofrecida: true,
    bloques: [],
  },
  /**
   * Categoría heredada.
   *
   * No se ofrece en el formulario, pero NO se borra: los expedientes que la
   * migración creó a partir del libro anual la tienen, y quitarla del vocabulario
   * dejaría esas filas apuntando a una categoría que no existe —con lo que la
   * vista del expediente se quedaría sin etiqueta, sin color y sin icono.
   */
  {
    codigo: "GENERAL",
    etiqueta: "Funcionario general",
    etiquetaCorta: "General",
    descripcion: "Solo requisitos generales. Categoría heredada de la versión anterior del módulo.",
    color: "#8b93a7",
    icono: "general",
    activa: true,
    ofrecida: false,
    bloques: [],
  },
];

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

/** Categorías que se muestran en el formulario de alta, en su orden. */
export function categoriasOfrecidas(): CategoriaDef[] {
  return CATEGORIAS.filter((c) => c.ofrecida);
}

export function categoria(codigo: string | null | undefined): CategoriaDef | null {
  if (!codigo) return null;
  const clave = String(codigo).trim().toUpperCase();
  // `DIRECTORIO` existe en el vocabulario del backend como rama aparte; en el
  // formulario las dos son la misma tarjeta, así que se resuelve al mismo sitio.
  const normalizada = clave === "DIRECTORIO" ? "EJECUTIVO" : clave;
  return CATEGORIAS.find((c) => c.codigo === normalizada) ?? null;
}

export function garantia(codigo: string | null | undefined): GarantiaDef | null {
  if (!codigo) return null;
  const clave = String(codigo).trim().toUpperCase().replace(/[ -]/g, "_");
  return GARANTIAS.find((g) => g.codigo === clave) ?? null;
}

/** ¿Esta categoría obliga a elegir un tipo de garantía antes de continuar? */
export function exigeGarantia(codigo: string | null | undefined): boolean {
  const def = categoria(codigo);
  return !!def?.garantias?.length;
}

/**
 * Requisitos de un expediente: generales + los de su categoría. Nada más.
 *
 * Se devuelve una lista plana y en orden de presentación para que el formulario,
 * la validación, la vista y el informe recorran exactamente lo mismo. Un código
 * repetido —`garante-folio` está en el Tipo 1 y en el Tipo 3— no puede aparecer
 * dos veces en el mismo expediente, y por eso se deduplica al final.
 */
export function requisitosDe(codigoCategoria: string | null | undefined, codigoGarantia?: string | null): RequisitoDef[] {
  const def = categoria(codigoCategoria);
  const salida: RequisitoDef[] = [...GENERALES];

  if (def) {
    for (const bloque of def.bloques) salida.push(...bloque.requisitos);
    if (def.garantias?.length) {
      const elegida = garantia(codigoGarantia);
      if (elegida) salida.push(...elegida.requisitos);
    }
  }

  const vistos = new Set<string>();
  return salida.filter((requisito) => {
    if (vistos.has(requisito.codigo)) return false;
    vistos.add(requisito.codigo);
    return true;
  });
}

/**
 * Bloques del recorrido, en el orden en que se llenan.
 *
 * Es lo que el formulario pinta como secciones y lo que el índice lateral usa
 * para navegar. Los generales van siempre primero porque son los que ya están en
 * la carpeta cuando la persona se sienta a registrar.
 */
export function bloquesDe(codigoCategoria: string | null | undefined, codigoGarantia?: string | null): BloqueRequisitos[] {
  const def = categoria(codigoCategoria);
  const bloques: BloqueRequisitos[] = [
    { codigo: "generales", etiqueta: "Documentos generales", requisitos: GENERALES },
  ];
  if (!def) return bloques;

  bloques.push(...def.bloques);

  if (def.garantias?.length) {
    const elegida = garantia(codigoGarantia);
    if (elegida) {
      bloques.push({
        codigo: `garantia-${elegida.codigo}`,
        etiqueta: elegida.etiqueta,
        descripcion: elegida.descripcion,
        caracteristicas: elegida.caracteristicas,
        requisitos: elegida.requisitos,
      });
    }
  }
  return bloques;
}

/** Todos los códigos que esta declaración conoce. Lo usa `catalogoCoincide`. */
export function codigosDeclarados(): string[] {
  const codigos = new Set<string>();
  for (const requisito of GENERALES) codigos.add(requisito.codigo);
  for (const def of CATEGORIAS) {
    for (const bloque of def.bloques) for (const r of bloque.requisitos) codigos.add(r.codigo);
    for (const g of def.garantias ?? []) for (const r of g.requisitos) codigos.add(r.codigo);
  }
  return [...codigos].sort();
}

/**
 * ¿El catálogo del libro conoce todo lo que esta declaración exige?
 *
 * El backend siembra los requisitos de un expediente nuevo leyendo su hoja
 * `CatalogoDocumentos`. Si el libro se quedó en la versión anterior, el formulario
 * preguntaría por documentos que el expediente no va a tener, y la persona
 * rellenaría campos que se pierden. Comprobarlo cuesta una comparación de
 * conjuntos sobre datos que ya están en memoria; no comprobarlo cuesta perder
 * trabajo sin enterarse.
 */
export function catalogoCoincide(codigosDelLibro: string[]): { ok: boolean; faltan: string[] } {
  const enLibro = new Set(codigosDelLibro.map((c) => String(c)));
  const faltan = codigosDeclarados().filter((codigo) => !enLibro.has(codigo));
  return { ok: faltan.length === 0, faltan };
}

/* ------------------------------------------------------------------ */
/* Identificador                                                       */
/* ------------------------------------------------------------------ */

export interface IdentificadorPartes {
  ci: string;
  proceso: string;
  anio: string;
}

/**
 * Parte un identificador `CI - Nro Proceso - Año`.
 *
 * Se lee DESDE LA DERECHA a propósito. Un carnet de identidad boliviano puede
 * llevar guión (`1234567-1L`, `4567890-2K`), así que partir por el primer
 * separador troceaba el propio carnet y dejaba el número de proceso donde iba el
 * año. Tomando el año y el número desde el final, todo lo que queda delante es el
 * carnet, tenga guiones o no.
 */
export function partirIdentificador(valor: string): IdentificadorPartes | null {
  const piezas = String(valor || "")
    .split("-")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (piezas.length < 3) return null;

  const anio = piezas[piezas.length - 1];
  const proceso = piezas[piezas.length - 2];
  const ci = piezas.slice(0, piezas.length - 2).join("-");
  if (!ci || !proceso || !/^\d{4}$/.test(anio)) return null;
  return { ci, proceso, anio };
}

/** Forma canónica con separadores homogéneos: `1234567 - 45 - 2026`. */
export function normalizarIdentificador(valor: string): string {
  const partes = partirIdentificador(valor);
  if (!partes) return String(valor || "").trim();
  return `${partes.ci} - ${partes.proceso} - ${partes.anio}`;
}

/**
 * Qué le falta al identificador, en lenguaje llano. Vacío si está bien.
 *
 * No se rechaza un carnet «raro»: hay cédulas con letras de extranjería y con
 * complemento, y un formulario que las rechaza es un formulario que no se puede
 * usar. Se exige la estructura de tres partes y un año de cuatro cifras, que es
 * lo único de lo que el sistema depende para archivar.
 */
export function problemaDeIdentificador(valor: string): string {
  const texto = String(valor || "").trim();
  if (!texto) return "Falta el identificador.";
  const partes = partirIdentificador(texto);
  if (!partes) return "El formato es CI - Número de proceso - Año. Por ejemplo: 1234567 - 45 - 2026.";
  const anio = Number(partes.anio);
  const actual = new Date().getFullYear();
  if (anio < 2000 || anio > actual + 1) return `El año ${partes.anio} está fuera de rango.`;
  if (!/^\d+$/.test(partes.proceso)) return "El número de proceso tiene que ser un número.";
  return "";
}

/* ------------------------------------------------------------------ */
/* Estados                                                             */
/* ------------------------------------------------------------------ */

/**
 * Los tres chips, en el orden que pide el acta: entregado, pendiente, no
 * entregado. El cuarto (`N/A`) solo aparece donde el requisito lo admite.
 */
export const ORDEN_CHIPS: EstadoDoc[] = ["ENTREGADO", "PENDIENTE", "NO_ENTREGADO"];

export const ETIQUETA_CHIP: Record<EstadoDoc, string> = {
  ENTREGADO: "Entregado",
  PENDIENTE: "Pendiente",
  NO_ENTREGADO: "No entregado",
  NO_APLICA: "N/A",
};

/**
 * Color semántico de cada estado.
 *
 * Verde, amarillo y rojo son los del acta y los del libro; se toman de los tokens
 * del módulo para que sigan funcionando en tema claro, en alto contraste y en
 * papel. El color NUNCA va solo: el chip lleva siempre su etiqueta.
 */
export const TOKEN_CHIP: Record<EstadoDoc, { fondo: string; texto: string; borde: string }> = {
  ENTREGADO: { fondo: "var(--doc-success-bg)", texto: "var(--doc-success-fg)", borde: "var(--doc-success)" },
  PENDIENTE: { fondo: "var(--doc-warning-bg)", texto: "var(--doc-warning-fg)", borde: "var(--doc-warning)" },
  NO_ENTREGADO: { fondo: "var(--doc-danger-bg)", texto: "var(--doc-danger-fg)", borde: "var(--doc-danger)" },
  NO_APLICA: { fondo: "var(--doc-surface-2)", texto: "var(--doc-text-muted)", borde: "var(--doc-border)" },
};

/** Estados que un requisito admite, según su definición. */
export function estadosDe(requisito: RequisitoDef): EstadoDoc[] {
  return requisito.noAplica ? [...ORDEN_CHIPS, "NO_APLICA"] : [...ORDEN_CHIPS];
}
