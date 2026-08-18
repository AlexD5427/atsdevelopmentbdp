/**
 * Cliente central del backend de Documentación.
 *
 * ── Por qué UN cliente ──────────────────────────────────────────────────
 * En la versión anterior cada panel llamaba a `google.script.run` (o a `fetch`)
 * por su cuenta. Consecuencia: cada uno inventaba su propio manejo de errores, su
 * propio indicador de carga y su propio criterio de reintento, y ninguno se
 * protegía del doble envío ni de las respuestas que llegan tarde.
 *
 * Aquí eso está resuelto una vez:
 *
 *   · **identificador de solicitud** en toda escritura, para que reintentar sea
 *     seguro (el backend reconoce la repetición y devuelve el resultado original);
 *   · **prevención de doble envío**: dos llamadas idénticas simultáneas comparten
 *     la misma promesa en lugar de producir dos escrituras;
 *   · **detección de respuestas obsoletas**: cada consulta lleva un número de
 *     secuencia; si llega la de una petición anterior, se descarta. Sin esto, una
 *     búsqueda lenta sobrescribe el resultado de la rápida que se escribió después;
 *   · **tiempo máximo visible**: Apps Script puede tardar minutos; una interfaz que
 *     espera indefinidamente parece rota;
 *   · **reintento solo de lo seguro**: fallo de red o libro ocupado. Un error de
 *     validación no se reintenta, porque volver a enviar lo mismo dará lo mismo;
 *   · **errores normalizados**: siempre `codigo`, `mensaje`, `pista` y `campos`,
 *     que es lo que un formulario necesita para marcar el campo que falla.
 *
 * ── Transporte ────────────────────────────────────────────────────────
 * `POST` con el cuerpo como `text/plain` y `redirect: "follow"`. No es descuido:
 * con `application/json` el navegador manda un `OPTIONS` previo que Apps Script no
 * responde y la llamada muere por CORS; y Apps Script contesta con un 302 hacia
 * googleusercontent, así que la redirección hay que seguirla.
 *
 * ── La URL es la de Documentación, no la del dashboard ─────────────────────
 * Este módulo habla con SU proyecto de Apps Script (`apps-script/documentacion/`),
 * que no es el del resto de la aplicación. Ver `SCRIPT_URL_DOCUMENTACION` en
 * `constants.ts`: apuntar aquí a `SCRIPT_URL` hacía que el módulo se declarara
 * conectado y mandara sus acciones al backend equivocado.
 */

import { CLAVE_URL_DOCUMENTACION, SCRIPT_URL_DOCUMENTACION } from "../../../constants";

/* ------------------------------------------------------------------ */
/* Tipos del sobre                                                     */
/* ------------------------------------------------------------------ */

export interface DocMeta {
  requestId?: string;
  timestamp?: string;
  version?: string;
  esquemaNormalizado?: number;
  traza?: string;
  milisegundos?: number;
  backend?: string;
  instalado?: boolean;
  contadores?: Record<string, number>;
}

export interface DocErrorPayload {
  code?: string;
  codigo?: string;
  message?: string;
  mensaje?: string;
  hint?: string;
  pista?: string;
  fields?: Record<string, string>;
  detalle?: Record<string, unknown>;
}

export interface DocSobre<T = unknown> {
  ok: boolean;
  accion: string;
  solicitudId?: string;
  data?: T;
  datos?: T;
  error?: DocErrorPayload | null;
  avisos?: string[];
  meta?: DocMeta;
}

/** Error normalizado. Es lo único que ven los componentes. */
export class DocError extends Error {
  readonly codigo: string;
  readonly pista: string;
  readonly campos: Record<string, string>;
  readonly detalle: Record<string, unknown>;
  readonly red: boolean;
  readonly requestId: string;

