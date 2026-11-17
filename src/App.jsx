import React, { useEffect, useState, useRef } from "react";
import {
  Camera, Search, Plus, Pencil, RefreshCw, ArrowLeft, ChevronRight,
  FolderOpen, Paperclip, Activity, FileText, X, Scissors, Receipt,
  LogOut, Droplets, CheckCircle2, Trash2
} from "lucide-react";
import { crearRepositorio, etiquetas, fechaCorta, fechaLocal, hora, edad, uuid } from "./datos.mjs";
import { config, marca } from "./config";
import "./estilos.css";
import { Boton, Campo } from "./Campos.jsx";
import { CamposClinicos, ValoresClinicos } from "./CamposClinicos.jsx";
import { AvatarPaciente, EditorFoto } from "./Identificacion.jsx";
import { HojaHospital } from "./HojaHospital.jsx";
import { camposDe, extraerCampos } from "./registro.mjs";

const repo = crearRepositorio(config);

const OPCIONES_JAULAS = [
  ["", "Seleccionar jaula / área"],
  ["Hospital general", "Hospital general"],
  ["Infectología", "Infectología"],
  ["UCI", "UCI / Cuidados intensivos"],
  ["Post-quirúrgico", "Post-quirúrgico"],
  ["Jaulas metálicas", "Jaulas metálicas"],
  ["Jaulas de adopción", "Jaulas de adopción"]
];

const TIPOS_TERAPIA_HOSP = [
  "Medicamento tópico",
  "Curación de herida",
  "Baño medicado / terapéutico",
  "Ozonoterapia",
  "Nebulización"
];

// Almacenamiento local sincronizado por paciente/ingreso para módulos extendidos
function leerStore(clave, fallback) {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function guardarStore(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch (e) {
    console.error("Error guardando en almacenamiento local:", e);
  }
}

function SelectorJaula({ valor }) {
  const opciones = valor && !OPCIONES_JAULAS.some(([v]) => v === valor)
    ? [...OPCIONES_JAULAS, [valor, valor]]
    : OPCIONES_JAULAS;
  return <Campo etiqueta="Jaula / Área" nombre="jaula" valor={valor || ""} opciones={opciones} />;
}

// ============================================================================
// FORMULARIO PRINCIPAL (PACIENTE / ATENCIÓN / EXAMEN)
// ============================================================================
function Formulario({ modelo, cerrar, guardado, recargar }) {
  const { clase, d, pid } = modelo;
  const paciente = clase === "paciente";
  const estudio = clase === "examen";
  const [tipo, Tipo] = useState(d.tipo || "consulta");
  const [enviando, Enviando] = useState(false);
  const [error, ErrorF] = useState("");
  const [conflicto, Conflicto] = useState(false);
  const dialog = useRef(null);
  const operacion = useRef(d.id || uuid());
  const ocupado = useRef(false);
  const ultimoArchivo = useRef(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  async function enviar(e) {
    e.preventDefault();
    if (ocupado.current || conflicto) return;
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    ocupado.current = true;
    Enviando(true);
    ErrorF("");
    try {
      if (estudio) {
        const archivo = datos.archivo;
        if (!archivo?.size) throw Error("Selecciona un archivo.");
        const firma = [archivo.name, archivo.size, archivo.lastModified, datos.visita, datos.categoria].join("|");
        if (ultimoArchivo.current !== firma) {
          operacion.current = uuid();
          ultimoArchivo.current = firma;
        }
        await repo.subir(operacion.current, datos.visita, archivo, datos.categoria);
      } else if (paciente) {
        await repo.guardarPaciente({
          ...datos,
          id: operacion.current,
          version: d.version || 0,
          version_propietario: d.version_propietario || 0
        });
      } else {
        const detalle_clinico = extraerCampos(datos, camposDe(tipo));
        const comunes = Object.fromEntries(Object.entries(datos).filter(([k]) => !k.startsWith("clin_")));
        const abierta = tipo === "hospitalizacion" && datos.abierta === "on";
        await repo.guardarAtencion({
          ...comunes,
          detalle_clinico,
          id: operacion.current,
          paciente_id: pid,
          version: d.version || 0,
          abierta
        });
      }
      guardado(
        paciente ? operacion.current : pid,
        estudio ? "Examen adjuntado." : "Cambios guardados.",
        !paciente && !estudio && tipo === "hospitalizacion" ? operacion.current : null
      );
    } catch (err) {
      ErrorF(err.message || "No se pudo guardar.");
      if (err.codigo === "40001") Conflicto(true);
    } finally {
      ocupado.current = false;
      Enviando(false);
    }
  }

  return (
    <dialog
      className={"ve-dialog " + (!paciente && !estudio ? "ve-dialog-clinico" : "")}
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!ocupado.current) cerrar();
      }}
      aria-labelledby="titulo-form"
    >
      <form onSubmit={enviar}>
        <div className="ve-row">
          <h2 id="titulo-form">
            {estudio
              ? "Adjuntar examen"
              : paciente
              ? d.version
                ? "Editar paciente"
                : "Nuevo paciente"
              : d.version
              ? "Editar " + (etiquetas[tipo] || "atención").toLowerCase()
              : tipo === "hospitalizacion"
              ? "Nuevo ingreso"
              : tipo === "consulta"
              ? "Nueva consulta"
              : "Nueva atención"}
          </h2>
          <Boton icono={X} aria-label="Cerrar" onClick={cerrar} disabled={enviando} />
        </div>

        <div className="ve-campos">
          {paciente ? (
            <>
              <Campo etiqueta="Nombre del paciente" nombre="nombre" valor={d.nombre} required maxLength={100} />
              <Campo
                etiqueta="Especie"
                nombre="especie"
                valor={d.especie || ""}
                opciones={[
                  ["", "Seleccionar"],
                  ...["Can
