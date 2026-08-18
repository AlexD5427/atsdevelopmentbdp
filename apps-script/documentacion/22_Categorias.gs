/**
 * 22_Categorias.gs — categorías de funcionario y catálogo v2.
 *
 * ── Por qué un archivo nuevo y ninguno tocado ───────────────────────────
 * El enrutador (`08_Router.gs`), el registro de acciones (`21_Api.gs`) y las 76
 * acciones `documentacion.*` se quedan exactamente como están. Añadir acciones
 * nuevas al registro habría significado editar esos dos archivos sin poder
 * ejecutar el arnés de Node ni el libro, para conseguir algo que el frontend ya
 * puede hacer con las acciones que existen. Sobre un backend que ahora mismo es lo
 * único que funciona, eso no vale el riesgo.
 *
 * Como Apps Script concatena los archivos por orden de prefijo, este se carga
 * DESPUÉS de todos los demás y puede usar sus constantes y sus ayudas sin
 * declararlas otra vez. Ninguna función de aquí repite un nombre existente: dos
 * funciones con el mismo nombre en archivos distintos se pisan en silencio, y
 * `npm run doc:check` lo detecta desde el repositorio.
 *
 * ── Qué corrige de verdad ────────────────────────────────────────────
 * El catálogo sembrado por `11_Domain.gs` no coincidía con las listas del acta en
 * tres puntos que importan:
 *
 *   1. **el Tipo 1 y el Tipo 3 no pedían garante familiar.** El acta lo exige en
 *      los dos, con cédula y croquis, y en el libro no existían esos requisitos;
 *   2. **el Tipo 2 no pedía el croquis de domicilio del garante**, solo el del
 *      negocio;
 *   3. **`lgi-ft` se aplicaba a Cumplimiento Y a Auditoría.** Es la mezcla que había
 *      que cortar: un auditor interno veía en su expediente una pregunta que no le
 *      corresponde. Auditoría pide una sola cosa —la declaración de impedimento— y
 *      Cumplimiento las dos suyas.
 *
 * ── Cómo se aplica ──────────────────────────────────────────────────
 * Ejecutando `docActualizarCatalogoV2()` UNA VEZ desde el editor de Apps Script.
 * Es idempotente: volver a ejecutarla no duplica ni degrada nada. El paso está en
 * `docs/modules/DOCUMENTACION_CATEGORIAS.md` y el frontend avisa solo si el libro
 * se quedó en la versión anterior, en lugar de crear expedientes incompletos en
 * silencio.
 */

/** Versión del catálogo que escribe este archivo. Se sella en cada requisito. */
var DOC2_CATALOGO_VERSION_V2 = 2;

/**
 * Metadatos de las categorías.
 *
 * Espejo de `src/features/documentacion/domain/categorias.ts`. El color y el estado
 * viven en los dos lados porque los dos los necesitan sin preguntar: el frontend
 * para pintar la tarjeta antes de que llegue el catálogo, y el backend para poder
 * responder qué ramas existen aunque el libro esté vacío.
 *
 * `GENERAL` sigue en la lista y no se ofrece: los expedientes que la migración
 * creó desde el libro anual la tienen, y quitarla dejaría esas filas apuntando a
 * una categoría inexistente.
 */
var DOC2_CATEGORIAS = [
  {
    codigo: 'COMERCIAL',
    etiqueta: 'Funcionario area comercial',
    color: '#00b0d8',
    activa: true,
    ofrecida: true,
    garantias: ['COMERCIAL_1', 'COMERCIAL_2', 'COMERCIAL_3'],
    nota: ''
  },
  {
    codigo: 'AUDITORIA',
    etiqueta: 'Funcionario area auditoria',
    color: '#7c5cff',
    activa: true,
    ofrecida: true,
    garantias: [],
    nota: ''
  },
  {
    codigo: 'CUMPLIMIENTO',
    etiqueta: 'Funcionario area cumplimiento',
    color: '#12b886',
    activa: true,
    ofrecida: true,
    garantias: [],
    nota: ''
  },
  {
    codigo: 'EJECUTIVO',
    etiqueta: 'Funcionario ejecutivo o directorio',
    color: '#f59f0a',
    activa: false,
    ofrecida: true,
    garantias: [],
    nota: 'En construccion: la lista de requisitos esta en definicion.'
  },
  {
    codigo: 'GENERAL',
    etiqueta: 'Funcionario general',
    color: '#8b93a7',
    activa: true,
    ofrecida: false,
    garantias: [],
    nota: 'Categoria heredada de la version anterior del modulo.'
  }
];