  constructor(
    mensaje: string,
    opciones: {
      codigo?: string;
      pista?: string;
      campos?: Record<string, string>;
      detalle?: Record<string, unknown>;
      red?: boolean;
      requestId?: string;
    } = {},
  ) {
    super(mensaje);
    this.name = "DocError";
    this.codigo = opciones.codigo ?? "ERROR";
    this.pista = opciones.pista ?? "";
    this.campos = opciones.campos ?? {};
    this.detalle = opciones.detalle ?? {};
    this.red = opciones.red === true;
    this.requestId = opciones.requestId ?? "";
  }
}

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

const TIMEOUT_POR_DEFECTO = 30000;
const TIMEOUT_LARGO = 180000;
const REINTENTOS = 3;

/**
 * Forma de un despliegue de aplicación web publicado.
 *
 * Se exige `/macros/s/<id>/exec`. Los tres errores que se ven de verdad al pegar
 * la URL a mano son: copiar la del editor (`/edit`), copiar la de prueba (`/dev`,
 * que exige sesión de Google y no sirve para el equipo) y copiar la del libro de
 * cálculo en lugar de la del script. Los tres se rechazan aquí, sin gastar una
 * petición y diciendo cuál es el problema.
 */
const FORMA_EXEC = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec(\?.*)?$/;

/** Acciones que escriben: llevan identificador y no se ejecutan dos veces. */
const ESCRITURAS = new Set([
  "documentacion.instalar",
  "documentacion.migrar",
  "documentacion.respaldo",
  "documentacion.reparar",
  "documentacion.proceso.diario",
  "documentacion.catalogo.guardar",
  "documentacion.auxiliares.agregar",
  "documentacion.expediente.crear",
  "documentacion.expediente.actualizar",
  "documentacion.expediente.estado",
  "documentacion.expediente.sincronizar",
  "documentacion.expediente.recalcular",
  "documentacion.expediente.archivar",
  "documentacion.expediente.restaurar",
  "documentacion.expediente.conservacion",
  "documentacion.requisito.actualizar",
  "documentacion.requisitos.guardar",
  "documentacion.prorroga.crear",
  "documentacion.prorroga.actualizar",
  "documentacion.prorroga.estado",
  "documentacion.solicitud.crear",
  "documentacion.solicitud.estado",
  "documentacion.solicitud.seguimiento",
  "documentacion.solicitudes.masiva",
  "documentacion.revision.decidir",
  "documentacion.aprobacion.solicitar",
  "documentacion.aprobacion.resolver",
  "documentacion.comentario.crear",
  "documentacion.comentario.editar",
  "documentacion.comentario.resolver",
  "documentacion.tarea.crear",
  "documentacion.tarea.actualizar",
  "documentacion.tarea.estado",
  "documentacion.notificacion.leer",
  "documentacion.notificaciones.leerTodas",
  "documentacion.exportacion.iniciar",
  "documentacion.exportacion.lote",
  "documentacion.exportacion.cancelar",
  "documentacion.filtro.guardar",
  "documentacion.filtro.eliminar",
  "documentacion.consentimiento.presentar",
  "documentacion.consentimiento.responder",
  "documentacion.retencion.aplicar",
  "documentacion.retencion.anonimizar",
  "documentacion.permisos.guardar",
  "documentacion.configuracion.guardar",
]);

/** Acciones lentas por naturaleza: instalar, migrar, exportar, reparar. */
const ACCIONES_LARGAS = new Set([
  "documentacion.instalar",
  "documentacion.migrar",
  "documentacion.respaldo",
  "documentacion.reparar",
  "documentacion.exportacion.lote",
  "documentacion.solicitudes.masiva",
  "documentacion.retencion.aplicar",
  "documentacion.proceso.diario",
]);

export function esEscritura(accion: string): boolean {
  return ESCRITURAS.has(accion);
}

/** Acciones declaradas por el cliente. La usa el verificador de coherencia. */
export function accionesDeclaradas(): string[] {
  return [...ESCRITURAS].sort();
}

/* ------------------------------------------------------------------ */
/* Persistencia de la URL                                              */
/* ------------------------------------------------------------------ */

