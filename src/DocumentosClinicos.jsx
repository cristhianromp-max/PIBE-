import React, { useState, useRef, useEffect } from "react";
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
  Check
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
      {/* Círculo izquierdo: Cruz médica negra */}
      <circle cx="66" cy="40" r="25" fill="none" stroke="#222222" strokeWidth="4.5" />
      <rect x="61.5" y="26" width="9" height="28" rx="1.5" fill="#222222" />
      <rect x="52" y="35.5" width="28" height="9" rx="1.5" fill="#222222" />

      {/* Círculo central: Huella en aro rojo */}
      <circle cx="150" cy="40" r="25" fill="none" stroke="#d92b2b" strokeWidth="4.5" />
      <g fill="#222222">
        {/* Almohadilla central */}
        <path d="M150 40.5c-5.5 0-10.5 4.2-10.5 8.5 0 2.5 2.1 4.2 4.8 4.2 2.1 0 3.7-.9 5.7-.9s3.6.9 5.7.9c2.7 0 4.8-1.7 4.8-4.2 0-4.3-5-8.5-10.5-8.5z" />
        {/* Dedos */}
        <ellipse cx="138.5" cy="36.5" rx="2.7" ry="3.8" transform="rotate(-22 138.5 36.5)" />
        <ellipse cx="145.5" cy="30.5" rx="2.8" ry="4.1" transform="rotate(-8 145.5 30.5)" />
        <ellipse cx="154.5" cy="30.5" rx="2.8" ry="4.1" transform="rotate(8 154.5 30.5)" />
        <ellipse cx="161.5" cy="36.5" rx="2.7" ry="3.8" transform="rotate(22 161.5 36.5)" />
      </g>

      {/* Círculo derecho: Pulso ECG en aro celeste */}
      <circle cx="234" cy="40" r="25" fill="none" stroke="#64c7d6" strokeWidth="4.5" />
      <polyline
        points="213,41 222,41 225,45 230,27 236,52 241,36 244,41 255,41"
        fill="none"
        stroke="#222222"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Tipografía institucional */}
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
// FORMATEADOR DE LÍNEAS DE RECETA (FORMATO EXACTO SOLICITADO)
// ============================================================================
function formatearItemReceta(item) {
  const med = item.medicamento.trim();
  const cantLimpia = item.cantidadTotal.trim().replace(/^#+\s*/, "");
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
// MODAL PRINCIPAL DE RECETAS Y CONSENTIMIENTOS
// ============================================================================
export function ModalDocumentosClinicos({
  paciente,
  atenciones = [],
  profesionales = [],
  cerrar,
  tipoInicial = "receta"
}) {
  const dialog = useRef(null);
  const [tipoDoc, setTipoDoc] = useState(tipoInicial); // "receta" | "cirugia" | "hospitalizacion"
  const [copiado, setCopiado] = useState(false);

  // Datos del médico y emisión
  const ultimaAtencion = atenciones[0] || null;
  const hospitalActiva = atenciones.find((a) => a.tipo === "hospitalizacion" && a.abierta);
  const ultimoPeso = atenciones.find((a) => a.peso != null)?.peso;

  const [medico, setMedico] = useState(
    ultimaAtencion?.profesional || "MVZ. Cristhian Romero"
  );
  const [registroProf, setRegistroProf] = useState("");
  const [fechaEmision, setFechaEmision] = useState(fechaLocal(new Date()).slice(0, 10));

  // Estado: Receta Médica
  const [filasRx, setFilasRx] = useState(() => [
    crearFilaReceta(),
    crearFilaReceta()
  ]);
  const [indicacionesGenerales, setIndicacionesGenerales] = useState("");
  const [proximoControl, setProximoControl] = useState("");

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

  function agregarFilaRx() {
    setFilasRx((prev) => [...prev, crearFilaReceta()]);
  }

  function quitarFilaRx(id) {
    setFilasRx((prev) =>
      prev.length > 1 ? prev.filter((f) => f.id !== id) : [crearFilaReceta()]
    );
  }

  const itemsValidosRx = filasRx.filter((f) => f.medicamento.trim() !== "");

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
    } catch {
      // Fallback silencioso
    }
  }

  function imprimirPdf() {
    window.print();
  }

  const enlaceWhatsApp = obtenerEnlaceWhatsApp(
    paciente.telefono,
    construirTextoWhatsApp()
  );

  // ==========================================================================
  // HOJA IMPRIMIBLE (PORTAL EN BODY PARA PDF LIMPIO EN PC Y ANDROID)
  // ==========================================================================
  const hojaImprimible = createPortal(
    <>
      <style>{`
        #ve-hoja-pdf-clinica {
          display: none;
        }
        @media print {
          @page {
            size: A4;
            margin: 14mm 15mm;
          }
          body > *:not(#ve-hoja-pdf-clinica) {
            display: none !important;
          }
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
        {/* Encabezado con Logo Oficial */}
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
            <div
              style={{
                fontSize: "16px",
                fontWeight: 800,
                textTransform: "uppercase",
                color: "#0f172a",
                letterSpacing: "0.03em"
              }}
            >
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

        {/* Datos del Paciente y Propietario */}
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
                  ultimoPeso != null
                    ? `${Number(ultimoPeso).toLocaleString("es-EC")} kg`
                    : ""
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

        {/* CUERPO DEL DOCUMENTO SEGÚN PESTAÑA */}
        {tipoDoc === "receta" ? (
          <div>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 800,
                color: "#0f172a",
                marginBottom: "10px",
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: "4px"
              }}
            >
              Rp / Prescripción:
            </div>

            {itemsValidosRx.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#64748b" }}>
                (Sin medicamentos registrados en la prescripción)
              </p>
            ) : (
              <div style={{ display: "grid", gap: "12px", marginBottom: "18px" }}>
                {itemsValidosRx.map((item, idx) => {
                  const { encabezado, instruccion } = formatearItemReceta(item);
                  return (
                    <div
                      key={item.id}
                      style={{
                        paddingBottom: "8px",
                        borderBottom: "1px dashed #cbd5e1"
                      }}
                    >
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                        {idx + 1}. {encabezado}
                      </div>
                      {instruccion && (
                        <div style={{ fontSize: "13.5px", color: "#1e293b", marginTop: "2px", paddingLeft: "14px" }}>
                          {instruccion}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {indicacionesGenerales.trim() && (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  fontSize: "13px",
                  marginBottom: "14px"
                }}
              >
                <strong>Indicaciones generales y cuidados en casa:</strong>
                <p style={{ margin: "4px 0 0", whiteSpace: "pre-line" }}>
                  {indicacionesGenerales.trim()}
                </p>
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
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "8px 12px",
                marginBottom: "12px"
              }}
            >
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
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "8px 12px",
                marginBottom: "12px"
              }}
            >
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

        {/* Bloques de Firma al pie */}
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
              <div
                style={{
                  borderTop: "1.5px solid #1e293b",
                  paddingTop: "6px",
                  fontWeight: 700
                }}
              >
                {paciente.propietario}
              </div>
              <div>Propietario / Responsable</div>
              <div>C.I.: {paciente.cedula || "________________"}</div>
            </div>
          )}

          <div style={{ width: tipoDoc === "receta" ? "52%" : "45%", textAlign: "center", fontSize: "12.5px" }}>
            <div
              style={{
                borderTop: "1.5px solid #1e293b",
                paddingTop: "6px",
                fontWeight: 700
              }}
            >
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
          cerrar();
        }}
        aria-labelledby="titulo-docs-clinicos"
      >
        <div>
          {/* Cabecera del Modal */}
          <div className="ve-row" style={{ alignItems: "flex-start", gap: "0.75rem" }}>
            <div>
              <h2 id="titulo-docs-clinicos" style={{ margin: 0 }}>
                Recetas y Documentos · {paciente.nombre}
              </h2>
              <p className="ve-meta" style={{ marginTop: "0.2rem" }}>
                Propietario: <strong>{paciente.propietario}</strong> · {paciente.especie}
                {ultimoPeso != null ? ` · ${Number(ultimoPeso).toLocaleString("es-EC")} kg` : ""}
              </p>
            </div>
            <Boton icono={X} aria-label="Cerrar" onClick={cerrar} />
          </div>

          {/* Selector de Tipo de Documento */}
          <div
            className="ve-actions"
            style={{
              marginTop: "0.75rem",
              paddingBottom: "0.75rem",
              borderBottom: "1px solid #e2e8f0",
              flexWrap: "wrap"
            }}
          >
            <Boton
              principal={tipoDoc === "receta"}
              icono={FileText}
              onClick={() => setTipoDoc("receta")}
            >
              Receta médica
            </Boton>
            <Boton
              principal={tipoDoc === "cirugia"}
              icono={Scissors}
              onClick={() => setTipoDoc("cirugia")}
            >
              Consentimiento cirugía
            </Boton>
            <Boton
              principal={tipoDoc === "hospitalizacion"}
              icono={Activity}
              onClick={() => setTipoDoc("hospitalizacion")}
            >
              Consentimiento hospitalización
            </Boton>
          </div>

          {/* Datos del Médico que receta / autoriza */}
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

          {/* FORMULARIO SEGÚN TIPO DE DOCUMENTO */}
          {tipoDoc === "receta" ? (
            <div style={{ marginTop: "0.85rem", display: "grid", gap: "0.85rem" }}>
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

              {/* Vista previa exacta de cómo saldrá escrito en el PDF */}
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
                    Escribe un medicamento arriba para ver cómo quedará redactado en la receta...
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

          {/* Pie de acciones */}
          <footer
            className="ve-actions ve-last"
            style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}
          >
            <Boton onClick={cerrar}>Cerrar</Boton>

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
                  <MessageCircle size={16} /> Enviar por WhatsApp
                </a>
              )}

              <Boton principal icono={Printer} onClick={imprimirPdf}>
                Imprimir / Guardar PDF
              </Boton>
            </div>
          </footer>
        </div>
      </dialog>

      {hojaImprimible}
    </>
  );
}