/** Metadatos de una categoría. `DIRECTORIO` resuelve a `EJECUTIVO`. */
function doc2CategoriaMeta_(codigo) {
  var clave = String(codigo || '').trim().toUpperCase();
  if (clave === 'DIRECTORIO') clave = 'EJECUTIVO';
  for (var i = 0; i < DOC2_CATEGORIAS.length; i++) {
    if (DOC2_CATEGORIAS[i].codigo === clave) return DOC2_CATEGORIAS[i];
  }
  return null;
}

/* ========================================================================== */
/* Catálogo v2                                                                 */
/* ========================================================================== */

/**
 * Las 35 definiciones, en el orden del acta.
 *
 * `orden` no es decorativo: es lo que hace que el formulario, la vista del
 * expediente, el reporte y la exportación presenten los requisitos en la misma
 * secuencia que la carpeta física. Los códigos compartidos entre tipos de garantía
 * —`garante-folio` está en el Tipo 1 y en el Tipo 3— llevan un solo `orden`, elegido
 * para que las dos ramas queden en el orden correcto; por eso `titular-ci` va en el
 * 235 y no al final.
 *
 * Los códigos que ya existían NO se renombran. Hay expedientes guardados que los
 * referencian, y cambiarlos obligaría a una migración de datos a cambio de nada.
 */