/**
 * Lectura y escritura tolerantes del almacén del navegador.
 *
 * `window.localStorage` lanza al ACCEDER a la propiedad cuando el navegador tiene
 * bloqueados los datos del sitio (política corporativa, cookies bloqueadas,
 * almacenamiento particionado en un iframe). Ya costó una pantalla en blanco una
 * vez; aquí nunca puede costar la conexión del módulo.
 */
function leerGuardada(): string {
  try {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(CLAVE_URL_DOCUMENTACION) ?? "").trim();
  } catch {
    return "";
  }
}

function guardarUrl(url: string): void {
  try {
    if (typeof window === "undefined") return;
    if (url) window.localStorage.setItem(CLAVE_URL_DOCUMENTACION, url);
    else window.localStorage.removeItem(CLAVE_URL_DOCUMENTACION);
  } catch {
    /* sin almacén, la URL vale para esta sesión y se vuelve a pedir */
  }
}

/**
 * URL inicial, en orden de autoridad.
 *
 * El entorno gana sobre el navegador: si el área publica un despliegue nuevo y lo
 * pone en Vercel, esa es la buena, y no la que alguien pegó a mano hace un mes.
 */
function urlInicial(): string {
  return SCRIPT_URL_DOCUMENTACION || leerGuardada();
}

/* ------------------------------------------------------------------ */
/* Estado del cliente                                                  */
/* ------------------------------------------------------------------ */

let urlActiva = urlInicial();
let actorActivo = "";
let rolActivo = "";
let contadorSecuencia = 0;

/** Peticiones en vuelo, por huella, para no enviar dos veces lo mismo. */
const enVuelo = new Map<string, Promise<unknown>>();

export function configurarCliente(opciones: { url?: string; actor?: string; rol?: string }): void {
  if (opciones.url !== undefined) {
    const limpia = (opciones.url || "").trim();
    // Vacío NO significa «vuelve al valor por defecto»: significa «quita la URL».
    // Confundir las dos cosas es exactamente lo que hacía que el módulo acabara
    // hablando con el Apps Script del dashboard.
    urlActiva = limpia || SCRIPT_URL_DOCUMENTACION || "";
    if (limpia) guardarUrl(limpia);
  }
  if (opciones.actor !== undefined) actorActivo = opciones.actor;
  if (opciones.rol !== undefined) rolActivo = opciones.rol;
}

export function urlCliente(): string {
  return urlActiva;
}

/** ¿La URL tiene la forma de un despliegue publicado? */
export function urlBienFormada(url: string): boolean {
  return FORMA_EXEC.test(String(url || "").trim());
}

/**
 * Por qué una URL no sirve, en lenguaje llano y vacío si sí sirve.
 *
 * Se usa en Configuración para validar mientras se escribe, sin gastar una
 * petición para descubrir algo que se ve a simple vista.
 */
