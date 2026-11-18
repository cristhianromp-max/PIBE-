import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Printer,
  MessageCircle,
  FileText,
  Scissors,
  Activity,
  Plus,
  X,
  Copy,
  Check,
  Download,
  ExternalLink,
  Pencil,
  Trash2,
  CloudUpload
} from "lucide-react";
import { Boton } from "./Campos.jsx";
import { fechaCorta, fechaLocal, edad, uuid } from "./datos.mjs";

const VIAS_ADMINISTRACION = [
  "vía oral",
  "vía tópica",
  "vía oftálmica",
  "vía ótica",
  "vía subcutánea",
  "vía intramuscular",
  "vía intranasal"
];

const MEDICAMENTOS_RAPIDOS_RECETA = [
  { nombre: "Doxi 200", via: "vía oral" },
  { nombre: "Doxi 100", via: "vía oral" },
  { nombre: "Quercetol 100 MG", via: "vía oral" },
  { nombre: "Diagel", via: "vía oral" },
  { nombre: "Hepamerz", via: "vía oral" },
  { nombre: "Clamox", via: "vía oral" },
  { nombre: "Previcox", via: "vía oral" },
  { nombre: "Meloxicam", via: "vía oral" },
  { nombre: "Sponge clean", via: "vía tópica" },
  { nombre: "Spectryl 20", via: "vía tópica" },
  { nombre: "Spectryl 10", via: "vía tópica" },
  { nombre: "Liv 52", via: "vía oral" },
  { nombre: "Carminal", via: "vía oral" },
  { nombre: "Anti hemok", via: "vía oral" },
  { nombre: "Neumoflogin", via: "vía oral" }
];

function crearFilaReceta() {
  return {
    id: uuid(),
    medicamento: "",
    cantidadTotal: "",
    via: "vía oral",
    dosis: "",
    frecuencia: "",
    duracion: ""
  };
}