function doc2CatalogoSemillaV2_() {
  var lista = [];
  var ordenGeneral = 0;

  function general(codigo, nombre, observacion, extras) {
    ordenGeneral += 10;
    var fila = {
      codigo: codigo,
      nombre: nombre,
      observacion: observacion,
      seccion: 'generales',
      grupo: 'personal',
      orden: ordenGeneral,
      obligatorio: true,
      funcionario: [],
      garantia: []
    };
    for (var k in (extras || {})) {
      if (Object.prototype.hasOwnProperty.call(extras, k)) fila[k] = extras[k];
    }
    lista.push(fila);
  }

  /* ── 18 documentos generales ──────────────────────────────────── */
  general('foto-4x4', 'Fotografia en formato digital 4x4', 'Observaciones (fotografia en formato digital)',
    { descripcion: 'Fondo blanco y vestimenta formal.' });
  general('antecedentes-felcc', 'Certificado de antecedentes policiales expedido por la FELCC',
    'Observaciones (Certificado de antecedentes policiales expedido por la FELCC)', {});
  general('rejap', 'Registro Judicial de Antecedentes Penales REJAP',
    'Observaciones (Registro Judicial de Antecedentes Penales REJAP)', { columna: 'rejap' });
  general('ci-copia', 'Fotocopia simple o escaneado de Carnet de Identidad',
    'Observaciones (Fotocopia simple/escaneado de Carnet de Identidad)', {});
  general('factura-servicios', 'Fotocopia o escaneado de factura de servicios basicos',
    'Observaciones (Fotocopia/escaneado de factura de servicios basicos)', {});
  general('croquis-domicilio', 'Croquis domiciliario', 'Observaciones (Croquis domiciliario)', {});
  general('cv', 'Curriculum Vitae actualizado', 'Observaciones (Curriculum Vitae actualizado)', {});
  general('cv-respaldo', 'Documentos de respaldo del Curriculum Vitae actualizado',
    'Observaciones (Titulos de formacion academica)', { descripcion: 'Titulos de formacion academica.' });
  general('cert-trabajo', 'Certificados de trabajo', 'Observaciones (Certificados de trabajo)',
    { prorroga: true, descripcion: 'Admite prorroga cuando el empleador anterior demora la emision.' });
  general('titulo-legalizado', 'Fotocopia legalizada del Titulo academico',
    'Observaciones (Fotocopia legalizada del Titulo academico)',
    { prorroga: true, noAplica: true, columna: 'titulo_legalizado' });
  general('cuenta-bancaria', 'Numero de Cuenta Bancaria', 'Observaciones (N. de Cuenta Bancaria)', {});
  general('extracto-gestora', 'Fotocopia de Extracto de la Gestora Publica',
    'Observaciones (Fotocopia de Extracto de la Gestora Publica)', {});
  general('djj-no-vinculacion',
    'Declaracion Jurada de No vinculacion por parentesco ni favorecimiento crediticio',
    'Observaciones (Declaracion Jurada de No vinculacion por parentesco ni favorecimiento Crediticio)',
    { columna: 'djj_no_codificacion' });
  general('djj-bienes-rentas', 'Fotocopia de la Declaracion Jurada de Bienes y Rentas',
    'Observaciones (Fotocopia de la Declaracion Jurada de Bienes y Rentas)',
    { descripcion: 'Recepcionada por la Contraloria General del Estado.' });
  general('seguro-accidentes', 'Seguro de Accidentes Personales', 'Observaciones (Seguro de Accidentes Personales)',
    { columna: 'seguros_alianza' });
  general('seguro-vida', 'Seguro de Vida Individual', 'Observaciones (Seguro de Vida Individual)',
    { columna: 'crediseguro' });
  general('rc-iva', 'Fotocopia del Certificado de saldo a favor del dependiente RC-IVA',
    'Observaciones (Fotocopia del Certificado de saldo a favor del dependiente RC-IVA)',
    { obligatorio: false, noAplica: true });
  general('carnet-heredero', 'Fotocopia de carnet de heredero de contrato',
    'Observaciones (Fotocopia de carnet de heredero de contrato)', {});

  /* ── Garantía comercial ─────────────────────────────────────── */
  var familiar = 'Garante familiar hasta 4to grado de consanguinidad.';

  function garantia(codigo, nombre, observacion, orden, garantias, extras) {
    var fila = {
      codigo: codigo,
      nombre: nombre,
      observacion: observacion,
      seccion: 'garantia',
      grupo: 'garantia',
      orden: orden,
      obligatorio: true,
      funcionario: ['COMERCIAL'],
      garantia: garantias
    };
    for (var k in (extras || {})) {
      if (Object.prototype.hasOwnProperty.call(extras, k)) fila[k] = extras[k];
    }
    lista.push(fila);
  }

  garantia('garante-ci', 'Fotocopia de CI del garante', 'Observaciones (Fotocopia de CI del garante)',
    210, ['COMERCIAL_1', 'COMERCIAL_2'], { columna: 'contrato_fianza' });
  garantia('garante-inmueble', 'Bien inmueble con o sin hipoteca', 'Observaciones (Bien inmueble con o sin hipoteca)',
    220, ['COMERCIAL_1', 'COMERCIAL_3'], { columna: 'contrato_fianza' });
  garantia('garante-folio', 'Fotocopia de folio o Informacion rapida',
    'Observaciones (Fotocopia de folio/Informacion rapida con antiguedad no menor a un mes)',
    230, ['COMERCIAL_1', 'COMERCIAL_3'],
    { descripcion: 'Antiguedad no menor a un mes.', columna: 'vista_informacion_rapida' });
  // 235: en el Tipo 3 este requisito va tercero, justo despues del folio. Es el
  // motivo de que su orden no siga la secuencia de diez en diez.
  garantia('titular-ci', 'Fotocopia de CI del titular del inmueble', 'Observaciones (Fotocopia de CI)',
    235, ['COMERCIAL_3'], { descripcion: 'Postulante con inmueble propio.' });
  garantia('garante-fam-ci', 'Fotocopia de CI del garante familiar', 'Observaciones (Fotocopia de CI)',
    240, ['COMERCIAL_1', 'COMERCIAL_3'], { descripcion: familiar });
  garantia('garante-fam-croquis', 'Croquis de domicilio del garante familiar', 'Observaciones (Croquis domicilio)',
    250, ['COMERCIAL_1', 'COMERCIAL_3'], { descripcion: familiar });
  garantia('garante-croquis-domicilio', 'Croquis de domicilio del garante', 'Observaciones (Croquis domicilio)',
    260, ['COMERCIAL_2'], {});
  garantia('garante-croquis-negocio', 'Croquis del negocio o fuente laboral',
    'Observaciones (Croquis del negocio / fuente laboral)', 270, ['COMERCIAL_2'], {});
  garantia('garante-boletas', 'Tres ultimas boletas de pago',
    'Observaciones (3 ultimas boletas de pago (Dependiente))', 280, ['COMERCIAL_2'],
    { descripcion: 'Garante dependiente.', columna: 'vista_informacion_rapida' });
  garantia('garante-form-200-400', 'Formulario 200 - 400 de las tres ultimas declaraciones juradas',
    'Observaciones (Formulario 200 - 400 de las tres ultimas declaraciones juradas (Independiente))',
    290, ['COMERCIAL_2'],
    { descripcion: 'Garante independiente.', obligatorio: false, noAplica: true, columna: 'vista_informacion_rapida' });
  garantia('garante-fam1-ci', 'Fotocopia de CI - Garante familiar 1',
    'Observaciones (Fotocopia de CI - Garante familiar 1)', 300, ['COMERCIAL_2'], { descripcion: familiar });
  garantia('garante-fam1-croquis', 'Croquis domicilio - Garante familiar 1',
    'Observaciones (Croquis domicilio - Garante familiar 1)', 310, ['COMERCIAL_2'], { descripcion: familiar });
  garantia('garante-fam2-ci', 'Fotocopia de CI - Garante familiar 2',
    'Observaciones (Fotocopia de CI - Garante familiar 2)', 320, ['COMERCIAL_2'], { descripcion: familiar });
  garantia('garante-fam2-croquis', 'Croquis domicilio - Garante familiar 2',
    'Observaciones (Croquis domicilio - Garante familiar 2)', 330, ['COMERCIAL_2'], { descripcion: familiar });

  /* ── Cumplimiento y auditoría ─────────────────────────────────── */
  lista.push({
    codigo: 'impedimento-auditor',
    nombre: 'Declaracion de impedimento para ser Auditor Interno',
    observacion: 'Observaciones (Declaracion de impedimento para ser Auditor Interno)',
    seccion: 'cumplimiento',
    grupo: 'cumplimiento',
    orden: 400,
    obligatorio: true,
    funcionario: ['AUDITORIA'],
    garantia: [],
    revision: true
  });
  // Antes tambien se aplicaba a AUDITORIA. Ese era el requisito que mezclaba las
  // dos ramas y hacia que un auditor viera una pregunta de cumplimiento.
  lista.push({
    codigo: 'lgi-ft',
    nombre: 'Conocimientos acreditados en prevencion, deteccion, control y reporte de LGI/FT',
    observacion: 'Observaciones (Conocimientos acreditados en temas de prevision, deteccion, control y reporte de LGI/FT)',
    seccion: 'cumplimiento',
    grupo: 'cumplimiento',
    orden: 410,
    obligatorio: true,
    funcionario: ['CUMPLIMIENTO'],
    garantia: [],
    revision: true,
    columna: 'conozca_funcionario'
  });
  lista.push({
    codigo: 'examen-uif',
    nombre: 'Presentar el examen presencial de la UIF',
    observacion: 'Observaciones (Presentar el examen presencial de la UIF)',
    seccion: 'cumplimiento',
    grupo: 'cumplimiento',
    orden: 420,
    obligatorio: true,
    funcionario: ['CUMPLIMIENTO'],
    garantia: [],
    revision: true,
    aprobacion: true,
    prorroga: true
  });

  return lista;
}