export function problemaDeUrl(url: string): string {
  const texto = String(url || "").trim();
  if (!texto) return "Falta la URL de la aplicación web de Documentación.";
  if (!/^https:\/\//.test(texto)) return "La URL tiene que empezar por https://";
  if (/docs\.google\.com/.test(texto)) {
    return "Esa es la URL del libro de cálculo, no la del script. En el editor de Apps Script: Implementar › Gestionar implementaciones › copiar la URL de la aplicación web.";
  }
  if (!/^https:\/\/script\.google\.com\//.test(texto)) return "La URL tiene que ser de script.google.com";
  if (/\/dev(\?|$)/.test(texto)) {
    return "Esa es la URL de prueba (/dev): solo funciona para quien edita el script. Hace falta la de la implementación, que termina en /exec.";
  }
  if (/\/edit(\?|#|$)/.test(texto)) return "Esa es la URL del editor. Hace falta la de la implementación, que termina en /exec.";
  if (!FORMA_EXEC.test(texto)) return "La URL tiene que terminar en /exec y venir de Implementar › Gestionar implementaciones.";
  return "";
}

export function hayBackendConfigurado(): boolean {
  return urlBienFormada(urlActiva);
}

export function nuevoRequestId(): string {
  const azar = Math.random().toString(36).slice(2, 10);
  return `req_${Date.now().toString(36)}_${azar}`;
}

/** Número de secuencia creciente para descartar respuestas obsoletas. */
export function siguienteSecuencia(): number {
  contadorSecuencia += 1;
  return contadorSecuencia;
}

export function secuenciaActual(): number {
  return contadorSecuencia;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Interpretación de una respuesta que no es un sobre                  */
/* ------------------------------------------------------------------ */

/**
 * Convierte una respuesta inesperada en un error que dice qué pasó.
 *
 * Los cuatro casos reales, en orden de frecuencia:
 *
 *   1. **el backend equivocado**. La respuesta es el payload del dashboard de
 *      talento (`candidatos`, `competencias`, `arquetipos_disc`). Es JSON válido,
 *      así que un cliente que solo comprueba «parsea» lo acepta y luego se queja
 *      de que falta `ok`. Con el nombre del culpable, se arregla en diez segundos;
 *   2. **permisos caducados**. Apps Script no devuelve 401: devuelve 200 con la
 *      página HTML de autorización de Google;
 *   3. **implementación privada**. Devuelve la pantalla de inicio de sesión;
 *   4. **JSON sin sobre**. Algún otro script contestando en esa URL.
 */
function errorDeRespuestaInesperada(texto: string, crudo: unknown): DocError {
  const muestra = texto.slice(0, 400);

  if (crudo && typeof crudo === "object" && !Array.isArray(crudo)) {
    const objeto = crudo as Record<string, unknown>;
    const esDashboard = "candidatos" in objeto || "arquetipos_disc" in objeto || "competencias" in objeto;
    if (esDashboard) {
      return new DocError("Esa URL es la del Apps Script del dashboard de talento, no la de Documentación.", {
        codigo: "BACKEND_EQUIVOCADO",
        pista:
          "Documentación tiene su propio proyecto de Apps Script, el de apps-script/documentacion/. Abre ESE proyecto, Implementar › Gestionar implementaciones, copia su URL /exec y pégala en Configuración › Conexión.",
        detalle: { camposRecibidos: Object.keys(objeto).slice(0, 8) },
      });
    }
    return new DocError("El backend respondió un JSON que no es el sobre de Documentación.", {
      codigo: "SIN_SOBRE",
      pista:
        "Se esperaba { ok, accion, datos, meta }. Comprueba que la URL sea la del proyecto de Documentación y que su implementación esté al día: al cambiar el código hay que publicar una VERSIÓN NUEVA, guardar no basta.",
      detalle: { camposRecibidos: Object.keys(objeto).slice(0, 8) },
    });
  }

  const pareceLogin = /accounts\.google\.com|iniciar sesión|sign in/i.test(texto);
  const pareceAutorizacion = /autoriza|authorization|permiso|permission|necesita tu permiso/i.test(texto);
  if (pareceLogin) {
    return new DocError("El backend pide iniciar sesión en Google.", {
      codigo: "AUTENTICACION",
      pista:
        'Vuelve a implementar la aplicación web con «Ejecutar como: yo» y «Quién tiene acceso: cualquier usuario». Con «solo yo», el equipo recibe esta pantalla.',
      detalle: { respuesta: muestra },
    });
  }
  if (pareceAutorizacion) {
    return new DocError("Al despliegue le faltan permisos sobre el libro.", {
      codigo: "PERMISOS_BACKEND",
      pista:
        "Abre el proyecto de Apps Script, ejecuta cualquier función a mano una vez y acepta los permisos. Después publica una versión nueva de la implementación.",
      detalle: { respuesta: muestra },
    });
  }

  return new DocError("El backend respondió algo que no es JSON.", {
    codigo: "RESPUESTA_INVALIDA",
    pista: "Comprueba que la URL termine en /exec y que la implementación esté publicada.",
    detalle: { respuesta: muestra },
  });
}

/* ------------------------------------------------------------------ */
/* Llamada                                                             */
/* ------------------------------------------------------------------ */

export interface OpcionesLlamada {
  requestId?: string;
  timeoutMs?: number;
  reintentos?: number;
  signal?: AbortSignal;
  /** Desactiva la unión de peticiones idénticas (para pruebas y para lotes). */
  sinUnir?: boolean;
  onCarga?: (cargando: boolean) => void;
}

/** Una petición, sin reintentos. */
async function unaVez<T>(
  accion: string,
  cuerpo: Record<string, unknown>,
  timeoutMs: number,
  signalExterno?: AbortSignal,
): Promise<DocSobre<T>> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  const cancelar = () => controlador.abort();
  if (signalExterno) {
    if (signalExterno.aborted) controlador.abort();
    else signalExterno.addEventListener("abort", cancelar);
  }

  try {
    const respuesta = await fetch(urlActiva, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ accion, ...cuerpo }),
      signal: controlador.signal,
    });

    const texto = await respuesta.text();
    let crudo: unknown = null;
    try {
      crudo = JSON.parse(texto) as unknown;
    } catch {
      crudo = null;
    }

    // Un sobre de verdad trae `ok` booleano y `accion`. Cualquier otra cosa —aunque
    // sea JSON impecable— viene de otro sitio, y decirlo es la mitad del arreglo.
    const esSobre =
      !!crudo && typeof crudo === "object" && !Array.isArray(crudo) && typeof (crudo as { ok?: unknown }).ok === "boolean";

    if (!esSobre) throw errorDeRespuestaInesperada(texto, crudo);

    if (!respuesta.ok) {
      // Con sobre y sin 2xx: se cree al sobre, que es más específico, pero se deja
      // constancia del código HTTP en el detalle.
      const sobre = crudo as DocSobre<T>;
      sobre.meta = { ...(sobre.meta ?? {}), traza: `http ${respuesta.status}` };
      return sobre;
    }

    return crudo as DocSobre<T>;
  } finally {
    clearTimeout(temporizador);
    if (signalExterno) signalExterno.removeEventListener("abort", cancelar);
  }
}

/**
 * Llamada al backend con todo el comportamiento del cliente.
 *
 * Devuelve `data` directamente: los componentes no manipulan el sobre. Los
 * errores llegan como `DocError`, siempre con código, pista y campos.
 */
export async function llamar<T = unknown>(
  accion: string,
  params: Record<string, unknown> = {},
  opciones: OpcionesLlamada = {},
): Promise<T> {
  if (!hayBackendConfigurado()) {
    const problema = problemaDeUrl(urlActiva);
    throw new DocError(
      urlActiva ? "La URL del backend de Documentación no es válida." : "No hay un backend configurado para Documentación.",
      {
        codigo: "SIN_BACKEND",
        pista: problema || "Pega la URL de la aplicación web en Configuración › Conexión.",
        detalle: { url: urlActiva },
      },
    );
  }

  const escritura = esEscritura(accion);
  const requestId = opciones.requestId ?? nuevoRequestId();
  const timeoutMs = opciones.timeoutMs ?? (ACCIONES_LARGAS.has(accion) ? TIMEOUT_LARGO : TIMEOUT_POR_DEFECTO);
  const maxIntentos = opciones.reintentos ?? REINTENTOS;

  const cuerpo: Record<string, unknown> = {
    ...params,
    solicitudId: requestId,
    origen: "modulo-documentacion",
  };
  if (actorActivo) cuerpo.actor = actorActivo;
  if (rolActivo) cuerpo.rol = rolActivo;

  // Unión de peticiones idénticas: dos componentes que piden el panel a la vez
  // comparten una sola llamada. Las escrituras no se unen nunca —dos guardados
  // seguidos son dos intenciones distintas—, salvo que se repita el requestId.
  const huella = escritura ? `${accion}|${requestId}` : `${accion}|${JSON.stringify(params)}`;
  if (!opciones.sinUnir) {
    const previa = enVuelo.get(huella);
    if (previa) return previa as Promise<T>;
  }

  const ejecutar = async (): Promise<T> => {
    opciones.onCarga?.(true);
    let ultimoFallo: unknown = null;
    try {
      for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
          const sobre = await unaVez<T>(accion, cuerpo, timeoutMs, opciones.signal);
          if (sobre.ok) return (sobre.data ?? sobre.datos ?? null) as T;

          const error = sobre.error ?? {};
          const codigo = error.code ?? error.codigo ?? "ERROR";
          const recuperable = codigo === "LIBRO_OCUPADO" || codigo === "BUSY" || codigo === "TIMEOUT";
          if (recuperable && intento < maxIntentos) {
            await esperar(600 * intento);
            continue;
          }
          throw new DocError(error.message ?? error.mensaje ?? "El backend rechazó la operación.", {
            codigo,
            pista: error.hint ?? error.pista ?? "",
            campos: error.fields ?? {},
            detalle: error.detalle ?? {},
            requestId: sobre.meta?.requestId ?? requestId,
          });
        } catch (e) {
          ultimoFallo = e;
          if (e instanceof DocError && !e.red) {
            const recuperable = e.codigo === "LIBRO_OCUPADO" || e.codigo === "TIMEOUT";
            if (!recuperable) throw e;
          }
          if (intento < maxIntentos) {
            await esperar(600 * intento);
            continue;
          }
        }
      }

      const abortado = ultimoFallo instanceof Error && ultimoFallo.name === "AbortError";
      throw new DocError(
        abortado ? "El backend tardó demasiado en responder." : "No se pudo contactar con el backend.",
        {
          codigo: abortado ? "TIMEOUT" : "SIN_RED",
          pista: abortado
            ? "La operación puede haberse completado en el libro. Vuelve a consultar antes de repetirla."
            : "Revisa la conexión y vuelve a intentarlo.",
          red: true,
          requestId,
        },
      );
    } finally {
      opciones.onCarga?.(false);
      enVuelo.delete(huella);
    }
  };

  const promesa = ejecutar();
  if (!opciones.sinUnir) enVuelo.set(huella, promesa as Promise<unknown>);
  return promesa;
}

