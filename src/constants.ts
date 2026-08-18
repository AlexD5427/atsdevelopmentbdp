import {
  LayoutDashboard,
  BarChart3,
  Users,
  GitCompareArrows,
  Workflow,
  ClipboardList,
  ListChecks,
  FolderCheck,
  Settings,
} from "lucide-react";
import { PerfilCargoIcon } from "./components/icons/CustomIcons";
import type { DrawableIcon } from "./components/DrawIcon";
import type { ModuleId } from "./types";

/**
 * Single source of truth — the Google Apps Script endpoint.
 * Every fetch to this URL MUST pass `{ redirect: "follow" }` so Google's 302
 * redirect is followed in production (Vercel), otherwise it 404s.
 */
export const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby5iqFsfvuL6movHAfZ46CZZuND22M1J-R-D3BLv2mx-a8lmRa_AePbmV59jPRTA-hczQ/exec";

/**
 * Endpoint del módulo de Documentación — OTRO proyecto de Apps Script.
 *
 * ── Por qué no es `SCRIPT_URL` ───────────────────────────────────────────
 * Documentación tiene su propio libro (las 19 hojas normalizadas y las pestañas
 * `CONTROL INGRESOS <año>`) y su propio despliegue, el de
 * `apps-script/documentacion/`. Son dos backends distintos que hablan idiomas
 * distintos: el del dashboard responde `{ candidatos, competencias,
 * arquetipos_disc }` a un GET; el de Documentación responde el sobre
 * `{ ok, accion, datos, meta }` a acciones `documentacion.*`.
 *
 * El cliente del módulo usaba `SCRIPT_URL` como valor por defecto, y como la URL
 * del dashboard también empieza por `https://script.google.com/`, la comprobación
 * de «hay backend configurado» la daba por buena. El módulo se declaraba
 * conectado y mandaba sus acciones al proyecto equivocado, que contestaba 200 con
 * un JSON válido y sin campo `ok`. De ahí el «el backend rechazó la operación»
 * sin más explicación.
 *
 * ── Por qué vacía por defecto ──────────────────────────────────────────
 * Porque la URL depende de CADA despliegue: al publicar una versión nueva de la
 * aplicación web, Google emite otro identificador. Codificarla aquí obligaría a
 * un commit y a un despliegue de Vercel cada vez que se republica el Apps
 * Script. Se resuelve en este orden:
 *
 *   1. `VITE_DOC_SCRIPT_URL` del entorno (Vercel → Environment Variables);
 *   2. lo que se haya guardado en el navegador desde Configuración › Conexión;
 *   3. vacía → el módulo dice «sin configurar» y explica qué pegar y dónde.
 *
 * Vacía es la respuesta honesta. Lo que no puede volver a pasar es que apunte en
 * silencio a otro backend.
 */
function urlDocumentacionDelEntorno(): string {
  try {
    const entorno = import.meta.env as Record<string, string | undefined> | undefined;
    return String(entorno?.VITE_DOC_SCRIPT_URL ?? "").trim();
  } catch {
    return "";
  }
}

export const SCRIPT_URL_DOCUMENTACION = urlDocumentacionDelEntorno();

/** Clave con la que se recuerda la URL de Documentación en este navegador. */
export const CLAVE_URL_DOCUMENTACION = "bdp-documentacion-url";

export interface DockItem {
  id: ModuleId;
  label: string;
  icon: DrawableIcon;
}

/** Navigation modules — icon + short label, Dashboard leads as the home. */
export const DOCK_ITEMS: DockItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "tablero", label: "Tablero", icon: BarChart3 },
  { id: "cara-a-cara", label: "Cara a Cara", icon: Users },
  { id: "comparador", label: "Comparador", icon: GitCompareArrows },
  { id: "procesos", label: "Procesos", icon: Workflow },
  { id: "evaluaciones", label: "Evaluaciones", icon: ClipboardList },
  { id: "postulantes", label: "Postulantes", icon: ListChecks },
  { id: "perfiles", label: "Perfiles", icon: PerfilCargoIcon },
  { id: "documentacion", label: "Documentación", icon: FolderCheck },
  { id: "configuracion", label: "Configuración", icon: Settings },
];

/** Estado civil options. */
export const ESTADO_CIVIL_OPTIONS = [
  "Soltero/a",
  "Casado/a",
  "Conviviente / Unión Libre",
  "Divorciado/a",
  "Viudo/a",
] as const;

/** Academic level options. */
export const NIVEL_ACADEMICO_OPTIONS = [
  "Bachiller",
  "Técnico Medio",
  "Técnico Superior",
  "Egresado Técnico Medio",
  "Egresado Técnico Superior",
  "Licenciatura",
] as const;

/** Departments of residence (Bolivia) — "N/A" leads the list. */
export const DEPARTAMENTO_OPTIONS = [
  "N/A",
  "Beni",
  "Chuquisaca",
  "Cochabamba",
  "La Paz",
  "Oruro",
  "Pando",
  "Potosí",
  "Santa Cruz",
  "Tarija",
] as const;

/** DISC behavioural archetypes and their meanings now come from the backend
 * ("Auxiliar" sheet, `arquetipo_disc` column), parsed in `lib/disc.ts` with a
 * built-in fallback catalogue. See `DiscSelect` / `DiscInfoButton`. */

/** Reliability — "Confiabilidad e Integridad". */
export const CONFIABILIDAD_OPTIONS = [
  "N/A",
  "Confiable",
  "Confiabilidad Media",
  "No Confiable",
] as const;

/**
 * Explicit, labelled risk scale shared by every "riesgo" field of the intake
 * form — Integridad, Robo and Mentira. The "Riesgo …" wording is what gets
 * stored in the database (per the brief), and each option carries a semantic
 * colour: verde = riesgo bajo, amarillo = riesgo medio, rojo = riesgo alto.
 * "N/A" is the only option without the "Riesgo" prefix.
 */
export const NIVEL_RIESGO_ETIQUETADO_OPTIONS = [
  "N/A",
  "Riesgo Bajo",
  "Riesgo Medio",
  "Riesgo Alto",
] as const;

/** Level scale used by the knowledge / tools list builders. */
export const NIVEL_ITEM_OPTIONS = ["Bajo", "Medio", "Alto"] as const;

/** Capacity limits for the form's list builders. */
export const MAX_COMPETENCIAS = 7;
export const MAX_CONOCIMIENTOS = 7;
export const MAX_HERRAMIENTAS = 5;