/** Una definición de la semilla, como fila de `CatalogoDocumentos`. */
function doc2FilaCatalogoV2_(def) {
  var estados = [
    DOC2_ESTADO_DOCUMENTO.PENDIENTE,
    DOC2_ESTADO_DOCUMENTO.ENTREGADO,
    DOC2_ESTADO_DOCUMENTO.NO_ENTREGADO
  ];
  var admiteNoAplica = def.noAplica === true || def.obligatorio !== true;
  if (admiteNoAplica) estados.push(DOC2_ESTADO_DOCUMENTO.NO_APLICA);

  return {
    codigo_documento: def.codigo,
    nombre_visible: String(def.nombre || def.codigo).slice(0, 300),
    descripcion: String(def.descripcion || '').slice(0, 2000),
    texto_observacion: String(def.observacion || '').slice(0, 2000),
    seccion: def.seccion,
    grupo: def.grupo,
    orden: def.orden,
    obligatorio: def.obligatorio === true,
    estados_permitidos: estados.join(','),
    permite_no_aplica: admiteNoAplica,
    permite_prorroga: def.prorroga === true,
    tipo_funcionario: (def.funcionario || []).join(','),
    tipo_garantia: (def.garantia || []).join(','),
    nivel_confidencialidad: def.confidencial || 'INTERNO',
    requiere_revision: def.revision === true,
    requiere_aprobacion: def.aprobacion === true,
    activo: true,
    version_catalogo: DOC2_CATALOGO_VERSION_V2,
    fecha_inicio_vigencia: '',
    fecha_fin_vigencia: '',
    columna_libro: def.columna || ''
  };
}

