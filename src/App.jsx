import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Camera, Search, Plus, Pencil, RefreshCw, ArrowLeft, ChevronRight,
  FolderOpen, Paperclip, Activity, FileText, X, Scissors, Receipt,
  LogOut, CheckCircle2, Trash2, Sparkles, Upload,
  Bell, Clock, AlertTriangle, MessageCircle, ExternalLink, LayoutGrid
} from "lucide-react";
import { crearRepositorio, etiquetas, fechaCorta, fechaLocal, hora, edad, uuid } from "./datos.mjs";
import { config, marca } from "./config";
import "./estilos.css";
import { Boton, Campo } from "./Campos.jsx";
import { CamposClinicos, ValoresClinicos } from "./CamposClinicos.jsx";
import { AvatarPaciente, EditorFoto } from "./Identificacion.jsx";
import { HojaHospital } from "./HojaHospital.jsx";
import { PizarraHospital } from "./PizarraHospital.jsx";
import { ModalDocumentosClinicos } from "./DocumentosClinicos.jsx";
import { agendaDelDia, camposDe, extraerCampos } from "./registro.mjs";

const repo = crearRepositorio(config);

const VENTANA_NOTIFICACION_MIN = 180; // 3 horas

const OPCIONES_JAULAS = [
  ["", "Seleccionar jaula / área"],
  ["Hospital general", "Hospital general"],
  ["Infectología", "Infectología"],
  ["UCI", "UCI / Cuidados intensivos"],
  ["Post-quirúrgico", "Post-quirúrgico"],
  ["Jaulas metálicas", "Jaulas metálicas"],
  ["Jaulas de adopción", "Jaulas de adopción"]
];

// ============================================================================
// UTILIDAD PARA ENLACE DIRECTO A WHATSAPP (ECUADOR +593)
// ============================================================================
function obtenerEnlaceWhatsApp(telefono) {
  const digitos = String(telefono || "").replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.startsWith("09") && digitos.length === 10) {
    return `https://wa.me/593${digitos.slice(1)}`;
  }
  if (digitos.startsWith("9") && digitos.length === 9) {
    return `https://wa.me/593${digitos}`;
  }
  return `https://wa.me/${digitos}`;
}

