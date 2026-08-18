/**
 * Formulario de Nuevo Expediente.
 *
 * ── El recorrido ──────────────────────────────────────────────────────
 *   1. Identidad — identificador, nombre, cargo, agencia, gerencia, ingreso.
 *   2. Documentos generales — los dieciocho de siempre.
 *   3. Tipo de funcionario — el punto de inflexión. Cuatro tarjetas.
 *   4. Tipo de garantía — solo si la categoría lo exige (Comercial).
 *   5. Documentos de la categoría — y GUARDAR Y ABRIR EXPEDIENTE.
 *
 * La estructura no está escrita aquí: está en `domain/categorias.ts`. Este archivo
 * la recorre. Añadir una categoría no toca este componente.
 *
 * ── Por qué el guardado son dos fases ────────────────────────────────────
 * `expediente.crear` no recibe el estado de los requisitos, y no es un descuido:
 * los requisitos los siembra el backend leyendo su catálogo, y hasta que no
 * existen no hay `expedienteDocumentoId` al que atar un estado. Así que se crea,
 * se lee lo sembrado, se emparejan los códigos con lo capturado y se guarda todo
 * en una llamada.
 *
 * La consecuencia hay que asumirla de frente: si la segunda fase falla, el
 * expediente YA existe. Decir «no se pudo crear» sería mentir, y haría que alguien
 * lo intentara otra vez y acabara con dos. Lo que se hace es decir exactamente qué
 * quedó a medias, guardar lo capturado en este equipo y ofrecer reintentar solo lo
 * que faltó.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  FolderOpen,
  Loader2,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { docApi } from "../api/acciones";
import { DocError } from "../api/client";
import {
  CATEGORIAS,
  GENERALES,
  bloquesDe,
  categoria as buscarCategoria,
  catalogoCoincide,
  categoriasOfrecidas,
  exigeGarantia,
  garantia as buscarGarantia,
  normalizarIdentificador,
  problemaDeIdentificador,
  requisitosDe,
  type CategoriaDef,
  type CodigoGarantia,
  type RequisitoDef,
} from "../domain/categorias";
import { useConsola } from "../state/consola";
import { Aviso, Boton } from "./piezas";
import { CURVA, DURACION, useMovimientoReducido } from "./DocMotion";
import { IconoCategoria } from "./IconosCategoria";
import { SelectorFecha } from "./SelectorFecha";
import { FilaRequisito, VALOR_INICIAL, type ValorRequisito } from "./FilaRequisito";
import "./nuevo-expediente.css";

/* ------------------------------------------------------------------ */
/* Estado del formulario                                               */
/* ------------------------------------------------------------------ */

type Paso = "identidad" | "generales" | "categoria" | "garantia" | "especificos";

interface Identidad {
  identificador: string;
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  fechaIngreso: string;
}

const IDENTIDAD_VACIA: Identidad = {
  identificador: "",
  nombre: "",
  cargo: "",
  agencia: "",
  gerencia: "",
  fechaIngreso: "",
};

interface Borrador {
  identidad: Identidad;
  categoria: string;
  garantia: string;
  valores: Record<string, ValorRequisito>;
  paso: Paso;
  guardadoEn: string;
}

const CLAVE_BORRADOR = "bdp-doc-nuevo-expediente-borrador";
/** Cola de lo que se capturó y no llegó a escribirse. Ver `reintentarPendiente`. */
const CLAVE_PENDIENTE = "bdp-doc-nuevo-expediente-pendiente";

function leerLocal<T>(clave: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const crudo = window.localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null;
  }
}

function escribirLocal(clave: string, valor: unknown): void {
  try {
    if (typeof window === "undefined") return;
    if (valor === null) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacén el formulario sigue funcionando; solo se pierde el borrador */
  }
}

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