/**
 * Consulta con control de obsolescencia.
 *
 * Devuelve `null` cuando la respuesta llegó tarde: entre que se pidió y que
 * contestó, alguien pidió otra cosa. Escribir ese resultado en la pantalla
 * mostraría el listado de la búsqueda anterior, que es el error clásico de un
 * buscador con debounce.
 */
export async function consultarVigente<T>(
  accion: string,
  params: Record<string, unknown>,
  secuencia: number,
  opciones: OpcionesLlamada = {},
): Promise<T | null> {
  const datos = await llamar<T>(accion, params, opciones);
  if (secuencia < contadorSecuencia) return null;
  return datos;
}

/* ------------------------------------------------------------------ */
/* Diagnóstico                                                         */
/* ------------------------------------------------------------------ */

export interface ComprobacionConexion {
  codigo: "url" | "endpoint" | "sobre" | "instalado";
  titulo: string;
  ok: boolean;
  detalle: string;
  remedio: string;
}

export interface InformeConexion {
  ok: boolean;
  url: string;
  comprobaciones: ComprobacionConexion[];
  texto: string;
}

/**
 * Cuatro comprobaciones que apuntan a cuatro culpables distintos.
 *
 * Solo LEE: nunca escribe una fila de prueba en el libro. Es la diferencia entre
 * un diagnóstico y un efecto secundario.
 */