function obtenerEnlaceWhatsApp(telefono, texto) {
  const digitos = String(telefono || "").replace(/\D/g, "");
  if (!digitos) return "";
  let numero = digitos;
  if (digitos.startsWith("09") && digitos.length === 10) {
    numero = `593${digitos.slice(1)}`;
  } else if (digitos.startsWith("9") && digitos.length === 9) {
    numero = `593${digitos}`;
  }
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

// ============================================================================
// LOGO VECTORIAL OFICIAL: CLÍNICA VETERINARIA EL PIBE
// ============================================================================
export function LogoClinicaElPibe({ ancho = 210 }) {
  return (
    <svg
      width={ancho}
      viewBox="0 0 300 132"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Clínica Veterinaria El Pibe"
      style={{ display: "block", maxWidth: "100%", height: "auto" }}
    >
      <circle cx="66" cy="40" r="25" fill="none" stroke="#222222" strokeWidth="4.5" />
      <rect x="61.5" y="26" width="9" height="28" rx="1.5" fill="#222222" />
      <rect x="52" y="35.5" width="28" height="9" rx="1.5" fill="#222222" />

      <circle cx="150" cy="40" r="25" fill="none" stroke="#d92b2b" strokeWidth="4.5" />
      <g fill="#222222">
        <path d="M150 40.5c-5.5 0-10.5 4.2-10.5 8.5 0 2.5 2.1 4.2 4.8 4.2 2.1 0 3.7-.9 5.7-.9s3.6.9 5.7.9c2.7 0 4.8-1.7 4.8-4.2 0-4.3-5-8.5-10.5-8.5z" />
        <ellipse cx="138.5" cy="36.5" rx="2.7" ry="3.8" transform="rotate(-22 138.5 36.5)" />
        <ellipse cx="145.5" cy="30.5" rx="2.8" ry="4.1" transform="rotate(-8 145.5 30.5)" />
        <ellipse cx="154.5" cy="30.5" rx="2.8" ry="4.1" transform="rotate(8 154.5 30.5)" />
        <ellipse cx="161.5" cy="36.5" rx="2.7" ry="3.8" transform="rotate(22 161.5 36.5)" />
      </g>

      <circle cx="234" cy="40" r="25" fill="none" stroke="#64c7d6" strokeWidth="4.5" />
      <polyline
        points="213,41 222,41 225,45 230,27 236,52 241,36 244,41 255,41"
        fill="none"
        stroke="#222222"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <text
        x="150"
        y="94"
        textAnchor="middle"
        fill="#222222"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="19.5"
        letterSpacing="0.6"
      >
        CLÍNICA VETERINARIA
      </text>
      <text
        x="150"
        y="118"
        textAnchor="middle"
        fill="#222222"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="20.5"
        letterSpacing="1"
      >
        EL PIBE
      </text>
    </svg>
  );
}

// ============================================================================
// FORMATEADOR DE LÍNEAS DE RECETA
// ============================================================================
export function formatearItemReceta(item) {
  const med = (item.medicamento || "").trim();
  const cantLimpia = (item.cantidadTotal || "").trim().replace(/^#+\s*/, "");
  const encabezado = cantLimpia ? `${med} #${cantLimpia}` : med;

  const partesIndicacion = [];
  if (item.via?.trim()) partesIndicacion.push(item.via.trim());
  if (item.dosis?.trim()) partesIndicacion.push(item.dosis.trim());
  if (item.frecuencia?.trim()) {
    const freq = item.frecuencia.trim();
    partesIndicacion.push(/^cada\b/i.test(freq) ? freq : `cada ${freq}`);
  }
  if (item.duracion?.trim()) {
    const dur = item.duracion.trim();
    partesIndicacion.push(/^(durante|por)\b/i.test(dur) ? dur : `durante ${dur}`);
  }

  const instruccion =
    partesIndicacion.length > 0 ? `Administrar ${partesIndicacion.join(" ")}.` : "";

  return { encabezado, instruccion };
}

// ============================================================================
// GENERADOR NATIVO DE ARCHIVO PDF REAL (SIN DEPENDENCIAS EXTERNAS)
// ============================================================================
const MAPA_WINANSI = {
  "€": 0x80, "–": 0x96, "—": 0x97, "¡": 0xa1, "°": 0xb0, "·": 0xb7, "º": 0xba, "¿": 0xbf,
  "Á": 0xc1, "É": 0xc9, "Í": 0xcd, "Ñ": 0xd1, "Ó": 0xd3, "Ú": 0xda, "Ü": 0xdc,
  "á": 0xe1, "é": 0xe9, "í": 0xed, "ñ": 0xf1, "ó": 0xf3, "ú": 0xfa, "ü": 0xfc
};

function textoPdfSeguro(str) {
  let out = "";
  for (const ch of String(str || "")) {
    const code = ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") {
      out += "\\" + ch;
    } else if (code >= 32 && code <= 126) {
      out += ch;
    } else if (MAPA_WINANSI[ch] !== undefined) {
      out += "\\" + MAPA_WINANSI[ch].toString(8).padStart(3, "0");
    } else {
      const sinAcento = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      out += sinAcento && sinAcento.charCodeAt(0) <= 126 ? sinAcento : "?";
    }
  }
  return out;
}

function dividirLineasPdf(texto, maxChars) {
  const parrafos = String(texto || "").split(/\r?\n/);
  const resultado = [];
  for (const parrafo of parrafos) {
    const palabras = parrafo.trim().split(/\s+/).filter(Boolean);
    if (palabras.length === 0) {
      resultado.push("");
      continue;
    }
    let lineaActual = "";
    for (const palabra of palabras) {
      if (!lineaActual) {
        lineaActual = palabra;
      } else if (lineaActual.length + 1 + palabra.length <= maxChars) {
        lineaActual += " " + palabra;
      } else {
        resultado.push(lineaActual);
        lineaActual = palabra;
      }
    }
    if (lineaActual) resultado.push(lineaActual);
  }
  return resultado;
}

function dibujarLogoEnPdf(ops, x0, yTop) {
  // 3 círculos + iconos vectoriales + nombre de la clínica
  const r = 14;
  const cy = yTop - 16;
  const c1x = x0 + 22;
  const c2x = x0 + 66;
  const c3x = x0 + 110;
  const k = 0.55228475 * r;

  const circulo = (cx, colorRgb) => {
    ops.push(`${colorRgb} RG 2 w`);
    ops.push(`${(cx + r).toFixed(2)} ${cy.toFixed(2)} m`);
    ops.push(`${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c`);
    ops.push(`${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c`);
    ops.push(`${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c`);
    ops.push(`${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c S`);
  };

  // Círculo 1: Cruz médica negra
  circulo(c1x, "0.13 0.13 0.13");
  ops.push(`0.13 0.13 0.13 rg`);
  ops.push(`${(c1x - 2.3).toFixed(2)} ${(cy - 7).toFixed(2)} 4.6 14 re f`);
  ops.push(`${(c1x - 7).toFixed(2)} ${(cy - 2.3).toFixed(2)} 14 4.6 re f`);

  // Círculo 2: Huella en aro rojo
  circulo(c2x, "0.85 0.17 0.17");
  ops.push(`0.13 0.13 0.13 rg`);
  ops.push(`${(c2x - 4.5).toFixed(2)} ${(cy - 5.5).toFixed(2)} 9 5.5 re f`);
  ops.push(`${(c2x - 6.5).toFixed(2)} ${(cy + 1).toFixed(2)} 2.5 3 re f`);
  ops.push(`${(c2x - 3).toFixed(2)} ${(cy + 3.2).toFixed(2)} 2.5 3.3 re f`);
  ops.push(`${(c2x + 0.5).toFixed(2)} ${(cy + 3.2).toFixed(2)} 2.5 3.3 re f`);
  ops.push(`${(c2x + 4).toFixed(2)} ${(cy + 1).toFixed(2)} 2.5 3 re f`);

  // Círculo 3: Pulso ECG en aro celeste
  circulo(c3x, "0.39 0.78 0.84");
  ops.push(`0.13 0.13 0.13 RG 1.7 w`);
  ops.push(`${(c3x - 10).toFixed(2)} ${cy.toFixed(2)} m`);
  ops.push(`${(c3x - 5.5).toFixed(2)} ${cy.toFixed(2)} l`);
  ops.push(`${(c3x - 3.8).toFixed(2)} ${(cy - 2.5).toFixed(2)} l`);
  ops.push(`${(c3x - 1.2).toFixed(2)} ${(cy + 7.5).toFixed(2)} l`);
  ops.push(`${(c3x + 1.8).toFixed(2)} ${(cy - 7.5).toFixed(2)} l`);
  ops.push(`${(c3x + 4.2).toFixed(2)} ${(cy + 2.5).toFixed(2)} l`);
  ops.push(`${(c3x + 6).toFixed(2)} ${cy.toFixed(2)} l`);
  ops.push(`${(c3x + 10).toFixed(2)} ${cy.toFixed(2)} l S`);

  // Texto institucional debajo de los 3 círculos
  ops.push(`0.13 0.13 0.13 rg`);
  ops.push(`BT /F3 10.5 Tf ${(x0 + 4).toFixed(2)} ${(yTop - 44).toFixed(2)} Td (CL\\315NICA VETERINARIA) Tj ET`);
  ops.push(`BT /F3 11.5 Tf ${(x0 + 42).toFixed(2)} ${(yTop - 57).toFixed(2)} Td (EL PIBE) Tj ET`);
}

export function generarArchivoPdfReceta({
  paciente,
  ultimoPeso,
  medico,
  registroProf,
  fechaEmision,
  items,
  indicacionesGenerales,
  proximoControl
}) {
  const paginas = [];
  let ops = [];

  const escribirTexto = (fontKey, size, x, y, texto, rgb = "0.07 0.09 0.15") => {
    ops.push(`${rgb} rg BT ${fontKey} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${textoPdfSeguro(texto)}) Tj ET`);
  };

  const iniciarPagina = (esPrimera) => {
    ops = [];
    if (esPrimera) {
      dibujarLogoEnPdf(ops, 42, 804);

      escribirTexto("/F2", 14, 345, 788, "RECETA M\\311DICA", "0.06 0.09 0.16");
      escribirTexto("/F1", 9.5, 345, 772, `Fecha: ${fechaCorta(fechaEmision)}`);
      escribirTexto("/F1", 9.5, 345, 758, `Historia N.º: ${paciente.codigo || "S/N"}`);
      escribirTexto("/F2", 9.5, 345, 744, `Médico: ${medico || "Médico Veterinario"}`);

      // Línea separadora cabecera
      ops.push(`0.12 0.16 0.23 RG 1.4 w 42 732 m 553 732 l S`);

      // Cuadro datos paciente y propietario
      ops.push(`0.97 0.98 0.99 rg 42 666 511 58 re f`);
      ops.push(`0.80 0.84 0.88 RG 0.8 w 42 666 511 58 re S`);
      ops.push(`42 705 m 553 705 l S`);
      ops.push(`42 686 m 553 686 l S`);
      ops.push(`298 666 m 298 724 l S`);

      escribirTexto("/F2", 9, 48, 711, `Paciente: ${paciente.nombre}`);
      escribirTexto("/F2", 9, 304, 711, `Propietario: ${paciente.propietario}`);

      const espRaza = `${paciente.especie || ""}${paciente.raza ? ` · ${paciente.raza}` : ""}`;
      escribirTexto("/F1", 9, 48, 692, `Especie / Raza: ${espRaza}`);
      escribirTexto("/F1", 9, 304, 692, `Cédula: ${paciente.cedula || "Sin registrar"}`);

      const datosExtra = [
        paciente.sexo,
        edad(paciente.nacimiento, paciente.edad_estimada),
        ultimoPeso != null ? `${Number(ultimoPeso).toLocaleString("es-EC")} kg` : ""
      ]
        .filter(Boolean)
        .join(" · ");
      escribirTexto("/F1", 9, 48, 673, `Datos: ${datosExtra || "Sin registrar"}`);
      escribirTexto("/F1", 9, 304, 673, `Teléfono: ${paciente.telefono || "Sin registrar"}`);

      escribirTexto("/F2", 11.5, 42, 644, "Rp / Prescripción:", "0.06 0.09 0.16");
      ops.push(`0.85 0.88 0.92 RG 0.8 w 42 638 m 553 638 l S`);
      return 618;
    } else {
      escribirTexto("/F2", 10, 42, 795, `RECETA MÉDICA (Continuación) · Paciente: ${paciente.nombre}`);
      ops.push(`0.85 0.88 0.92 RG 0.8 w 42 788 m 553 788 l S`);
      return 768;
    }
  };

  let y = iniciarPagina(true);

  const asegurarEspacio = (altoNecesario) => {
    if (y - altoNecesario < 115) {
      paginas.push(ops.join("\n"));
      y = iniciarPagina(false);
    }
  };

  items.forEach((item, idx) => {
    const { encabezado, instruccion } = formatearItemReceta(item);
    const lineasEnc = dividirLineasPdf(`${idx + 1}. ${encabezado}`, 82);
    const lineasInst = instruccion ? dividirLineasPdf(instruccion, 84) : [];
    const altoBloque = lineasEnc.length * 14 + lineasInst.length * 13 + 12;

    asegurarEspacio(altoBloque);

    for (const ln of lineasEnc) {
      escribirTexto("/F2", 10.5, 44, y, ln, "0.06 0.09 0.16");
      y -= 14;
    }
    for (const ln of lineasInst) {
      escribirTexto("/F1", 10, 58, y, ln, "0.18 0.22 0.28");
      y -= 13;
    }
    ops.push(`0.88 0.91 0.94 RG 0.5 w 44 ${(y + 5).toFixed(2)} m 550 ${(y + 5).toFixed(2)} l S`);
    y -= 10;
  });

  if (indicacionesGenerales?.trim()) {
    const lineasInd = dividirLineasPdf(indicacionesGenerales.trim(), 86);
    const altoCaja = lineasInd.length * 13 + 26;
    asegurarEspacio(altoCaja);

    ops.push(`0.97 0.98 0.99 rg 42 ${(y - altoCaja + 12).toFixed(2)} 511 ${altoCaja} re f`);
    ops.push(`0.80 0.84 0.88 RG 0.7 w 42 ${(y - altoCaja + 12).toFixed(2)} 511 ${altoCaja} re S`);
    escribirTexto("/F2", 9.5, 50, y - 4, "Indicaciones generales y cuidados en casa:");
    let yInd = y - 18;
    for (const ln of lineasInd) {
      escribirTexto("/F1", 9.2, 50, yInd, ln);
      yInd -= 13;
    }
    y -= altoCaja + 10;
  }

  if (proximoControl) {
    asegurarEspacio(24);
    escribirTexto("/F2", 9.5, 44, y, `Próximo control médico: ${fechaCorta(proximoControl)}`);
    y -= 20;
  }

  // Firma del médico al pie de la página actual
  const yFirma = Math.min(y - 34, 105);
  ops.push(`0.12 0.16 0.23 RG 1.1 w 330 ${yFirma.toFixed(2)} m 545 ${yFirma.toFixed(2)} l S`);
  escribirTexto("/F2", 9.8, 345, yFirma - 14, medico || "Médico Veterinario");
  escribirTexto("/F1", 8.8, 345, yFirma - 26, "Médico Veterinario Zootecnista", "0.28 0.33 0.41");
  let yPie = yFirma - 38;
  if (registroProf?.trim()) {
    escribirTexto("/F1", 8.5, 345, yPie, `Reg. Prof.: ${registroProf.trim()}`, "0.28 0.33 0.41");
    yPie -= 12;
  }
  escribirTexto("/F1", 8.5, 345, yPie, "Clínica Veterinaria El Pibe", "0.28 0.33 0.41");

  paginas.push(ops.join("\n"));

  // Ensamblaje binario del PDF 1.4
  const objetos = [];
  const agregarObj = (contenido) => {
    objetos.push(contenido);
    return objetos.length;
  };

  const catalogId = agregarObj("");
  const pagesId = agregarObj("");
  const fontRegId = agregarObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBoldId = agregarObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const fontSerifId = agregarObj("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>");

  const pageIds = [];
  for (const streamStr of paginas) {
    const contentId = agregarObj(`<< /Length ${streamStr.length} >>\nstream\n${streamStr}\nendstream`);
    const pageId = agregarObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 ${fontRegId} 0 R /F2 ${fontBoldId} 0 R /F3 ${fontSerifId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objetos[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objetos[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objetos.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objetos[i]}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objetos.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }

  const nombrePacienteLimpio = String(paciente.nombre || "Paciente")
    .trim()
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, "_");
  const nombreArchivo = `Receta_${nombrePacienteLimpio}_${fechaEmision || fechaLocal(new Date()).slice(0, 10)}.pdf`;

  return new File([bytes], nombreArchivo, { type: "application/pdf" });
}

function descargarBlobLocal(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ============================================================================
// MODAL DE RECETAS (CON GUARDADO PDF EN LA NUBE) Y CONSENTIMIENTOS
// ============================================================================
export function ModalDocumentosClinicos({
  paciente,
  atenciones = [],
  profesionales = [],
  repo,
  cerrar,
  tipoInicial = "receta",
  recetaInicial = null,
  onRecetaGuardada
}) {
  const dialog = useRef(null);
  const [tipoDoc, setTipoDoc] = useState(recetaInicial ? "receta" : tipoInicial);
  const [copiado, setCopiado] = useState(false);
  const [guardandoNube, setGuardandoNube] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState("");
  const [avisoGuardar, setAvisoGuardar] = useState("");

  const ultimaAtencion = atenciones[0] || null;
  const hospitalActiva = atenciones.find((a) => a.tipo === "hospitalizacion" && a.abierta);
  const ultimoPeso = atenciones.find((a) => a.peso != null)?.peso;

  const [medico, setMedico] = useState(
    recetaInicial?.medico || ultimaAtencion?.profesional || "MVZ. Cristhian Romero"
  );
  const [registroProf, setRegistroProf] = useState(recetaInicial?.registroProf || "");
  const [fechaEmision, setFechaEmision] = useState(
    recetaInicial?.fechaEmision || fechaLocal(new Date()).slice(0, 10)
  );

  // Estado: Receta Médica
  const [filasRx, setFilasRx] = useState(() =>
    recetaInicial?.items?.length
      ? recetaInicial.items.map((it) => ({ ...it, id: it.id || uuid() }))
      : [crearFilaReceta(), crearFilaReceta()]
  );
  const [indicacionesGenerales, setIndicacionesGenerales] = useState(
    recetaInicial?.indicacionesGenerales || ""
  );
  const [proximoControl, setProximoControl] = useState(recetaInicial?.proximoControl || "");

  // Estado: Consentimientos
  const [procedimientoCirugia, setProcedimientoCirugia] = useState("");
  const [diagnosticoDoc, setDiagnosticoDoc] = useState(
    hospitalActiva?.titulo || ultimaAtencion?.titulo || ""
  );
  const [areaJaula, setAreaJaula] = useState(hospitalActiva?.jaula || "");
  const [observacionesConsentimiento, setObservacionesConsentimiento] = useState("");

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  function actualizarFilaRx(id, campo, valor) {
    setFilasRx((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f))
    );
  }

  function agregarMedicamentoRapidoRx(med) {
    setFilasRx((prev) => {
      const idxVacia = prev.findIndex((f) => !f.medicamento.trim());
      if (idxVacia !== -1) {
        return prev.map((f, idx) =>
          idx === idxVacia
            ? {
                ...f,
                medicamento: med.nombre,
                via: med.via || f.via || "vía oral"
              }
            : f
        );
      }
      return [
        ...prev,
        {
          ...crearFilaReceta(),
          medicamento: med.nombre,
          via: med.via || "vía oral"
        }
      ];
    });
  }

  function agregarFilaRx() {
    setFilasRx((prev) => [...prev, crearFilaReceta()]);
  }

  function quitarFilaRx(id) {
    setFilasRx((prev) =>
      prev.length > 1 ? prev.filter((f) => f.id !== id) : [crearFilaReceta()]
    );
  }

  const itemsValidosRx = filasRx.filter((f) => f.medicamento.trim() !== "");

  async function guardarRecetaPdfEnNube() {
    if (guardandoNube) return;
    if (itemsValidosRx.length === 0) {
      setErrorGuardar("Agrega al menos un medicamento antes de guardar la receta en la nube.");
      return;
    }

    setGuardandoNube(true);
    setErrorGuardar("");
    setAvisoGuardar("");

    try {
      const medicoFinal = medico.trim() || "MVZ. Cristhian Romero";
      const pdfFile = generarArchivoPdfReceta({
        paciente,
        ultimoPeso,
        medico: medicoFinal,
        registroProf: registroProf.trim(),
        fechaEmision,
        items: itemsValidosRx,
        indicacionesGenerales: indicacionesGenerales.trim(),
        proximoControl
      });

      let anexoId = null;
      let nombrePdf = pdfFile.name;

      if (repo?.subir) {
        let visitaId = atenciones[0]?.id;
        if (!visitaId && repo.guardarAtencion) {
          visitaId = uuid();
          await repo.guardarAtencion({
            id: visitaId,
            paciente_id: paciente.id,
            tipo: "consulta",
            fecha_local: fechaLocal(new Date()),
            titulo: "Prescripción médica",
            profesional: medicoFinal,
            detalle_clinico: {},
            resumen: "Atención creada automáticamente para respaldar receta médica en PDF.",
            version: 0,
            abierta: false
          });
        }
        if (visitaId) {
          anexoId = uuid();
          await repo.subir(anexoId, visitaId, pdfFile, "diagnostico");
        }
      }

      const registroReceta = {
        id: recetaInicial?.id || uuid(),
        medico: medicoFinal,
        registroProf: registroProf.trim(),
        fechaEmision,
        items: itemsValidosRx,
        indicacionesGenerales: indicacionesGenerales.trim(),
        proximoControl,
        anexoId,
        nombrePdf,
        actualizadoEn: fechaLocal(new Date()).replace("T", " ")
      };

      let guardada = registroReceta;
      if (repo?.modulos?.guardar) {
        guardada = await repo.modulos.guardar(paciente.id, "receta", registroReceta);
      }

      setAvisoGuardar(
        recetaInicial
          ? "Receta actualizada y nuevo PDF guardado en la nube."
          : "Receta guardada en PDF en la nube."
      );

      if (onRecetaGuardada) {
        onRecetaGuardada(guardada);
      }
      setTimeout(() => cerrar(), 650);
    } catch (err) {
      setErrorGuardar(err.message || "No se pudo guardar el PDF de la receta en la nube.");
    } finally {
      setGuardandoNube(false);
    }
  }

  function descargarPdfDirecto() {
    const pdfFile = generarArchivoPdfReceta({
      paciente,
      ultimoPeso,
      medico: medico.trim() || "MVZ. Cristhian Romero",
      registroProf: registroProf.trim(),
      fechaEmision,
      items: itemsValidosRx,
      indicacionesGenerales: indicacionesGenerales.trim(),
      proximoControl
    });
    descargarBlobLocal(pdfFile);
  }

  function construirTextoWhatsApp() {
    const medicoTexto = medico.trim() || "Médico Veterinario";
    const cabecera = [
      "*CLÍNICA VETERINARIA EL PIBE*",
      tipoDoc === "receta"
        ? "*RECETA MÉDICA*"
        : tipoDoc === "cirugia"
        ? "*CONSENTIMIENTO DE CIRUGÍA Y ANESTESIA*"
        : "*CONSENTIMIENTO DE HOSPITALIZACIÓN*",
      `Fecha: ${fechaCorta(fechaEmision)}`,
      `Paciente: *${paciente.nombre}* (${paciente.especie}${
        ultimoPeso ? ` · ${Number(ultimoPeso).toLocaleString("es-EC")} kg` : ""
      })`,
      `Propietario: ${paciente.propietario}`,
      `Médico tratante: *${medicoTexto}*`,
      ""
    ];

    if (tipoDoc === "receta") {
      if (itemsValidosRx.length === 0) {
        cabecera.push("_Sin medicamentos ingresados._");
      } else {
        itemsValidosRx.forEach((item, idx) => {
          const { encabezado, instruccion } = formatearItemReceta(item);
          cabecera.push(`*${idx + 1}. ${encabezado}*`);
          if (instruccion) cabecera.push(instruccion);
          cabecera.push("");
        });
      }
      if (indicacionesGenerales.trim()) {
        cabecera.push(`*Indicaciones:* ${indicacionesGenerales.trim()}`);
      }
      if (proximoControl) {
        cabecera.push(`*Próximo control:* ${fechaCorta(proximoControl)}`);
      }
    } else if (tipoDoc === "cirugia") {
      cabecera.push(
        `Procedimiento autorizado: *${procedimientoCirugia.trim() || "Por definir"}*`
      );
      if (diagnosticoDoc.trim()) {
        cabecera.push(`Diagnóstico / Motivo: ${diagnosticoDoc.trim()}`);
      }
      cabecera.push(
        "Autorizo al equipo médico de Clínica Veterinaria El Pibe a realizar el procedimiento quirúrgico y anestésico indicado."
      );
    } else {
      cabecera.push(
        `Motivo de hospitalización: *${diagnosticoDoc.trim() || "Observación y tratamiento"}*`
      );
      if (areaJaula.trim()) cabecera.push(`Área asignada: ${areaJaula.trim()}`);
      cabecera.push(
        "Autorizo el ingreso hospitalario, administración de fluidoterapia, medicación y exámenes diagnósticos necesarios."
      );
    }

    return cabecera.join("\n").trim();
  }

  async function copiarTexto() {
    try {
      await navigator.clipboard.writeText(construirTextoWhatsApp());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {}
  }

  const enlaceWhatsApp = obtenerEnlaceWhatsApp(
    paciente.telefono,
    construirTextoWhatsApp()
  );

  // ==========================================================================
  // HOJA IMPRIMIBLE (PARA CONSENTIMIENTOS O IMPRESIÓN DIRECTA)
  // ==========================================================================
  const hojaImprimible = createPortal(
    <>
      <style>{`
        #ve-hoja-pdf-clinica { display: none; }
        @media print {
          @page { size: A4; margin: 14mm 15mm; }
          body > *:not(#ve-hoja-pdf-clinica) { display: none !important; }
          #ve-hoja-pdf-clinica {
            display: block !important;
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #111827;
            background: #ffffff;
            width: 100%;
            line-height: 1.45;
          }
        }
      `}</style>

      <div id="ve-hoja-pdf-clinica">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "2px solid #1e293b",
            paddingBottom: "10px",
            marginBottom: "14px"
          }}
        >
          <LogoClinicaElPibe ancho={215} />

          <div style={{ textAlign: "right", fontSize: "12.5px" }}>
            <div style={{ fontSize: "16px", fontWeight: 800, textTransform: "uppercase", color: "#0f172a" }}>
              {tipoDoc === "receta"
                ? "Receta Médica Veterinaria"
                : tipoDoc === "cirugia"
                ? "Consentimiento Quirúrgico y Anestésico"
                : "Consentimiento de Hospitalización"}
            </div>
            <div style={{ marginTop: "4px" }}>
              <strong>Fecha:</strong> {fechaCorta(fechaEmision)}
            </div>
            <div>
              <strong>Historia N.º:</strong> {paciente.codigo || "S/N"}
            </div>
            <div style={{ marginTop: "2px" }}>
              <strong>Médico:</strong> {medico.trim() || "Médico Veterinario"}
            </div>
          </div>
        </div>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "12.5px",
            marginBottom: "16px",
            border: "1px solid #cbd5e1"
          }}
        >
          <tbody>
            <tr style={{ borderBottom: "1px solid #cbd5e1" }}>
              <td style={{ padding: "6px 8px", width: "50%" }}>
                <strong>Paciente:</strong> {paciente.nombre}
              </td>
              <td style={{ padding: "6px 8px", width: "50%" }}>
                <strong>Propietario:</strong> {paciente.propietario}
              </td>
            </tr>
            <tr style={{ borderBottom: "1px solid #cbd5e1" }}>
              <td style={{ padding: "6px 8px" }}>
                <strong>Especie / Raza:</strong> {paciente.especie}
                {paciente.raza ? ` · ${paciente.raza}` : ""}
              </td>
              <td style={{ padding: "6px 8px" }}>
                <strong>Cédula:</strong> {paciente.cedula || "________________"}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "6px 8px" }}>
                <strong>Sexo / Edad / Peso:</strong>{" "}
                {[
                  paciente.sexo,
                  edad(paciente.nacimiento, paciente.edad_estimada),
                  ultimoPeso != null ? `${Number(ultimoPeso).toLocaleString("es-EC")} kg` : ""
                ]
                  .filter(Boolean)
                  .join(" · ") || "Sin registrar"}
              </td>
              <td style={{ padding: "6px 8px" }}>
                <strong>Teléfono:</strong> {paciente.telefono || "________________"}
              </td>
            </tr>
          </tbody>
        </table>

        {tipoDoc === "receta" ? (
          <div>
            <div style={{ fontSize: "15px", fontWeight: 800, marginBottom: "10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px" }}>
              Rp / Prescripción:
            </div>
            <div style={{ display: "grid", gap: "12px", marginBottom: "18px" }}>
              {itemsValidosRx.map((item, idx) => {
                const { encabezado, instruccion } = formatearItemReceta(item);
                return (
                  <div key={item.id} style={{ paddingBottom: "8px", borderBottom: "1px dashed #cbd5e1" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700 }}>
                      {idx + 1}. {encabezado}
                    </div>
                    {instruccion && (
                      <div style={{ fontSize: "13.5px", marginTop: "2px", paddingLeft: "14px" }}>
                        {instruccion}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {indicacionesGenerales.trim() && (
              <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", marginBottom: "14px" }}>
                <strong>Indicaciones generales y cuidados en casa:</strong>
                <p style={{ margin: "4px 0 0", whiteSpace: "pre-line" }}>{indicacionesGenerales.trim()}</p>
              </div>
            )}
            {proximoControl && (
              <div style={{ fontSize: "13px", marginBottom: "16px" }}>
                <strong>Próximo control médico:</strong> {fechaCorta(proximoControl)}
              </div>
            )}
          </div>
        ) : tipoDoc === "cirugia" ? (
          <div style={{ fontSize: "13px", textAlign: "justify" }}>
            <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px" }}>
              <div>
                <strong>Procedimiento quirúrgico autorizado:</strong>{" "}
                {procedimientoCirugia.trim() || "________________________________________"}
              </div>
              {diagnosticoDoc.trim() && (
                <div style={{ marginTop: "4px" }}>
                  <strong>Diagnóstico / Motivo:</strong> {diagnosticoDoc.trim()}
                </div>
              )}
            </div>
            <p style={{ marginBottom: "10px" }}>
              Yo, <strong>{paciente.propietario}</strong>, con cédula de identidad N.º{" "}
              <strong>{paciente.cedula || "________________"}</strong>, en calidad de propietario(a) o responsable
              legal del paciente <strong>{paciente.nombre}</strong>, declaro que he sido informado(a) de manera clara
              y comprensible por el médico veterinario tratante,{" "}
              <strong>{medico.trim() || "Médico Veterinario"}</strong>, sobre la naturaleza, objetivos, beneficios y
              posibles riesgos inherentes al procedimiento quirúrgico y protocolo anestésico arriba descrito.
            </p>
            <p style={{ marginBottom: "10px" }}>
              Comprendo que todo acto anestésico y quirúrgico conlleva riesgos imprevisibles (reacciones adversas a
              fármacos, hemorragias, infecciones o complicaciones cardiorrespiratorias), por lo que autorizo al equipo
              de <strong>Clínica Veterinaria El Pibe</strong> a realizar las maniobras médicas, reanimación o
              procedimientos complementarios de emergencia necesarios para salvaguardar la vida del paciente,
              asumiendo los honorarios y costos derivados de su atención.
            </p>
            {observacionesConsentimiento.trim() && (
              <p style={{ marginBottom: "10px" }}>
                <strong>Observaciones adicionales:</strong> {observacionesConsentimiento.trim()}
              </p>
            )}
          </div>
        ) : (
          <div style={{ fontSize: "13px", textAlign: "justify" }}>
            <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px" }}>
              <div>
                <strong>Motivo de ingreso / Diagnóstico presuntivo:</strong>{" "}
                {diagnosticoDoc.trim() || "________________________________________"}
              </div>
              {areaJaula.trim() && (
                <div style={{ marginTop: "4px" }}>
                  <strong>Área / Jaula asignada:</strong> {areaJaula.trim()}
                </div>
              )}
            </div>
            <p style={{ marginBottom: "10px" }}>
              Yo, <strong>{paciente.propietario}</strong>, con cédula de identidad N.º{" "}
              <strong>{paciente.cedula || "________________"}</strong>, autorizo el ingreso y permanencia en el área de
              hospitalización de <strong>Clínica Veterinaria El Pibe</strong> de mi mascota{" "}
              <strong>{paciente.nombre}</strong>, bajo la supervisión de{" "}
              <strong>{medico.trim() || "Médico Veterinario"}</strong> y el personal clínico de turno.
            </p>
            <p style={{ marginBottom: "10px" }}>
              Autorizo la administración de fluidoterapia, medicación parenteral u oral, toma de muestras y exámenes
              complementarios necesarios para su diagnóstico y estabilización. Declaro conocer el estado clínico actual
              del paciente, los horarios de visita/informes médicos y me comprometo a cubrir los valores generados
              durante su estancia hospitalaria.
            </p>
            {observacionesConsentimiento.trim() && (
              <p style={{ marginBottom: "10px" }}>
                <strong>Observaciones adicionales:</strong> {observacionesConsentimiento.trim()}
              </p>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: "42px",
            display: "flex",
            justifyContent: tipoDoc === "receta" ? "flex-end" : "space-between",
            gap: "32px",
            pageBreakInside: "avoid"
          }}
        >
          {tipoDoc !== "receta" && (
            <div style={{ width: "45%", textAlign: "center", fontSize: "12.5px" }}>
              <div style={{ borderTop: "1.5px solid #1e293b", paddingTop: "6px", fontWeight: 700 }}>
                {paciente.propietario}
              </div>
              <div>Propietario / Responsable</div>
              <div>C.I.: {paciente.cedula || "________________"}</div>
            </div>
          )}

          <div style={{ width: tipoDoc === "receta" ? "52%" : "45%", textAlign: "center", fontSize: "12.5px" }}>
            <div style={{ borderTop: "1.5px solid #1e293b", paddingTop: "6px", fontWeight: 700 }}>
              {medico.trim() || "Médico Veterinario"}
            </div>
            <div>Médico Veterinario Zootecnista</div>
            {registroProf.trim() && <div>Reg. Prof.: {registroProf.trim()}</div>}
            <div style={{ color: "#475569", fontSize: "11.5px" }}>Clínica Veterinaria El Pibe</div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );

  return (
    <>
      <dialog
        className="ve-dialog ve-dialog-clinico"
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          if (!guardandoNube) cerrar();
        }}
        aria-labelledby="titulo-docs-clinicos"
      >
        <div>
          <div className="ve-row" style={{ alignItems: "flex-start", gap: "0.75rem" }}>
            <div>
              <h2 id="titulo-docs-clinicos" style={{ margin: 0 }}>
                {recetaInicial ? `Editar receta · ${paciente.nombre}` : `Recetas y Documentos · ${paciente.nombre}`}
              </h2>
              <p className="ve-meta" style={{ marginTop: "0.2rem" }}>
                Propietario: <strong>{paciente.propietario}</strong> · {paciente.especie}
                {ultimoPeso != null ? ` · ${Number(ultimoPeso).toLocaleString("es-EC")} kg` : ""}
              </p>
            </div>
            <Boton icono={X} aria-label="Cerrar" onClick={cerrar} disabled={guardandoNube} />
          </div>

          {!recetaInicial && (
            <div
              className="ve-actions"
              style={{
                marginTop: "0.75rem",
                paddingBottom: "0.75rem",
                borderBottom: "1px solid #e2e8f0",
                flexWrap: "wrap"
              }}
            >
              <Boton principal={tipoDoc === "receta"} icono={FileText} onClick={() => setTipoDoc("receta")}>
                Receta médica
              </Boton>
              <Boton principal={tipoDoc === "cirugia"} icono={Scissors} onClick={() => setTipoDoc("cirugia")}>
                Consentimiento cirugía
              </Boton>
              <Boton principal={tipoDoc === "hospitalizacion"} icono={Activity} onClick={() => setTipoDoc("hospitalizacion")}>
                Consentimiento hospitalización
              </Boton>
            </div>
          )}

          <div className="ve-campos" style={{ marginTop: "0.75rem" }}>
            <div className="ve-field">
              <label>Médico veterinario que receta / firma *</label>
              <input
                type="text"
                value={medico}
                onChange={(e) => setMedico(e.target.value)}
                list="ve-medicos-receta"
                placeholder="Ej. MVZ. Cristhian Romero"
                required
              />
              <datalist id="ve-medicos-receta">
                {[
                  "MVZ. Cristhian Romero",
                  "Dr. Franklin Pazmiño",
                  ...profesionales.filter(
                    (p) => p !== "MVZ. Cristhian Romero" && p !== "Dr. Franklin Pazmiño"
                  )
                ].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <div className="ve-field">
              <label>Registro profesional (opcional)</label>
              <input
                type="text"
                value={registroProf}
                onChange={(e) => setRegistroProf(e.target.value)}
                placeholder="Ej. Reg. SENESCYT / MP"
              />
            </div>

            <div className="ve-field">
              <label>Fecha del documento</label>
              <input
                type="date"
                value={fechaEmision}
                onChange={(e) => setFechaEmision(e.target.value)}
              />
            </div>
          </div>

          {tipoDoc === "receta" ? (
            <div style={{ marginTop: "0.85rem", display: "grid", gap: "0.85rem" }}>
              {/* Opciones rápidas de medicamentos frecuentes */}
              <div
                style={{
                  background: "#f0fdfa",
                  border: "1px solid #5eead4",
                  borderRadius: "10px",
                  padding: "0.6rem 0.75rem",
                  display: "grid",
                  gap: "0.45rem"
                }}
              >
                <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#115e59", textTransform: "uppercase" }}>
                  Agregar medicamento frecuente en 1 toque:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {MEDICAMENTOS_RAPIDOS_RECETA.map((med) => (
                    <button
                      key={med.nombre}
                      type="button"
                      onClick={() => agregarMedicamentoRapidoRx(med)}
                      style={{
                        padding: "0.32rem 0.65rem",
                        borderRadius: "999px",
                        border: "1px solid #2dd4bf",
                        background: "#ffffff",
                        color: "#115e59",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem"
                      }}
                    >
                      <Plus size={13} color="#0f766e" />
                      {med.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "10px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", textAlign: "left", color: "#334155", borderBottom: "1px solid #cbd5e1" }}>
                      <th style={{ padding: "0.45rem" }}>Medicamento</th>
                      <th style={{ padding: "0.45rem", width: "130px" }}># Cantidad</th>
                      <th style={{ padding: "0.45rem", width: "130px" }}>Vía</th>
                      <th style={{ padding: "0.45rem", width: "120px" }}>Dosis</th>
                      <th style={{ padding: "0.45rem", width: "115px" }}>Cada (frec.)</th>
                      <th style={{ padding: "0.45rem", width: "110px" }}>Durante</th>
                      <th style={{ width: "32px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasRx.map((fila) => (
                      <tr key={fila.id} style={{ borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
                        <td style={{ padding: "0.35rem" }}>
                          <input
                            type="text"
                            value={fila.medicamento}
                            onChange={(e) => actualizarFilaRx(fila.id, "medicamento", e.target.value)}
                            placeholder="Ej. Amoxicilina + Ác. Clavulánico 250 mg"
                            style={{ width: "100%", padding: "0.38rem 0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                        </td>
                        <td style={{ padding: "0.35rem" }}>
                          <input
                            type="text"
                            value={fila.cantidadTotal}
                            onChange={(e) => actualizarFilaRx(fila.id, "cantidadTotal", e.target.value)}
                            placeholder="1 caja (14 tab)"
                            style={{ width: "100%", padding: "0.38rem 0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                        </td>
                        <td style={{ padding: "0.35rem" }}>
                          <select
                            value={fila.via}
                            onChange={(e) => actualizarFilaRx(fila.id, "via", e.target.value)}
                            style={{ width: "100%", padding: "0.38rem 0.35rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          >
                            {VIAS_ADMINISTRACION.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "0.35rem" }}>
                          <input
                            type="text"
                            value={fila.dosis}
                            onChange={(e) => actualizarFilaRx(fila.id, "dosis", e.target.value)}
                            placeholder="1 tableta / 2 ml"
                            style={{ width: "100%", padding: "0.38rem 0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                        </td>
                        <td style={{ padding: "0.35rem" }}>
                          <input
                            type="text"
                            value={fila.frecuencia}
                            onChange={(e) => actualizarFilaRx(fila.id, "frecuencia", e.target.value)}
                            placeholder="12 horas"
                            style={{ width: "100%", padding: "0.38rem 0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                        </td>
                        <td style={{ padding: "0.35rem" }}>
                          <input
                            type="text"
                            value={fila.duracion}
                            onChange={(e) => actualizarFilaRx(fila.id, "duracion", e.target.value)}
                            placeholder="7 días"
                            style={{ width: "100%", padding: "0.38rem 0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                          />
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => quitarFilaRx(fila.id)}
                            className="ve-link"
                            title="Quitar medicamento"
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <Boton icono={Plus} onClick={agregarFilaRx}>
                  Agregar medicamento
                </Boton>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  padding: "0.75rem 0.9rem"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", color: "#475569" }}>
                    Vista previa en PDF (con logo y firma de {medico.trim() || "Médico"})
                  </span>
                  <LogoClinicaElPibe ancho={110} />
                </div>

                {itemsValidosRx.length === 0 ? (
                  <p className="ve-meta" style={{ margin: 0 }}>
                    Escribe un medicamento arriba para ver cómo quedará redactado en el PDF...
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: "0.55rem", fontSize: "0.86rem" }}>
                    {itemsValidosRx.map((item, idx) => {
                      const { encabezado, instruccion } = formatearItemReceta(item);
                      return (
                        <div key={item.id}>
                          <strong style={{ color: "#0f172a" }}>
                            {idx + 1}. {encabezado}
                          </strong>
                          {instruccion && (
                            <div style={{ color: "#334155", paddingLeft: "0.85rem" }}>
                              {instruccion}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="ve-campos">
                <div className="ve-field ve-ancho">
                  <label>Indicaciones generales / Dieta / Cuidados en casa</label>
                  <textarea
                    rows={2}
                    value={indicacionesGenerales}
                    onChange={(e) => setIndicacionesGenerales(e.target.value)}
                    placeholder="Ej. Administrar junto con comida, dieta blanda por 3 días, mantener collar isabelino..."
                  />
                </div>
                <div className="ve-field">
                  <label>Fecha próximo control (opcional)</label>
                  <input
                    type="date"
                    value={proximoControl}
                    onChange={(e) => setProximoControl(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : tipoDoc === "cirugia" ? (
            <div className="ve-campos" style={{ marginTop: "0.85rem" }}>
              <div className="ve-field">
                <label>Procedimiento quirúrgico *</label>
                <input
                  type="text"
                  value={procedimientoCirugia}
                  onChange={(e) => setProcedimientoCirugia(e.target.value)}
                  placeholder="Ej. Ovariohisterectomía (OVH), Profilaxis dental..."
                />
              </div>
              <div className="ve-field">
                <label>Diagnóstico / Motivo</label>
                <input
                  type="text"
                  value={diagnosticoDoc}
                  onChange={(e) => setDiagnosticoDoc(e.target.value)}
                  placeholder="Ej. Esterilización electiva, Piómetra..."
                />
              </div>
              <div className="ve-field ve-ancho">
                <label>Observaciones o riesgos particulares (opcional)</label>
                <textarea
                  rows={2}
                  value={observacionesConsentimiento}
                  onChange={(e) => setObservacionesConsentimiento(e.target.value)}
                  placeholder="Ej. Paciente geriátrico, ayuno verificado, exámenes prequirúrgicos revisados..."
                />
              </div>
            </div>
          ) : (
            <div className="ve-campos" style={{ marginTop: "0.85rem" }}>
              <div className="ve-field">
                <label>Motivo de ingreso / Diagnóstico presuntivo *</label>
                <input
                  type="text"
                  value={diagnosticoDoc}
                  onChange={(e) => setDiagnosticoDoc(e.target.value)}
                  placeholder="Ej. Gastroenteritis hemorrágica, Parvovirosis..."
                />
              </div>
              <div className="ve-field">
                <label>Área / Jaula asignada</label>
                <input
                  type="text"
                  value={areaJaula}
                  onChange={(e) => setAreaJaula(e.target.value)}
                  placeholder="Ej. Hospital general, Infectología..."
                />
              </div>
              <div className="ve-field ve-ancho">
                <label>Observaciones adicionales (opcional)</label>
                <textarea
                  rows={2}
                  value={observacionesConsentimiento}
                  onChange={(e) => setObservacionesConsentimiento(e.target.value)}
                  placeholder="Ej. Pronóstico reservado, se autoriza transfusión o exámenes de laboratorio..."
                />
              </div>
            </div>
          )}

          {errorGuardar && (
            <p className="ve-message" role="alert" style={{ marginTop: "0.75rem" }}>
              {errorGuardar}
            </p>
          )}

          {avisoGuardar && (
            <p className="ve-confirm" role="status" style={{ marginTop: "0.75rem" }}>
              {avisoGuardar}
            </p>
          )}

          <footer
            className="ve-actions ve-last"
            style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}
          >
            <Boton onClick={cerrar} disabled={guardandoNube}>
              Cerrar
            </Boton>

            <div className="ve-actions" style={{ flexWrap: "wrap" }}>
              <Boton icono={copiado ? Check : Copy} onClick={copiarTexto}>
                {copiado ? "Copiado" : "Copiar texto"}
              </Boton>

              {enlaceWhatsApp && (
                <a
                  href={enlaceWhatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ve-button"
                  style={{
                    background: "#16a34a",
                    borderColor: "#16a34a",
                    color: "#fff",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem"
                  }}
                >
                  <MessageCircle size={16} /> WhatsApp
                </a>
              )}

              {tipoDoc === "receta" ? (
                <>
                  <Boton icono={Download} onClick={descargarPdfDirecto} disabled={itemsValidosRx.length === 0}>
                    Descargar PDF
                  </Boton>
                  <button
                    type="button"
                    className="ve-button"
                    onClick={guardarRecetaPdfEnNube}
                    disabled={guardandoNube}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    <CloudUpload size={16} />
                    {guardandoNube
                      ? "Guardando PDF en la nube…"
                      : recetaInicial
                      ? "Guardar cambios en PDF"
                      : "Guardar PDF en la nube"}
                  </button>
                </>
              ) : (
                <Boton principal icono={Printer} onClick={() => window.print()}>
                  Imprimir / Guardar PDF
                </Boton>
              )}
            </div>
          </footer>
        </div>
      </dialog>

      {hojaImprimible}
    </>
  );
}

// ============================================================================
// PESTAÑA DE RECETAS ALMACENADAS EN LA NUBE (AL LADO DE EXÁMENES)
// ============================================================================
export function PestanaRecetas({
  paciente,
  atenciones = [],
  anexos = [],
  profesionales = [],
  repo,
  revision,
  onRecargar
}) {
  const android = globalThis.Capacitor?.getPlatform?.() === "android";
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [recetaEditando, setRecetaEditando] = useState(null);
  const [eliminandoId, setEliminandoId] = useState("");

  const ultimoPeso = atenciones.find((a) => a.peso != null)?.peso;

  const cargarRecetas = useCallback(
    async (signal) => {
      setCargando(true);
      setError("");
      try {
        const items = await repo.modulos.listar(paciente.id, "receta", signal);
        setLista(items || []);
      } catch (e) {
        if (e.name !== "AbortError") setError(e.message || "No se pudieron cargar las recetas.");
      } finally {
        setCargando(false);
      }
    },
    [paciente.id, repo]
  );

  useEffect(() => {
    const ac = new AbortController();
    cargarRecetas(ac.signal);
    return () => ac.abort();
  }, [cargarRecetas, revision]);

  function descargarRespaldoLocal(receta) {
    const pdfFile = generarArchivoPdfReceta({
      paciente,
      ultimoPeso,
      medico: receta.medico || "MVZ. Cristhian Romero",
      registroProf: receta.registroProf || "",
      fechaEmision: receta.fechaEmision || fechaLocal(new Date()).slice(0, 10),
      items: receta.items || [],
      indicacionesGenerales: receta.indicacionesGenerales || "",
      proximoControl: receta.proximoControl || ""
    });
    descargarBlobLocal(pdfFile);
  }

  async function eliminarReceta(receta) {
    if (eliminandoId === receta.id) return;
    if (!window.confirm(`¿Eliminar esta receta del ${fechaCorta(receta.fechaEmision)}?`)) return;

    setEliminandoId(receta.id);
    setError("");
    try {
      await repo.modulos.eliminar(receta.id);
      if (receta.anexoId && typeof repo.eliminarAnexo === "function") {
        await repo.eliminarAnexo(receta.anexoId).catch(() => {});
      }
      setLista((prev) => prev.filter((r) => r.id !== receta.id));
      setAviso("Receta eliminada.");
      setTimeout(() => setAviso(""), 3500);
      if (onRecargar) onRecargar();
    } catch (err) {
      setError(err.message || "No se pudo eliminar la receta.");
    } finally {
      setEliminandoId("");
    }
  }

  return (
    <section className="ve-panel ve-pad">
      <div className="ve-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>Recetas médicas ({lista.length})</h2>
          <p className="ve-meta" style={{ margin: "0.2rem 0 0" }}>
            Almacenadas en PDF en la nube para descargar, editar o eliminar en cualquier momento.
          </p>
        </div>

        <Boton
          principal
          icono={Plus}
          onClick={() => {
            setRecetaEditando(null);
            setModalAbierto(true);
          }}
        >
          Nueva receta
        </Boton>
      </div>

      {error && (
        <p className="ve-message" role="alert" style={{ marginTop: "0.75rem" }}>
          {error}
        </p>
      )}

      {aviso && (
        <p className="ve-confirm" role="status" style={{ marginTop: "0.75rem" }}>
          {aviso}
        </p>
      )}

      {cargando ? (
        <p className="ve-sub" style={{ marginTop: "0.75rem" }}>
          Cargando recetas guardadas…
        </p>
      ) : lista.length === 0 ? (
        <div className="ve-empty" style={{ marginTop: "0.75rem" }}>
          <FileText size={24} />
          <strong>Sin recetas guardadas</strong>
          <span>Crea una receta médica y guárdala en PDF en la nube para tenerla siempre disponible aquí.</span>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.85rem" }}>
          {lista.map((rec) => {
            const anexoNube = rec.anexoId ? anexos.find((a) => a.id === rec.anexoId) : null;

            return (
              <div
                key={rec.id}
                style={{
                  border: "1px solid var(--borde, #dce3ea)",
                  borderRadius: "10px",
                  padding: "0.8rem 0.9rem",
                  background: "#fff",
                  display: "grid",
                  gap: "0.55rem"
                }}
              >
                <div className="ve-row" style={{ alignItems: "flex-start", gap: "0.6rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>
                        Receta · {fechaCorta(rec.fechaEmision)}
                      </strong>
                      <span
                        className="ve-badge"
                        style={{ background: "#e0f2fe", color: "#0369a1", fontWeight: 700 }}
                      >
                        {rec.medico || "Médico Veterinario"}
                      </span>
                      {anexoNube && (
                        <span
                          className="ve-badge"
                          style={{ background: "#dcfce7", color: "#166534", fontWeight: 700 }}
                        >
                          PDF en nube
                        </span>
                      )}
                    </div>
                    {rec.nombrePdf && (
                      <p className="ve-meta" style={{ margin: "0.2rem 0 0" }}>
                        Archivo: {rec.nombrePdf}
                      </p>
                    )}
                  </div>

                  <div className="ve-actions" style={{ flexWrap: "wrap" }}>
                    {anexoNube ? (
                      <>
                        <a
                          href={repo.enlace(anexoNube, false)}
                          target={android ? "_self" : "_blank"}
                          rel="noopener noreferrer"
                          className="ve-link"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 700 }}
                        >
                          <ExternalLink size={14} /> Ver PDF
                        </a>
                        <a
                          href={repo.enlace(anexoNube, true)}
                          download={android ? undefined : anexoNube.nombre}
                          className="ve-link"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 700 }}
                        >
                          <Download size={14} /> Descargar PDF
                        </a>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => descargarRespaldoLocal(rec)}
                        className="ve-link"
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 700 }}
                      >
                        <Download size={14} /> Descargar PDF
                      </button>
                    )}

                    <Boton
                      icono={Pencil}
                      onClick={() => {
                        setRecetaEditando(rec);
                        setModalAbierto(true);
                      }}
                    >
                      Editar
                    </Boton>

                    <button
                      type="button"
                      onClick={() => eliminarReceta(rec)}
                      disabled={eliminandoId === rec.id}
                      style={{
                        background: "#fee2e2",
                        color: "#991b1b",
                        border: "1px solid #fca5a5",
                        borderRadius: "8px",
                        padding: "0.38rem 0.65rem",
                        fontWeight: 700,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem"
                      }}
                    >
                      <Trash2 size={14} />
                      {eliminandoId === rec.id ? "Eliminando…" : "Eliminar"}
                    </button>
                  </div>
                </div>

                {/* Detalle legible de los medicamentos prescritos */}
                <div
                  style={{
                    background: "#f8fafc",
                    borderRadius: "8px",
                    padding: "0.6rem 0.75rem",
                    display: "grid",
                    gap: "0.45rem",
                    fontSize: "0.85rem"
                  }}
                >
                  {(rec.items || []).map((item, idx) => {
                    const { encabezado, instruccion } = formatearItemReceta(item);
                    return (
                      <div key={item.id || idx}>
                        <strong style={{ color: "#0f172a" }}>
                          {idx + 1}. {encabezado}
                        </strong>
                        {instruccion && (
                          <div style={{ color: "#334155", paddingLeft: "0.8rem" }}>{instruccion}</div>
                        )}
                      </div>
                    );
                  })}

                  {rec.indicacionesGenerales && (
                    <div className="ve-meta" style={{ marginTop: "0.2rem", borderTop: "1px dashed #cbd5e1", paddingTop: "0.35rem" }}>
                      <strong>Indicaciones:</strong> {rec.indicacionesGenerales}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalAbierto && (
        <ModalDocumentosClinicos
          paciente={paciente}
          atenciones={atenciones}
          profesionales={profesionales}
          repo={repo}
          tipoInicial="receta"
          recetaInicial={recetaEditando}
          cerrar={() => {
            setModalAbierto(false);
            setRecetaEditando(null);
          }}
          onRecetaGuardada={(guardada) => {
            setLista((prev) => {
              const existe = prev.some((r) => r.id === guardada.id);
              return existe
                ? prev.map((r) => (r.id === guardada.id ? guardada : r))
                : [guardada, ...prev];
            });
            if (onRecargar) onRecargar();
          }}
        />
      )}
    </section>
  );
}