export function NuevoExpediente({
  abierto,
  onCerrar,
  onCreado,
  avisar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (expedienteId: string) => void;
  avisar: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
}) {
  const consola = useConsola();
  const reducido = useMovimientoReducido();

  const [paso, setPaso] = useState<Paso>("identidad");
  const [identidad, setIdentidad] = useState<Identidad>(IDENTIDAD_VACIA);
  const [codigoCategoria, setCodigoCategoria] = useState<string>("");
  const [codigoGarantia, setCodigoGarantia] = useState<string>("");
  const [valores, setValores] = useState<Record<string, ValorRequisito>>({});
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [fase, setFase] = useState("");
  const [fallo, setFallo] = useState<{ mensaje: string; pista: string; codigo: string } | null>(null);
  const [duplicado, setDuplicado] = useState<{ expedienteId: string; nombre: string } | null>(null);
  const [hayBorrador, setHayBorrador] = useState(false);
  /** Expediente creado cuya segunda fase quedó a medias. */
  const [aMedias, setAMedias] = useState<{ expedienteId: string; faltan: number } | null>(null);

  const dialogo = useRef<HTMLDivElement | null>(null);
  const primerCampo = useRef<HTMLInputElement | null>(null);

  const categoria = buscarCategoria(codigoCategoria);
  const auxiliares = consola.catalogo?.auxiliares;
  const agencias = useMemo(() => auxiliares?.agencia_bdp ?? [], [auxiliares]);
  const gerencias = useMemo(() => auxiliares?.gerencia_bdp ?? [], [auxiliares]);

  /* ---------------------------------------------------------------- */
  /* Coherencia con el catálogo del libro                              */
  /* ---------------------------------------------------------------- */

  /**
   * El formulario pregunta por lo que declara el dominio; los requisitos los
   * siembra la hoja. Si el libro se quedó en la versión anterior del catálogo, hay
   * documentos que se rellenarían y se perderían sin que nadie se enterara.
   */
  const desfase = useMemo(() => {
    const documentos = consola.catalogo?.documentos;
    if (!documentos?.length) return null;
    const resultado = catalogoCoincide(documentos.map((d) => d.codigo));
    return resultado.ok ? null : resultado;
  }, [consola.catalogo]);

  /* ---------------------------------------------------------------- */
  /* Requisitos vigentes                                               */
  /* ---------------------------------------------------------------- */

  const requisitosVigentes = useMemo(
    () => requisitosDe(codigoCategoria, codigoGarantia),
    [codigoCategoria, codigoGarantia],
  );

  const bloques = useMemo(() => bloquesDe(codigoCategoria, codigoGarantia), [codigoCategoria, codigoGarantia]);
  const bloquesPropios = useMemo(() => bloques.filter((b) => b.codigo !== "generales"), [bloques]);

  const valorDe = useCallback(
    (codigo: string): ValorRequisito => valores[codigo] ?? VALOR_INICIAL,
    [valores],
  );

  const cambiar = useCallback((codigo: string, patch: Partial<ValorRequisito>) => {
    setValores((prev) => ({ ...prev, [codigo]: { ...(prev[codigo] ?? VALOR_INICIAL), ...patch } }));
  }, []);

  /**
   * Cuánto hay resuelto.
   *
   * Resuelto es «entregado» o «no aplica»: los dos son decisiones tomadas. Es la
   * misma regla que usa el backend para el porcentaje, y coincidir importa —si la
   * barra del formulario dice 80 % y el expediente abre con 62 %, nadie vuelve a
   * creerse ninguna de las dos.
   */
  const avance = useMemo(() => {
    const total = requisitosVigentes.length;
    if (!total) return { total: 0, resueltos: 0, porcentaje: 0, pendientes: 0, noEntregados: 0 };
    let resueltos = 0;
    let pendientes = 0;
    let noEntregados = 0;
    for (const requisito of requisitosVigentes) {
      const estado = valorDe(requisito.codigo).estado;
      if (estado === "ENTREGADO" || estado === "NO_APLICA") resueltos += 1;
      if (estado === "PENDIENTE") pendientes += 1;
      if (estado === "NO_ENTREGADO") noEntregados += 1;
    }
    return { total, resueltos, porcentaje: Math.round((resueltos / total) * 100), pendientes, noEntregados };
  }, [requisitosVigentes, valorDe]);

  const sucio = useMemo(() => {
    if (identidad !== IDENTIDAD_VACIA && Object.values(identidad).some((v) => String(v).trim())) return true;
    if (codigoCategoria) return true;
    return Object.values(valores).some(
      (v) => v.estado !== "PENDIENTE" || v.observaciones.trim() || v.prorroga,
    );
  }, [identidad, codigoCategoria, valores]);

  /* ---------------------------------------------------------------- */
  /* Borrador                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!abierto) return;
    setHayBorrador(!!leerLocal<Borrador>(CLAVE_BORRADOR));
    const pendiente = leerLocal<{ expedienteId: string; cambios: unknown[] }>(CLAVE_PENDIENTE);
    if (pendiente?.expedienteId) {
      setAMedias({ expedienteId: pendiente.expedienteId, faltan: pendiente.cambios?.length ?? 0 });
    }
  }, [abierto]);

  useEffect(() => {
    if (!abierto || !sucio) return;
    const guardar = window.setTimeout(() => {
      const borrador: Borrador = {
        identidad,
        categoria: codigoCategoria,
        garantia: codigoGarantia,
        valores,
        paso,
        guardadoEn: new Date().toISOString(),
      };
      escribirLocal(CLAVE_BORRADOR, borrador);
    }, 400);
    return () => window.clearTimeout(guardar);
  }, [abierto, sucio, identidad, codigoCategoria, codigoGarantia, valores, paso]);

  function recuperarBorrador() {
    const borrador = leerLocal<Borrador>(CLAVE_BORRADOR);
    if (!borrador) return;
    setIdentidad({ ...IDENTIDAD_VACIA, ...borrador.identidad });
    setCodigoCategoria(borrador.categoria || "");
    setCodigoGarantia(borrador.garantia || "");
    setValores(borrador.valores || {});
    setPaso(borrador.paso || "identidad");
    setHayBorrador(false);
    avisar("info", "Borrador recuperado.", "Nada se ha escrito todavía en el libro.");
  }

  function limpiarTodo() {
    setIdentidad(IDENTIDAD_VACIA);
    setCodigoCategoria("");
    setCodigoGarantia("");
    setValores({});
    setErroresCampo({});
    setFallo(null);
    setDuplicado(null);
    setPaso("identidad");
    escribirLocal(CLAVE_BORRADOR, null);
  }

  /* ---------------------------------------------------------------- */
  /* Diálogo: foco, scroll y Escape                                    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!abierto || typeof document === "undefined") return;

    // El bloqueo del desplazamiento se firma con `data-bloqueo-scroll` para que el
    // guardia de interfaz sepa que este bloqueo es legítimo y no lo deshaga por
    // debajo. Ver `shared/interfazViva.ts`.
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const foco = window.setTimeout(() => primerCampo.current?.focus(), reducido ? 0 : 120);

    return () => {
      document.body.style.overflow = previo;
      window.clearTimeout(foco);
    };
  }, [abierto, reducido]);

  const intentarCerrar = useCallback(() => {
    if (guardando) return;
    if (sucio && !window.confirm("Hay datos sin guardar. El borrador se conserva en este equipo. ¿Cerrar?")) return;
    onCerrar();
  }, [guardando, sucio, onCerrar]);

  useEffect(() => {
    if (!abierto) return;
    const teclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        intentarCerrar();
      }
    };
    document.addEventListener("keydown", teclado);
    return () => document.removeEventListener("keydown", teclado);
  }, [abierto, intentarCerrar]);

  /* ---------------------------------------------------------------- */
  /* Validación y navegación                                           */
  /* ---------------------------------------------------------------- */

  function validarIdentidad(): boolean {
    const errores: Record<string, string> = {};
    const problema = problemaDeIdentificador(identidad.identificador);
    if (problema) errores.identificador = problema;
    if (!identidad.nombre.trim()) errores.nombre = "Falta el nombre.";
    if (!identidad.cargo.trim()) errores.cargo = "Falta el cargo.";
    if (!identidad.agencia.trim()) errores.agencia = "Elige una agencia.";
    if (!identidad.gerencia.trim()) errores.gerencia = "Elige una gerencia.";
    if (!identidad.fechaIngreso) errores.fechaIngreso = "Falta la fecha de ingreso.";
    setErroresCampo(errores);
    return Object.keys(errores).length === 0;
  }

  /** Pasos alcanzables ahora mismo, en orden. La navegación libre usa esto. */
  const pasos = useMemo(() => {
    const lista: { id: Paso; etiqueta: string; disponible: boolean }[] = [
      { id: "identidad", etiqueta: "Identidad", disponible: true },
      { id: "generales", etiqueta: "Documentos generales", disponible: true },
      { id: "categoria", etiqueta: "Tipo de funcionario", disponible: true },
    ];
    if (exigeGarantia(codigoCategoria)) {
      lista.push({ id: "garantia", etiqueta: "Tipo de garantía", disponible: !!codigoCategoria });
    }
    if (codigoCategoria && bloquesPropios.length > 0) {
      lista.push({ id: "especificos", etiqueta: categoria?.etiquetaCorta ?? "Requisitos", disponible: true });
    }
    return lista;
  }, [codigoCategoria, bloquesPropios.length, categoria]);

  /** ¿Es este el último paso? Solo ahí aparece GUARDAR Y ABRIR EXPEDIENTE. */
  const esUltimo = pasos.length > 0 && pasos[pasos.length - 1].id === paso;

  function siguiente() {
    if (paso === "identidad" && !validarIdentidad()) return;
    const indice = pasos.findIndex((p) => p.id === paso);
    if (indice < 0) return;
    const destino = pasos[indice + 1];
    if (destino) setPaso(destino.id);
  }

  function anterior() {
    const indice = pasos.findIndex((p) => p.id === paso);
    if (indice > 0) setPaso(pasos[indice - 1].id);
  }

  /**
   * Elegir categoría.
   *
   * Lo capturado NO se borra al cambiar de categoría: los generales valen igual y
   * los requisitos que la categoría nueva también pide conservan su estado. Lo que
   * deja de aplicar se queda en `valores` sin usarse —por si se vuelve— y nunca se
   * envía, porque el envío recorre `requisitosVigentes`, no `valores`.
   */
  function elegirCategoria(def: CategoriaDef) {
    if (!def.activa) {
      avisar(
        "aviso",
        `${def.etiqueta}: ${def.nota ?? "en construcción"}.`,
        "El backend ya tiene la rama preparada; falta que el área defina su lista de requisitos. Mientras tanto no se puede registrar con esta categoría.",
      );
      return;
    }
    setCodigoCategoria(def.codigo);
    if (!def.garantias?.length) setCodigoGarantia("");
    setPaso(def.garantias?.length ? "garantia" : def.bloques.length ? "especificos" : "generales");
  }

  function elegirGarantia(codigo: CodigoGarantia) {
    setCodigoGarantia(codigo);
    setPaso("especificos");
  }

  /* ---------------------------------------------------------------- */
  /* Duplicados                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Comprobar el identificador ANTES de llenar el expediente.
   *
   * Descubrir el choque al pulsar guardar, con veintisiete chips ya marcados, es
   * la peor forma posible de enterarse. Es una consulta de solo lectura y si falla
   * no se dice nada: es una cortesía, no una validación.
   */
  async function comprobarDuplicado() {
    const texto = identidad.identificador.trim();
    if (!texto || problemaDeIdentificador(texto)) return;
    if (consola.conexion !== "conectado") return;
    try {
      const res = await docApi.listarExpedientes({ texto: normalizarIdentificador(texto), porPagina: 3 });
      const encontrado = res.expedientes?.find(
        (e) => normalizarIdentificador(e.identificador) === normalizarIdentificador(texto),
      );
      setDuplicado(encontrado ? { expedienteId: encontrado.expedienteId, nombre: encontrado.nombre } : null);
    } catch {
      setDuplicado(null);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Guardado                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Cambios a escribir en la segunda fase.
   *
   * Solo lo que se ha tocado: un requisito que sigue en «pendiente» sin
   * observaciones ya está así recién sembrado, y mandarlo son filas escritas para
   * dejar todo igual. Con veintisiete requisitos y un límite de seis minutos por
   * ejecución, eso no es una optimización cosmética.
   *
   * TODO(contrato): se envían `estado` y `estado_documental` a la vez porque el
   * contrato exacto del patch de requisitos no está documentado en el repositorio y
   * no hay libro de pruebas contra el que confirmarlo. Un backend con lista blanca
   * se queda con la clave que conoce. En cuanto se verifique cuál es, se deja una.
   */
  function construirCambios(requisitosDelBackend: { expedienteDocumentoId: string; codigo: string }[]) {
    const porCodigo = new Map(requisitosDelBackend.map((r) => [r.codigo, r.expedienteDocumentoId]));
    const cambios: Record<string, unknown>[] = [];
    const prorrogas: { expedienteDocumentoId: string; codigo: string; fecha: string; motivo: string }[] = [];
    const sinSitio: string[] = [];

    for (const requisito of requisitosVigentes) {
      const valor = valores[requisito.codigo];
      if (!valor) continue;
      const tocado = valor.estado !== "PENDIENTE" || valor.observaciones.trim() !== "";
      const id = porCodigo.get(requisito.codigo);

      if (!id) {
        // El backend no sembró este requisito: su catálogo no lo conoce. Se avisa con
        // nombre y apellido en lugar de perderlo en silencio.
        if (tocado || valor.prorroga) sinSitio.push(requisito.nombre);
        continue;
      }

      if (tocado) {
        cambios.push({
          expedienteDocumentoId: id,
          estado: valor.estado,
          estado_documental: valor.estado,
          observaciones: valor.observaciones.trim(),
        });
      }
      if (valor.prorroga) {
        prorrogas.push({
          expedienteDocumentoId: id,
          codigo: requisito.codigo,
          fecha: valor.prorroga,
          motivo: valor.prorrogaMotivo.trim() || "Prórroga registrada al abrir el expediente",
        });
      }
    }

    return { cambios, prorrogas, sinSitio };
  }

  async function guardar() {
    if (!validarIdentidad()) {
      setPaso("identidad");
      return;
    }
    if (!codigoCategoria) {
      setPaso("categoria");
      avisar("aviso", "Falta elegir el tipo de funcionario.");
      return;
    }
    if (exigeGarantia(codigoCategoria) && !codigoGarantia) {
      setPaso("garantia");
      avisar("aviso", "Falta elegir el tipo de garantía.");
      return;
    }

    setGuardando(true);
    setFallo(null);
    let expedienteId = "";

    try {
      /* ── Fase 1: el expediente ───────────────────────────────────── */
      setFase("Creando el expediente…");
      const creado = await docApi.crearExpediente({
        identificador: normalizarIdentificador(identidad.identificador),
        nombre: identidad.nombre.trim(),
        cargo: identidad.cargo.trim(),
        agencia: identidad.agencia.trim(),
        gerencia: identidad.gerencia.trim(),
        fechaIngreso: identidad.fechaIngreso,
        fecha_ingreso: identidad.fechaIngreso,
        tipoFuncionario: codigoCategoria,
        tipo_funcionario: codigoCategoria,
        tipoGarantia: codigoGarantia || "NINGUNA",
        tipo_garantia: codigoGarantia || "NINGUNA",
      });

      expedienteId = creado.expedienteId;
      if (!expedienteId) throw new DocError("El backend creó el expediente pero no devolvió su identificador.", { codigo: "SIN_ID" });

      if (creado.repetido) {
        avisar(
          "info",
          "Ese expediente ya existía y se ha reutilizado.",
          "El backend reconoció la operación como repetida, así que no se ha duplicado nada.",
        );
      }

      /* ── Fase 2: los estados capturados ──────────────────────────────── */
      setFase("Leyendo los requisitos sembrados…");
      const operativo = await docApi.obtenerExpediente(expedienteId);
      const { cambios, prorrogas, sinSitio } = construirCambios(
        (operativo.requisitos ?? []).map((r) => ({ expedienteDocumentoId: r.expedienteDocumentoId, codigo: r.codigo })),
      );

      if (cambios.length) {
        setFase(`Guardando ${cambios.length} estado(s)…`);
        // Se deja la cola en el navegador ANTES de mandarla: si el guardado se cae a
        // medias, lo capturado sigue estando y se puede reintentar solo eso.
        escribirLocal(CLAVE_PENDIENTE, { expedienteId, cambios });
        await docApi.guardarRequisitos(expedienteId, cambios);
        escribirLocal(CLAVE_PENDIENTE, null);
      }

      if (prorrogas.length) {
        setFase(`Registrando ${prorrogas.length} prórroga(s)…`);
        for (const prorroga of prorrogas) {
          try {
            await docApi.crearProrroga({
              expedienteId,
              expediente_id: expedienteId,
              expedienteDocumentoId: prorroga.expedienteDocumentoId,
              expediente_documento_id: prorroga.expedienteDocumentoId,
              codigoDocumento: prorroga.codigo,
              codigo_documento: prorroga.codigo,
              fechaProrroga: prorroga.fecha,
              fecha_prorroga: prorroga.fecha,
              motivo: prorroga.motivo,
            });
          } catch (error) {
            // Una prórroga que falla no invalida el expediente ni las otras.
            const detalle = error instanceof DocError ? error.message : String(error);
            avisar("aviso", `No se pudo registrar la prórroga de ${prorroga.codigo}.`, detalle);
          }
        }
      }

      if (sinSitio.length) {
        avisar(
          "aviso",
          `${sinSitio.length} documento(s) no se guardaron: el catálogo del libro no los conoce.`,
          `${sinSitio.slice(0, 3).join(", ")}${sinSitio.length > 3 ? "…" : ""}. Ejecuta «docActualizarCatalogoV2» en el editor de Apps Script y vuelve a marcarlos en el expediente.`,
        );
      }

      escribirLocal(CLAVE_BORRADOR, null);
      setAMedias(null);
      avisar("exito", `Expediente de ${identidad.nombre.trim()} creado.`, `${cambios.length} estado(s) guardado(s).`);
      limpiarTodo();
      onCreado(expedienteId);
    } catch (error) {
      const normalizado =
        error instanceof DocError
          ? { mensaje: error.message, pista: error.pista, codigo: error.codigo }
          : { mensaje: String(error), pista: "", codigo: "ERROR" };
      setFallo(normalizado);

      if (error instanceof DocError && Object.keys(error.campos).length) {
        setErroresCampo(error.campos);
        setPaso("identidad");
      }

      // El expediente puede existir aunque la operación haya fallado: decir «no se
      // creó» haría que alguien lo repitiera y acabara con dos.
      if (expedienteId) {
        const pendiente = leerLocal<{ expedienteId: string; cambios: unknown[] }>(CLAVE_PENDIENTE);
        setAMedias({ expedienteId, faltan: pendiente?.cambios?.length ?? 0 });
      }
    } finally {
      setGuardando(false);
      setFase("");
    }
  }

  /** Reintenta solo la segunda fase de un expediente que quedó a medias. */
  async function reintentarPendiente() {
    const pendiente = leerLocal<{ expedienteId: string; cambios: Record<string, unknown>[] }>(CLAVE_PENDIENTE);
    if (!pendiente?.expedienteId || !pendiente.cambios?.length) {
      setAMedias(null);
      escribirLocal(CLAVE_PENDIENTE, null);
      return;
    }
    setGuardando(true);
    setFase("Reintentando el guardado…");
    try {
      await docApi.guardarRequisitos(pendiente.expedienteId, pendiente.cambios);
      escribirLocal(CLAVE_PENDIENTE, null);
      setAMedias(null);
      setFallo(null);
      avisar("exito", "Los estados que faltaban ya están en el libro.");
    } catch (error) {
      const detalle = error instanceof DocError ? error.message : String(error);
      avisar("peligro", "El reintento tampoco pasó.", detalle);
    } finally {
      setGuardando(false);
      setFase("");
    }
  }

  if (!abierto) return null;

  /* ---------------------------------------------------------------- */
  /* Interfaz                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/55 p-0 backdrop-blur-md sm:items-center sm:p-4"
        initial={reducido ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducido ? undefined : { opacity: 0 }}
        transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
        onMouseDown={(evento) => {
          if (evento.target === evento.currentTarget) intentarCerrar();
        }}
      >
        <motion.div
          ref={dialogo}
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo expediente documental"
          data-bloqueo-scroll="activo"
          className="doc-console ne-form glass-heavy flex h-full w-full max-w-5xl flex-col overflow-hidden sm:h-[min(92vh,54rem)] sm:rounded-2xl"
          initial={reducido ? false : { opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducido ? undefined : { opacity: 0, y: 10, scale: 0.99 }}
          transition={reducido ? { duration: 0 } : { duration: DURACION.lenta, ease: CURVA.salidaExpo }}
        >
          {/* ── Cabecera ──────────────────────────────────────────── */}
          <header className="flex items-start justify-between gap-3 border-b border-[color:var(--doc-border)] p-4">
            <div className="min-w-0">
              <p className="doc-eyebrow ne-revelar">Nuevo expediente</p>
              <h2 className="ne-revelar ne-revelar-2 mt-0.5 text-sm font-semibold text-[color:var(--doc-text)]">
                {identidad.nombre.trim() || "Registro documental de incorporación"}
              </h2>
              {categoria && (
                <p className="ne-revelar ne-revelar-3 mt-0.5 text-[11px]" style={{ color: categoria.color }}>
                  {categoria.etiqueta}
                  {codigoGarantia && buscarGarantia(codigoGarantia) ? ` · ${buscarGarantia(codigoGarantia)?.etiqueta}` : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              className="doc-tap ne-fecha-boton"
              onClick={intentarCerrar}
              aria-label="Cerrar el formulario"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          {/* ── Índice de pasos ─────────────────────────────────────── */}
          <nav className="ne-pasos border-b border-[color:var(--doc-border)] px-4 py-2.5" aria-label="Secciones del formulario">
            {pasos.map((definicion, indice) => (
              <button
                key={definicion.id}
                type="button"
                className="ne-paso doc-tap"
                data-activo={paso === definicion.id ? "si" : undefined}
                data-completo={
                  definicion.id === "identidad" && !problemaDeIdentificador(identidad.identificador) && identidad.nombre.trim()
                    ? "si"
                    : definicion.id === "categoria" && codigoCategoria
                      ? "si"
                      : definicion.id === "garantia" && codigoGarantia
                        ? "si"
                        : undefined
                }
                disabled={!definicion.disponible}
                onClick={() => setPaso(definicion.id)}
              >
                <span className="ne-paso-numero">{indice + 1}</span>
                {definicion.etiqueta}
              </button>
            ))}
          </nav>

          {/* ── Contenido ─────────────────────────────────────────── */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
            <div className="space-y-3">
              {hayBorrador && !sucio && (
                <Aviso intencion="info" titulo="Hay un borrador de este equipo">
                  Se guardó sin llegar a enviarse.{" "}
                  <button type="button" className="doc-tap ne-enlace" onClick={recuperarBorrador}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Recuperarlo
                  </button>
                </Aviso>
              )}

              {desfase && (
                <Aviso intencion="aviso" titulo="El catálogo del libro se quedó en la versión anterior">
                  Faltan {desfase.faltan.length} requisito(s) que este formulario pide: {desfase.faltan.slice(0, 4).join(", ")}
                  {desfase.faltan.length > 4 ? "…" : ""}. Los expedientes se crearán sin ellos. Se arregla ejecutando
                  <b> docActualizarCatalogoV2</b> una vez en el editor de Apps Script (está en la guía de despliegue).
                </Aviso>
              )}

              {aMedias && (
                <Aviso intencion="peligro" titulo="Un expediente quedó a medias">
                  Se creó el expediente pero {aMedias.faltan} estado(s) no llegaron al libro.{" "}
                  <button type="button" className="doc-tap ne-enlace" onClick={() => void reintentarPendiente()}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reintentar solo eso
                  </button>{" "}
                  ·{" "}
                  <button type="button" className="doc-tap ne-enlace" onClick={() => onCreado(aMedias.expedienteId)}>
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Abrir el expediente
                  </button>
                </Aviso>
              )}

              {fallo && (
                <Aviso intencion="peligro" titulo={fallo.codigo}>
                  {fallo.mensaje} {fallo.pista}
                </Aviso>
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={paso}
                  className="ne-panel"
                  initial={reducido ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reducido ? undefined : { opacity: 0, x: -10 }}
                  transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
                >
                  {paso === "identidad" && (
                    <PasoIdentidad
                      identidad={identidad}
                      onCambio={(patch) => setIdentidad((prev) => ({ ...prev, ...patch }))}
                      errores={erroresCampo}
                      agencias={agencias}
                      gerencias={gerencias}
                      duplicado={duplicado}
                      onComprobarDuplicado={() => void comprobarDuplicado()}
                      refPrimerCampo={primerCampo}
                      onAbrirDuplicado={(id) => onCreado(id)}
                    />
                  )}

                  {paso === "generales" && (
                    <BloqueDocumentos
                      titulo="Documentos generales"
                      descripcion="Los dieciocho que se piden a toda incorporación, en el orden de la carpeta."
                      requisitos={GENERALES}
                      valorDe={valorDe}
                      onCambio={cambiar}
                    />
                  )}

                  {paso === "categoria" && (
                    <PasoCategoria elegida={codigoCategoria} onElegir={elegirCategoria} />
                  )}

                  {paso === "garantia" && categoria?.garantias && (
                    <PasoGarantia
                      categoria={categoria}
                      elegida={codigoGarantia}
                      onElegir={elegirGarantia}
                    />
                  )}

                  {paso === "especificos" &&
                    (bloquesPropios.length ? (
                      <div className="space-y-4">
                        {bloquesPropios.map((bloque) => (
                          <BloqueDocumentos
                            key={bloque.codigo}
                            titulo={bloque.etiqueta}
                            descripcion={bloque.descripcion}
                            caracteristicas={bloque.caracteristicas}
                            requisitos={bloque.requisitos}
                            valorDe={valorDe}
                            onCambio={cambiar}
                          />
                        ))}
                      </div>
                    ) : (
                      <Aviso intencion="info" titulo="Esta categoría no añade requisitos propios">
                        Con los generales está completo. Ya se puede guardar.
                      </Aviso>
                    ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* ── Pie ──────────────────────────────────────────────── */}
          <footer className="border-t border-[color:var(--doc-border)] px-4 py-3">
            {avance.total > 0 && (
              <div className="mb-2.5 space-y-1.5">
                <div className="ne-barra" role="presentation">
                  <span style={{ width: `${avance.porcentaje}%` }} />
                </div>
                <p className="ne-resumen" aria-live="polite">
                  <span>
                    <b>{avance.resueltos}</b> de <b>{avance.total}</b> resueltos ({avance.porcentaje} %)
                  </span>
                  {avance.pendientes > 0 && (
                    <span>
                      <b>{avance.pendientes}</b> pendientes
                    </span>
                  )}
                  {avance.noEntregados > 0 && (
                    <span>
                      <b>{avance.noEntregados}</b> no entregados
                    </span>
                  )}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {pasos.findIndex((p) => p.id === paso) > 0 && (
                  <Boton variante="fantasma" onClick={anterior}>
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Atrás
                  </Boton>
                )}
                {guardando && (
                  <span className="flex items-center gap-1.5 text-[11px] text-[color:var(--doc-text-muted)]" aria-live="polite">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {fase}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!esUltimo && (
                  <Boton variante="primario" onClick={siguiente}>
                    Continuar <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Boton>
                )}
                {esUltimo && (
                  <Boton variante="primario" cargando={guardando} onClick={() => void guardar()}>
                    <Save className="h-3.5 w-3.5" aria-hidden /> GUARDAR Y ABRIR EXPEDIENTE
                  </Boton>
                )}
              </div>
            </div>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Paso 1 · Identidad                                                  */
/* ------------------------------------------------------------------ */

function PasoIdentidad({
  identidad,
  onCambio,
  errores,
  agencias,
  gerencias,
  duplicado,
  onComprobarDuplicado,
  onAbrirDuplicado,
  refPrimerCampo,
}: {
  identidad: Identidad;
  onCambio: (patch: Partial<Identidad>) => void;
  errores: Record<string, string>;
  agencias: string[];
  gerencias: string[];
  duplicado: { expedienteId: string; nombre: string } | null;
  onComprobarDuplicado: () => void;
  onAbrirDuplicado: (expedienteId: string) => void;
  refPrimerCampo: React.RefObject<HTMLInputElement | null>;
}) {
  const anio = new Date().getFullYear();

  return (
    <>
      <div className="ne-seccion-titulo">
        <h3>Identidad del expediente</h3>
        <p className="ne-ayuda">Estos seis datos son los que después permiten encontrar el expediente.</p>
      </div>

      <div className="ne-rejilla">
        <label className="doc-campo ne-rejilla-ancho">
          <span className="doc-eyebrow">
            Identificador <span style={{ color: "var(--doc-danger)" }}>*</span>
          </span>
          <input
            ref={refPrimerCampo}
            type="text"
            className="doc-input"
            value={identidad.identificador}
            placeholder={`1234567 - 45 - ${anio}`}
            aria-invalid={errores.identificador ? true : undefined}
            onChange={(e) => onCambio({ identificador: e.target.value })}
            onBlur={onComprobarDuplicado}
          />
          {errores.identificador ? (
            <p className="ne-error">{errores.identificador}</p>
          ) : (
            <p className="ne-ayuda">
              Formato CI – Número de proceso – Año. El carnet puede llevar guión o complemento: se lee el año y el proceso desde el final.
            </p>
          )}
          {duplicado && (
            <p className="ne-error">
              Ya existe un expediente con ese identificador ({duplicado.nombre}).{" "}
              <button type="button" className="doc-tap ne-enlace" onClick={() => onAbrirDuplicado(duplicado.expedienteId)}>
                <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Abrirlo
              </button>
            </p>
          )}
        </label>

        <label className="doc-campo">
          <span className="doc-eyebrow">
            Nombre <span style={{ color: "var(--doc-danger)" }}>*</span>
          </span>
          <input
            type="text"
            className="doc-input"
            value={identidad.nombre}
            aria-invalid={errores.nombre ? true : undefined}
            onChange={(e) => onCambio({ nombre: e.target.value })}
          />
          {errores.nombre && <p className="ne-error">{errores.nombre}</p>}
        </label>

        <label className="doc-campo">
          <span className="doc-eyebrow">
            Cargo <span style={{ color: "var(--doc-danger)" }}>*</span>
          </span>
          <input
            type="text"
            className="doc-input"
            value={identidad.cargo}
            aria-invalid={errores.cargo ? true : undefined}
            onChange={(e) => onCambio({ cargo: e.target.value })}
          />
          {errores.cargo && <p className="ne-error">{errores.cargo}</p>}
        </label>

        <ListaAuxiliar
          etiqueta="Agencia"
          columna="agencia_bdp"
          valor={identidad.agencia}
          opciones={agencias}
          error={errores.agencia}
          onCambio={(agencia) => onCambio({ agencia })}
        />

        <ListaAuxiliar
          etiqueta="Gerencia"
          columna="gerencia_bdp"
          valor={identidad.gerencia}
          opciones={gerencias}
          error={errores.gerencia}
          onCambio={(gerencia) => onCambio({ gerencia })}
        />

        <div className="ne-rejilla-ancho">
          <SelectorFecha
            etiqueta="Fecha de ingreso"
            requerido
            valor={identidad.fechaIngreso}
            error={errores.fechaIngreso}
            descripcion="Se puede escribir (15/03/2026) o elegir en el calendario."
            onCambio={(fechaIngreso) => onCambio({ fechaIngreso })}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Desplegable alimentado por la hoja `Auxiliar`.
 *
 * ── Por qué también se puede escribir ──────────────────────────────────
 * Porque el día que abre una agencia nueva, el catalogo todavía no la tiene, y un
 * desplegable cerrado impediría registrar a esa persona hasta que alguien
 * mantenga una lista. Se ofrece la lista, se avisa cuando el valor escrito no
 * está en ella, y se deja continuar: el backend acepta el valor y lo suma al
 * catalogo, del que nunca se quita nada.
 *
 * Se usa `datalist` y no un desplegable propio a propósito: es un campo de texto
 * con sugerencias nativas, con lo que funciona con teclado, con lector de pantalla
 * y en móvil sin una línea de JavaScript.
 */
function ListaAuxiliar({
  etiqueta,
  columna,
  valor,
  opciones,
  error,
  onCambio,
}: {
  etiqueta: string;
  columna: string;
  valor: string;
  opciones: string[];
  error?: string;
  onCambio: (valor: string) => void;
}) {
  const idLista = `ne-lista-${columna}`;
  const fueraDeCatalogo =
    valor.trim().length > 0 &&
    opciones.length > 0 &&
    !opciones.some((o) => o.trim().toUpperCase() === valor.trim().toUpperCase());

  return (
    <label className="doc-campo">
      <span className="doc-eyebrow">
        {etiqueta} <span style={{ color: "var(--doc-danger)" }}>*</span>
      </span>
      <input
        type="text"
        className="doc-input"
        list={idLista}
        value={valor}
        aria-invalid={error ? true : undefined}
        placeholder={opciones.length ? "Elige o escribe" : "Escribe el valor"}
        onChange={(e) => onCambio(e.target.value)}
      />
      <datalist id={idLista}>
        {opciones.map((opcion) => (
          <option key={opcion} value={opcion} />
        ))}
      </datalist>
      {error ? (
        <p className="ne-error">{error}</p>
      ) : fueraDeCatalogo ? (
        <p className="ne-ayuda">No está en la columna {columna} de la hoja Auxiliar. Se registrará y se añadirá al catálogo.</p>
      ) : (
        <p className="ne-ayuda">
          {opciones.length
            ? `${opciones.length} opciones desde la columna ${columna}.`
            : `La columna ${columna} de la hoja Auxiliar todavía está vacía.`}
        </p>
      )}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Paso 3 · Categoría                                                  */
/* ------------------------------------------------------------------ */

function PasoCategoria({ elegida, onElegir }: { elegida: string; onElegir: (def: CategoriaDef) => void }) {
  return (
    <>
      <div className="ne-seccion-titulo">
        <h3>Tipo de funcionario</h3>
        <p className="ne-ayuda">
          Un expediente pertenece a una sola categoría, y desde aquí solo verá los documentos de la suya.
        </p>
      </div>

      <div className="ne-categorias">
        {categoriasOfrecidas().map((def) => (
          <button
            key={def.codigo}
            type="button"
            className="ne-categoria doc-tap"
            style={{ ["--ne-color" as string]: def.color }}
            data-elegida={elegida === def.codigo ? "si" : undefined}
            disabled={!def.activa}
            aria-pressed={elegida === def.codigo}
            onClick={() => onElegir(def)}
          >
            <span className="ne-categoria-icono">
              <IconoCategoria categoria={def} className="h-5 w-5" />
            </span>
            <p className="ne-categoria-nombre">{def.etiqueta}</p>
            <p className="ne-categoria-descripcion">{def.descripcion}</p>
            {!def.activa && (
              <span className="ne-categoria-nota">
                <AlertTriangle className="h-3 w-3" aria-hidden /> {def.nota ?? "En construcción"}
              </span>
            )}
            {elegida === def.codigo && (
              <span className="ne-categoria-nota" style={{ background: "var(--doc-success-bg)", color: "var(--doc-success-fg)" }}>
                <Check className="h-3 w-3" aria-hidden /> Elegida
              </span>
            )}
          </button>
        ))}
      </div>

      {/* La categoría heredada no se ofrece, pero se explica: si alguien abre un
          expediente antiguo y ve «Funcionario general», tiene que poder entender de
          dónde sale. */}
      <p className="ne-ayuda">
        Los expedientes creados antes de esta versión aparecen como «
        {CATEGORIAS.find((c) => c.codigo === "GENERAL")?.etiqueta}». Es una categoría heredada: se conserva para poder leerlos, y ya no
        se asigna a expedientes nuevos.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Paso 4 · Garantía                                                   */
/* ------------------------------------------------------------------ */

function PasoGarantia({
  categoria,
  elegida,
  onElegir,
}: {
  categoria: CategoriaDef;
  elegida: string;
  onElegir: (codigo: CodigoGarantia) => void;
}) {
  return (
    <>
      <div className="ne-seccion-titulo">
        <h3>Seleccione tipo de garantía</h3>
        <p className="ne-ayuda">Cada tipo lleva a una lista de documentos distinta. Se puede cambiar después sin perder lo capturado.</p>
      </div>

      <div className="ne-garantias">
        {(categoria.garantias ?? []).map((def) => (
          <button
            key={def.codigo}
            type="button"
            className="ne-categoria doc-tap"
            style={{ ["--ne-color" as string]: categoria.color }}
            data-elegida={elegida === def.codigo ? "si" : undefined}
            aria-pressed={elegida === def.codigo}
            onClick={() => onElegir(def.codigo)}
          >
            <span className="ne-categoria-icono">
              <BadgeCheck className="h-5 w-5" aria-hidden />
            </span>
            <p className="ne-categoria-nombre">{def.etiqueta}</p>
            <p className="ne-categoria-descripcion">{def.descripcion}</p>
            <ul className="ne-caracteristicas">
              {def.caracteristicas.map((rasgo) => (
                <li key={rasgo}>{rasgo}</li>
              ))}
            </ul>
            <p className="ne-ayuda">{def.requisitos.length} documentos</p>
          </button>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Bloque de documentos                                                */
/* ------------------------------------------------------------------ */

function BloqueDocumentos({
  titulo,
  descripcion,
  caracteristicas,
  requisitos,
  valorDe,
  onCambio,
}: {
  titulo: string;
  descripcion?: string;
  caracteristicas?: string[];
  requisitos: RequisitoDef[];
  valorDe: (codigo: string) => ValorRequisito;
  onCambio: (codigo: string, patch: Partial<ValorRequisito>) => void;
}) {
  return (
    <section className="ne-panel">
      <div className="ne-seccion-titulo">
        <h3>{titulo}</h3>
        <p className="ne-ayuda">{requisitos.length} documentos</p>
      </div>
      {descripcion && <p className="ne-ayuda">{descripcion}</p>}
      {caracteristicas && caracteristicas.length > 0 && (
        <ul className="ne-caracteristicas">
          {caracteristicas.map((rasgo) => (
            <li key={rasgo}>{rasgo}</li>
          ))}
        </ul>
      )}

      <ul className="ne-requisitos">
        {requisitos.map((requisito, indice) => (
          <FilaRequisito
            key={requisito.codigo}
            requisito={requisito}
            indice={indice}
            valor={valorDe(requisito.codigo)}
            onCambio={(patch) => onCambio(requisito.codigo, patch)}
          />
        ))}
      </ul>
    </section>
  );
}