/* ========================================================================== */
/* Hoja Auxiliar                                                               */
/* ========================================================================== */

/**
 * Asegura una columna de catálogo en la hoja `Auxiliar`.
 *
 * Crea la hoja si no existe y añade la cabecera si falta. NO borra, NO reordena y
 * NO toca los valores: la regla de esta hoja es que se añaden valores y nunca se
 * quitan, porque una agencia que ya cerró sigue siendo necesaria para leer los
 * expedientes antiguos.
 */
function doc2AsegurarColumnaAuxiliar_(columna) {
  var ss = docSpreadsheet_();
  var hoja = ss.getSheetByName(DOC2_SHEET.AUXILIAR);
  if (!hoja) hoja = ss.insertSheet(DOC2_SHEET.AUXILIAR);

  var ancho = Math.max(1, hoja.getLastColumn());
  var cabeceras = hoja.getRange(1, 1, 1, ancho).getValues()[0];

  for (var i = 0; i < cabeceras.length; i++) {
    if (String(cabeceras[i] || '').trim() === columna) {
      return {
        columna: columna,
        creada: false,
        indice: i + 1,
        valores: Math.max(0, hoja.getLastRow() - 1)
      };
    }
  }

  // Si la última celda de cabecera está vacía se usa esa; si no, se añade una
  // columna al final. Insertar en medio desplazaría los valores de las demás.
  var destino = String(cabeceras[ancho - 1] || '').trim() === '' ? ancho : ancho + 1;
  var celda = hoja.getRange(1, destino);
  celda.setValue(columna);
  try {
    celda.setFontWeight('bold');
    celda.setBackground('#e8eef7');
    hoja.setColumnWidth(destino, 240);
    hoja.setFrozenRows(1);
  } catch (e) {
    /* el formato es cosmético: si el libro lo rechaza, la columna ya sirve */
  }

  return { columna: columna, creada: true, indice: destino, valores: 0 };
}

/* ========================================================================== */
/* Actualización del catálogo                                                  */
/* ========================================================================== */

/**
 * Lleva el catálogo del libro a la versión 2. EJECUTAR UNA VEZ desde el editor.
 *
 * ── Qué escribe y qué respeta ──────────────────────────────────────
 * Escribe lo ESTRUCTURAL: sección, grupo, orden, aplicabilidad, obligatoriedad,
 * prórroga, estados admitidos, revisión y aprobación. Eso define qué requisitos
 * existen y a quién le tocan, y es lo que estaba mal.
 *
 * Respeta el nombre visible y la descripción si el área los editó: son decisiones
 * humanas y pisarlas sería el peor resultado posible de una actualización. Solo
 * los rellena cuando están vacíos.
 *
 * Idempotente: la segunda ejecución informa de que no había nada que cambiar.
 */