// ============================================================================
// UTILIDADES DE CÁLCULO DE HORARIOS (VENTANA < 3 HORAS Y PIZARRA)
// ============================================================================
function parsearFechaEcuador(str, ahoraMs = Date.now()) {
  if (!str) return null;
  if (str instanceof Date) return Number.isNaN(str.getTime()) ? null : str;
  const limpia = String(str).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(limpia)) {
    const hoy = fechaLocal(new Date(ahoraMs)).slice(0, 10);
    const hhmm = limpia.slice(0, 5);
    const dHora = new Date(`${hoy}T${hhmm}:00-05:00`);
    return Number.isNaN(dHora.getTime()) ? null : dHora;
  }
  const conT = limpia.replace(" ", "T");
  let iso = conT;
  if (conT.length === 16) {
    iso = `${conT}:00-05:00`;
  } else if (conT.length === 19 && !/[Z+-]/.test(conT.slice(10))) {
    iso = `${conT}-05:00`;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parsearIntervaloMinutos(frecuencia) {
  const txt = String(frecuencia || "").toLowerCase().trim();
  const matchHoras = txt.match(/(?:cada|c\/)\s*(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas)?\b/);
  if (matchHoras) {
    const val = parseFloat(matchHoras[1].replace(",", "."));
    if (val > 0) return Math.round(val * 60);
  }
  const matchMin = txt.match(/(?:cada|c\/)\s*(\d+)\s*(?:m|min|mins|minuto|minutos)\b/);
  if (matchMin) {
    const val = parseInt(matchMin[1], 10);
    if (val > 0) return val;
  }
  if (/\bsid\b|1\s*vez|una\s*vez|diario|cada\s*d[ií]a/.test(txt)) return 1440;
  if (/\bbid\b|2\s*veces/.test(txt)) return 720;
  if (/\btid\b|3\s*veces/.test(txt)) return 480;
  if (/\bqid\b|4\s*veces/.test(txt)) return 360;
  return 720;
}

function formatearTiempoRelativo(minutosAbs) {
  if (minutosAbs < 1) return "ahora mismo";
  if (minutosAbs < 60) return `${minutosAbs} min`;
  const h = Math.floor(minutosAbs / 60);
  const m = minutosAbs % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function calcularEstadoDosis(item, ahoraMs) {
  const intervaloMin = item.intervalo_horas
    ? Number(item.intervalo_horas) * 60
    : parsearIntervaloMinutos(item.frecuencia);
  const esDosisUnica =
    item.pauta === "unica" || /\b(unica|única|stat|1\s*vez|una\s*vez)\b/i.test(String(item.frecuencia || ""));

  const appsParseadas = (item.aplicaciones || [])
    .map((ap) => {
      const dt = parsearFechaEcuador(ap.fecha || ap.hora, ahoraMs);
      return dt ? { ...ap, ts: dt.getTime() } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts);

  let proximaDate = null;
  if (appsParseadas.length > 0) {
    proximaDate = new Date(appsParseadas[0].ts + intervaloMin * 60000);
  } else {
    proximaDate = parsearFechaEcuador(
      item.programada ||
        item.proximaManual ||
        item.proximaDosis ||
        item.proxima ||
        item.horaProgramada ||
        item.fechaInicio ||
        item.inicio,
      ahoraMs
    );
  }

  if (!proximaDate) {
    proximaDate = new Date(ahoraMs);
  }

  const diffMin = Math.round((proximaDate.getTime() - ahoraMs) / 60000);
  const urgencia = diffMin < 0 ? "atrasado" : diffMin <= VENTANA_NOTIFICACION_MIN ? "proximo" : "programado";

  const visibleEnNotificaciones =
    item.activa !== false &&
    !item.suspendida_en &&
    !(esDosisUnica && appsParseadas.length > 0) &&
    diffMin <= VENTANA_NOTIFICACION_MIN;

  return {
    proximaDate,
    proximaHora: hora(proximaDate),
    diffMin,
    urgencia,
    visibleEnNotificaciones,
    etiquetaTiempo:
      diffMin < 0
        ? `Atrasado ${formatearTiempoRelativo(Math.abs(diffMin))}`
        : diffMin === 0
        ? "Toca ahora"
        : `En ${formatearTiempoRelativo(diffMin)} (${hora(proximaDate)})`
  };
}

function sumarDiasIso(isoFecha, dias) {
  const [y, m, d] = isoFecha.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

function evaluarEstadoSlot(item, ahoraMs) {
  const diffMin = Math.round((item.slotTs - ahoraMs) / 60000);
  const urgencia = diffMin < 0 ? "atrasado" : diffMin <= VENTANA_NOTIFICACION_MIN ? "proximo" : "programado";
  return {
    proximaDate: new Date(item.slotTs),
    proximaHora: item.hor,
    diffMin,
    urgencia,
    visibleEnNotificaciones: diffMin <= VENTANA_NOTIFICACION_MIN,
    etiquetaTiempo:
      diffMin < 0
        ? `Atrasado ${formatearTiempoRelativo(Math.abs(diffMin))}`
        : diffMin === 0
        ? "Toca ahora"
        : `En ${formatearTiempoRelativo(diffMin)} (${item.hor})`
  };
}

function extraerPendientesMedicacion(hojaHoy, hojaManana, pac, adm, ahoraMs) {
  const hoy = fechaLocal(new Date(ahoraMs)).slice(0, 10);
  const manana = sumarDiasIso(hoy, 1);

  const slotsBrutos = [
    ...(hojaHoy ? agendaDelDia(hojaHoy, hoy) : []),
    ...(hojaManana ? agendaDelDia(hojaManana, manana) : [])
  ];

  const vistos = new Set();
  const lista = [];

  for (const slot of slotsBrutos) {
    const { orden, programada, toma } = slot;
    if (!orden || !programada || toma) continue;
    if (orden.suspendida_en) continue;

    const clave = `${orden.id}|${programada}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    if (orden.pauta === "unica" && (hojaHoy?.tomas || []).some((t) => t.orden_id === orden.id)) {
      continue;
    }

    const slotDate = parsearFechaEcuador(programada, ahoraMs);
    if (!slotDate) continue;

    lista.push({
      id: `med_${orden.id}_${programada}`,
      ordenId: orden.id,
      esAgendaHoja: true,
      pacienteId: pac.id,
      pacienteNombre: pac.nombre,
      admisionId: adm.id,
      tipo: "Medicación",
      producto: orden.medicina,
      dosis: [orden.dosis, orden.via].filter(Boolean).join(" · "),
      hor: hora(slotDate),
      slotTs: slotDate.getTime()
    });
  }

  return lista;
}

function extraerPendientesProcedimientos(procs, pac, adm, ahoraMs) {
  const hoy = fechaLocal(new Date(ahoraMs)).slice(0, 10);
  const manana = sumarDiasIso(hoy, 1);
  const lista = [];

  for (const proc of procs) {
    if (proc.activa === false) continue;
    const inicio = proc.fechaInicio || hoy;
    const fin = proc.fechaFin || inicio;
    const limiteFin = fin < manana ? fin : manana;
    if (inicio > limiteFin) continue;

    const createdTs = proc.creado ? Date.parse(proc.creado) : 0;
    const horarios = Array.isArray(proc.horarios) && proc.horarios.length ? proc.horarios : ["09:00"];
    let cursor = inicio;

    for (let i = 0; i < 65 && cursor <= limiteFin; i++, cursor = sumarDiasIso(cursor, 1)) {
      for (const hor of horarios) {
        const yaHecho = (proc.registros || []).some((r) => r.fechaDia === cursor && r.horario === hor);
        if (yaHecho) continue;

        let slotTs;
        if (hor === "Única" || proc.frecuenciaCodigo === "unica") {
          slotTs = createdTs || Date.parse(`${cursor}T09:00:00-05:00`);
        } else {
          slotTs = Date.parse(`${cursor}T${hor}:00-05:00`);
          if (Number.isNaN(slotTs)) continue;
          if (createdTs && slotTs < createdTs - 60 * 60000) continue;
        }

        lista.push({
          id: `proc_${proc.id}_${cursor}_${hor}`,
          esProcedimiento: true,
          pacienteId: pac.id,
          pacienteNombre: pac.nombre,
          admisionId: adm.id,
          tipo: "Procedimiento",
          producto: proc.nombre,
          dosis: proc.indicaciones || proc.frecuenciaTexto,
          hor,
          slotTs
        });
      }
    }
  }

  return lista;
}

function SelectorJaula({ valor }) {
  const opciones =
    valor && !OPCIONES_JAULAS.some(([v]) => v === valor)
      ? [...OPCIONES_JAULAS, [valor, valor]]
      : OPCIONES_JAULAS;
  return <Campo etiqueta="Jaula / Área" nombre="jaula" valor={valor || ""} opciones={opciones} />;
}

// ============================================================================
// MODAL DE CONFIRMACIÓN PARA ELIMINAR PACIENTE DEFINITIVAMENTE
// ============================================================================
function ModalEliminarPaciente({ paciente, atenciones, anexos, cerrar, onEliminado }) {
  const dialog = useRef(null);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  async function confirmarEliminacion() {
    if (eliminando) return;
    setEliminando(true);
    setError("");
    try {
      const tiposModulos = ["cirugia", "cotizacion", "peluqueria"];
      for (const tipo of tiposModulos) {
        try {
          const items = await repo.modulos.listar(paciente.id, tipo);
          await Promise.all(items.map((it) => repo.modulos.eliminar(it.id)));
        } catch {
          // Continuar si algún módulo no tiene registros
        }
      }

      if (typeof repo.eliminarPaciente === "function") {
        await repo.eliminarPaciente(paciente.id, { atenciones, anexos });
      } else {
        throw new Error(
          "Falta configurar la función 'eliminarPaciente' en datos.mjs para borrar archivos de la nube."
        );
      }

      onEliminado(paciente.id, paciente.nombre);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el paciente.");
      setEliminando(false);
    }
  }

  return (
    <dialog
      className="ve-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!eliminando) cerrar();
      }}
      aria-labelledby="titulo-eliminar-paciente"
    >
      <div>
        <div className="ve-row">
          <h2
            id="titulo-eliminar-paciente"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#991b1b" }}
          >
            <AlertTriangle size={20} color="#dc2626" /> Eliminar paciente
          </h2>
          <Boton icono={X} aria-label="Cerrar" onClick={cerrar} disabled={eliminando} />
        </div>

        <div
          style={{
            marginTop: "0.85rem",
            padding: "0.85rem",
            borderRadius: "8px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#7f1d1d",
            fontSize: "0.9rem",
            lineHeight: 1.45
          }}
        >
          <p style={{ margin: "0 0 0.5rem" }}>
            ¿Estás seguro de que deseas eliminar a <strong>{paciente.nombre}</strong> ({paciente.codigo})?
          </p>
          <p style={{ margin: 0 }}>
            <strong>Advertencia:</strong> Se perderán todos los datos de manera definitiva, incluyendo su historia
            clínica, hospitalizaciones, cirugías, cotizaciones y{" "}
            <strong>todos los exámenes y archivos subidos a la nube ({anexos.length})</strong>. Esta acción no se puede
            deshacer.
          </p>
        </div>

        {error && (
          <p className="ve-message" role="alert" style={{ marginTop: "0.75rem" }}>
            {error}
          </p>
        )}

        <footer className="ve-actions ve-last">
          <Boton onClick={cerrar} disabled={eliminando}>
            Cancelar
          </Boton>
          <button
            type="button"
            onClick={confirmarEliminacion}
            disabled={eliminando}
            style={{
              background: "#dc2626",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.55rem 0.95rem",
              fontWeight: 700,
              cursor: eliminando ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem"
            }}
          >
            <Trash2 size={15} />
            {eliminando ? "Eliminando datos y archivos…" : "Aceptar y eliminar definitivamente"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

// ============================================================================
// CENTRO DE NOTIFICACIONES (SOLO PRÓXIMOS EN < 3 HORAS, RESUMEN Y BOTÓN FICHA)
// ============================================================================
function ModalCentroNotificaciones({
  pendientes,
  pacientesLista,
  cerrar,
  onIrAPaciente,
  onRefrescar,
  cargando
}) {
  const dialog = useRef(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  return (
    <dialog
      className="ve-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        cerrar();
      }}
      aria-labelledby="titulo-notif"
    >
      <div>
        <div className="ve-row">
          <div>
            <h2 id="titulo-notif" style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <Bell size={18} /> Próximos a medicar (menos de 3 horas)
            </h2>
            <p className="ve-meta">
              {pendientes.length === 0
                ? "Sin medicaciones ni procedimientos pendientes en las próximas 3 horas."
                : `${pendientes.length} atención(es) requieren atención en menos de 3 horas.`}
            </p>
          </div>
          <div className="ve-actions">
            <Boton icono={RefreshCw} aria-label="Actualizar" onClick={onRefrescar} disabled={cargando} />
            <Boton icono={X} aria-label="Cerrar" onClick={cerrar} />
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.85rem", maxHeight: "62vh", overflowY: "auto" }}>
          {cargando ? (
            <p className="ve-sub">Cargando notificaciones…</p>
          ) : pendientes.length === 0 ? (
            <div className="ve-empty" style={{ padding: "1.4rem 1rem" }}>
              <CheckCircle2 size={24} color="#16a34a" />
              <strong>Todo al día</strong>
              <span>No hay pacientes por medicar ni procedimientos pendientes en menos de 3 horas.</span>
            </div>
          ) : (
            pendientes.map((item) => {
              const pacEncontrado = pacientesLista.find((p) => p.id === item.pacienteId);
              const nombrePac = item.pacienteNombre || pacEncontrado?.nombre || "Paciente hospitalizado";
              const esAtrasado = item.estado.urgencia === "atrasado";
              const producto = item.producto || item.medicamento || item.medicina || item.nombre || "Tratamiento";
              const resumen = [item.tipo, producto, item.dosis].filter(Boolean).join(" · ");

              return (
                <div
                  key={item.id}
                  style={{
                    border: `1px solid ${esAtrasado ? "#fca5a5" : "#fcd34d"}`,
                    borderLeft: `4px solid ${esAtrasado ? "#dc2626" : "#d97706"}`,
                    borderRadius: "8px",
                    padding: "0.7rem 0.85rem",
                    background: esAtrasado ? "#fef2f2" : "#fffbeb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.96rem", color: "#0f172a" }}>{nombrePac}</strong>
                      <span
                        className="ve-badge"
                        style={{
                          background: esAtrasado ? "#dc2626" : "#f59e0b",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "0.72rem"
                        }}
                      >
                        {item.estado.etiquetaTiempo}
                      </span>
                    </div>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.86rem", color: "#334155" }}>
                      {resumen}
                    </p>
                  </div>

                  {item.pacienteId && (
                    <Boton
                      principal
                      onClick={() => {
                        cerrar();
                        onIrAPaciente(item.pacienteId, item.admisionId);
                      }}
                    >
                      Ir a hospitalización
                    </Boton>
                  )}
                </div>
              );
            })
          )}
        </div>

        <footer className="ve-actions ve-last">
          <Boton onClick={cerrar}>Cerrar</Boton>
        </footer>
      </div>
    </dialog>
  );
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
                  ...["Canino", "Felino", "Ave", "Conejo", "Otra", ...([d.especie].filter((x) => x && !["Canino", "Felino", "Ave", "Conejo", "Otra"].includes(x)))].map((v) => [v, v])
                ]}
                required
              />
              <Campo etiqueta="Raza" nombre="raza" valor={d.raza} />
              <Campo
                etiqueta="Sexo"
                nombre="sexo"
                valor={d.sexo}
                opciones={[
                  ["", "Sin registrar"],
                  ["Macho", "Macho"],
                  ["Hembra", "Hembra"],
                  ["Indeterminado", "Indeterminado"]
                ]}
              />
              <Campo etiqueta="Fecha de nacimiento" nombre="nacimiento" valor={d.nacimiento} tipo="date" max={fechaLocal().slice(0, 10)} />
              <Campo etiqueta="Edad estimada" nombre="edad_estimada" valor={d.edad_estimada} placeholder="Si desconoces la fecha" />
              <Campo etiqueta="Propietario" nombre="propietario" valor={d.propietario} required maxLength={140} />
              <Campo etiqueta="Cédula" nombre="cedula" valor={d.cedula} minLength={3} maxLength={32} />
              <Campo etiqueta="Teléfono" nombre="telefono" valor={d.telefono} tipo="tel" maxLength={40} />
              {d.version > 0 && <p className="ve-meta ve-ancho">Los cambios del propietario se reflejan en sus otras mascotas.</p>}
            </>
          ) : estudio ? (
            <>
              <Campo
                etiqueta="Visita a la que pertenece"
                nombre="visita"
                valor={d.visita}
                opciones={modelo.atenciones.map((a) => [a.id, fechaCorta(a.inicio) + " · " + a.titulo])}
                required
              />
              <Campo
                etiqueta="Tipo de archivo"
                nombre="categoria"
                valor="diagnostico"
                opciones={[
                  ["diagnostico", "Estudio diagnóstico o PDF · conservar original"],
                  ["foto", "Foto de seguimiento · optimizar tamaño"]
                ]}
              />
              <label className="ve-field ve-ancho">
                Archivo
                <input type="file" name="archivo" accept="application/pdf,image/jpeg,image/png,image/webp" required />
              </label>
              <p className="ve-meta ve-ancho">PDF, JPG, PNG o WebP. Máximo 20 MiB por archivo.</p>
            </>
          ) : (
            <>
              <Campo etiqueta="Tipo de atención" nombre="tipo" valor={tipo} opciones={Object.entries(etiquetas)} onChange={(e) => Tipo(e.target.value)} />
              <Campo etiqueta="Fecha y hora en Ecuador" nombre="fecha_local" tipo="datetime-local" valor={fechaLocal(d.inicio || new Date())} required />
              <Campo etiqueta={tipo === "hospitalizacion" ? "Motivo de ingreso" : "Motivo de la atención"} nombre="titulo" valor={d.titulo} required maxLength={200} />
              <Campo etiqueta="Profesional que atendió (opcional)" nombre="profesional" valor={d.profesional} list="ve-profesionales" maxLength={140} />
              <datalist id="ve-profesionales">
                {(modelo.profesionales || []).map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <Campo etiqueta="Peso en kg" nombre="peso" tipo="number" min="0.001" max="9999.999" step="0.001" valor={d.peso} />
              {tipo === "hospitalizacion" && <SelectorJaula valor={d.jaula} />}
              {tipo === "hospitalizacion" && (
                <label className="ve-check">
                  <input type="checkbox" name="abierta" defaultChecked={d.abierta ?? true} /> Hospitalización activa
                </label>
              )}
              {d.abierta && tipo === "hospitalizacion" && (
                <p className="ve-meta ve-ancho">Al cerrar el ingreso se suspenden sus pautas activas.</p>
              )}
              <CamposClinicos tipo={tipo} datos={d.detalle_clinico || {}} />
              <div className="ve-ancho">
                <Campo etiqueta={tipo === "hospitalizacion" ? "Observaciones de ingreso" : "Observaciones"} nombre="resumen" tipo="textarea" valor={d.resumen} />
              </div>
            </>
          )}
        </div>

        {error && (
          <p className="ve-message" role="alert">
            {error}
          </p>
        )}

        <footer className="ve-actions ve-last">
          <Boton onClick={cerrar} disabled={enviando}>
            Cancelar
          </Boton>
          {conflicto ? (
            <Boton
              principal
              onClick={() => {
                cerrar();
                recargar();
              }}
            >
              Actualizar ficha
            </Boton>
          ) : (
            <button type="submit" className="ve-button" disabled={enviando}>
              {enviando ? "Guardando…" : estudio ? "Subir examen" : "Guardar"}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}

// ============================================================================
// MODAL DE ALTA MÉDICA DE HOSPITALIZACIÓN
// ============================================================================
function ModalAltaHospital({ paciente, admision, profesionales, cerrar, onAltaConfirmada }) {
  const dialog = useRef(null);
  const [fechaAlta, setFechaAlta] = useState(fechaLocal(new Date()));
  const [medicoAlta, setMedicoAlta] = useState(admision.profesional || "MVZ. Cristhian Romero");
  const [notasAlta, setNotasAlta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  async function confirmarAlta(e) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setError("");
    try {
      const notaFinal = `[ALTA MÉDICA ${fechaAlta.replace("T", " ")} · Por: ${medicoAlta}]${notasAlta.trim() ? `: ${notasAlta.trim()}` : ""}`;
      const resumenActualizado = [admision.resumen, notaFinal].filter(Boolean).join("\n");

      await repo.guardarAtencion({
        id: admision.id,
        paciente_id: paciente.id,
        tipo: "hospitalizacion",
        fecha_local: fechaLocal(admision.inicio || new Date()),
        titulo: admision.titulo,
        profesional: medicoAlta || admision.profesional || "",
        peso: admision.peso ?? "",
        jaula: admision.jaula || "",
        detalle_clinico: admision.detalle_clinico || {},
        resumen: resumenActualizado,
        version: admision.version || 0,
        abierta: false
      });

      onAltaConfirmada(paciente.id, `Alta médica registrada para ${paciente.nombre}.`);
    } catch (err) {
      setError(err.message || "No se pudo registrar el alta médica.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <dialog
      className="ve-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!guardando) cerrar();
      }}
      aria-labelledby="titulo-alta"
    >
      <form onSubmit={confirmarAlta}>
        <div className="ve-row">
          <h2 id="titulo-alta">Dar de alta · {paciente.nombre}</h2>
          <Boton icono={X} aria-label="Cerrar" onClick={cerrar} disabled={guardando} />
        </div>

        <div className="ve-campos">
          <p className="ve-meta ve-ancho">
            Ingreso: <strong>{fechaCorta(admision.inicio)}</strong> · Jaula:{" "}
            <strong>{admision.jaula || "Sin asignar"}</strong> · Motivo: <strong>{admision.titulo}</strong>
          </p>

          <div className="ve-field">
            <label>Fecha y hora de alta</label>
            <input
              type="datetime-local"
              value={fechaAlta}
              onChange={(e) => setFechaAlta(e.target.value)}
              required
            />
          </div>

          <div className="ve-field">
            <label>Médico que autoriza el alta</label>
            <input
              type="text"
              value={medicoAlta}
              onChange={(e) => setMedicoAlta(e.target.value)}
              list="ve-prof-alta"
              required
            />
            <datalist id="ve-prof-alta">
              {(profesionales || []).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className="ve-field ve-ancho">
            <label>Indicaciones de alta / Tratamiento en casa</label>
            <textarea
              rows={3}
              value={notasAlta}
              onChange={(e) => setNotasAlta(e.target.value)}
              placeholder="Ej. Dieta blanda por 3 días, continuar medicación oral en casa, control en 48h..."
            />
          </div>
        </div>

        {error && (
          <p className="ve-message" role="alert">
            {error}
          </p>
        )}

        <footer className="ve-actions ve-last">
          <Boton onClick={cerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <button type="submit" className="ve-button" disabled={guardando}>
            {guardando ? "Procesando alta…" : "Confirmar alta médica"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

// ============================================================================
// PESTAÑA DE CIRUGÍAS DEL PACIENTE (SINCRONIZADA EN SUPABASE)
// ============================================================================
function crearFilasBorradorMateriales() {
  return [
    { id: uuid(), nombre: "", cantidad: "" },
    { id: uuid(), nombre: "", cantidad: "" },
    { id: uuid(), nombre: "", cantidad: "" }
  ];
}

function PestanaCirugias({ paciente, atenciones, anexos, profesionales, onRecargar, revision }) {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [fechaProg, setFechaProg] = useState(fechaLocal(new Date()));
  const [estado, setEstado] = useState("Programada");
  const [motivo, setMotivo] = useState("");
  const [procedimiento, setProcedimiento] = useState("");
  const [cirujano, setCirujano] = useState("MVZ. Cristhian Romero");
  const [observaciones, setObservaciones] = useState("");
  const [archivoPreq, setArchivoPreq] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  const [borradoresMat, setBorradoresMat] = useState({});
  const [internistasMat, setInternistasMat] = useState({});
  const [guardandoMatId, setGuardandoMatId] = useState("");
  const [errorMat, setErrorMat] = useState({});
  const [avisoMat, setAvisoMat] = useState({});
  const [subiendoExtraId, setSubiendoExtraId] = useState("");
  const [obsEditadas, setObsEditadas] = useState({});

  const android = globalThis.Capacitor?.getPlatform?.() === "android";

  const cargarCirugias = useCallback(async (signal) => {
    setCargando(true);
    try {
      const items = await repo.modulos.listar(paciente.id, "cirugia", signal);
      setLista(items);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [paciente.id]);

  useEffect(() => {
    const ac = new AbortController();
    cargarCirugias(ac.signal);
    return () => ac.abort();
  }, [cargarCirugias, revision]);

  function obtenerBorrador(cirugiaId) {
    return borradoresMat[cirugiaId] || crearFilasBorradorMateriales();
  }

  function actualizarFilaBorrador(cirugiaId, filaId, campo, valor) {
    const actual = obtenerBorrador(cirugiaId);
    const siguiente = actual.map((f) => (f.id === filaId ? { ...f, [campo]: valor } : f));
    setBorradoresMat({ ...borradoresMat, [cirugiaId]: siguiente });
  }

  function agregarFilaBorrador(cirugiaId) {
    const actual = obtenerBorrador(cirugiaId);
    setBorradoresMat({
      ...borradoresMat,
      [cirugiaId]: [...actual, { id: uuid(), nombre: "", cantidad: "" }]
    });
  }

  function quitarFilaBorrador(cirugiaId, filaId) {
    const actual = obtenerBorrador(cirugiaId);
    if (actual.length <= 1) {
      setBorradoresMat({
        ...borradoresMat,
        [cirugiaId]: [{ id: uuid(), nombre: "", cantidad: "" }]
      });
      return;
    }
    setBorradoresMat({
      ...borradoresMat,
      [cirugiaId]: actual.filter((f) => f.id !== filaId)
    });
  }

  async function guardarYSubirMateriales(cirugia, e) {
    e.preventDefault();
    const cirugiaId = cirugia.id;
    if (guardandoMatId === cirugiaId) return;

    const internista = (internistasMat[cirugiaId] || "").trim();
    if (!internista) {
      setErrorMat({
        ...errorMat,
        [cirugiaId]: "Escribe primero el nombre del internista que realiza el registro."
      });
      return;
    }

    const filas = obtenerBorrador(cirugiaId);
    const validos = filas.filter((f) => f.nombre.trim() && f.cantidad.trim());
    if (validos.length === 0) {
      setErrorMat({
        ...errorMat,
        [cirugiaId]: "Ingresa al menos un material o hilo de sutura con su cantidad en la lista."
      });
      return;
    }

    setGuardandoMatId(cirugiaId);
    setErrorMat({ ...errorMat, [cirugiaId]: "" });
    try {
      const fechaReg = fechaLocal(new Date()).replace("T", " ");
      const nuevosItems = validos.map((f) => ({
        id: uuid(),
        nombre: f.nombre.trim(),
        cantidad: f.cantidad.trim(),
        internista,
        fechaRegistro: fechaReg
      }));

      const cirActualizada = {
        ...cirugia,
        materiales: [...(cirugia.materiales || []), ...nuevosItems]
      };

      await repo.modulos.guardar(paciente.id, "cirugia", cirActualizada);
      setLista((prev) => prev.map((c) => (c.id === cirugiaId ? cirActualizada : c)));
      setBorradoresMat({ ...borradoresMat, [cirugiaId]: crearFilasBorradorMateriales() });
      setAvisoMat({
        ...avisoMat,
        [cirugiaId]: `Se guardaron y subieron ${nuevosItems.length} material(es)/hilo(s) por ${internista}.`
      });
      setTimeout(() => {
        setAvisoMat((prev) => ({ ...prev, [cirugiaId]: "" }));
      }, 4000);
    } catch (err) {
      setErrorMat({ ...errorMat, [cirugiaId]: err.message || "No se pudo subir el registro." });
    } finally {
      setGuardandoMatId("");
    }
  }

  async function subirExamenPrequirurgico(file) {
    if (!file) return null;
    let visitaId = atenciones[0]?.id;
    if (!visitaId) {
      visitaId = uuid();
      await repo.guardarAtencion({
        id: visitaId,
        paciente_id: paciente.id,
        tipo: "consulta",
        fecha_local: fechaLocal(new Date()),
        titulo: "Evaluación prequirúrgica",
        profesional: cirujano,
        detalle_clinico: {},
        resumen: "Atención creada automáticamente para adjuntar examen prequirúrgico.",
        version: 0,
        abierta: false
      });
    }
    const anexoId = uuid();
    await repo.subir(anexoId, visitaId, file, "diagnostico");
    return { id: anexoId, nombre: file.name, fecha: fechaLocal(new Date()).slice(0, 10) };
  }

  async function registrarCirugia(e) {
    e.preventDefault();
    if (!motivo.trim() || !procedimiento.trim() || subiendo) return;
    setSubiendo(true);
    setError("");
    try {
      let preqAdjuntos = [];
      if (archivoPreq) {
        const adj = await subirExamenPrequirurgico(archivoPreq);
        if (adj) preqAdjuntos.push(adj);
      }

      const nueva = {
        id: uuid(),
        fechaProgramada: fechaProg,
        estado,
        motivo: motivo.trim(),
        procedimiento: procedimiento.trim(),
        cirujano: cirujano.trim(),
        observaciones: observaciones.trim(),
        examenesPreq: preqAdjuntos,
        materiales: []
      };

      const guardada = await repo.modulos.guardar(paciente.id, "cirugia", nueva);
      setLista((prev) => [guardada, ...prev]);
      setMotivo("");
      setProcedimiento("");
      setObservaciones("");
      setArchivoPreq(null);
      e.target.reset();
      if (preqAdjuntos.length > 0 && onRecargar) onRecargar();
    } catch (err) {
      setError(err.message || "Error al registrar la cirugía.");
    } finally {
      setSubiendo(false);
    }
  }

  async function adjuntarMasPreq(cirugia, file) {
    if (!file) return;
    setSubiendoExtraId(cirugia.id);
    try {
      const adj = await subirExamenPrequirurgico(file);
      if (adj) {
        const actualizada = {
          ...cirugia,
          examenesPreq: [...(cirugia.examenesPreq || []), adj]
        };
        await repo.modulos.guardar(paciente.id, "cirugia", actualizada);
        setLista((prev) => prev.map((c) => (c.id === cirugia.id ? actualizada : c)));
        if (onRecargar) onRecargar();
      }
    } catch (err) {
      alert(err.message || "No se pudo adjuntar el examen prequirúrgico.");
    } finally {
      setSubiendoExtraId("");
    }
  }

  async function eliminarMaterialCirugia(cirugia, matId) {
    const actualizada = {
      ...cirugia,
      materiales: (cirugia.materiales || []).filter((m) => m.id !== matId)
    };
    try {
      await repo.modulos.guardar(paciente.id, "cirugia", actualizada);
      setLista((prev) => prev.map((c) => (c.id === cirugia.id ? actualizada : c)));
    } catch (err) {
      alert(err.message || "No se pudo eliminar el material.");
    }
  }

  async function cambiarEstadoCirugia(cirugia, nuevoEstado) {
    const actualizada = { ...cirugia, estado: nuevoEstado };
    try {
      await repo.modulos.guardar(paciente.id, "cirugia", actualizada);
      setLista((prev) => prev.map((c) => (c.id === cirugia.id ? actualizada : c)));
    } catch (err) {
      alert(err.message || "No se pudo actualizar el estado.");
    }
  }

  async function guardarObsCirugia(cirugia) {
    const texto = obsEditadas[cirugia.id] ?? cirugia.observaciones ?? "";
    if (texto === (cirugia.observaciones || "")) return;
    const actualizada = { ...cirugia, observaciones: texto };
    try {
      await repo.modulos.guardar(paciente.id, "cirugia", actualizada);
      setLista((prev) => prev.map((c) => (c.id === cirugia.id ? actualizada : c)));
    } catch (err) {
      alert(err.message || "No se pudieron guardar las observaciones.");
    }
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section className="ve-panel ve-pad">
        <div className="ve-row">
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <Scissors size={18} /> Programar / Registrar Cirugía
          </h2>
        </div>

        <form onSubmit={registrarCirugia} className="ve-campos" style={{ marginTop: "0.75rem" }}>
          <div className="ve-field">
            <label>Fecha y hora de cirugía *</label>
            <input
              type="datetime-local"
              value={fechaProg}
              onChange={(e) => setFechaProg(e.target.value)}
              required
            />
          </div>

          <div className="ve-field">
            <label>Estado</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="Programada">Programada</option>
              <option value="Realizada">Realizada</option>
              <option value="Cancelada">Cancelada</option>
            </select>
          </div>

          <div className="ve-field">
            <label>Motivo de la cirugía *</label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Piómetra abierta, Fractura fémur, Esterilización..."
              required
            />
          </div>

          <div className="ve-field">
            <label>Cirugía a realizar *</label>
            <input
              type="text"
              value={procedimiento}
              onChange={(e) => setProcedimiento(e.target.value)}
              placeholder="Ej. Ovariohisterectomía (OVH), Osteosíntesis..."
              required
            />
          </div>

          <div className="ve-field">
            <label>Cirujano responsable</label>
            <input
              type="text"
              value={cirujano}
              onChange={(e) => setCirujano(e.target.value)}
              list="ve-prof-cirugia"
            />
            <datalist id="ve-prof-cirugia">
              {(profesionales || []).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className="ve-field">
            <label>Adjuntar examen prequirúrgico (PDF / Imagen)</label>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setArchivoPreq(e.target.files?.[0] || null)}
            />
          </div>

          <div className="ve-field ve-ancho">
            <label>Observaciones pre / post quirúrgicas</label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Protocolo anestésico, ayuno, hallazgos o cuidados postoperatorios..."
            />
          </div>

          {error && (
            <p className="ve-message ve-ancho" role="alert">
              {error}
            </p>
          )}

          <div className="ve-actions ve-ancho">
            <button type="submit" className="ve-button" disabled={subiendo}>
              {subiendo ? "Guardando en la nube…" : "Guardar registro de cirugía"}
            </button>
          </div>
        </form>
      </section>

      <section className="ve-panel ve-pad">
        <div className="ve-row">
          <h2>Historial de Cirugías ({lista.length})</h2>
          {cargando && <span className="ve-meta">Sincronizando…</span>}
        </div>

        {cargando ? (
          <p className="ve-sub">Cargando cirugías…</p>
        ) : lista.length === 0 ? (
          <p className="ve-sub">No hay cirugías programadas o realizadas para {paciente.nombre}.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.9rem", marginTop: "0.75rem" }}>
            {lista.map((cir) => {
              const filasBorrador = obtenerBorrador(cir.id);
              const internistaActual = internistasMat[cir.id] ?? "";
              const textoObsActual = obsEditadas[cir.id] !== undefined ? obsEditadas[cir.id] : cir.observaciones || "";

              return (
                <div
                  key={cir.id}
                  style={{
                    border: "1px solid var(--borde, #dce3ea)",
                    borderRadius: "12px",
                    padding: "0.9rem",
                    background: "#fff"
                  }}
                >
                  <div className="ve-row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
                    <div>
                      <span
                        className="ve-badge"
                        style={{
                          background:
                            cir.estado === "Realizada"
                              ? "#dcfce7"
                              : cir.estado === "Cancelada"
                              ? "#fee2e2"
                              : "#fef3c7",
                          color:
                            cir.estado === "Realizada"
                              ? "#166534"
                              : cir.estado === "Cancelada"
                              ? "#991b1b"
                              : "#92400e",
                          marginRight: "0.5rem"
                        }}
                      >
                        {cir.estado}
                      </span>
                      <span className="ve-meta">Fecha: {cir.fechaProgramada.replace("T", " ")}</span>
                      <h3 style={{ margin: "0.3rem 0 0.15rem", fontSize: "1.02rem" }}>{cir.procedimiento}</h3>
                      <p className="ve-meta">
                        Motivo: <strong>{cir.motivo}</strong> · Cirujano: {cir.cirujano || "Sin registrar"}
                      </p>
                    </div>

                    <div className="ve-actions">
                      <select
                        value={cir.estado}
                        onChange={(e) => cambiarEstadoCirugia(cir, e.target.value)}
                        className="ve-select"
                        aria-label="Estado de cirugía"
                      >
                        <option value="Programada">Programada</option>
                        <option value="Realizada">Realizada</option>
                        <option value="Cancelada">Cancelada</option>
                      </select>
                    </div>
                  </div>

                  {/* Exámenes prequirúrgicos vinculados */}
                  <div style={{ marginTop: "0.65rem", padding: "0.6rem", background: "#f8fafc", borderRadius: "8px" }}>
                    <div className="ve-row">
                      <strong style={{ fontSize: "0.85rem" }}>
                        Exámenes prequirúrgicos ({(cir.examenesPreq || []).length})
                      </strong>
                      <label className="ve-link" style={{ cursor: "pointer", fontSize: "0.82rem" }}>
                        <Paperclip size={14} style={{ verticalAlign: "middle", marginRight: "4px" }} />
                        {subiendoExtraId === cir.id ? "Subiendo a Drive…" : "+ Adjuntar examen prequirúrgico"}
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png,image/webp"
                          disabled={subiendoExtraId === cir.id}
                          onChange={(e) => {
                            adjuntarMasPreq(cir, e.target.files?.[0]);
                            e.target.value = "";
                          }}
                          style={{ display: "none" }}
                        />
                      </label>
                    </div>

                    {(cir.examenesPreq || []).length > 0 && (
                      <div style={{ display: "grid", gap: "0.35rem", marginTop: "0.45rem" }}>
                        {cir.examenesPreq.map((ex) => {
                          const realAnexo = anexos.find((a) => a.id === ex.id);
                          return (
                            <div key={ex.id} className="ve-row" style={{ fontSize: "0.84rem" }}>
                              <span>
                                - {ex.nombre} <span className="ve-meta">({ex.fecha})</span>
                              </span>
                              {realAnexo && (
                                <div className="ve-actions">
                                  <a
                                    href={repo.enlace(realAnexo, false)}
                                    target={android ? "_self" : "_blank"}
                                    rel="noopener noreferrer"
                                    className="ve-link"
                                  >
                                    Ver
                                  </a>
                                  <a
                                    href={repo.enlace(realAnexo, true)}
                                    download={android ? undefined : realAnexo.nombre}
                                    className="ve-link"
                                  >
                                    Descargar
                                  </a>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Materiales e hilos de sutura */}
                  <div style={{ marginTop: "0.75rem", padding: "0.75rem", border: "1px solid #cbd5e1", borderRadius: "10px", background: "#fcfdfe" }}>
                    <strong style={{ fontSize: "0.88rem", display: "block", marginBottom: "0.5rem" }}>
                      Registro de materiales e hilos de sutura utilizados
                    </strong>

                    <form onSubmit={(e) => guardarYSubirMateriales(cir, e)} style={{ display: "grid", gap: "0.6rem" }}>
                      <div className="ve-field" style={{ maxWidth: "360px" }}>
                        <label>Nombre del internista que registra *</label>
                        <input
                          type="text"
                          value={internistaActual}
                          onChange={(e) => setInternistasMat({ ...internistasMat, [cir.id]: e.target.value })}
                          placeholder="Escribe el nombre del internista..."
                          list={`ve-int-cir-${cir.id}`}
                        />
                        <datalist id={`ve-int-cir-${cir.id}`}>
                          {(profesionales || []).map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      </div>

                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                          <thead>
                            <tr style={{ textAlign: "left", background: "#f1f5f9", color: "#334155" }}>
                              <th style={{ padding: "0.4rem 0.5rem", width: "36px" }}>#</th>
                              <th style={{ padding: "0.4rem 0.5rem" }}>Material o hilo de sutura</th>
                              <th style={{ padding: "0.4rem 0.5rem", width: "180px" }}>Cantidad</th>
                              <th style={{ padding: "0.4rem 0.5rem", width: "40px" }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {filasBorrador.map((fila, idx) => (
                              <tr key={fila.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                                <td style={{ padding: "0.35rem 0.5rem", color: "#64748b", fontWeight: 600 }}>
                                  {idx + 1}
                                </td>
                                <td style={{ padding: "0.35rem 0.4rem" }}>
                                  <input
                                    type="text"
                                    placeholder="Ej. Sutura PGA 2-0, Nylon 3-0, Gasas, Propofol..."
                                    value={fila.nombre}
                                    onChange={(e) => actualizarFilaBorrador(cir.id, fila.id, "nombre", e.target.value)}
                                    style={{
                                      width: "100%",
                                      padding: "0.4rem 0.55rem",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1"
                                    }}
                                  />
                                </td>
                                <td style={{ padding: "0.35rem 0.4rem" }}>
                                  <input
                                    type="text"
                                    placeholder="Ej. 2 sobres, 5 ml..."
                                    value={fila.cantidad}
                                    onChange={(e) => actualizarFilaBorrador(cir.id, fila.id, "cantidad", e.target.value)}
                                    style={{
                                      width: "100%",
                                      padding: "0.4rem 0.55rem",
                                      borderRadius: "6px",
                                      border: "1px solid #cbd5e1"
                                    }}
                                  />
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  <button
                                    type="button"
                                    onClick={() => quitarFilaBorrador(cir.id, fila.id)}
                                    className="ve-link"
                                    title="Quitar fila"
                                  >
                                    <X size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {errorMat[cir.id] && (
                        <p className="ve-message" role="alert" style={{ margin: 0 }}>
                          {errorMat[cir.id]}
                        </p>
                      )}

                      {avisoMat[cir.id] && (
                        <p className="ve-confirm" role="status" style={{ margin: 0 }}>
                          {avisoMat[cir.id]}
                        </p>
                      )}

                      <div className="ve-actions">
                        <Boton icono={Plus} onClick={() => agregarFilaBorrador(cir.id)}>
                          Agregar fila a la lista
                        </Boton>
                        <button
                          type="submit"
                          className="ve-button"
                          disabled={guardandoMatId === cir.id}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                        >
                          <Upload size={15} />
                          {guardandoMatId === cir.id ? "Subiendo…" : "Guardar y subir"}
                        </button>
                      </div>
                    </form>

                    {(cir.materiales || []).length > 0 && (
                      <div style={{ marginTop: "0.85rem", paddingTop: "0.65rem", borderTop: "1px dashed #cbd5e1" }}>
                        <strong style={{ fontSize: "0.84rem", display: "block", marginBottom: "0.4rem", color: "#0f172a" }}>
                          Materiales e hilos registrados en esta cirugía ({cir.materiales.length})
                        </strong>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
                          <thead>
                            <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                              <th style={{ padding: "0.3rem 0.25rem" }}>Material / Hilo</th>
                              <th style={{ padding: "0.3rem 0.25rem" }}>Cantidad</th>
                              <th style={{ padding: "0.3rem 0.25rem" }}>Registrado por</th>
                              <th style={{ width: "36px" }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {cir.materiales.map((m) => (
                              <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "0.35rem 0.25rem", fontWeight: 600 }}>{m.nombre}</td>
                                <td style={{ padding: "0.35rem 0.25rem" }}>{m.cantidad}</td>
                                <td style={{ padding: "0.35rem 0.25rem" }} className="ve-meta">
                                  {m.internista || "Sin registrar"} {m.fechaRegistro ? `· ${m.fechaRegistro}` : ""}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    type="button"
                                    onClick={() => eliminarMaterialCirugia(cir, m.id)}
                                    className="ve-link"
                                    title="Eliminar registro"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Observaciones editables */}
                  <div className="ve-field" style={{ marginTop: "0.65rem" }}>
                    <label>Observaciones de la cirugía</label>
                    <textarea
                      rows={2}
                      value={textoObsActual}
                      onChange={(e) => setObsEditadas({ ...obsEditadas, [cir.id]: e.target.value })}
                      onBlur={() => guardarObsCirugia(cir)}
                      placeholder="Notas intraoperatorias o evolución postquirúrgica..."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// PESTAÑA DE COTIZACIONES (AGRUPADA, CON SALDO PENDIENTE Y MODAL DE DETALLE)
// ============================================================================
function crearFilasCotizacion() {
  return [
    { id: uuid(), tipoItem: "Medicina", descripcion: "", cantidad: "", nota: "" },
    { id: uuid(), tipoItem: "Material médico", descripcion: "", cantidad: "", nota: "" },
    { id: uuid(), tipoItem: "Insumo", descripcion: "", cantidad: "", nota: "" }
  ];
}

function normalizarEnlacePrefactura(url) {
  const limpio = String(url || "").trim();
  if (!limpio) return "";
  return /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
}

function ModalDetalleCotizacion({ grupo, cerrar, onEliminarItem }) {
  const dialog = useRef(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  if (!grupo) return null;

  const esCobrado = grupo.estadoCobro === "cobrado";
  const saldo = Number(grupo.saldoPendiente) || 0;

  return (
    <dialog
      className="ve-dialog ve-dialog-clinico"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        cerrar();
      }}
      aria-labelledby="titulo-detalle-cot"
    >
      <div>
        <div className="ve-row" style={{ alignItems: "flex-start", gap: "0.75rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <h2 id="titulo-detalle-cot" style={{ margin: 0 }}>
                Cotización #{grupo.numeroCotizacion}
              </h2>
              <span
                className="ve-badge"
                style={{
                  background: esCobrado ? "#dcfce7" : "#fee2e2",
                  color: esCobrado ? "#166534" : "#991b1b",
                  fontWeight: 700
                }}
              >
                {esCobrado ? "Cobrado" : "Pendiente"}
              </span>
              {saldo > 0 && (
                <span
                  className="ve-badge"
                  style={{
                    background: "#fef3c7",
                    color: "#92400e",
                    fontWeight: 700
                  }}
                >
                  Falta por pagar: ${saldo.toFixed(2)}
                </span>
              )}
            </div>
            <p className="ve-meta" style={{ marginTop: "0.3rem" }}>
              {grupo.items.length} ítem(s) · Fecha: {grupo.fecha} · Internista(s): {grupo.internistas || "Sin registrar"}
            </p>
          </div>

          <div className="ve-actions">
            {grupo.linkPrefactura && (
              <a
                href={grupo.linkPrefactura}
                target="_blank"
                rel="noopener noreferrer"
                className="ve-button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  textDecoration: "none",
                  fontSize: "0.82rem"
                }}
              >
                <ExternalLink size={14} /> Abrir en Contífico
              </a>
            )}
            <Boton icono={X} aria-label="Cerrar" onClick={cerrar} />
          </div>
        </div>

        <div style={{ overflowX: "auto", marginTop: "0.9rem", maxHeight: "58vh", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", color: "#334155" }}>
                <th style={{ padding: "0.5rem 0.4rem" }}>Fecha / Hora</th>
                <th style={{ padding: "0.5rem 0.4rem" }}>Categoría</th>
                <th style={{ padding: "0.5rem 0.4rem" }}>Producto / Medicina / Insumo</th>
                <th style={{ padding: "0.5rem 0.4rem" }}>Cantidad</th>
                <th style={{ padding: "0.5rem 0.4rem" }}>Internista</th>
                <th style={{ width: "36px" }}></th>
              </tr>
            </thead>
            <tbody>
              {grupo.items.map((it) => (
                <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "0.5rem 0.4rem", whiteSpace: "nowrap" }}>
                    {it.fecha} <span className="ve-meta">{it.horaRegistro}</span>
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem" }}>
                    <span className="ve-badge">{it.tipoItem}</span>
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem" }}>
                    <strong>{it.descripcion}</strong>
                    {it.nota && <div className="ve-meta">{it.nota}</div>}
                  </td>
                  <td style={{ padding: "0.5rem 0.4rem", fontWeight: 700 }}>{it.cantidad}</td>
                  <td style={{ padding: "0.5rem 0.4rem" }}>{it.internista}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => onEliminarItem(it.id)}
                      className="ve-link"
                      title="Eliminar ítem de la cotización"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="ve-actions ve-last">
          <Boton onClick={cerrar}>Cerrar</Boton>
        </footer>
      </div>
    </dialog>
  );
}

function PestanaCotizaciones({ paciente, profesionales, revision }) {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [numeroCot, setNumeroCot] = useState("");
  const [linkPrefactura, setLinkPrefactura] = useState("");
  const [internista, setInternista] = useState("MVZ. Cristhian Romero");
  const [fecha, setFecha] = useState(fechaLocal(new Date()).slice(0, 10));
  const [filasTabla, setFilasTabla] = useState(() => crearFilasCotizacion());
  const [filtroCot, setFiltroCot] = useState("TODAS");
  const [avisoCot, setAvisoCot] = useState("");
  const [errorCot, setErrorCot] = useState("");

  const [cambiosCotizacion, setCambiosCotizacion] = useState({});
  const [guardandoEstados, setGuardandoEstados] = useState(false);
  const [cotizacionDetalleNum, setCotizacionDetalleNum] = useState("");

  const cargarCotizaciones = useCallback(async (signal) => {
    setCargando(true);
    try {
      const items = await repo.modulos.listar(paciente.id, "cotizacion", signal);
      setLista(items);
      setCambiosCotizacion({});
      if (items[0]?.numeroCotizacion) {
        setNumeroCot((prev) => prev || items[0].numeroCotizacion);
      }
    } catch (e) {
      if (e.name !== "AbortError") setErrorCot(e.message);
    } finally {
      setCargando(false);
    }
  }, [paciente.id]);

  useEffect(() => {
    const ac = new AbortController();
    cargarCotizaciones(ac.signal);
    return () => ac.abort();
  }, [cargarCotizaciones, revision]);

  function actualizarFila(filaId, campo, valor) {
    setFilasTabla((prev) => prev.map((f) => (f.id === filaId ? { ...f, [campo]: valor } : f)));
  }

  function agregarFila() {
    setFilasTabla((prev) => [
      ...prev,
      { id: uuid(), tipoItem: "Medicina", descripcion: "", cantidad: "", nota: "" }
    ]);
  }

  function quitarFila(filaId) {
    setFilasTabla((prev) => (prev.length > 1 ? prev.filter((f) => f.id !== filaId) : crearFilasCotizacion()));
  }

  async function guardarTablaCotizacion(e) {
    e.preventDefault();
    if (!numeroCot.trim() || !internista.trim() || guardando) return;

    const filasValidas = filasTabla.filter((f) => f.descripcion.trim() && f.cantidad.trim());
    if (filasValidas.length === 0) return;

    setGuardando(true);
    setErrorCot("");
    try {
      const numLimpio = numeroCot.trim();
      const horaActual = hora(new Date());
      const existentes = lista.filter((it) => String(it.numeroCotizacion || "").trim() === numLimpio);
      const enlaceNormalizado =
        normalizarEnlacePrefactura(linkPrefactura) ||
        existentes.find((it) => it.linkPrefactura)?.linkPrefactura ||
        "";
      const estadoHeredado = existentes[0]?.estadoCobro || "pendiente";
      const saldoHeredado = Number(existentes.find((it) => it.saldoPendiente != null)?.saldoPendiente) || 0;

      const nuevosRegistros = await Promise.all(
        filasValidas.map((f) =>
          repo.modulos.guardar(paciente.id, "cotizacion", {
            id: uuid(),
            numeroCotizacion: numLimpio,
            linkPrefactura: enlaceNormalizado,
            internista: internista.trim(),
            fecha,
            tipoItem: f.tipoItem,
            descripcion: f.descripcion.trim(),
            cantidad: f.cantidad.trim(),
            nota: f.nota.trim(),
            horaRegistro: horaActual,
            estadoCobro: estadoHeredado,
            saldoPendiente: saldoHeredado
          })
        )
      );

      setLista((prev) => [...nuevosRegistros, ...prev]);
      setFilasTabla(crearFilasCotizacion());
      setLinkPrefactura("");
      setAvisoCot(`Se guardaron en la nube ${nuevosRegistros.length} ítem(s) en la cotización #${numLimpio}.`);
      setTimeout(() => setAvisoCot(""), 4000);
    } catch (err) {
      setErrorCot(err.message || "No se pudo guardar la cotización.");
    } finally {
      setGuardando(false);
    }
  }

  const gruposCotizaciones = (() => {
    const mapa = new Map();
    for (const it of lista) {
      const num = String(it.numeroCotizacion || "Sin número").trim();
      if (!mapa.has(num)) {
        mapa.set(num, {
          numeroCotizacion: num,
          items: [],
          linkPrefactura: "",
          estadoCobro: it.estadoCobro || "pendiente",
          saldoPendiente: 0,
          tieneSaldoRegistrado: false
        });
      }
      const g = mapa.get(num);
      g.items.push(it);
      if (!g.linkPrefactura && it.linkPrefactura) {
        g.linkPrefactura = it.linkPrefactura;
      }
      if (!g.tieneSaldoRegistrado && it.saldoPendiente !== undefined && it.saldoPendiente !== null) {
        g.saldoPendiente = Number(it.saldoPendiente) || 0;
        g.tieneSaldoRegistrado = true;
      }
    }

    return Array.from(mapa.values()).map((g) => {
      const fechasUnicas = [...new Set(g.items.map((i) => i.fecha).filter(Boolean))];
      const internistasUnicos = [...new Set(g.items.map((i) => i.internista).filter(Boolean))];
      return {
        ...g,
        fecha: fechasUnicas.length <= 1 ? fechasUnicas[0] || "" : `${fechasUnicas[fechasUnicas.length - 1]} – ${fechasUnicas[0]}`,
        internistas: internistasUnicos.join(", ")
      };
    });
  })();

  function actualizarDraftGrupo(grupo, campo, valor) {
    const num = grupo.numeroCotizacion;
    const estadoGuardado = grupo.estadoCobro || "pendiente";
    const saldoGuardadoNum = Number(grupo.saldoPendiente) || 0;

    setCambiosCotizacion((prev) => {
      const actual = prev[num] || {};
      const siguiente = { ...actual, [campo]: valor };

      const estadoFinal = siguiente.estadoCobro ?? estadoGuardado;
      const saldoFinalStr =
        siguiente.saldoPendiente !== undefined
          ? siguiente.saldoPendiente
          : saldoGuardadoNum > 0
          ? String(saldoGuardadoNum)
          : "";
      const saldoFinalNum = Math.max(0, parseFloat(saldoFinalStr) || 0);

      const sinCambios = estadoFinal === estadoGuardado && Math.abs(saldoFinalNum - saldoGuardadoNum) < 0.001;
      const copia = { ...prev };
      if (sinCambios) {
        delete copia[num];
      } else {
        copia[num] = siguiente;
      }
      return copia;
    });
  }

  async function guardarCambiosCotizaciones() {
    const numerosModificados = Object.keys(cambiosCotizacion);
    if (numerosModificados.length === 0 || guardandoEstados) return;

    setGuardandoEstados(true);
    setErrorCot("");
    try {
      const actualizaciones = [];

      for (const num of numerosModificados) {
        const grupo = gruposCotizaciones.find((g) => g.numeroCotizacion === num);
        if (!grupo) continue;
        const draft = cambiosCotizacion[num];
        const nuevoEstado = draft.estadoCobro ?? grupo.estadoCobro ?? "pendiente";
        const nuevoSaldo =
          draft.saldoPendiente !== undefined
            ? Math.max(0, parseFloat(draft.saldoPendiente) || 0)
            : Number(grupo.saldoPendiente) || 0;

        for (const item of grupo.items) {
          actualizaciones.push(
            repo.modulos.guardar(paciente.id, "cotizacion", {
              ...item,
              estadoCobro: nuevoEstado,
              saldoPendiente: nuevoSaldo
            })
          );
        }
      }

      const itemsGuardados = await Promise.all(actualizaciones);
      const mapaActualizados = new Map(itemsGuardados.map((it) => [it.id, it]));
      setLista((prev) => prev.map((it) => mapaActualizados.get(it.id) || it));
      setCambiosCotizacion({});
      setAvisoCot(`Cambios guardados en ${numerosModificados.length} cotización(es).`);
      setTimeout(() => setAvisoCot(""), 4000);
    } catch (err) {
      setErrorCot(err.message || "No se pudieron guardar los cambios.");
    } finally {
      setGuardandoEstados(false);
    }
  }

  async function eliminarItem(itemId) {
    try {
      await repo.modulos.eliminar(itemId);
      setLista((prev) => {
        const nuevaLista = prev.filter((it) => it.id !== itemId);
        if (
          cotizacionDetalleNum &&
          !nuevaLista.some((it) => String(it.numeroCotizacion || "Sin número").trim() === cotizacionDetalleNum)
        ) {
          setCotizacionDetalleNum("");
        }
        return nuevaLista;
      });
    } catch (err) {
      setErrorCot(err.message);
    }
  }

  const numerosUnicos = gruposCotizaciones.map((g) => g.numeroCotizacion);
  const gruposFiltrados =
    filtroCot === "TODAS"
      ? gruposCotizaciones
      : gruposCotizaciones.filter((g) => g.numeroCotizacion === filtroCot);
  const cantidadCambios = Object.keys(cambiosCotizacion).length;
  const grupoModalActivo = gruposCotizaciones.find((g) => g.numeroCotizacion === cotizacionDetalleNum) || null;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section className="ve-panel ve-pad">
        <div className="ve-row">
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <Receipt size={18} /> Registro diario de insumos y cotizaciones
          </h2>
        </div>

        <form onSubmit={guardarTablaCotizacion} style={{ display: "grid", gap: "0.85rem", marginTop: "0.75rem" }}>
          <div className="ve-campos">
            <div className="ve-field">
              <label>N.º de Cotización (manual) *</label>
              <input
                type="text"
                value={numeroCot}
                onChange={(e) => setNumeroCot(e.target.value)}
                placeholder="Ej. COT-00124"
                required
              />
            </div>

            <div className="ve-field">
              <label>Link de prefactura Contífico (opcional)</label>
              <input
                type="text"
                value={linkPrefactura}
                onChange={(e) => setLinkPrefactura(e.target.value)}
                placeholder="https://app.contifico.com/..."
              />
            </div>

            <div className="ve-field">
              <label>Internista responsable *</label>
              <input
                type="text"
                value={internista}
                onChange={(e) => setInternista(e.target.value)}
                list="ve-prof-cot"
                placeholder="Nombre del internista"
                required
              />
              <datalist id="ve-prof-cot">
                {(profesionales || []).map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            <div className="ve-field">
              <label>Fecha *</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </div>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "10px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f1f5f9", color: "#334155", borderBottom: "1px solid #cbd5e1" }}>
                  <th style={{ padding: "0.5rem", width: "36px" }}>#</th>
                  <th style={{ padding: "0.5rem", width: "165px" }}>Categoría</th>
                  <th style={{ padding: "0.5rem" }}>Material / Medicina / Insumo</th>
                  <th style={{ padding: "0.5rem", width: "165px" }}>Cantidad</th>
                  <th style={{ padding: "0.5rem", width: "200px" }}>Observación (opcional)</th>
                  <th style={{ padding: "0.5rem", width: "38px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filasTabla.map((fila, idx) => (
                  <tr key={fila.id} style={{ borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
                    <td style={{ padding: "0.4rem 0.5rem", color: "#64748b", fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ padding: "0.35rem 0.4rem" }}>
                      <select
                        value={fila.tipoItem}
                        onChange={(e) => actualizarFila(fila.id, "tipoItem", e.target.value)}
                        style={{ width: "100%", padding: "0.42rem 0.45rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                      >
                        <option value="Medicina">Medicina</option>
                        <option value="Material médico">Material médico</option>
                        <option value="Insumo">Insumo</option>
                        <option value="Examen / Procedimiento">Examen / Proc.</option>
                      </select>
                    </td>
                    <td style={{ padding: "0.35rem 0.4rem" }}>
                      <input
                        type="text"
                        value={fila.descripcion}
                        onChange={(e) => actualizarFila(fila.id, "descripcion", e.target.value)}
                        placeholder="Ej. Catéter 22G, Ringer Lactato, Ceftriaxona..."
                        style={{ width: "100%", padding: "0.42rem 0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                      />
                    </td>
                    <td style={{ padding: "0.35rem 0.4rem" }}>
                      <input
                        type="text"
                        value={fila.cantidad}
                        onChange={(e) => actualizarFila(fila.id, "cantidad", e.target.value)}
                        placeholder="Ej. 2 unid, 3.5 ml"
                        style={{ width: "100%", padding: "0.42rem 0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                      />
                    </td>
                    <td style={{ padding: "0.35rem 0.4rem" }}>
                      <input
                        type="text"
                        value={fila.nota}
                        onChange={(e) => actualizarFila(fila.id, "nota", e.target.value)}
                        placeholder="Turno / detalle..."
                        style={{ width: "100%", padding: "0.42rem 0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => quitarFila(fila.id)}
                        className="ve-link"
                        title="Quitar fila"
                      >
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errorCot && (
            <p className="ve-message" role="alert" style={{ margin: 0 }}>
              {errorCot}
            </p>
          )}

          {avisoCot && (
            <p className="ve-confirm" role="status" style={{ margin: 0 }}>
              {avisoCot}
            </p>
          )}

          <div className="ve-actions">
            <Boton icono={Plus} onClick={agregarFila}>
              Agregar fila
            </Boton>
            <button type="submit" className="ve-button" disabled={guardando}>
              {guardando ? "Guardando en la nube…" : "Guardar en cotización"}
            </button>
          </div>
        </form>
      </section>

      <section className="ve-panel ve-pad">
        <div className="ve-row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h2 style={{ margin: 0 }}>Historial de Cotizaciones ({gruposFiltrados.length})</h2>
            <p className="ve-meta" style={{ margin: "0.2rem 0 0" }}>
              Haz clic en una cotización para ver el detalle completo de sus productos e insumos.
            </p>
          </div>

          <div className="ve-actions" style={{ flexWrap: "wrap" }}>
            {numerosUnicos.length > 0 && (
              <select
                value={filtroCot}
                onChange={(e) => setFiltroCot(e.target.value)}
                className="ve-select"
                aria-label="Filtrar por número de cotización"
              >
                <option value="TODAS">Todas las cotizaciones ({numerosUnicos.length})</option>
                {numerosUnicos.map((num) => (
                  <option key={num} value={num}>
                    Cotización #{num}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              className="ve-button"
              onClick={guardarCambiosCotizaciones}
              disabled={cantidadCambios === 0 || guardandoEstados}
              style={{
                opacity: cantidadCambios === 0 ? 0.55 : 1,
                cursor: cantidadCambios === 0 ? "not-allowed" : "pointer"
              }}
            >
              {guardandoEstados
                ? "Guardando…"
                : cantidadCambios > 0
                ? `Guardar cambios (${cantidadCambios})`
                : "Guardar cambios"}
            </button>
          </div>
        </div>

        {cargando ? (
          <p className="ve-sub">Cargando cotizaciones…</p>
        ) : gruposFiltrados.length === 0 ? (
          <p className="ve-sub">Aún no se han cargado insumos o medicinas en cotizaciones para {paciente.nombre}.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0", color: "#334155" }}>
                  <th style={{ padding: "0.5rem 0.35rem" }}>N.º Cotización</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Fecha</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Resumen de productos / insumos</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Estado</th>
                  <th style={{ padding: "0.5rem 0.35rem", width: "155px" }}>Valor pendiente ($)</th>
                  <th style={{ padding: "0.5rem 0.35rem", textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gruposFiltrados.map((grupo) => {
                  const num = grupo.numeroCotizacion;
                  const draft = cambiosCotizacion[num];
                  const tieneCambio = draft !== undefined;
                  const estadoActual = draft?.estadoCobro ?? grupo.estadoCobro ?? "pendiente";
                  const esCobrado = estadoActual === "cobrado";
                  const valorSaldoInput =
                    draft?.saldoPendiente !== undefined
                      ? draft.saldoPendiente
                      : grupo.saldoPendiente > 0
                      ? String(grupo.saldoPendiente)
                      : "";

                  const vistaPrevia = grupo.items
                    .slice(0, 3)
                    .map((i) => `${i.descripcion} (${i.cantidad})`)
                    .join(" · ");

                  return (
                    <tr
                      key={num}
                      onClick={() => setCotizacionDetalleNum(num)}
                      title="Haz clic para abrir el detalle de esta cotización"
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: tieneCambio ? "#fefce8" : "transparent",
                        cursor: "pointer"
                      }}
                    >
                      <td style={{ padding: "0.6rem 0.35rem", whiteSpace: "nowrap" }}>
                        <span className="ve-badge" style={{ fontWeight: 700 }}>
                          #{num}
                        </span>
                        <div className="ve-meta" style={{ marginTop: "0.2rem" }}>
                          {grupo.items.length} ítem(s)
                        </div>
                      </td>

                      <td style={{ padding: "0.6rem 0.35rem" }}>
                        <div>{grupo.fecha}</div>
                        <div className="ve-meta">{grupo.internistas}</div>
                      </td>

                      <td style={{ padding: "0.6rem 0.35rem" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>
                          {vistaPrevia}
                          {grupo.items.length > 3 ? ` (+${grupo.items.length - 3} más)` : ""}
                        </div>
                        <span className="ve-link" style={{ fontSize: "0.78rem", padding: 0 }}>
                          Clic para ver detalle completo →
                        </span>
                      </td>

                      <td
                        style={{ padding: "0.6rem 0.35rem" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => actualizarDraftGrupo(grupo, "estadoCobro", "pendiente")}
                            style={{
                              padding: "0.22rem 0.5rem",
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              border: !esCobrado ? "1.5px solid #dc2626" : "1px solid #cbd5e1",
                              background: !esCobrado ? "#fee2e2" : "#f8fafc",
                              color: !esCobrado ? "#991b1b" : "#64748b"
                            }}
                          >
                            Pendiente
                          </button>
                          <button
                            type="button"
                            onClick={() => actualizarDraftGrupo(grupo, "estadoCobro", "cobrado")}
                            style={{
                              padding: "0.22rem 0.5rem",
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              border: esCobrado ? "1.5px solid #16a34a" : "1px solid #cbd5e1",
                              background: esCobrado ? "#dcfce7" : "#f8fafc",
                              color: esCobrado ? "#166534" : "#64748b"
                            }}
                          >
                            Cobrado
                          </button>
                        </div>
                      </td>

                      <td
                        style={{ padding: "0.6rem 0.35rem" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <span style={{ fontWeight: 700, color: "#475569" }}>$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={valorSaldoInput}
                            onChange={(e) => actualizarDraftGrupo(grupo, "saldoPendiente", e.target.value)}
                            placeholder="0.00"
                            aria-label={`Valor pendiente cotización ${num}`}
                            style={{
                              width: "105px",
                              padding: "0.3rem 0.45rem",
                              borderRadius: "6px",
                              border: Number(valorSaldoInput) > 0 ? "1.5px solid #d97706" : "1px solid #cbd5e1",
                              background: Number(valorSaldoInput) > 0 ? "#fffbeb" : "#fff",
                              fontWeight: Number(valorSaldoInput) > 0 ? 700 : 400,
                              color: Number(valorSaldoInput) > 0 ? "#92400e" : "#0f172a"
                            }}
                          />
                        </div>
                      </td>

                      <td
                        style={{ padding: "0.6rem 0.35rem", textAlign: "right", whiteSpace: "nowrap" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                          <button
                            type="button"
                            onClick={() => setCotizacionDetalleNum(num)}
                            className="ve-link"
                            style={{ fontSize: "0.8rem", fontWeight: 700 }}
                          >
                            Ver detalle
                          </button>
                          {grupo.linkPrefactura && (
                            <a
                              href={grupo.linkPrefactura}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ve-link"
                              title="Abrir prefactura en Contífico"
                              aria-label="Abrir prefactura en Contífico"
                              style={{ color: "#0284c7", display: "inline-flex", alignItems: "center" }}
                            >
                              <ExternalLink size={15} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {grupoModalActivo && (
        <ModalDetalleCotizacion
          grupo={grupoModalActivo}
          cerrar={() => setCotizacionDetalleNum("")}
          onEliminarItem={eliminarItem}
        />
      )}
    </div>
  );
}

// ============================================================================
// PESTAÑA DE PELUQUERÍAS ESTÉTICAS (SINCRONIZADA EN SUPABASE)
// ============================================================================
function PestanaPeluqueria({ paciente, revision }) {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [peluquero, setPeluquero] = useState("");
  const [fecha, setFecha] = useState(fechaLocal(new Date()).slice(0, 10));
  const [precio, setPrecio] = useState("");
  const [observacion, setObservacion] = useState("");
  const [avisoPelu, setAvisoPelu] = useState("");
  const [errorPelu, setErrorPelu] = useState("");

  const cargarPeluquerias = useCallback(async (signal) => {
    setCargando(true);
    try {
      const items = await repo.modulos.listar(paciente.id, "peluqueria", signal);
      setLista(items);
    } catch (e) {
      if (e.name !== "AbortError") setErrorPelu(e.message);
    } finally {
      setCargando(false);
    }
  }, [paciente.id]);

  useEffect(() => {
    const ac = new AbortController();
    cargarPeluquerias(ac.signal);
    return () => ac.abort();
  }, [cargarPeluquerias, revision]);

  async function guardarPeluqueria(e) {
    e.preventDefault();
    if (!peluquero.trim() || !fecha || precio === "" || guardando) return;

    setGuardando(true);
    setErrorPelu("");
    try {
      const nuevo = await repo.modulos.guardar(paciente.id, "peluqueria", {
        id: uuid(),
        peluquero: peluquero.trim(),
        fecha,
        precio: parseFloat(precio) || 0,
        observacion: observacion.trim()
      });

      setLista((prev) => [nuevo, ...prev]);
      setPrecio("");
      setObservacion("");
      setAvisoPelu(`Peluquería estética registrada en la nube para ${paciente.nombre}.`);
      setTimeout(() => setAvisoPelu(""), 4000);
    } catch (err) {
      setErrorPelu(err.message || "No se pudo guardar el registro.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarPeluqueria(regId) {
    try {
      await repo.modulos.eliminar(regId);
      setLista((prev) => prev.filter((r) => r.id !== regId));
    } catch (err) {
      setErrorPelu(err.message);
    }
  }

  const peluquerosPrevios = [...new Set(lista.map((r) => r.peluquero).filter(Boolean))];

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section className="ve-panel ve-pad">
        <div className="ve-row">
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <Sparkles size={18} /> Registrar Peluquería Estética
          </h2>
        </div>

        <form onSubmit={guardarPeluqueria} className="ve-campos" style={{ marginTop: "0.75rem" }}>
          <div className="ve-field">
            <label>Nombre del peluquero *</label>
            <input
              type="text"
              value={peluquero}
              onChange={(e) => setPeluquero(e.target.value)}
              list="ve-peluqueros-lista"
              placeholder="Nombre del groomer / peluquero"
              required
            />
            <datalist id="ve-peluqueros-lista">
              {peluquerosPrevios.map((nom) => (
                <option key={nom} value={nom} />
              ))}
            </datalist>
          </div>

          <div className="ve-field">
            <label>Fecha *</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </div>

          <div className="ve-field">
            <label>Precio ($) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="Ej. 15.00"
              required
            />
          </div>

          <div className="ve-field ve-ancho">
            <label>Observación (opcional)</label>
            <textarea
              rows={2}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Tipo de corte, baño medicado/estético, comportamiento, nudos, limpieza de oídos..."
            />
          </div>

          {errorPelu && (
            <p className="ve-message ve-ancho" role="alert" style={{ margin: 0 }}>
              {errorPelu}
            </p>
          )}

          {avisoPelu && (
            <p className="ve-confirm ve-ancho" role="status" style={{ margin: 0 }}>
              {avisoPelu}
            </p>
          )}

          <div className="ve-actions ve-ancho">
            <button type="submit" className="ve-button" disabled={guardando}>
              {guardando ? "Guardando en la nube…" : "Guardar"}
            </button>
          </div>
        </form>
      </section>

      <section className="ve-panel ve-pad">
        <div className="ve-row">
          <h2>Historial de Peluquerías Estéticas ({lista.length})</h2>
        </div>

        {cargando ? (
          <p className="ve-sub">Cargando historial de peluquería…</p>
        ) : lista.length === 0 ? (
          <p className="ve-sub">Aún no hay registros de peluquería estética para {paciente.nombre}.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0", color: "#334155" }}>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Fecha</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Peluquero</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Precio</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Observación</th>
                  <th style={{ width: "36px" }}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.5rem 0.35rem", fontWeight: 600 }}>{r.fecha}</td>
                    <td style={{ padding: "0.5rem 0.35rem" }}>{r.peluquero}</td>
                    <td style={{ padding: "0.5rem 0.35rem", fontWeight: 700, color: "#0f766e" }}>
                      ${Number(r.precio).toFixed(2)}
                    </td>
                    <td style={{ padding: "0.5rem 0.35rem" }} className="ve-meta">
                      {r.observacion || "Sin observaciones"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => eliminarPeluqueria(r.id)}
                        className="ve-link"
                        title="Eliminar registro"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// BANCO DE DOCUMENTOS GLOBAL (DEBAJO DE PACIENTES)
// ============================================================================
function BancoDocumentos({ pacientesLista, revision, onSeleccionarPaciente }) {
  const android = globalThis.Capacitor?.getPlatform?.() === "android";
  const [busquedaDoc, setBusquedaDoc] = useState("");
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(false);

  const cargarTodosLosDocumentos = useCallback(async (signal) => {
    setCargando(true);
    try {
      if (typeof repo.listarDocumentos === "function") {
        const res = await repo.listarDocumentos("", signal);
        setDocumentos(res || []);
        return;
      }

      let pacs = pacientesLista || [];
      if (pacs.length === 0) {
        const r = await repo.listar("", 0, signal);
        pacs = r.items || [];
      }

      const expedientes = await Promise.all(
        pacs.slice(0, 40).map((p) =>
          repo.expediente(p.id, signal).catch(() => null)
        )
      );

      const acumulados = [];
      for (const exp of expedientes) {
        if (!exp?.p || !exp?.anexos?.length) continue;
        for (const anexo of exp.anexos) {
          const atencionRel = (exp.atenciones || []).find((a) => a.id === anexo.atencion_id);
          acumulados.push({
            ...anexo,
            pacienteId: exp.p.id,
            pacienteNombre: exp.p.nombre,
            atencionTitulo: atencionRel?.titulo || "",
            fechaOrden: anexo.creado_en || atencionRel?.inicio || ""
          });
        }
      }

      acumulados.sort((a, b) => String(b.fechaOrden).localeCompare(String(a.fechaOrden)));
      setDocumentos(acumulados);
    } catch (e) {
      if (e.name !== "AbortError") console.error(e);
    } finally {
      setCargando(false);
    }
  }, [pacientesLista]);

  useEffect(() => {
    const ac = new AbortController();
    cargarTodosLosDocumentos(ac.signal);
    return () => ac.abort();
  }, [cargarTodosLosDocumentos, revision]);

  const termino = busquedaDoc.trim().toLowerCase();
  const coincidencias = termino
    ? documentos.filter(
        (d) =>
          String(d.nombre || "").toLowerCase().includes(termino) ||
          String(d.pacienteNombre || "").toLowerCase().includes(termino) ||
          String(d.atencionTitulo || "").toLowerCase().includes(termino)
      )
    : documentos.slice(0, 4);

  return (
    <section className="ve-panel ve-pad" style={{ marginTop: "1rem" }}>
      <div className="ve-row" style={{ marginBottom: "0.5rem" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "1rem", margin: 0 }}>
          <FolderOpen size={17} /> Banco de documentos
        </h2>
        <span className="ve-badge" style={{ fontSize: "0.7rem" }}>
          {termino ? `${coincidencias.length} hallados` : "Últimos 4"}
        </span>
      </div>

      <div className="ve-search">
        <Search size={16} />
        <input
          type="search"
          value={busquedaDoc}
          aria-label="Buscar documento o paciente"
          placeholder="Documento o paciente…"
          onChange={(e) => setBusquedaDoc(e.target.value)}
        />
      </div>

      <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.65rem" }}>
        {cargando && documentos.length === 0 ? (
          <p className="ve-meta">Cargando documentos…</p>
        ) : coincidencias.length === 0 ? (
          <p className="ve-meta">
            {termino ? "Sin documentos que coincidan." : "Aún no hay exámenes ni fotos subidas."}
          </p>
        ) : (
          coincidencias.map((doc) => (
            <div
              key={doc.id}
              style={{
                border: "1px solid var(--borde, #e2e8f0)",
                borderRadius: "8px",
                padding: "0.55rem 0.65rem",
                background: "#f8fafc",
                fontSize: "0.82rem"
              }}
            >
              <div style={{ fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>
                {doc.nombre}
              </div>
              <div className="ve-meta" style={{ marginTop: "0.15rem" }}>
                Paciente:{" "}
                <button
                  type="button"
                  className="ve-link"
                  style={{ fontWeight: 700, padding: 0, fontSize: "0.8rem" }}
                  onClick={() => onSeleccionarPaciente(doc.pacienteId)}
                >
                  {doc.pacienteNombre}
                </button>
                {doc.bytes ? ` · ${Math.max(1, Math.round(doc.bytes / 1024))} KB` : ""}
              </div>
              <div className="ve-actions" style={{ marginTop: "0.35rem", gap: "0.6rem" }}>
                <a
                  href={repo.enlace(doc, false)}
                  target={android ? "_self" : "_blank"}
                  rel="noopener noreferrer"
                  className="ve-link"
                  style={{ fontSize: "0.78rem" }}
                >
                  Ver
                </a>
                <a
                  href={repo.enlace(doc, true)}
                  download={android ? undefined : doc.nombre}
                  className="ve-link"
                  style={{ fontSize: "0.78rem" }}
                >
                  Descargar
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ============================================================================
// HISTORIA CLÍNICA DEL PACIENTE
// ============================================================================
function Historia({
  ficha,
  abrir,
  volver,
  ingresoId,
  verIngreso,
  revision,
  recargar,
  onSyncHosp,
  onAltaSuccess,
  onCambioNotificaciones,
  onPacienteEliminado
}) {
  const android = globalThis.Capacitor?.getPlatform?.() === "android";
  const { p, atenciones, anexos } = ficha;
  const [filtro, Filtro] = useState("todos");
  const [pestana, setPestana] = useState("clinica");
  const [altaTarget, setAltaTarget] = useState(null);
  const [mostrarModalEliminar, setMostrarModalEliminar] = useState(false);
  const [mostrarDocs, setMostrarDocs] = useState(false);

  const ultima = atenciones.find((a) => a.peso != null);
  const profesionales = [...new Set(atenciones.map((a) => a.profesional).filter(Boolean))];
  const hospitalAbierto = atenciones.find((a) => a.tipo === "hospitalizacion" && a.abierta);
  const admision =
    atenciones.find((a) => a.id === ingresoId && a.tipo === "hospitalizacion") ||
    (ingresoId === "activa" ? hospitalAbierto : null);

  useEffect(() => {
    if (onSyncHosp && p?.id) {
      onSyncHosp(
        p.id,
        hospitalAbierto
          ? {
              activa: true,
              jaula: hospitalAbierto.jaula || "",
              ubicacion: hospitalAbierto.detalle_clinico?.ubicacion || ""
            }
          : { activa: false }
      );
    }
  }, [
    p?.id,
    hospitalAbierto?.id,
    hospitalAbierto?.abierta,
    hospitalAbierto?.jaula,
    hospitalAbierto?.detalle_clinico?.ubicacion,
    onSyncHosp
  ]);

  function formulario(d) {
    abrir({ clase: "atencion", d, pid: p.id, profesionales });
  }
  function editarFoto(actual = p.foto_id) {
    abrir({ clase: "foto", d: p, fotoActual: actual ?? null });
  }

  if (admision) {
    return (
      <div className="ve-paper">
        {admision.abierta && (
          <div
            className="ve-panel ve-pad"
            style={{
              marginBottom: "0.85rem",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              background: "#fffbeb",
              borderColor: "#fcd34d"
            }}
          >
            <div>
              <strong style={{ color: "#92400e" }}>
                Paciente hospitalizado · {admision.jaula || "Jaula sin asignar"}
              </strong>
              <p className="ve-meta">Ingreso: {fechaCorta(admision.inicio)} · {admision.titulo}</p>
            </div>
            <Boton principal icono={LogOut} onClick={() => setAltaTarget(admision)}>
              Dar de alta médica
            </Boton>
          </div>
        )}

        <HojaHospital
          paciente={p}
          admision={admision}
          profesionales={profesionales}
          repo={repo.hospital}
          fotos={repo.fotos}
          editarFoto={editarFoto}
          onGuardarUbicacion={async (nuevaUbicacion) => {
            await repo.guardarAtencion({
              id: admision.id,
              paciente_id: p.id,
              tipo: "hospitalizacion",
              fecha_local: fechaLocal(admision.inicio || new Date()),
              titulo: admision.titulo,
              profesional: admision.profesional || "",
              peso: admision.peso ?? "",
              jaula: admision.jaula || "",
              detalle_clinico: { ...(admision.detalle_clinico || {}), ubicacion: nuevaUbicacion },
              resumen: admision.resumen || "",
              version: admision.version || 0,
              abierta: admision.abierta ?? true
            });
            if (onSyncHosp) {
              onSyncHosp(p.id, {
                activa: Boolean(admision.abierta),
                jaula: admision.jaula || "",
                ubicacion: nuevaUbicacion
              });
            }
            recargar();
          }}
          actualizarFicha={() => {
            recargar();
            if (onCambioNotificaciones) onCambioNotificaciones();
          }}
          volver={() => {
            verIngreso("");
            if (onCambioNotificaciones) onCambioNotificaciones();
          }}
          editar={() => formulario(admision)}
          revision={revision}
        />

        {altaTarget && (
          <ModalAltaHospital
            paciente={p}
            admision={altaTarget}
            profesionales={profesionales}
            cerrar={() => setAltaTarget(null)}
            onAltaConfirmada={(pid, msg) => {
              setAltaTarget(null);
              verIngreso("");
              if (onAltaSuccess) onAltaSuccess(pid, msg);
              else recargar();
            }}
          />
        )}
      </div>
    );
  }

  const enlaceWhatsApp = obtenerEnlaceWhatsApp(p.telefono);

  const campos = [
    ["Propietario", p.propietario],
    ["Cédula", p.cedula],
    [
      "Teléfono",
      p.telefono && enlaceWhatsApp ? (
        <a
          href={enlaceWhatsApp}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir chat en WhatsApp"
          style={{
            color: "#15803d",
            fontWeight: 700,
            textDecoration: "underline",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem"
          }}
        >
          <MessageCircle size={14} />
          {p.telefono}
        </a>
      ) : (
        p.telefono
      )
    ],
    ["Sexo", p.sexo],
    ["Raza", p.raza],
    ["Edad", edad(p.nacimiento, p.edad_estimada)],
    ["Último peso", ultima && Number(ultima.peso).toLocaleString("es-EC") + " kg · " + fechaCorta(ultima.inicio)]
  ];
  const lista = atenciones.filter((a) => filtro === "todos" || a.tipo === filtro);

  return (
    <div className="ve-paper">
      <div>
        <button className="ve-link ve-back" onClick={volver}>
          <ArrowLeft size={16} /> Pacientes
        </button>

        <section className="ve-panel">
          <div className="ve-cardtop">
            <div className="ve-titlerow">
              <div className="ve-identity">
                <AvatarPaciente paciente={p} src={repo.fotos.url(p.id, p.foto_id)} />
                <div>
                  <p className="ve-meta">
                    {p.codigo} · {p.especie}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0 }}>{p.nombre}</h2>
                    {hospitalAbierto && (
                      <span
                        className="ve-badge"
                        style={{ background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}
                      >
                        HOSPITALIZADO
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="ve-actions" style={{ flexWrap: "wrap" }}>
                <Boton principal icono={FileText} onClick={() => setMostrarDocs(true)}>
                  Recetas y docs
                </Boton>
                <Boton icono={Camera} onClick={() => editarFoto()}>
                  {p.foto_id ? "Cambiar foto" : "Añadir foto"}
                </Boton>
                <Boton icono={Pencil} onClick={() => abrir({ clase: "paciente", d: p, pid: p.id })}>
                  Editar ficha
                </Boton>
                <button
                  type="button"
                  onClick={() => setMostrarModalEliminar(true)}
                  style={{
                    background: "#fee2e2",
                    color: "#991b1b",
                    border: "1px solid #fca5a5",
                    borderRadius: "8px",
                    padding: "0.45rem 0.75rem",
                    fontWeight: 700,
                    fontSize: "0.84rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem"
                  }}
                >
                  <Trash2 size={15} /> Eliminar
                </button>
              </div>
            </div>

            {hospitalAbierto && (
              <div className="ve-ingreso-activo">
                <span>
                  <Activity size={17} /> Hospitalización activa · {hospitalAbierto.jaula || "Jaula sin asignar"}
                </span>
                <div className="ve-actions">
                  <Boton onClick={() => verIngreso(hospitalAbierto.id)}>Abrir hoja de hospitalización</Boton>
                  <Boton principal icono={LogOut} onClick={() => setAltaTarget(hospitalAbierto)}>
                    Dar de alta
                  </Boton>
                </div>
              </div>
            )}
          </div>

          <dl className="ve-facts">
            {campos.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || "Sin registrar"}</dd>
              </div>
            ))}
          </dl>

          {/* Navegación de pestañas del expediente */}
          <div
            className="ve-actions"
            style={{
              padding: "0.75rem 1rem",
              borderTop: "1px solid var(--borde, #e2e8f0)",
              background: "#f8fafc",
              flexWrap: "wrap"
            }}
          >
            <Boton principal={pestana === "clinica"} icono={FileText} onClick={() => setPestana("clinica")}>
              Historia clínica ({atenciones.length})
            </Boton>
            <Boton principal={pestana === "cirugias"} icono={Scissors} onClick={() => setPestana("cirugias")}>
              Cirugías
            </Boton>
            <Boton principal={pestana === "cotizaciones"} icono={Receipt} onClick={() => setPestana("cotizaciones")}>
              Cotizaciones
            </Boton>
            <Boton principal={pestana === "peluqueria"} icono={Sparkles} onClick={() => setPestana("peluqueria")}>
              Peluquería
            </Boton>
            <Boton principal={pestana === "examenes"} icono={Paperclip} onClick={() => setPestana("examenes")}>
              Exámenes ({anexos.length})
            </Boton>
          </div>
        </section>
      </div>

      {pestana === "clinica" && (
        <section className="ve-panel ve-pad">
          <div className="ve-row">
            <h2>Historia clínica</h2>
            <div className="ve-actions ve-actions-clinicas">
              <Boton principal icono={Plus} onClick={() => formulario({ tipo: "consulta" })}>
                Nueva consulta
              </Boton>
              {!hospitalAbierto && (
                <Boton icono={Activity} onClick={() => formulario({ tipo: "hospitalizacion" })}>
                  Nuevo ingreso
                </Boton>
              )}
              <Boton onClick={() => formulario({ tipo: "control" })}>Otra atención</Boton>
            </div>
          </div>

          <div className="ve-last">
            <select className="ve-select" aria-label="Filtrar atenciones" value={filtro} onChange={(e) => Filtro(e.target.value)}>
              <option value="todos">Todas las atenciones</option>
              {Object.entries(etiquetas).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {lista.length ? (
            <ol className="ve-timeline">
              {lista.map((a) => (
                <li className="ve-entry" key={a.id}>
                  <span className="ve-marker">
                    <FileText size={17} />
                  </span>
                  <details>
                    <summary>
                      <span>
                        <span className="ve-meta">
                          {fechaCorta(a.inicio)} · {hora(a.inicio)} · {etiquetas[a.tipo]}
                        </span>
                        <strong>{a.titulo}</strong>
                      </span>
                      <ChevronRight size={15} />
                    </summary>
                    <ValoresClinicos datos={a.detalle_clinico || {}} campos={camposDe(a.tipo)} />
                    {a.resumen && <p className="ve-detailtext">{a.resumen}</p>}
                    <p className="ve-meta">{a.profesional || "Profesional sin registrar"}</p>
                    <div className="ve-actions ve-spaced">
                      {a.tipo === "hospitalizacion" && (
                        <Boton principal icono={Activity} onClick={() => verIngreso(a.id)}>
                          Abrir hoja de hospitalización
                        </Boton>
                      )}
                      {a.tipo === "hospitalizacion" && a.abierta && (
                        <Boton icono={LogOut} onClick={() => setAltaTarget(a)}>
                          Dar de alta
                        </Boton>
                      )}
                      <Boton icono={Pencil} onClick={() => formulario(a)}>
                        Editar atención
                      </Boton>
                      <Boton icono={Paperclip} onClick={() => abrir({ clase: "examen", d: { visita: a.id }, pid: p.id, atenciones })}>
                        Adjuntar examen
                      </Boton>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ve-sub">{filtro === "todos" ? "Aún no hay atenciones." : "No hay atenciones de ese tipo."}</p>
          )}
        </section>
      )}

      {pestana === "cirugias" && (
        <PestanaCirugias
          paciente={p}
          atenciones={atenciones}
          anexos={anexos}
          profesionales={profesionales}
          onRecargar={recargar}
          revision={revision}
        />
      )}

      {pestana === "cotizaciones" && (
        <PestanaCotizaciones paciente={p} profesionales={profesionales} revision={revision} />
      )}

      {pestana === "peluqueria" && <PestanaPeluqueria paciente={p} revision={revision} />}

      {pestana === "examenes" && (
        <section className="ve-panel ve-pad">
          <div className="ve-row">
            <h2>Exámenes</h2>
            {atenciones.length > 0 && (
              <Boton icono={Paperclip} onClick={() => abrir({ clase: "examen", d: { visita: atenciones[0].id }, pid: p.id, atenciones })}>
                Adjuntar
              </Boton>
            )}
          </div>
          {anexos.length ? (
            anexos.map((x) => (
              <div className="ve-archivo" key={x.id}>
                <div>
                  <strong>{x.nombre}</strong>
                  <p className="ve-meta">
                    {atenciones.find((a) => a.id === x.atencion_id)?.titulo} · {Math.max(1, Math.round(x.bytes / 1024))} KB
                  </p>
                </div>
                <div className="ve-actions">
                  <a href={repo.enlace(x, false)} target={android ? "_self" : "_blank"} rel="noopener noreferrer" className="ve-link">
                    Ver
                  </a>
                  <a href={repo.enlace(x, true)} download={android ? undefined : x.nombre} className="ve-link">
                    Descargar
                  </a>
                </div>
              </div>
            ))
          ) : (
            <p className="ve-sub">
              {atenciones.length ? "Aún no se han adjuntado exámenes." : "Crea una atención para asociarle un examen."}
            </p>
          )}
        </section>
      )}

      {altaTarget && (
        <ModalAltaHospital
          paciente={p}
          admision={altaTarget}
          profesionales={profesionales}
          cerrar={() => setAltaTarget(null)}
          onAltaConfirmada={(pid, msg) => {
            setAltaTarget(null);
            if (onAltaSuccess) onAltaSuccess(pid, msg);
            else recargar();
          }}
        />
      )}

      {mostrarModalEliminar && (
        <ModalEliminarPaciente
          paciente={p}
          atenciones={atenciones}
          anexos={anexos}
          cerrar={() => setMostrarModalEliminar(false)}
          onEliminado={(pid, nombreEliminado) => {
            setMostrarModalEliminar(false);
            if (onPacienteEliminado) onPacienteEliminado(pid, nombreEliminado);
          }}
        />
      )}

      {mostrarDocs && (
        <ModalDocumentosClinicos
          paciente={p}
          atenciones={atenciones}
          profesionales={profesionales}
          cerrar={() => setMostrarDocs(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// APLICACIÓN RAÍZ
// ============================================================================
export default function App() {
  const [vista, setVista] = useState("expedientes"); // "expedientes" | "pizarra"
  const [q, Q] = useState("");
  const [pag, Pag] = useState(0);
  const [id, Id] = useState("");
  const [rev, Rev] = useState(0);
  const [resultado, R] = useState({ items: [], mas: false, carga: true });
  const [ficha, F] = useState(null);
  const [errFicha, EF] = useState("");
  const [modal, M] = useState(null);
  const [aviso, A] = useState("");
  const [ingresoId, VerIngreso] = useState("");
  const [filtroDir, setFiltroDir] = useState("todos");
  const [hospMapa, setHospMapa] = useState({});
  const [fotosMapa, setFotosMapa] = useState({});

  // Estado del Centro de Notificaciones y Pizarra de Sala
  const [pautasActivas, setPautasActivas] = useState([]);
  const [salaHospital, setSalaHospital] = useState([]);
  const [cargaNotif, setCargaNotif] = useState(false);
  const [abrirNotif, setAbrirNotif] = useState(false);
  const [relojTick, setRelojTick] = useState(() => Date.now());

  function recargar() {
    Rev((n) => n + 1);
  }

  const actualizarHospPaciente = useCallback((pacienteId, info) => {
    setHospMapa((prev) => {
      const actual = prev[pacienteId];
      if (
        actual?.activa === info.activa &&
        (actual?.jaula || "") === (info.jaula || "") &&
        (actual?.ubicacion || "") === (info.ubicacion || "")
      ) {
        return prev;
      }
      return { ...prev, [pacienteId]: info };
    });
  }, []);

  const cargarDatosHospital = useCallback(async (signal) => {
    setCargaNotif(true);
    try {
      const ahoraMs = Date.now();
      const hoy = fechaLocal(new Date(ahoraMs)).slice(0, 10);
      const manana = sumarDiasIso(hoy, 1);

      const itemsLegacy = repo.notificaciones?.listarActivas
        ? await repo.notificaciones.listarActivas(signal).catch(() => [])
        : [];

      const pacsMap = new Map();
      for (let p = 0; p < 5; p++) {
        const res = await repo.listar("", p, signal).catch(() => ({ items: [], mas: false }));
        for (const pac of res?.items || []) {
          pacsMap.set(pac.id, pac);
        }
        if (!res?.mas) break;
      }

      for (const it of itemsLegacy || []) {
        const pid = it.pacienteId || it.paciente_id;
        if (pid && !pacsMap.has(pid)) {
          pacsMap.set(pid, { id: pid, nombre: it.pacienteNombre || "Paciente hospitalizado", hospitalizado: true });
        }
      }

      const pacsHosp = Array.from(pacsMap.values()).filter((p) =>
        Boolean(p.hospitalizado || p.abierta || p.ingreso_activo || p.jaula)
      );

      const alertasHoja = [];
      const tarjetasSala = [];
      const ordenesRevisadas = new Set();

      await Promise.all(
        pacsHosp.map(async (pac) => {
          try {
            const exp = await repo.expediente(pac.id, signal);
            const adm = (exp?.atenciones || []).find((a) => a.tipo === "hospitalizacion" && a.abierta);
            if (!adm) return;

            const pacReal = exp?.p || pac;
            const [hojaHoy, hojaManana, procs] = await Promise.all([
              repo.hospital.hoja(adm.id, hoy, signal).catch(() => null),
              repo.hospital.hoja(adm.id, manana, signal).catch(() => null),
              repo.modulos ? repo.modulos.listar(adm.id, "proc_hosp", signal).catch(() => []) : Promise.resolve([])
            ]);

            const medsPendientes = hojaHoy
              ? extraerPendientesMedicacion(hojaHoy, hojaManana, pacReal, adm, ahoraMs)
              : [];
            const procsPendientes =
              Array.isArray(procs) && procs.length > 0
                ? extraerPendientesProcedimientos(procs, pacReal, adm, ahoraMs)
                : [];

            if (hojaHoy) {
              for (const o of hojaHoy.ordenes || []) ordenesRevisadas.add(o.id);
            }

            const todosPendientesPaciente = [...medsPendientes, ...procsPendientes].sort(
              (a, b) => a.slotTs - b.slotTs
            );
            alertasHoja.push(...todosPendientesPaciente);

            const notasOrdenadas = [...(hojaHoy?.notas || [])].sort(
              (a, b) => Date.parse(b.momento || 0) - Date.parse(a.momento || 0)
            );

            tarjetasSala.push({
              pac: pacReal,
              adm,
              pendientes: todosPendientesPaciente,
              ultimaNota: notasOrdenadas[0] || null
            });
          } catch {}
        })
      );

      const extrasLegacy = (itemsLegacy || []).filter((it) => {
        const oid = it.ordenId || it.orden_id || it.id;
        return !ordenesRevisadas.has(oid);
      });

      setPautasActivas([...alertasHoja, ...extrasLegacy]);
      setSalaHospital(tarjetasSala);
    } catch (e) {
      if (e.name !== "AbortError") console.error(e);
    } finally {
      setCargaNotif(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    cargarDatosHospital(ac.signal);
    return () => ac.abort();
  }, [cargarDatosHospital, rev]);

  useEffect(() => {
    const tReloj = setInterval(() => setRelojTick(Date.now()), 30000);
    const tSync = setInterval(() => cargarDatosHospital(), 60000);
    return () => {
      clearInterval(tReloj);
      clearInterval(tSync);
    };
  }, [cargarDatosHospital]);

  useEffect(() => {
    const fn = () => recargar();
    window.addEventListener("focus", fn);
    return () => window.removeEventListener("focus", fn);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    let activo = true;
    R({ items: [], mas: false, carga: true });
    const t = setTimeout(
      async () => {
        try {
          const r = await repo.listar(q, pag, ac.signal);
          if (activo) R({ ...r, carga: false });
        } catch (e) {
          if (activo) R({ items: [], mas: false, carga: false, error: e.message });
        }
      },
      repo.demo ? 0 : 160
    );
    return () => {
      activo = false;
      clearTimeout(t);
      ac.abort();
    };
  }, [q, pag, rev]);

  useEffect(() => {
    if (!id) {
      F(null);
      EF("");
      return;
    }
    const ac = new AbortController();
    let activo = true;
    EF("");
    repo
      .expediente(id, ac.signal)
      .then((r) => {
        if (activo) {
          if (r.p) {
            F(r);
            const fid = r.p.foto_id || r.p.fotoId;
            if (fid) {
              setFotosMapa((prev) => (prev[r.p.id] === fid ? prev : { ...prev, [r.p.id]: fid }));
            }
          } else {
            F(null);
            EF("No se encontró el paciente.");
          }
        }
      })
      .catch((e) => {
        if (activo) {
          F(null);
          EF(e.message);
        }
      });
    return () => {
      activo = false;
      ac.abort();
    };
  }, [id, rev]);

  useEffect(() => {
    function volverEnAndroid(e) {
      const dialogo = document.querySelector("dialog[open]");
      if (dialogo) {
        e.preventDefault();
        dialogo.dispatchEvent(new Event("cancel", { cancelable: true, bubbles: false }));
      } else if (abrirNotif) {
        e.preventDefault();
        setAbrirNotif(false);
      } else if (vista === "pizarra") {
        e.preventDefault();
        setVista("expedientes");
      } else if (ingresoId) {
        e.preventDefault();
        VerIngreso("");
      } else if (id) {
        e.preventDefault();
        seleccionar("");
      }
    }
    window.addEventListener("elpibe:volver", volverEnAndroid);
    return () => window.removeEventListener("elpibe:volver", volverEnAndroid);
  }, [id, ingresoId, abrirNotif, vista]);

  function seleccionar(v) {
    setVista("expedientes");
    VerIngreso("");
    if (v !== id) F(null);
    EF("");
    Id(v);
    A("");
  }

  function abrirHojaDesdeSala(pacId, admId) {
    setVista("expedientes");
    if (pacId !== id) F(null);
    EF("");
    Id(pacId);
    VerIngreso(admId || "activa");
    A("");
  }

  function guardar(pid, msg, ingreso) {
    setVista("expedientes");
    if (ingreso) {
      VerIngreso(ingreso);
      actualizarHospPaciente(pid, { activa: true, jaula: "", ubicacion: "" });
    }
    M(null);
    Q("");
    Pag(0);
    if (id !== pid) F(null);
    Id(pid);
    A(msg);
    recargar();
  }

  const pendientes3Horas = pautasActivas
    .map((item) => ({
      ...item,
      estado:
        item.esProcedimiento || item.esAgendaHoja
          ? evaluarEstadoSlot(item, relojTick)
          : calcularEstadoDosis(item, relojTick)
    }))
    .filter((item) => item.estado.visibleEnNotificaciones)
    .sort((a, b) => a.estado.diffMin - b.estado.diffMin);

  const atrasadosCount = pendientes3Horas.filter((p) => p.estado.urgencia === "atrasado").length;

  const esHospitalizado = (p) => Boolean(p.hospitalizado || p.abierta || p.ingreso_activo || hospMapa[p.id]?.activa);
  const pacientesHosp = resultado.items.filter((p) => esHospitalizado(p));
  const pacientesOtros = resultado.items.filter((p) => !esHospitalizado(p));

  const renderBotonPaciente = (p, enHospital) => {
    const jaula = p.jaula || hospMapa[p.id]?.jaula;
    const ubicacion = p.ubicacion || hospMapa[p.id]?.ubicacion;
    const fotoId = p.foto_id || p.fotoId || fotosMapa[p.id];
    return (
      <button className="ve-patient" key={p.id} aria-pressed={p.id === id} onClick={() => seleccionar(p.id)}>
        <AvatarPaciente pequeno paciente={p} src={repo.fotos.url(p.id, fotoId)} />
        <span className="ve-grow">
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
            <strong>{p.nombre}</strong>
            {enHospital && (
              <span
                className="ve-badge"
                style={{
                  background: "#fee2e2",
                  color: "#991b1b",
                  fontSize: "0.68rem",
                  padding: "0.1rem 0.4rem",
                  fontWeight: 700
                }}
              >
                Hospitalizado{jaula ? ` · ${jaula}` : ""}
              </span>
            )}
            {enHospital && ubicacion && (
              <span
                className="ve-badge"
                style={{
                  background: "#e0f2fe",
                  color: "#0369a1",
                  fontSize: "0.68rem",
                  padding: "0.1rem 0.4rem",
                  fontWeight: 700
                }}
              >
                {ubicacion}
              </span>
            )}
          </span>
          <span className="ve-meta">
            {p.especie} · {p.propietario}
          </span>
        </span>
        <ChevronRight size={14} />
      </button>
    );
  };

  return (
    <div className="ve-app">
      <header className="ve-header">
        <div className="ve-bar">
          <div className="ve-brand" style={{ cursor: "pointer" }} onClick={() => setVista("expedientes")}>
            <img src={marca} alt="Clínica Veterinaria El Pibe" />
            <b>Área clínica</b>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
            {/* Botón Pizarra General de Hospitalización */}
            <button
              type="button"
              onClick={() => {
                const nuevaVista = vista === "pizarra" ? "expedientes" : "pizarra";
                setVista(nuevaVista);
                if (nuevaVista === "pizarra") cargarDatosHospital();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.75rem",
                borderRadius: "999px",
                border: vista === "pizarra" ? "1.5px solid #0f766e" : "1px solid #cbd5e1",
                background: vista === "pizarra" ? "#0f766e" : "#f0fdfa",
                color: vista === "pizarra" ? "#fff" : "#0f766e",
                fontWeight: 700,
                fontSize: "0.8rem",
                cursor: "pointer"
              }}
              aria-pressed={vista === "pizarra"}
            >
              <LayoutGrid size={15} />
              <span>{vista === "pizarra" ? "Ver expedientes" : "Pizarra sala"}</span>
              <span
                style={{
                  background: vista === "pizarra" ? "rgba(255,255,255,0.22)" : "#0f766e",
                  color: "#fff",
                  borderRadius: "999px",
                  padding: "0.05rem 0.45rem",
                  fontSize: "0.73rem"
                }}
              >
                {salaHospital.length}
              </span>
            </button>

            {/* Botón Campana Por Medicar */}
            <button
              type="button"
              onClick={() => {
                setAbrirNotif(true);
                cargarDatosHospital();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.7rem",
                borderRadius: "999px",
                border: `1px solid ${atrasadosCount > 0 ? "#fca5a5" : pendientes3Horas.length > 0 ? "#fcd34d" : "#cbd5e1"}`,
                background: atrasadosCount > 0 ? "#fee2e2" : pendientes3Horas.length > 0 ? "#fef3c7" : "#f8fafc",
                color: atrasadosCount > 0 ? "#991b1b" : pendientes3Horas.length > 0 ? "#92400e" : "#1e293b",
                fontWeight: 700,
                fontSize: "0.8rem",
                cursor: "pointer"
              }}
              aria-label="Centro de notificaciones de medicación"
            >
              <Bell size={15} />
              <span>Por medicar</span>
              <span
                style={{
                  background: atrasadosCount > 0 ? "#dc2626" : pendientes3Horas.length > 0 ? "#d97706" : "#64748b",
                  color: "#fff",
                  borderRadius: "999px",
                  padding: "0.05rem 0.45rem",
                  fontSize: "0.73rem"
                }}
              >
                {pendientes3Horas.length}
              </span>
            </button>

            <span className="ve-badge">{repo.demo ? "Demostración" : "Clínica El Pibe"}</span>
          </div>
        </div>
      </header>

      <main className="ve-container">
        {pendientes3Horas.length > 0 && (
          <div
            role="status"
            style={{
              marginBottom: "0.85rem",
              padding: "0.65rem 0.9rem",
              borderRadius: "10px",
              border: `1px solid ${atrasadosCount > 0 ? "#fca5a5" : "#fcd34d"}`,
              background: atrasadosCount > 0 ? "#fef2f2" : "#fffbeb",
              color: atrasadosCount > 0 ? "#991b1b" : "#92400e",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.6rem"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.86rem" }}>
              {atrasadosCount > 0 ? <AlertTriangle size={18} /> : <Clock size={18} />}
              <span>
                <strong>
                  {pendientes3Horas.length} paciente(s) por medicar en menos de 3 horas
                </strong>
                {" — "}
                {pendientes3Horas
                  .slice(0, 2)
                  .map((p) => `${p.pacienteNombre || "Paciente"} (${p.producto || p.medicamento || p.medicina || "Tratamiento"} · ${p.estado.etiquetaTiempo})`)
                  .join(" | ")}
              </span>
            </div>
            <Boton
              principal
              onClick={() => {
                setAbrirNotif(true);
                cargarDatosHospital();
              }}
            >
              Ver lista ({pendientes3Horas.length})
            </Boton>
          </div>
        )}

        {vista === "pizarra" ? (
          <PizarraHospital
            pacientesSala={salaHospital}
            fotosRepo={repo.fotos}
            cargando={cargaNotif}
            relojTick={relojTick}
            onRefrescar={() => cargarDatosHospital()}
            onAbrirHoja={(pacId, admId) => abrirHojaDesdeSala(pacId, admId)}
            onAbrirExpediente={(pacId) => seleccionar(pacId)}
          />
        ) : (
          <>
            <div className="ve-row">
              <div>
                <h1 className="ve-heading">Expedientes clínicos</h1>
                <p className="ve-sub">
                  {repo.demo
                    ? "Datos ficticios. Los cambios duran mientras esta vista está abierta."
                    : "Directorio e historia clínica compartida."}
                </p>
              </div>
              <div className="ve-actions">
                <Boton icono={RefreshCw} aria-label="Actualizar expedientes" onClick={recargar} />
                <Boton principal icono={Plus} onClick={() => M({ clase: "paciente", d: {} })}>
                  Nuevo paciente
                </Boton>
              </div>
            </div>

            {aviso && (
              <p className="ve-confirm" role="status">
                {aviso}
              </p>
            )}

            <div className={"ve-main " + (id ? "has-patient" : "")}>
              <div style={{ display: "grid", gap: "1rem", alignContent: "start" }}>
                <section className="ve-panel ve-directory">
                  <div className="ve-pad">
                    <h2>Pacientes</h2>
                    <div className="ve-search">
                      <Search size={17} />
                      <input
                        type="search"
                        value={q}
                        aria-label="Buscar por paciente, propietario o cédula"
                        placeholder="Paciente, propietario o cédula"
                        onChange={(e) => {
                          Q(e.target.value);
                          Pag(0);
                          seleccionar("");
                        }}
                      />
                    </div>

                    <div className="ve-actions" style={{ marginTop: "0.55rem", flexWrap: "wrap", gap: "0.35rem" }}>
                      <button
                        type="button"
                        onClick={() => setFiltroDir("todos")}
                        className={filtroDir === "todos" ? "ve-button" : "ve-link"}
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem" }}
                      >
                        Todos ({resultado.items.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroDir("hospitalizados")}
                        className={filtroDir === "hospitalizados" ? "ve-button" : "ve-link"}
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem" }}
                      >
                        Hospitalizados ({pacientesHosp.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroDir("otros")}
                        className={filtroDir === "otros" ? "ve-button" : "ve-link"}
                        style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem" }}
                      >
                        Otros ({pacientesOtros.length})
                      </button>
                    </div>

                    <span role="status" className="ve-meta" style={{ display: "block", marginTop: "0.35rem" }}>
                      {resultado.carga ? "Buscando…" : resultado.items.length + " en esta página"}
                    </span>
                  </div>

                  <div className="ve-patients">
                    {(filtroDir === "todos" || filtroDir === "hospitalizados") && pacientesHosp.length > 0 && (
                      <>
                        <div
                          style={{
                            padding: "0.35rem 0.85rem",
                            background: "#fef2f2",
                            color: "#991b1b",
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            borderTop: "1px solid #fecaca",
                            borderBottom: "1px solid #fecaca"
                          }}
                        >
                          Hospitalizados ({pacientesHosp.length})
                        </div>
                        {pacientesHosp.map((p) => renderBotonPaciente(p, true))}
                      </>
                    )}

                    {(filtroDir === "todos" || filtroDir === "otros") && pacientesOtros.length > 0 && (
                      <>
                        {pacientesHosp.length > 0 && filtroDir === "todos" && (
                          <div
                            style={{
                              padding: "0.35rem 0.85rem",
                              background: "#f1f5f9",
                              color: "#475569",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                              borderTop: "1px solid #e2e8f0",
                              borderBottom: "1px solid #e2e8f0"
                            }}
                          >
                            Consulta externa / Otros ({pacientesOtros.length})
                          </div>
                        )}
                        {pacientesOtros.map((p) => renderBotonPaciente(p, false))}
                      </>
                    )}
                  </div>

                  {resultado.error ? (
                    <div className="ve-empty" role="alert">
                      {resultado.error}
                      <Boton onClick={recargar}>Reintentar</Boton>
                    </div>
                  ) : (
                    !resultado.carga &&
                    !resultado.items.length && (
                      <div className="ve-empty">
                        <strong>{q ? "Sin coincidencias" : "Directorio vacío"}</strong>
                        <span>{q ? "Prueba con otro nombre o cédula." : "Usa Nuevo paciente para abrir la primera ficha."}</span>
                      </div>
                    )
                  )}

                  {(pag > 0 || resultado.mas) && (
                    <div className="ve-actions ve-pad">
                      {pag > 0 && <Boton onClick={() => Pag((n) => n - 1)}>Anterior</Boton>}
                      {resultado.mas && <Boton onClick={() => Pag((n) => n + 1)}>Siguiente</Boton>}
                    </div>
                  )}
                </section>

                {/* Pestaña / Panel de Banco de Documentos debajo de Pacientes */}
                <BancoDocumentos
                  pacientesLista={resultado.items}
                  revision={rev}
                  onSeleccionarPaciente={(pacId) => seleccionar(pacId)}
                />
              </div>

              {id && ficha?.p?.id === id ? (
                <Historia
                  key={id}
                  ficha={ficha}
                  abrir={M}
                  ingresoId={ingresoId}
                  verIngreso={VerIngreso}
                  revision={rev}
                  recargar={recargar}
                  volver={() => seleccionar("")}
                  onSyncHosp={actualizarHospPaciente}
                  onCambioNotificaciones={() => cargarDatosHospital()}
                  onAltaSuccess={(pid, msg) => {
                    actualizarHospPaciente(pid, { activa: false });
                    A(msg);
                    recargar();
                  }}
                  onPacienteEliminado={(pid, nombreEliminado) => {
                    VerIngreso("");
                    F(null);
                    EF("");
                    Id("");
                    R((prev) => ({
                      ...prev,
                      items: prev.items.filter((item) => item.id !== pid)
                    }));
                    setHospMapa((prev) => {
                      const copia = { ...prev };
                      delete copia[pid];
                      return copia;
                    });
                    setFotosMapa((prev) => {
                      const copia = { ...prev };
                      delete copia[pid];
                      return copia;
                    });
                    setPautasActivas((prev) => prev.filter((item) => item.pacienteId !== pid));
                    setSalaHospital((prev) => prev.filter((item) => item.pac.id !== pid));
                    A(`Paciente "${nombreEliminado}" y todos sus exámenes fueron eliminados definitivamente.`);
                    recargar();
                  }}
                />
              ) : (
                <div className="ve-paper">
                  <div className="ve-panel ve-empty">
                    <FolderOpen size={26} />
                    <h2>{errFicha || (!id ? "Selecciona un paciente" : "Cargando ficha…")}</h2>
                    {!id && <span>Su historia aparecerá aquí.</span>}
                    {errFicha && (
                      <>
                        <Boton onClick={recargar}>Reintentar</Boton>
                        <Boton onClick={() => seleccionar("")}>Volver</Boton>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {abrirNotif && (
        <ModalCentroNotificaciones
          pendientes={pendientes3Horas}
          pacientesLista={resultado.items}
          cerrar={() => setAbrirNotif(false)}
          onRefrescar={() => cargarDatosHospital()}
          cargando={cargaNotif}
          onIrAPaciente={(pacId, admId) => abrirHojaDesdeSala(pacId, admId)}
        />
      )}

      {modal?.clase === "foto" ? (
        <EditorFoto
          paciente={modal.d}
          fotoActual={modal.fotoActual}
          fotos={repo.fotos}
          cerrar={() => M(null)}
          recargar={recargar}
          guardado={(fotoId) => {
            const pid = modal.d.id;
            setFotosMapa((prev) => ({ ...prev, [pid]: fotoId }));
            F((prev) => (prev?.p.id === pid ? { ...prev, p: { ...prev.p, foto_id: fotoId } } : prev));
            guardar(pid, "Foto de identificación guardada.");
          }}
        />
      ) : (
        modal && <Formulario modelo={modal} cerrar={() => M(null)} guardado={guardar} recargar={recargar} />
      )}
    </div>
  );
}
