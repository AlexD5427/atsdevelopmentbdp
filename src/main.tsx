import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { instalarGuardiaDeInterfaz } from "./shared/interfazViva";
import "./index.css";

/**
 * El guardia de interfaz se instala ANTES de montar React y fuera de su árbol.
 *
 * Fuera, porque el síntoma que resuelve —la página deja de aceptar ratón y
 * teclado al salir de un panel— aparecía en varios módulos, no solo en
 * Documentación, y porque si el problema estuviera en el propio árbol de React,
 * una red dibujada por React no llegaría a aparecer.
 *
 * Antes, porque la primera pantalla también puede quedarse inerte.
 */
instalarGuardiaDeInterfaz();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