export async function diagnosticarConexion(): Promise<InformeConexion> {
  const comprobaciones: ComprobacionConexion[] = [];
  const url = urlActiva;

  const problema = problemaDeUrl(url);
  comprobaciones.push({
    codigo: "url",
    titulo: "La URL tiene forma de implementación publicada",
    ok: !problema,
    detalle: problema || `${url.slice(0, 64)}…`,
    remedio: problema ? "Apps Script › Implementar › Gestionar implementaciones › copiar la URL que termina en /exec." : "",
  });

  if (problema) {
    return terminarInforme(url, comprobaciones);
  }

  let sobre: DocSobre<{ instalado?: boolean; libro?: string }> | null = null;
  let fallo: DocError | null = null;
  try {
    sobre = await unaVez<{ instalado?: boolean; libro?: string }>(
      "documentacion.estado",
      { solicitudId: nuevoRequestId(), origen: "diagnostico" },
      15000,
    );
  } catch (e) {
    fallo = e instanceof DocError ? e : new DocError(String(e), { codigo: "ERROR" });
  }

  const respondio = !!sobre || (fallo !== null && !fallo.red);
  comprobaciones.push({
    codigo: "endpoint",
    titulo: "El endpoint responde",
    ok: respondio,
    detalle: respondio ? "Contestó a documentacion.estado." : (fallo?.message ?? "Sin respuesta."),
    remedio: respondio ? "" : "Puede ser la red de la oficina o un cortafuegos que bloquea script.google.com.",
  });

  comprobaciones.push({
    codigo: "sobre",
    titulo: "La respuesta es el sobre de Documentación",
    ok: !!sobre,
    detalle: sobre ? `accion: ${sobre.accion || "documentacion.estado"}` : (fallo?.pista || fallo?.message || "—"),
    remedio: sobre ? "" : (fallo?.pista ?? ""),
  });

  const instalado = sobre?.ok === true && (sobre.data ?? sobre.datos)?.instalado === true;
  comprobaciones.push({
    codigo: "instalado",
    titulo: "El libro tiene el modelo instalado",
    ok: instalado,
    detalle: instalado ? `Libro: ${(sobre?.data ?? sobre?.datos)?.libro ?? "sin nombre"}` : "Faltan hojas del modelo normalizado.",
    remedio: instalado ? "" : "Menú Documentación del libro › Instalar o actualizar modelo.",
  });

  return terminarInforme(url, comprobaciones);
}

