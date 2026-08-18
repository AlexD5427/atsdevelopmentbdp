# Documentación · categorías de funcionario, expediente nuevo e informe mensual

Guía de puesta en marcha y de arquitectura de esta iteración del módulo.

Está escrita para seguirse **sin saber Git, ni Vercel, ni Apps Script**. Cada paso
dice qué hacer, dónde, y cómo comprobar que salió bien antes de pasar al siguiente.
Si algo no coincide con lo que se describe, para y mira la
[tabla de síntomas](#11-si-algo-no-cuadra).

---

## 1. Qué cambia, en cuatro frases

1. **El módulo vuelve a conectar.** Apuntaba al Apps Script del dashboard de
   talento en lugar de al suyo, y como los dos son URLs de `script.google.com`, se
   declaraba conectado y fallaba con un mensaje que no decía nada.
2. **La pantalla ya no se queda muerta** al salir de Configuración o de Perfiles.
   Era una transición de vista abortada que dejaba una capa invisible por encima
   de todo comiéndose el ratón y el teclado.
3. **El formulario de Nuevo Expediente es otro**: identidad, generales, categoría
   de funcionario, tipo de garantía y requisitos de la categoría. Cada expediente
   pertenece a **una sola** categoría y solo ve los documentos de la suya.
4. **Hay informe mensual** en Excel, Word y PDF, categorizado y por persona.

---

## 2. El orden de los pasos, y por qué importa

| # | Paso | Dónde | ¿Se puede deshacer? |
|---|---|---|---|
| A | Fusionar el PR | GitHub | Sí |
| B | Pegar `22_Categorias.gs` | Apps Script | Sí |
| C | Ejecutar `docActualizarCatalogoV2()` | Apps Script | Sí, con matices |
| D | Publicar una **versión nueva** de la implementación | Apps Script | Sí |
| E | Poner la URL `/exec` en la aplicación | Vercel o Configuración | Sí |
| F | Ejecutar `docVerificarModuloDocumentacion()` | Apps Script | Solo lee |
| G | Comprobar en la web | Navegador | — |

> [!IMPORTANT]
> **No adelantes el paso E.** Si la aplicación nueva queda publicada antes de que
> el catálogo del libro esté en la versión 2, el formulario preguntará por cuatro
> documentos que el expediente **no va a tener**, y lo que alguien rellene en esos
> cuatro se pierde. El formulario lo detecta y avisa, pero es mejor no llegar ahí.

---

## 3. Paso A · Fusionar el PR en GitHub

1. Abre el repositorio en el navegador: `github.com/AlexD5427/atsdevelopmentbdp`.
2. Pestaña **Pull requests**. Entra en el PR de esta rama
   (`claude/documentacion-categorias-informe-mensual`).
3. Baja hasta el recuadro verde y pulsa **Merge pull request** y luego **Confirm
   merge**.
4. Vercel empieza a construir solo. Para verlo: `vercel.com` → el proyecto →
   **Deployments**. La entrada de arriba es la nueva.
5. **Espera a que diga `Ready`.** Si dice `Error`, abre el despliegue, pulsa
   **Building** y busca la primera línea que empiece por `error TS`. Ese texto es
   lo que hay que arreglar; avísame con esa línea y lo corrijo.

> El build de Vercel corre `tsc -b && vite build`. **No corre las pruebas**, así
> que una prueba en rojo no impide el despliegue. Lo que sí lo impide es un error
> de tipos.

---

## 4. Paso B · Pegar el archivo nuevo en Apps Script

Este PR añade **un** archivo al backend y no modifica ninguno de los otros 22.

1. Abre la hoja de cálculo de Documentación.
2. Menú **Extensiones › Apps Script**. Se abre el editor en otra pestaña.
3. En la lista de archivos de la izquierda, comprueba que están los 22 de siempre
   (`00_Manifest` … `21_Api`). Si falta alguno, para: primero hay que completar el
   despliegue base con `docs/modules/DOCUMENTACION_DESPLIEGUE.md`.
4. Pulsa el **+** de arriba de la lista → **Secuencia de comandos**.
5. Ponle exactamente este nombre, sin la extensión: `22_Categorias`
   El editor le añade el `.gs` él solo. **El número 22 no es decorativo**: Apps
   Script pega los archivos en orden y este necesita que los otros ya estén
   cargados.
6. Vuelve al repositorio en GitHub, abre
   `apps-script/documentacion/22_Categorias.gs`, pulsa el botón de **copiar** (el
   icono de dos hojas, arriba a la derecha del código).
7. En el editor de Apps Script, borra lo que haya en el archivo nuevo (`Ctrl+A` y
   `Supr`) y pega.
8. Guarda con el icono del disquete o `Ctrl+S`.

**Comprobación:** en el desplegable de funciones de la barra de arriba deben
aparecer ahora `docActualizarCatalogoV2` y `docVerificarModuloDocumentacion`. Si no
aparecen, el archivo no se guardó o tiene un error; mira el panel inferior.

---

## 5. Paso C · Actualizar el catálogo del libro

Esto es lo que hace que el libro pida los mismos documentos que el formulario.

1. En el editor, en el desplegable de funciones, elige **`docActualizarCatalogoV2`**.
2. Pulsa **Ejecutar**.
3. La primera vez Google pedirá permisos: **Revisar permisos ›** tu cuenta **›**
   *Avanzado* **›** *Ir a … (no seguro)* **› Permitir**. Es tu propio script; el
   aviso sale porque no está verificado por Google.
4. Abre **Registro de ejecución** (abajo). Verás algo así:

   ```
   Catalogo v2: 4 creados, 12 actualizados, 19 sin cambio.
   ```

**Qué acaba de pasar:**

- se crearon los cuatro requisitos que faltaban —`garante-fam-ci`,
  `garante-fam-croquis`, `garante-croquis-domicilio`, `titular-ci`—;
- se corrigió a quién le toca cada documento; en particular, **la acreditación
  LGI/FT deja de aplicarse a Auditoría**, que era la mezcla de categorías;
- se crearon las cabeceras `agencia_bdp` y `gerencia_bdp` en la hoja `Auxiliar` si
  faltaban.

**Es idempotente.** Puedes ejecutarla otra vez: la segunda dirá `0 creados, 0
actualizados`. No duplica nada y **no toca** los nombres visibles ni las
descripciones si el área los editó.

> [!NOTE]
> **Sobre deshacer este paso.** No borra nada, así que no hay pérdida. Lo que no se
> deshace automáticamente son los cuatro requisitos nuevos: si hicieras marcha
> atrás, quedarían en la hoja `CatalogoDocumentos` sin usarse. Para retirarlos, pon
> su columna `activo` en `FALSE`; nunca borres la fila, porque un expediente puede
> referenciarla.

---

## 6. Paso D · Publicar una versión nueva

**Guardar el archivo no basta.** La aplicación web sirve la última *versión
publicada*, no lo que hay en el editor. Este es el error que más veces parece un
fallo del código y no lo es.

1. Arriba a la derecha: **Implementar › Gestionar implementaciones**.
2. En la implementación que ya existe, pulsa el **lápiz** (Editar).
3. En **Versión**, elige **Versión nueva**.
4. Comprueba que dice:
   - **Ejecutar como:** *Yo* (tu cuenta).
   - **Quién tiene acceso:** **Cualquier usuario**.

   Si pone *Solo yo*, el resto del equipo recibirá la pantalla de inicio de sesión
   de Google y la aplicación dirá `AUTENTICACION`.
5. **Implementar**.
6. Copia la **URL de la aplicación web**. Termina en `/exec`.

> Si creas una implementación *nueva* en lugar de una versión nueva de la que ya
> existe, la URL cambia y hay que rehacer el paso E.

---

## 7. Paso E · Decirle a la aplicación cuál es su backend

Hasta este PR, el módulo usaba por defecto la URL del **dashboard de talento**, que
es otro proyecto de Apps Script con otro libro y otro contrato. De ahí que «dejara
de conectar». Ahora la URL de Documentación es suya y hay que darla. Dos formas; la
primera es la buena para todo el equipo.

### Opción 1 · Variable de entorno en Vercel (recomendada)

1. `vercel.com` → el proyecto → **Settings › Environment Variables**.
2. **Add New**:
   - **Key:** `VITE_DOC_SCRIPT_URL`
   - **Value:** la URL `/exec` del paso D
   - **Environments:** marca *Production*, *Preview* y *Development*.
3. **Save**.
4. **Deployments ›** el último **›** menú `⋯` **› Redeploy**. Las variables se leen
   al construir: sin volver a desplegar, no surte efecto.

Ventaja: vale para todos, en cualquier navegador, sin que nadie configure nada.

### Opción 2 · Desde la propia aplicación

Abre **Documentación › Configuración › Conexión** y pega la URL. Se guarda **en
ese navegador**, así que hay que repetirlo en cada equipo. Sirve para probar
rápido o para apuntar a un despliegue de pruebas sin tocar Vercel.

**La aplicación valida la URL antes de gastar una petición.** Los tres errores
habituales y lo que dirá:

| Lo que se pegó | Lo que dice |
|---|---|
| La URL de la hoja (`docs.google.com/...`) | «Esa es la URL del libro de cálculo, no la del script» |
| La de prueba (`.../dev`) | «Solo funciona para quien edita el script» |
| La del editor (`.../edit`) | «Hace falta la de la implementación, que termina en /exec» |
| La del dashboard de talento | «Esa URL es la del Apps Script del dashboard» |

---

## 8. Paso F · Que el propio backend se revise

1. En el editor de Apps Script, elige la función
   **`docVerificarModuloDocumentacion`** y pulsa **Ejecutar**.
2. Abre el **Registro de ejecución**. Debería quedar así:

   ```
   VERIFICACION OK
   [OK]    El script apunta a un libro
   [OK]    Las 19 hojas del modelo existen
   [OK]    La hoja Auxiliar tiene agencia_bdp y gerencia_bdp
   [OK]    El catalogo tiene los 35 requisitos en la version 2
   [OK]    Cada rama pide exactamente sus requisitos
   [OK]    doPost contesta el sobre de Documentacion
   ```

Cada línea en `[FALLA]` trae debajo su **Remedio**. Las cifras de la quinta
comprobación son las del acta y conviene conocerlas, porque son la prueba de que
las categorías no se mezclan:

| Rama | Requisitos |
|---|---|
| Comercial · Tipo 1 | 18 generales + 5 de garantía = **23** |
| Comercial · Tipo 2 | 18 + 9 = **27** |
| Comercial · Tipo 3 | 18 + 5 = **23** |
| Auditoría | 18 + 1 = **19** |
| Cumplimiento | 18 + 2 = **20** |
| General (heredada) | **18** |

Solo lee. No escribe una fila, no manda un correo y no crea un expediente de
prueba.

---

## 9. Paso G · Comprobar en la web

Abre la aplicación y recarga con `Ctrl+F5`. Recorre esta lista; el orden importa
porque cada punto depende del anterior.

- [ ] El punto del dock está **verde**, no rojo.
- [ ] Entras en **Documentación** y ves el panel con datos, no la pantalla de
      «sin conexión».
- [ ] Arriba hay dos botones: **Informe mensual** y **Nuevo expediente**.
- [ ] **La prueba del congelamiento:** entra en Configuración, abre el panel,
      pulsa guardar y salir, y comprueba que la página **sigue respondiendo** al
      ratón. Repítelo en Perfiles.
- [ ] Pulsa **Nuevo expediente**. No debe salir el aviso «el catálogo del libro se
      quedó en la versión anterior». Si sale, falta el paso C.
- [ ] Los desplegables de **Agencia** y **Gerencia** traen opciones (ver §10).
- [ ] El **calendario** de la fecha de ingreso se abre y se maneja con las flechas.
- [ ] Registra un expediente de prueba **Comercial · Tipo 2**: deben salir los 9
      documentos de garantía del Tipo 2 y **ninguno** del Tipo 1 o del 3.
- [ ] Los chips cambian de color al pulsarlos: verde, amarillo, rojo.
- [ ] En **Certificados de trabajo**, registra una prórroga: la fila se pinta en
      ámbar y muestra los días que quedan.
- [ ] **GUARDAR Y ABRIR EXPEDIENTE** crea el expediente y lo abre.
- [ ] En el expediente abierto se ven **Cargo, Agencia y Fecha de ingreso**, y el
      icono de color de la categoría.
- [ ] En la hoja, la fila del expediente está en `Expedientes` y sus requisitos en
      `ExpedienteDocumentos` con los estados que marcaste.
- [ ] **Informe mensual** → mes actual → **Generar** → descarga en Excel y en Word,
      y **PDF** abre el diálogo de impresión.

Borra el expediente de prueba desde la propia consola cuando termines.

---

## 10. Poblar las agencias y las gerencias

Los dos desplegables leen la hoja **`Auxiliar`**, una columna por catálogo:

| Columna | Qué alimenta |
|---|---|
| `agencia_bdp` | El desplegable de Agencia |
| `gerencia_bdp` | El desplegable de Gerencia |

Para añadir valores, escríbelos **debajo de la cabecera, uno por celda**. Se leen
en cuanto se recarga la página (la caché del catálogo dura diez minutos como
máximo).

Tres reglas:

1. **No se quita nunca un valor.** Una agencia que ya cerró sigue siendo necesaria
   para leer los expedientes antiguos.
2. **No hace falta que la lista esté completa para trabajar.** Los dos campos
   admiten texto escrito a mano: si abre una agencia nueva, se registra igual y la
   aplicación avisa de que ese valor no estaba en el catálogo. Un desplegable
   cerrado impediría dar de alta a esa persona hasta que alguien mantuviera una
   lista.
3. **Ojo con los espacios.** `LA PAZ` y `LA PAZ ` son dos valores distintos para el
   informe. El diagnóstico del módulo los reporta y **no** los corrige solo:
   fusionarlos cambiaría el texto que alguien escribió, y esa decisión es del área.

---

## 11. Si algo no cuadra

| Síntoma | Causa más probable | Qué hacer |
|---|---|---|
| «No hay un backend configurado» | Falta el paso E | Poner `VITE_DOC_SCRIPT_URL` y volver a desplegar |
| «Esa URL es la del Apps Script del dashboard» | Se pegó la URL del otro proyecto | Copiar la del proyecto de Documentación |
| `AUTENTICACION` | La implementación es privada | Paso D con *Cualquier usuario* |
| `PERMISOS_BACKEND` | Al despliegue le caducaron los permisos | Ejecutar cualquier función a mano, aceptar permisos, publicar versión nueva |
| `SIN_SOBRE` | La implementación no está al día | Paso D otra vez: **versión nueva**, no guardar |
| Aviso del catálogo desfasado | Falta el paso C | Ejecutar `docActualizarCatalogoV2()` |
| Un auditor ve preguntas de cumplimiento | El paso C no llegó a aplicarse | `docVerificarModuloDocumentacion()` y mirar la quinta comprobación |
| «N documento(s) no se guardaron» al crear | El catálogo no conoce esos códigos | Paso C, y volver a marcarlos en el expediente |
| «Un expediente quedó a medias» | La segunda fase del guardado se cayó | Pulsar **Reintentar solo eso**. El expediente ya existe: no lo crees otra vez |
| La pantalla se congela | Una capa huérfana | Pulsa **Escape tres veces**, o el botón **Desbloquear pantalla**. Y avísame: eso no debería seguir pasando |
| El informe tarda mucho | Es una petición por expediente | Normal. La barra dice por cuál va |
| El PDF no se abre | El navegador bloqueó la ventana | Permitir ventanas emergentes del sitio |

---

## 12. Cómo revertir

| Qué revertir | Cómo | Consecuencia |
|---|---|---|
| El frontend entero | En GitHub, el PR fusionado → **Revert** → fusionar | Vuelve el formulario anterior. El catálogo v2 se queda, y no molesta |
| Solo el formulario nuevo | En `DocumentacionConsola.tsx`, `altaAbierta={false}` → `altaAbierta={altaAbierta}` | Vuelve el alta de `SeccionExpedientes`, intacta |
| La URL del backend | Quitar `VITE_DOC_SCRIPT_URL` y redesplegar | El módulo vuelve a decir «sin configurar» |
| El catálogo v2 | `activo = FALSE` en los cuatro códigos nuevos | Dejan de pedirse. **No borres las filas** |

El backend anterior a este PR no se ha tocado, así que revertir el frontend deja el
libro funcionando igual.

---

## 13. Arquitectura, para quien audita el código

### Una sola declaración manda

```
src/features/documentacion/domain/categorias.ts   ← la estructura, como dato
        │
        ├─ NuevoExpediente.tsx        recorre la declaración; no la conoce
        ├─ DocExpedienteHeader.tsx    color e icono de la categoría
        └─ export/informeMensual.ts   agrupa el informe por categoría

apps-script/documentacion/22_Categorias.gs        ← la MISMA lista, en el libro
```

Añadir una categoría es añadir un objeto a `CATEGORIAS` **y** su entrada en
`doc2CatalogoSemillaV2_()`. No hay un solo `if (categoria === ...)` en la interfaz.

Las dos copias tienen que decir lo mismo, y por eso `catalogoCoincide()` las
compara al abrir el formulario y avisa si el libro se quedó atrás. Es la parte
frágil del diseño y conviene saberlo: la alternativa —que el frontend construya el
formulario solo desde el catálogo del libro— dejaría el orden de las preguntas y
el texto de cada bloque de observaciones a merced de una hoja de cálculo editable.

### El guardado, en dos fases

```
1. expediente.crear      → el backend siembra los requisitos desde su catálogo
2. expediente.obtener    → de ahí salen los expedienteDocumentoId
3. requisitos.guardar    → los estados capturados, en una llamada
4. prorroga.crear        → una por prórroga, tolerante a fallo individual
```

Si el paso 3 falla, **el expediente ya existe**. Lo capturado queda en
`localStorage` (`bdp-doc-nuevo-expediente-pendiente`) y el aviso ofrece reintentar
solo eso. Decir «no se pudo crear» haría que alguien lo repitiera y acabara con dos.

### El congelamiento

`document.startViewTransition()` monta el pseudo-elemento `::view-transition`, una
capa a pantalla completa que recibe el input y se retira al resolverse `finished`.
Si la transición se **aborta** —y se aborta sola cuando dos elementos comparten
`view-transition-name`— y nadie escucha esa promesa, la capa no se retira nunca.

Tres cierres: se escuchan las tres promesas, hay un vigilante de 1,2 s que corta la
transición, y los nombres se reparten desde un registro que garantiza unicidad.
Más `shared/interfazViva.ts`, que es una red global e independiente de React:
detecta los cinco estados en los que la página queda inerte sin haber un modal
abierto y los deshace en el propio evento de entrada. Nunca actúa si hay un diálogo
de verdad abierto (`[aria-modal="true"]`, `dialog[open]`,
`[data-bloqueo-scroll="activo"]`).

### Archivos

| Archivo | Qué hace |
|---|---|
| `shared/interfazViva.ts` | Guardia global contra la página inerte |
| `domain/categorias.ts` | Las categorías y sus requisitos, como dato |
| `ui/NuevoExpediente.tsx` | El formulario completo |
| `ui/SelectorFecha.tsx` | Calendario con teclado |
| `ui/FilaRequisito.tsx` | Chips, observaciones y prórroga |
| `ui/IconosCategoria.tsx` | Los cuatro iconos SVG |
| `ui/InformeMensualPanel.tsx` | El panel del informe |
| `export/informeMensual.ts` | El modelo del informe y sus tres salidas |
| `export/docx.ts` | Generador de `.docx` |
| `ui/nuevo-expediente.css` | Capa visual y de movimiento |
| `apps-script/documentacion/22_Categorias.gs` | Catálogo v2, Auxiliar y autoverificación |

---

## 14. Lo que NO está probado

Esto no suele ponerse en una guía. Aquí hace falta, porque el código se escribió
sin poder ejecutar el proyecto ni el libro.

**Sí se comprobó:** la sintaxis del `.gs` y su motor de aplicabilidad, ejecutado
contra las seis ramas y devolviendo exactamente las cifras del §8. Y que no hay
códigos duplicados en las 35 definiciones.

**No se pudo comprobar:**

1. **El typecheck y el build.** Un error de tipos pararía el despliegue de Vercel.
   Es lo primero que dirá el paso A.
2. **Las pruebas existentes.** Alguna que dé por hecho que el cliente del módulo
   arranca con `SCRIPT_URL` fallará, porque ahora arranca vacío. Es un cambio
   buscado; hay que actualizar la prueba, no el código. No afecta al despliegue.
3. **El contrato exacto de `requisitos.guardar`.** No está documentado en el
   repositorio. Se envían `estado` y `estado_documental` a la vez y las fechas en
   las dos convenciones de nombre: un backend con lista blanca se queda con la que
   conoce. Está marcado con un `TODO(contrato)` y se deja una sola en cuanto se
   confirme cuál es. **Es lo primero que hay que mirar si los chips no llegan a la
   hoja.**
4. **El `.docx` abriéndose en Word.** El XML es correcto y mínimo, pero Word es
   quisquilloso. Si se queja, avísame con el mensaje exacto.
5. **La aparición real del congelamiento.** Se identificó el mecanismo leyendo el
   código, no reproduciéndolo en un navegador. Si vuelve a pasar después de esto,
   el botón de rescate y el registro de desbloqueos dirán por dónde seguir.