function docActualizarCatalogoV2() {
  var ctx = { actor: 'catalogo-v2', origen: 'editor-apps-script' };
  var informe = {
    version: DOC2_CATALOGO_VERSION_V2,
    auxiliar: [],
    creados: [],
    actualizados: [],
    sinCambio: [],
    avisos: []
  };

  /* 1 · Las columnas de catálogo que el formulario necesita para sus desplegables. */
  for (var c = 0; c < DOC2_AUXILIAR_COLUMNS.length; c++) {
    try {
      informe.auxiliar.push(doc2AsegurarColumnaAuxiliar_(DOC2_AUXILIAR_COLUMNS[c]));
    } catch (e) {
      informe.avisos.push('No se pudo asegurar la columna ' + DOC2_AUXILIAR_COLUMNS[c] + ': ' + e);
    }
  }

  /* 2 · El catálogo. */
  var semilla = doc2CatalogoSemillaV2_();
  var estructurales = [
    'seccion', 'grupo', 'orden', 'tipo_funcionario', 'tipo_garantia', 'estados_permitidos',
    'permite_no_aplica', 'permite_prorroga', 'obligatorio', 'requiere_revision',
    'requiere_aprobacion', 'version_catalogo', 'activo'
  ];

  for (var i = 0; i < semilla.length; i++) {
    var def = semilla[i];
    var fila = doc2FilaCatalogoV2_(def);
    var existente = null;
    try {
      existente = docById_(DOC2_SHEET.CATALOGO, def.codigo);
    } catch (e) {
      existente = null;
    }

    if (!existente) {
      doc2Insert_(DOC2_SHEET.CATALOGO, fila, ctx);
      informe.creados.push(def.codigo);
      continue;
    }

    var patch = {};
    for (var e2 = 0; e2 < estructurales.length; e2++) {
      var campo = estructurales[e2];
      // Comparación como texto a propósito: la hoja devuelve `TRUE`, `"TRUE"` o `1`
      // según cómo se escribió la celda, y comparar tipos daría un cambio falso en
      // cada ejecución.
      if (String(existente[campo]) !== String(fila[campo])) patch[campo] = fila[campo];
    }
    if (!String(existente.texto_observacion || '').trim() && fila.texto_observacion) {
      patch.texto_observacion = fila.texto_observacion;
    }
    if (!String(existente.descripcion || '').trim() && fila.descripcion) {
      patch.descripcion = fila.descripcion;
    }
    if (!String(existente.columna_libro || '').trim() && fila.columna_libro) {
      patch.columna_libro = fila.columna_libro;
    }

    if (Object.keys(patch).length) {
      doc2Update_(DOC2_SHEET.CATALOGO, def.codigo, patch, ctx);
      informe.actualizados.push({ codigo: def.codigo, campos: Object.keys(patch) });
    } else {
      informe.sinCambio.push(def.codigo);
    }
  }

  /* 3 · Cachés y espejo heredado. Sin esto, el frontend seguiría recibiendo el
        catálogo viejo hasta que la caché caduque sola (diez minutos). */
  try {
    doc2CatalogoReset_();
    doc2CacheInvalidar_([DOC2_CACHE.CATALOGO, DOC2_CACHE.PANEL, DOC2_CACHE.AUXILIAR]);
  } catch (e) {
    informe.avisos.push('No se pudo invalidar la cache: ' + e);
  }
  try {
    doc2EspejoCatalogoHeredado_();
  } catch (e) {
    informe.avisos.push('No se pudo actualizar el espejo heredado: ' + e);
  }

  var resumen =
    'Catalogo v2: ' + informe.creados.length + ' creados, ' +
    informe.actualizados.length + ' actualizados, ' +
    informe.sinCambio.length + ' sin cambio.';
  try {
    docInfo_(resumen, informe);
  } catch (e) {
    /* la bitacora interna es un extra, no un requisito */
  }
  Logger.log(resumen);
  Logger.log(JSON.stringify(informe, null, 2));

  return informe;
}

