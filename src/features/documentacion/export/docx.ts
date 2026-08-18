/**
 * Generador de documentos de Word (.docx) en el navegador.
 *
 * ── Por qué un `.docx` de verdad ──────────────────────────────────────
 * El atajo clásico es servir HTML con la extensión `.doc`: Word lo abre, y luego
 * avisa de que el formato no coincide, no pagina bien y no se puede firmar
 * digitalmente. Para un informe que se archiva, eso no vale.
 *
 * Un `.docx` es un ZIP con XML dentro, igual que un `.xlsx`. Se generan las cinco
 * piezas mínimas que Word, LibreOffice y Google Docs aceptan sin quejarse:
 *
 *   [Content_Types].xml            qué tipo es cada pieza
 *   _rels/.rels                    la relación raíz hacia el documento
 *   word/document.xml              el contenido
 *   word/_rels/document.xml.rels   la relación del documento con sus estilos
 *   word/styles.xml                los estilos de encabezado y de texto
 *
 * Se reutiliza `fflate`, que ya está en el proyecto por el generador de Excel: un
 * informe en tres formatos no debería añadir ni una dependencia.
 */

import { zipSync, strToU8 } from "fflate";

export type BloqueDocx =
  | { tipo: "titulo"; nivel: 1 | 2 | 3; texto: string }
  | { tipo: "parrafo"; texto: string; tenue?: boolean }
  | { tipo: "tabla"; cabecera: string[]; filas: (string | number)[][]; anchos?: number[] }
  | { tipo: "saltoPagina" };

function escapar(valor: string): string {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Los caracteres de control invalidan el XML y Word se niega a abrir el archivo
    // sin decir por qué.
    .replace(/[-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/**
 * Un `<w:t>` no admite saltos de línea: hay que partirlos en `<w:br/>`.
 *
 * Sin esto, una observación escrita en tres líneas llega a Word como una sola
 * frase corrida, que es peor que no incluirla.
 */
function corridas(texto: string, tenue?: boolean): string {
  const lineas = String(texto ?? "").split(/\r?\n/);
  const formato = tenue ? '<w:rPr><w:color w:val="6B7280"/><w:sz w:val="18"/></w:rPr>' : "";
  return lineas
    .map((linea, indice) => {
      const salto = indice > 0 ? "<w:br/>" : "";
      return `<w:r>${formato}${salto}<w:t xml:space="preserve">${escapar(linea)}</w:t></w:r>`;
    })
    .join("");
}

function parrafo(texto: string, estilo?: string, tenue?: boolean): string {
  const propiedades = estilo ? `<w:pPr><w:pStyle w:val="${estilo}"/></w:pPr>` : "";
  return `<w:p>${propiedades}${corridas(texto, tenue)}</w:p>`;
}

function celda(texto: string | number, ancho: number, encabezado: boolean): string {
  const sombra = encabezado ? '<w:shd w:val="clear" w:color="auto" w:fill="EDF2F7"/>' : "";
  const negrita = encabezado ? "<w:rPr><w:b/></w:rPr>" : "";
  const contenido = encabezado
    ? `<w:r>${negrita}<w:t xml:space="preserve">${escapar(String(texto))}</w:t></w:r>`
    : corridas(String(texto ?? ""));
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${sombra}` +
    `<w:vAlign w:val="top"/></w:tcPr><w:p>${contenido}</w:p></w:tc>`
  );
}

function tabla(cabecera: string[], filas: (string | number)[][], anchos?: number[]): string {
  const columnas = cabecera.length || (filas[0]?.length ?? 1);
  // El ancho útil de una A4 con márgenes de 2 cm son unos 9.400 twips.
  const total = 9400;
  const repartidos = anchos && anchos.length === columnas ? anchos : new Array(columnas).fill(Math.floor(total / columnas));

  const grid = `<w:tblGrid>${repartidos.map((a) => `<w:gridCol w:w="${a}"/>`).join("")}</w:tblGrid>`;
  const bordes =
    "<w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((lado) => `<w:${lado} w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>`)
      .join("") +
    "</w:tblBorders>";

  const filaCabecera = cabecera.length
    ? `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cabecera.map((t, i) => celda(t, repartidos[i], true)).join("")}</w:tr>`
    : "";

  const cuerpo = filas
    .map((fila) => {
      const celdas: string[] = [];
      for (let i = 0; i < columnas; i++) celdas.push(celda(fila[i] ?? "", repartidos[i], false));
      return `<w:tr>${celdas.join("")}</w:tr>`;
    })
    .join("");

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${bordes}<w:tblLayout w:type="fixed"/></w:tblPr>` +
    `${grid}${filaCabecera}${cuerpo}</w:tbl>` +
    // Un párrafo vacío tras la tabla: dos tablas seguidas sin separación Word las
    // fusiona en una.
    "<w:p/>"
  );
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/>
</w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>
<w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="004A8F"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
<w:pPr><w:keepNext/><w:spacing w:before="280" w:after="140"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="005BAA"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
<w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="1F2937"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
<w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="21"/><w:color w:val="374151"/></w:rPr></w:style>
</w:styles>`;

/** Construye el `.docx` como bytes. Se devuelve para poder probarlo sin navegador. */
export function construirDocx(bloques: BloqueDocx[], titulo: string): Uint8Array {
  const cuerpo: string[] = [parrafo(titulo, "Title")];

  for (const bloque of bloques) {
    if (bloque.tipo === "titulo") {
      cuerpo.push(parrafo(bloque.texto, `Heading${bloque.nivel}`));
    } else if (bloque.tipo === "parrafo") {
      cuerpo.push(parrafo(bloque.texto, undefined, bloque.tenue));
    } else if (bloque.tipo === "tabla") {
      cuerpo.push(tabla(bloque.cabecera, bloque.filas, bloque.anchos));
    } else {
      cuerpo.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
  }

  // A4 vertical con márgenes de 2 cm, en twips (1 cm = 567).
  const seccion =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';

  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo.join("")}${seccion}</w:body></w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const relsDocumento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  return zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(rels),
      "word/document.xml": strToU8(documento),
      "word/_rels/document.xml.rels": strToU8(relsDocumento),
      "word/styles.xml": strToU8(ESTILOS),
    },
    { level: 6 },
  );
}

/** Descarga el documento. Revoca la URL temporal para no retener los bytes. */
export function descargarDocx(bloques: BloqueDocx[], titulo: string, nombreArchivo: string): { bytes: number; nombre: string } {
  const datos = construirDocx(bloques, titulo);
  const nombre = nombreArchivo.toLowerCase().endsWith(".docx") ? nombreArchivo : `${nombreArchivo}.docx`;
  if (typeof document === "undefined") return { bytes: datos.length, nombre };

  const blob = new Blob([datos as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { bytes: datos.length, nombre };
}
