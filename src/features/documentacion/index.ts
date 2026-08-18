/**
 * Barril del módulo de Documentación.
 *
 * La aplicación importa desde aquí y no de las carpetas internas: así el módulo
 * puede reorganizarse por dentro sin tocar `App.tsx`. Se exportan la consola, el
 * cliente y el dominio, que es lo que otros módulos podrían necesitar; no se
 * exportan las secciones ni las piezas de interfaz, que son detalle interno.
 *
 * La declaración de categorías SÍ sale: el perfil del postulante y el tablero
 * pintan la categoría de una persona, y tienen que pintarla con el mismo color y
 * el mismo icono que el expediente.
 */

export { DocumentacionConsola } from "./ui/DocumentacionConsola";
export { VistaLocal } from "./ui/VistaLocal";
export { docApi } from "./api/acciones";
export { DocError, configurarCliente, hayBackendConfigurado, diagnosticarConexion, problemaDeUrl, urlBienFormada } from "./api/client";
export * from "./domain/vocabulario";
export * from "./domain/progreso";
export {
  CATEGORIAS,
  GARANTIAS,
  GENERALES,
  bloquesDe,
  categoria,
  categoriasOfrecidas,
  catalogoCoincide,
  codigosDeclarados,
  exigeGarantia,
  garantia,
  normalizarIdentificador,
  partirIdentificador,
  problemaDeIdentificador,
  requisitosDe,
} from "./domain/categorias";
export type { CategoriaDef, CodigoCategoria, CodigoGarantia, EstadoDoc, GarantiaDef, RequisitoDef } from "./domain/categorias";
export { IconoCategoria, IconoPorCodigo } from "./ui/IconosCategoria";
export { construirXlsx, descargarXlsx, unirLotes, nombreConFecha } from "./export/xlsx";
export { construirDocx, descargarDocx } from "./export/docx";
export {
  construirInformeMensual,
  descargarInformeExcel,
  descargarInformeWord,
  imprimirInformePdf,
  libroDelInforme,
  rangoDelMes,
} from "./export/informeMensual";
export type { InformeMensual, CategoriaInforme, PersonaInforme, RequisitoInforme } from "./export/informeMensual";