/** Cuántos requisitos le tocan a cada rama, según el catálogo del libro. */
function doc2ResumenAplicabilidadV2_() {
  var salida = [];
  for (var i = 0; i < DOC2_CATEGORIAS.length; i++) {
    var categoria = DOC2_CATEGORIAS[i];
    var garantias = categoria.garantias.length ? categoria.garantias : ['NINGUNA'];
    for (var g = 0; g < garantias.length; g++) {
      var aplicables = [];
      try {
        aplicables = doc2Aplicables_({ tipoFuncionario: categoria.codigo, tipoGarantia: garantias[g] });
      } catch (e) {
        aplicables = [];
      }
      salida.push({
        categoria: categoria.codigo,
        garantia: garantias[g],
        total: aplicables.length,
        codigos: aplicables.map(function (a) { return a.codigo_documento; })
      });
    }
  }
  return salida;
}

/* ========================================================================== */
/* Autoverificación del despliegue                                             */
/* ========================================================================== */

/**
 * Seis comprobaciones sobre el libro real. EJECUTAR tras pegar el código.
 *
 * ── Para qué sirve ─────────────────────────────────────────────────
 * Para saber si el despliegue está sano ANTES de que alguien intente registrar a
 * una persona y descubra que falta media configuración. Cada comprobación apunta a
 * un culpable distinto, y la última llama de verdad a `doPost`, que es la única
 * forma de comprobar que el enrutador contesta el sobre que el frontend espera.
 *
 * Solo LEE. No escribe una fila, no manda un correo y no crea un expediente de
 * prueba.
 */