function terminarInforme(url: string, comprobaciones: ComprobacionConexion[]): InformeConexion {
  const lineas = [
    "Diagnóstico de conexión — módulo Documentación",
    `Fecha: ${new Date().toISOString()}`,
    `URL: ${url || "(sin configurar)"}`,
    "",
  ];
  for (const c of comprobaciones) {
    lineas.push(`${c.ok ? "[OK]" : "[FALLA]"} ${c.titulo}`);
    if (c.detalle) lineas.push(`       ${c.detalle}`);
    if (!c.ok && c.remedio) lineas.push(`       Remedio: ${c.remedio}`);
  }
  return {
    ok: comprobaciones.every((c) => c.ok),
    url,
    comprobaciones,
    texto: lineas.join("\n"),
  };
}

/** Mensaje para la persona, a partir de cualquier cosa que se haya lanzado. */
export function mensajeDeError(error: unknown): { mensaje: string; pista: string; codigo: string } {
  if (error instanceof DocError) {
    return { mensaje: error.message, pista: error.pista, codigo: error.codigo };
  }
  if (error instanceof Error) return { mensaje: error.message, pista: "", codigo: "ERROR" };
  return { mensaje: String(error), pista: "", codigo: "ERROR" };
}

/** Limpia el estado interno. Solo lo usan las pruebas. */
export function __reiniciarClienteParaPruebas(url?: string): void {
  enVuelo.clear();
  contadorSecuencia = 0;
  urlActiva = url !== undefined ? url : urlInicial();
  actorActivo = "";
  rolActivo = "";
}