function docVerificarModuloDocumentacion() {
  var informe = { ok: true, comprobaciones: [] };

  function anotar(titulo, ok, detalle, remedio) {
    informe.comprobaciones.push({ titulo: titulo, ok: !!ok, detalle: String(detalle || ''), remedio: ok ? '' : String(remedio || '') });
    if (!ok) informe.ok = false;
  }

  /* 1 · El libro. */
  var ss = null;
  try {
    ss = docSpreadsheet_();
    anotar('El script apunta a un libro', true, ss.getName() + ' (' + ss.getId() + ')');
  } catch (e) {
    anotar('El script apunta a un libro', false, String(e),
      'Configuracion del proyecto > Propiedades del script > DOC_SPREADSHEET_ID con el id que sale en la URL de la hoja.');
    Logger.log(JSON.stringify(informe, null, 2));
    return informe;
  }

  /* 2 · Las hojas del modelo. */
  var faltantes = [];
  for (var s = 0; s < DOC2_SHEET_ORDER.length; s++) {
    if (!ss.getSheetByName(DOC2_SHEET_ORDER[s])) faltantes.push(DOC2_SHEET_ORDER[s]);
  }
  anotar('Las 19 hojas del modelo existen', faltantes.length === 0,
    faltantes.length ? ('Faltan: ' + faltantes.join(', ')) : 'Todas presentes.',
    'Menu Documentacion > Instalar o actualizar modelo.');

  /* 3 · Las columnas de catálogo del formulario. */
  var auxiliar = ss.getSheetByName(DOC2_SHEET.AUXILIAR);
  if (!auxiliar) {
    anotar('La hoja Auxiliar tiene agencia_bdp y gerencia_bdp', false, 'No existe la hoja Auxiliar.',
      'Ejecuta docActualizarCatalogoV2().');
  } else {
    var ancho = Math.max(1, auxiliar.getLastColumn());
    var cabeceras = auxiliar.getRange(1, 1, 1, ancho).getValues()[0].map(function (v) { return String(v || '').trim(); });
    var sinColumna = [];
    for (var a = 0; a < DOC2_AUXILIAR_COLUMNS.length; a++) {
      if (cabeceras.indexOf(DOC2_AUXILIAR_COLUMNS[a]) < 0) sinColumna.push(DOC2_AUXILIAR_COLUMNS[a]);
    }
    var conteos = [];
    try {
      var aux = doc2Auxiliares_();
      for (var k in aux) {
        if (Object.prototype.hasOwnProperty.call(aux, k)) conteos.push(k + ': ' + (aux[k] || []).length);
      }
    } catch (e) {
      conteos.push('no se pudo contar: ' + e);
    }
    anotar('La hoja Auxiliar tiene agencia_bdp y gerencia_bdp', sinColumna.length === 0,
      (sinColumna.length ? ('Faltan: ' + sinColumna.join(', ') + '. ') : '') + conteos.join(' | '),
      'Ejecuta docActualizarCatalogoV2().');
  }

  /* 4 · El catálogo, completo y en la versión 2. */
  var semilla = doc2CatalogoSemillaV2_();
  var sinRequisito = [];
  var enV1 = [];
  for (var d = 0; d < semilla.length; d++) {
    var existente = null;
    try {
      existente = docById_(DOC2_SHEET.CATALOGO, semilla[d].codigo);
    } catch (e) {
      existente = null;
    }
    if (!existente) sinRequisito.push(semilla[d].codigo);
    else if (String(existente.version_catalogo) !== String(DOC2_CATALOGO_VERSION_V2)) enV1.push(semilla[d].codigo);
  }
  anotar('El catalogo tiene los ' + semilla.length + ' requisitos en la version 2',
    sinRequisito.length === 0 && enV1.length === 0,
    (sinRequisito.length ? ('Faltan ' + sinRequisito.length + ': ' + sinRequisito.join(', ') + '. ') : '') +
    (enV1.length ? ('En version anterior ' + enV1.length + ': ' + enV1.join(', ') + '.') : 'Todos al dia.'),
    'Ejecuta docActualizarCatalogoV2().');

  /* 5 · La aplicabilidad por rama. Es donde se ve si una categoría mezcla
        requisitos de otra. */
  var esperado = { 'COMERCIAL|COMERCIAL_1': 23, 'COMERCIAL|COMERCIAL_2': 27, 'COMERCIAL|COMERCIAL_3': 23, 'AUDITORIA|NINGUNA': 19, 'CUMPLIMIENTO|NINGUNA': 20, 'GENERAL|NINGUNA': 18 };
  var mapa = doc2ResumenAplicabilidadV2_();
  var discrepancias = [];
  var lineas = [];
  for (var m = 0; m < mapa.length; m++) {
    var clave = mapa[m].categoria + '|' + mapa[m].garantia;
    lineas.push(clave + ' = ' + mapa[m].total);
    if (Object.prototype.hasOwnProperty.call(esperado, clave) && esperado[clave] !== mapa[m].total) {
      discrepancias.push(clave + ' da ' + mapa[m].total + ' y deberia dar ' + esperado[clave]);
    }
  }
  anotar('Cada rama pide exactamente sus requisitos', discrepancias.length === 0,
    lineas.join(' | ') + (discrepancias.length ? (' >> ' + discrepancias.join('; ')) : ''),
    'Ejecuta docActualizarCatalogoV2(). Si persiste, alguien desactivo un requisito en la hoja CatalogoDocumentos.');

  /* 6 · El enrutador. Se llama a `doPost` como lo llamaría el navegador. */
  try {
    var respuesta = doPost({ postData: { contents: JSON.stringify({ accion: 'documentacion.estado', origen: 'autoverificacion' }) } });
    var texto = respuesta && typeof respuesta.getContent === 'function' ? respuesta.getContent() : String(respuesta);
    var sobre = JSON.parse(texto);
    anotar('doPost contesta el sobre de Documentacion', sobre && typeof sobre.ok === 'boolean',
      'ok=' + sobre.ok + ' accion=' + sobre.accion + ' instalado=' + JSON.stringify((sobre.datos || sobre.data || {}).instalado),
      'Revisa 08_Router.gs y que los 23 archivos esten pegados con su nombre y su orden.');
  } catch (e) {
    anotar('doPost contesta el sobre de Documentacion', false, String(e),
      'Comprueba que estan los 23 archivos .gs y que el manifiesto appsscript.json es el del repositorio.');
  }

  Logger.log(informe.ok ? 'VERIFICACION OK' : 'VERIFICACION CON FALLOS');
  for (var r = 0; r < informe.comprobaciones.length; r++) {
    var comprobacion = informe.comprobaciones[r];
    Logger.log((comprobacion.ok ? '[OK]    ' : '[FALLA] ') + comprobacion.titulo);
    if (comprobacion.detalle) Logger.log('        ' + comprobacion.detalle);
    if (!comprobacion.ok && comprobacion.remedio) Logger.log('        Remedio: ' + comprobacion.remedio);
  }

  return informe;
}
