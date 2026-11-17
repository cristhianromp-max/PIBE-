import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Camera, Search, Plus, Pencil, RefreshCw, ArrowLeft, ChevronRight,
  FolderOpen, Paperclip, Activity, FileText, X, Scissors, Receipt,
  LogOut, CheckCircle2, Trash2, Sparkles, Upload,
  Bell, Clock, AlertTriangle, Syringe
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
  "Medicación IV / IM / SC / VO",
  "Medicamento tópico",
  "Curación de herida",
  "Baño medicado / terapéutico",
  "Ozonoterapia",
  "Nebulización"
];

// ============================================================================
// UTILIDADES DE CÁLCULO DE HORARIOS Y ADMINISTRACIÓN DEL DÍA
// ============================================================================
function parsearFechaEcuador(str, ahoraMs = Date.now()) {
  if (!str) return null;
  const limpia = String(str).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(limpia)) {
    const hoy = fechaLocal(new Date(ahoraMs)).slice(0, 10);
    const hhmm = limpia.slice(0, 5);
    const dHora = new Date(`${hoy}T${hhmm}:00-05:00`);
    return Number.isNaN(dHora.getTime()) ? null : dHora;
  }
  const conT = limpia.replace(" ", "T");
  const iso = conT.length === 16 ? `${conT}:00-05:00` : conT;
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
  const intervaloMin = parsearIntervaloMinutos(item.frecuencia);
  const hoyEC = fechaLocal(new Date(ahoraMs)).slice(0, 10);
  const esDosisUnica = /\b(unica|única|stat|1\s*vez|una\s*vez)\b/i.test(String(item.frecuencia || ""));

  const appsParseadas = (item.aplicaciones || [])
    .map((ap) => {
      const dt = parsearFechaEcuador(ap.fecha, ahoraMs);
      return dt
        ? {
            ...ap,
            ts: dt.getTime(),
            fechaEC: fechaLocal(dt).slice(0, 10),
            horaEC: hora(dt)
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts);

  const administracionesHoy = [...appsParseadas]
    .filter((ap) => ap.fechaEC === hoyEC)
    .sort((a, b) => a.ts - b.ts);

  const tomasEsperadasDia = esDosisUnica ? 1 : Math.max(1, Math.round(1440 / intervaloMin));

  let proximaDate = null;
  if (appsParseadas.length > 0) {
    proximaDate = new Date(appsParseadas[0].ts + intervaloMin * 60000);
  } else {
    proximaDate = parsearFechaEcuador(item.proximaManual || item.fechaInicio, ahoraMs);
  }

  if (!proximaDate) {
    proximaDate = new Date(ahoraMs);
  }

  const diffMin = Math.round((proximaDate.getTime() - ahoraMs) / 60000);
  const urgencia = diffMin < 0 ? "atrasado" : diffMin <= 60 ? "proximo" : "programado";

  // Si ya recibió una dosis y es dosis única o falta más de 60 min para la siguiente toma,
  // se oculta automáticamente del Centro de Notificaciones hasta el próximo turno.
  const yaMedicadoEnTurno =
    appsParseadas.length > 0 && (esDosisUnica || diffMin > 60);

  return {
    proximaDate,
    proximaTexto: fechaLocal(proximaDate).replace("T", " "),
    proximaHora: hora(proximaDate),
    diffMin,
    urgencia,
    yaMedicadoEnTurno,
    administracionesHoy,
    tomasEsperadasDia,
    etiquetaTiempo:
      diffMin < 0
        ? `Atrasado hace ${formatearTiempoRelativo(Math.abs(diffMin))}`
        : diffMin === 0
        ? "Toca ahora"
        : `En ${formatearTiempoRelativo(diffMin)} (${hora(proximaDate)})`
  };
}

function SelectorJaula({ valor }) {
  const opciones =
    valor && !OPCIONES_JAULAS.some(([v]) => v === valor)
      ? [...OPCIONES_JAULAS, [valor, valor]]
      : OPCIONES_JAULAS;
  return <Campo etiqueta="Jaula / Área" nombre="jaula" valor={valor || ""} opciones={opciones} />;
}

// ============================================================================
// CENTRO DE NOTIFICACIONES DE PRÓXIMOS A MEDICAR + ADMINISTRACIÓN DEL DÍA
// ============================================================================
function ModalCentroNotificaciones({
  pendientes,
  pacientesLista,
  cerrar,
  onMedicarAhora,
  onIrAPaciente,
  onRefrescar,
  cargando
}) {
  const dialog = useRef(null);
  const [filtro, setFiltro] = useState("urgentes");
  const [procesandoId, setProcesandoId] = useState("");

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  const urgentes = pendientes.filter((p) => p.estado.urgencia === "atrasado" || p.estado.urgencia === "proximo");
  const visibles = filtro === "urgentes" ? urgentes : pendientes;

  async function manejarMedicar(item) {
    if (procesandoId) return;
    setProcesandoId(item.id);
    try {
      await onMedicarAhora(item);
    } finally {
      setProcesandoId("");
    }
  }

  return (
    <dialog
      className="ve-dialog ve-dialog-clinico"
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
              <Bell size={19} /> Centro de Notificaciones · Próximos a medicar
            </h2>
            <p className="ve-meta">
              {urgentes.length} urgente(s) · {pendientes.length} pendiente(s) por medicar
            </p>
          </div>
          <div className="ve-actions">
            <Boton icono={RefreshCw} aria-label="Actualizar" onClick={onRefrescar} disabled={cargando} />
            <Boton icono={X} aria-label="Cerrar" onClick={cerrar} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.45rem",
            marginTop: "0.75rem",
            padding: "0.55rem 0.65rem",
            background: "#f8fafc",
            borderRadius: "10px",
            border: "1px solid #e2e8f0"
          }}
        >
          <button
            type="button"
            onClick={() => setFiltro("urgentes")}
            className={filtro === "urgentes" ? "ve-button" : "ve-link"}
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.65rem" }}
          >
            Urgentes / Próximos ({urgentes.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltro("todos")}
            className={filtro === "todos" ? "ve-button" : "ve-link"}
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.65rem" }}
          >
            Todos pendientes ({pendientes.length})
          </button>
        </div>

        <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.85rem", maxHeight: "62vh", overflowY: "auto" }}>
          {cargando ? (
            <p className="ve-sub">Sincronizando medicaciones y administración del día…</p>
          ) : visibles.length === 0 ? (
            <div className="ve-empty" style={{ padding: "1.5rem 1rem" }}>
              <CheckCircle2 size={26} color="#16a34a" />
              <strong>
                {filtro === "urgentes"
                  ? "No hay pacientes atrasados ni próximos en la siguiente hora"
                  : "Todos los pacientes hospitalizados están medicados al día"}
              </strong>
              <span>
                {filtro === "urgentes" && pendientes.length > 0
                  ? `Tienes ${pendientes.length} medicación(es) programada(s) para más tarde. Pulsa "Todos pendientes" para verlas.`
                  : "Cuando llegue la hora de una nueva dosis aparecerá aquí automáticamente."}
              </span>
            </div>
          ) : (
            visibles.map((item) => {
              const pacEncontrado = pacientesLista.find((p) => p.id === item.pacienteId);
              const nombrePac = item.pacienteNombre || pacEncontrado?.nombre || "Paciente hospitalizado";
              const especiePac = item.especie || pacEncontrado?.especie || "";
              const jaulaPac = item.jaula || pacEncontrado?.jaula || "Sin jaula";
              const esAtrasado = item.estado.urgencia === "atrasado";
              const esProximo = item.estado.urgencia === "proximo";
              const adminHoy = item.estado.administracionesHoy || [];

              return (
                <div
                  key={item.id}
                  style={{
                    border: `1px solid ${esAtrasado ? "#fca5a5" : esProximo ? "#fcd34d" : "#cbd5e1"}`,
                    borderLeft: `5px solid ${esAtrasado ? "#dc2626" : esProximo ? "#d97706" : "#0284c7"}`,
                    borderRadius: "10px",
                    padding: "0.8rem",
                    background: esAtrasado ? "#fef2f2" : esProximo ? "#fffbeb" : "#fff"
                  }}
                >
                  <div className="ve-row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                        <span
                          className="ve-badge"
                          style={{
                            background: esAtrasado ? "#dc2626" : esProximo ? "#f59e0b" : "#e0f2fe",
                            color: esAtrasado || esProximo ? "#fff" : "#0369a1",
                            fontWeight: 700
                          }}
                        >
                          {item.estado.etiquetaTiempo}
                        </span>
                        <strong style={{ fontSize: "0.98rem" }}>{nombrePac}</strong>
                        {especiePac && <span className="ve-meta">({especiePac})</span>}
                        <span className="ve-badge" style={{ background: "#f1f5f9", color: "#334155" }}>
                          {jaulaPac}
                        </span>
                      </div>

                      <p style={{ margin: "0.4rem 0 0.25rem", fontSize: "0.92rem" }}>
                        <span className="ve-badge" style={{ marginRight: "0.4rem" }}>
                          {item.tipo}
                        </span>
                        <strong>{item.producto}</strong>
                        {item.dosis ? ` · ${item.dosis}` : ""}
                      </p>

                      <p className="ve-meta">
                        Frecuencia: <strong>{item.frecuencia}</strong> · Duración: {item.duracion}
                      </p>

                      {/* Administración del día */}
                      <div
                        style={{
                          marginTop: "0.5rem",
                          padding: "0.45rem 0.65rem",
                          borderRadius: "8px",
                          background: "rgba(255, 255, 255, 0.85)",
                          border: "1px solid #e2e8f0",
                          fontSize: "0.82rem"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.35rem" }}>
                          <strong style={{ color: "#0f172a" }}>
                            Administración del día ({adminHoy.length}/{item.estado.tomasEsperadasDia} hoy)
                          </strong>
                          <span className="ve-meta">
                            Próxima dosis: <strong>{item.estado.proximaHora}</strong>
                          </span>
                        </div>

                        {adminHoy.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                            {adminHoy.map((ap) => (
                              <span
                                key={ap.id}
                                className="ve-badge"
                                style={{
                                  background: "#dcfce7",
                                  color: "#166534",
                                  fontWeight: 600
                                }}
                              >
                                ✓ {ap.horaEC} aplicada
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="ve-meta" style={{ margin: "0.25rem 0 0", color: "#b45309" }}>
                            Sin dosis aplicadas todavía en el día de hoy.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="ve-actions" style={{ flexShrink: 0 }}>
                      <Boton
                        principal
                        icono={CheckCircle2}
                        disabled={procesandoId === item.id}
                        onClick={() => manejarMedicar(item)}
                      >
                        {procesandoId === item.id ? "Abriendo…" : "Medicar ahora"}
                      </Boton>
                      {item.pacienteId && (
                        <Boton
                          onClick={() => {
                            cerrar();
                            onIrAPaciente(item.pacienteId, item.admisionId);
                          }}
                        >
                          Ver hoja
                        </Boton>
                      )}
                    </div>
                  </div>
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
// PANEL DE TERAPIAS COMPLEMENTARIAS EN HOJA DE HOSPITALIZACIÓN
// ============================================================================
function PanelTerapiasComplementarias({ paciente, admision, profesionales, revision, onCambioNotificaciones }) {
  const admisionId = admision.id;
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const [tipo, setTipo] = useState(TIPOS_TERAPIA_HOSP[0]);
  const [producto, setProducto] = useState("");
  const [dosis, setDosis] = useState("");
  const [frecuencia, setFrecuencia] = useState("Cada 8h");
  const [duracion, setDuracion] = useState("5 días");
  const [primeraDosis, setPrimeraDosis] = useState(() => fechaLocal(new Date()));
  const [medico, setMedico] = useState("MVZ. Cristhian Romero");

  const cargar = useCallback(async (signal) => {
    setCargando(true);
    try {
      const items = await repo.modulos.listar(admisionId, "terapia_hosp", signal);
      setLista(items);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [admisionId]);

  useEffect(() => {
    const ac = new AbortController();
    cargar(ac.signal);
    return () => ac.abort();
  }, [cargar, revision]);

  async function agregarTerapia(e) {
    e.preventDefault();
    if (!producto.trim() || guardando) return;
    setGuardando(true);
    setError("");
    try {
      const nueva = {
        id: uuid(),
        admisionId,
        pacienteId: paciente?.id || "",
        pacienteNombre: paciente?.nombre || "",
        especie: paciente?.especie || "",
        jaula: admision?.jaula || "",
        tipo,
        producto: producto.trim(),
        dosis: dosis.trim(),
        frecuencia: frecuencia.trim(),
        duracion: duracion.trim(),
        proximaManual: primeraDosis.replace("T", " "),
        medico: medico.trim(),
        fechaInicio: fechaLocal(new Date()).replace("T", " "),
        activa: true,
        aplicaciones: []
      };
      const guardada = await repo.modulos.guardar(admisionId, "terapia_hosp", nueva);
      setLista((prev) => [guardada, ...prev]);
      setProducto("");
      setDosis("");
      if (onCambioNotificaciones) onCambioNotificaciones();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function registrarAplicacion(terapia) {
    const ahora = fechaLocal(new Date()).replace("T", " ");
    const doc = medico.trim() || "Médico de turno";
    const actualizada = {
      ...terapia,
      pacienteId: terapia.pacienteId || paciente?.id || "",
      pacienteNombre: terapia.pacienteNombre || paciente?.nombre || "",
      especie: terapia.especie || paciente?.especie || "",
      jaula: admision?.jaula || terapia.jaula || "",
      aplicaciones: [{ id: uuid(), fecha: ahora, medico: doc }, ...(terapia.aplicaciones || [])]
    };
    try {
      await repo.modulos.guardar(admisionId, "terapia_hosp", actualizada);
      setLista((prev) => prev.map((t) => (t.id === terapia.id ? actualizada : t)));
      if (onCambioNotificaciones) onCambioNotificaciones();
    } catch (err) {
      setError(err.message);
    }
  }

  async function alternarEstado(terapia) {
    const actualizada = { ...terapia, activa: !terapia.activa };
    try {
      await repo.modulos.guardar(admisionId, "terapia_hosp", actualizada);
      setLista((prev) => prev.map((t) => (t.id === terapia.id ? actualizada : t)));
      if (onCambioNotificaciones) onCambioNotificaciones();
    } catch (err) {
      setError(err.message);
    }
  }

  async function eliminarTerapia(terapiaId) {
    try {
      await repo.modulos.eliminar(terapiaId);
      setLista((prev) => prev.filter((t) => t.id !== terapiaId));
      if (onCambioNotificaciones) onCambioNotificaciones();
    } catch (err) {
      setError(err.message);
    }
  }

  const ahoraMs = Date.now();

  return (
    <section className="ve-panel ve-pad" style={{ marginTop: "1rem" }}>
      <div className="ve-row">
        <h2 style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <Syringe size={18} /> Terapias tópicas, curaciones, baños, ozono y nebulizaciones
        </h2>
        <span className="ve-meta">{cargando ? "Sincronizando…" : `${lista.length} registradas`}</span>
      </div>

      <form onSubmit={agregarTerapia} className="ve-campos" style={{ marginTop: "0.75rem" }}>
        <div className="ve-field">
          <label>Tipo de terapia / medicación</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_TERAPIA_HOSP.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </div>

        <div className="ve-field">
          <label>Fármaco / Producto / Solución *</label>
          <input
            type="text"
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            placeholder="Ej. Clorhexidina 2%, Nebulización, Pomada..."
            required
          />
        </div>

        <div className="ve-field">
          <label>Dosis / Vía (opcional)</label>
          <input
            type="text"
            value={dosis}
            onChange={(e) => setDosis(e.target.value)}
            placeholder="Ej. 1.2 ml IV, 10 min, aplicar en herida"
          />
        </div>

        <div className="ve-field">
          <label>Frecuencia *</label>
          <input
            type="text"
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value)}
            placeholder="Ej. Cada 6h, Cada 8h, Cada 12h, Cada 24h"
            required
          />
        </div>

        <div className="ve-field">
          <label>Primera / Próxima dosis *</label>
          <input
            type="datetime-local"
            value={primeraDosis}
            onChange={(e) => setPrimeraDosis(e.target.value)}
            required
          />
        </div>

        <div className="ve-field">
          <label>Por cuánto tiempo (Duración)</label>
          <input
            type="text"
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            placeholder="Ej. 5 días, 3 sesiones"
            required
          />
        </div>

        <div className="ve-field">
          <label>Médico responsable</label>
          <input
            type="text"
            value={medico}
            onChange={(e) => setMedico(e.target.value)}
            list="ve-prof-terapia"
          />
          <datalist id="ve-prof-terapia">
            {(profesionales || []).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>

        <div className="ve-field" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="ve-button" disabled={guardando}>
            {guardando ? "Guardando…" : "+ Agregar terapia"}
          </button>
        </div>
      </form>

      {error && (
        <p className="ve-message" role="alert">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="ve-sub" style={{ marginTop: "0.75rem" }}>Cargando pautas…</p>
      ) : lista.length > 0 ? (
        <div style={{ display: "grid", gap: "0.65rem", marginTop: "1rem" }}>
          {lista.map((t) => {
            const estadoDosis = t.activa ? calcularEstadoDosis(t, ahoraMs) : null;
            return (
              <div
                key={t.id}
                style={{
                  border: "1px solid var(--borde, #dce3ea)",
                  borderRadius: "10px",
                  padding: "0.75rem",
                  background: t.activa ? "#fff" : "#f8fafc",
                  opacity: t.activa ? 1 : 0.78
                }}
              >
                <div className="ve-row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                      <span className="ve-badge">{t.tipo}</span>
                      <strong>{t.producto}</strong>
                      {t.dosis && <span className="ve-meta">({t.dosis})</span>}
                      {estadoDosis && (
                        <span
                          className="ve-badge"
                          style={{
                            background:
                              estadoDosis.urgencia === "atrasado"
                                ? "#fee2e2"
                                : estadoDosis.urgencia === "proximo"
                                ? "#fef3c7"
                                : "#e0f2fe",
                            color:
                              estadoDosis.urgencia === "atrasado"
                                ? "#991b1b"
                                : estadoDosis.urgencia === "proximo"
                                ? "#92400e"
                                : "#0369a1",
                            fontWeight: 700
                          }}
                        >
                          Próxima: {estadoDosis.etiquetaTiempo}
                        </span>
                      )}
                    </div>
                    <p className="ve-meta" style={{ marginTop: "0.25rem" }}>
                      Frecuencia: <strong>{t.frecuencia}</strong> · Duración: <strong>{t.duracion}</strong> · Indicó:{" "}
                      {t.medico || "Sin registrar"} ({t.fechaInicio})
                    </p>
                  </div>
                  <div className="ve-actions">
                    <Boton icono={CheckCircle2} onClick={() => registrarAplicacion(t)}>
                      Marcar realizada
                    </Boton>
                    <Boton onClick={() => alternarEstado(t)}>
                      {t.activa ? "Finalizar" : "Reactivar"}
                    </Boton>
                    <Boton icono={Trash2} aria-label="Eliminar" onClick={() => eliminarTerapia(t.id)} />
                  </div>
                </div>

                {(t.aplicaciones || []).length > 0 && (
                  <div style={{ marginTop: "0.5rem", paddingTop: "0.45rem", borderTop: "1px dashed #e2e8f0" }}>
                    <span className="ve-meta">
                      Aplicaciones registradas ({t.aplicaciones.length}):{" "}
                      {t.aplicaciones.map((ap) => `${ap.fecha} (${ap.medico})`).join(" · ")}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="ve-sub" style={{ marginTop: "0.75rem" }}>
          Sin terapias complementarias registradas en este ingreso.
        </p>
      )}
    </section>
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
                                • {ex.nombre} <span className="ve-meta">({ex.fecha})</span>
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
// PESTAÑA DE COTIZACIONES (TABLA CÓMODA SINCRONIZADA EN SUPABASE)
// ============================================================================
function crearFilasCotizacion() {
  return [
    { id: uuid(), tipoItem: "Medicina", descripcion: "", cantidad: "", nota: "" },
    { id: uuid(), tipoItem: "Material médico", descripcion: "", cantidad: "", nota: "" },
    { id: uuid(), tipoItem: "Insumo", descripcion: "", cantidad: "", nota: "" }
  ];
}

function PestanaCotizaciones({ paciente, profesionales, revision }) {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [numeroCot, setNumeroCot] = useState("");
  const [internista, setInternista] = useState("MVZ. Cristhian Romero");
  const [fecha, setFecha] = useState(fechaLocal(new Date()).slice(0, 10));
  const [filasTabla, setFilasTabla] = useState(() => crearFilasCotizacion());
  const [filtroCot, setFiltroCot] = useState("TODAS");
  const [avisoCot, setAvisoCot] = useState("");
  const [errorCot, setErrorCot] = useState("");

  const cargarCotizaciones = useCallback(async (signal) => {
    setCargando(true);
    try {
      const items = await repo.modulos.listar(paciente.id, "cotizacion", signal);
      setLista(items);
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
      const horaActual = hora(new Date());
      const nuevosRegistros = await Promise.all(
        filasValidas.map((f) =>
          repo.modulos.guardar(paciente.id, "cotizacion", {
            id: uuid(),
            numeroCotizacion: numeroCot.trim(),
            internista: internista.trim(),
            fecha,
            tipoItem: f.tipoItem,
            descripcion: f.descripcion.trim(),
            cantidad: f.cantidad.trim(),
            nota: f.nota.trim(),
            horaRegistro: horaActual
          })
        )
      );

      setLista((prev) => [...nuevosRegistros, ...prev]);
      setFilasTabla(crearFilasCotizacion());
      setAvisoCot(`Se guardaron en la nube ${nuevosRegistros.length} ítem(s) en la cotización #${numeroCot.trim()}.`);
      setTimeout(() => setAvisoCot(""), 4000);
    } catch (err) {
      setErrorCot(err.message || "No se pudo guardar la cotización.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarItem(itemId) {
    try {
      await repo.modulos.eliminar(itemId);
      setLista((prev) => prev.filter((it) => it.id !== itemId));
    } catch (err) {
      setErrorCot(err.message);
    }
  }

  const numerosUnicos = [...new Set(lista.map((it) => it.numeroCotizacion))];
  const filtrados = filtroCot === "TODAS" ? lista : lista.filter((it) => it.numeroCotizacion === filtroCot);

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
        <div className="ve-row">
          <h2>Historial de Cotizaciones e Insumos ({filtrados.length})</h2>
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
        </div>

        {cargando ? (
          <p className="ve-sub">Cargando cotizaciones…</p>
        ) : filtrados.length === 0 ? (
          <p className="ve-sub">Aún no se han cargado insumos o medicinas en cotizaciones para {paciente.nombre}.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0", color: "#334155" }}>
                  <th style={{ padding: "0.5rem 0.35rem" }}>N.º Cotización</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Fecha</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Tipo</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Material / Medicina / Insumo</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Cantidad</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Internista</th>
                  <th style={{ width: "36px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((it) => (
                  <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.5rem 0.35rem" }}>
                      <span className="ve-badge">#{it.numeroCotizacion}</span>
                    </td>
                    <td style={{ padding: "0.5rem 0.35rem" }}>
                      {it.fecha} <span className="ve-meta">{it.horaRegistro}</span>
                    </td>
                    <td style={{ padding: "0.5rem 0.35rem" }}>{it.tipoItem}</td>
                    <td style={{ padding: "0.5rem 0.35rem" }}>
                      <strong>{it.descripcion}</strong>
                      {it.nota && <div className="ve-meta">{it.nota}</div>}
                    </td>
                    <td style={{ padding: "0.5rem 0.35rem", fontWeight: 700 }}>{it.cantidad}</td>
                    <td style={{ padding: "0.5rem 0.35rem" }}>{it.internista}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => eliminarItem(it.id)}
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
  onCambioNotificaciones
}) {
  const android = globalThis.Capacitor?.getPlatform?.() === "android";
  const { p, atenciones, anexos } = ficha;
  const [filtro, Filtro] = useState("todos");
  const [pestana, setPestana] = useState("clinica");
  const [altaTarget, setAltaTarget] = useState(null);

  const ultima = atenciones.find((a) => a.peso != null);
  const profesionales = [...new Set(atenciones.map((a) => a.profesional).filter(Boolean))];
  const hospitalAbierto = atenciones.find((a) => a.tipo === "hospitalizacion" && a.abierta);
  const admision =
    atenciones.find((a) => a.id === ingresoId && a.tipo === "hospitalizacion") ||
    (ingresoId === "activa" ? hospitalAbierto : null);

  useEffect(() => {
    if (onSyncHosp && p?.id) {
      onSyncHosp(p.id, hospitalAbierto ? { activa: true, jaula: hospitalAbierto.jaula || "" } : { activa: false });
    }
  }, [p?.id, hospitalAbierto?.id, hospitalAbierto?.abierta, hospitalAbierto?.jaula, onSyncHosp]);

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

        <PanelTerapiasComplementarias
          paciente={p}
          admision={admision}
          profesionales={profesionales}
          revision={revision}
          onCambioNotificaciones={onCambioNotificaciones}
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

  const campos = [
    ["Propietario", p.propietario],
    ["Cédula", p.cedula],
    ["Teléfono", p.telefono],
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

              <div className="ve-actions">
                <Boton icono={Camera} onClick={() => editarFoto()}>
                  {p.foto_id ? "Cambiar foto" : "Añadir foto"}
                </Boton>
                <Boton icono={Pencil} onClick={() => abrir({ clase: "paciente", d: p, pid: p.id })}>
                  Editar ficha
                </Boton>
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
    </div>
  );
}

// ============================================================================
// APLICACIÓN RAÍZ
// ============================================================================
export default function App() {
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

  // Estado del Centro de Notificaciones
  const [pautasActivas, setPautasActivas] = useState([]);
  const [cargaNotif, setCargaNotif] = useState(false);
  const [abrirNotif, setAbrirNotif] = useState(false);
  const [relojTick, setRelojTick] = useState(() => Date.now());

  function recargar() {
    Rev((n) => n + 1);
  }

  const actualizarHospPaciente = useCallback((pacienteId, info) => {
    setHospMapa((prev) => {
      const actual = prev[pacienteId];
      if (actual?.activa === info.activa && (actual?.jaula || "") === (info.jaula || "")) {
        return prev;
      }
      return { ...prev, [pacienteId]: info };
    });
  }, []);

  // Cargar notificaciones globales (Hoja de Hospitalización + Terapias)
  const cargarNotificaciones = useCallback(async (signal) => {
    setCargaNotif(true);
    try {
      const items = await repo.notificaciones.listarActivas(signal);
      setPautasActivas(items);
    } catch (e) {
      if (e.name !== "AbortError") console.error(e);
    } finally {
      setCargaNotif(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    cargarNotificaciones(ac.signal);
    return () => ac.abort();
  }, [cargarNotificaciones, rev]);

  useEffect(() => {
    const tReloj = setInterval(() => setRelojTick(Date.now()), 30000);
    const tSync = setInterval(() => cargarNotificaciones(), 90000);
    return () => {
      clearInterval(tReloj);
      clearInterval(tSync);
    };
  }, [cargarNotificaciones]);

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
          if (r.p) F(r);
          else {
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
  }, [id, ingresoId, abrirNotif]);

  function seleccionar(v) {
    VerIngreso("");
    if (v !== id) F(null);
    EF("");
    Id(v);
    A("");
  }

  function guardar(pid, msg, ingreso) {
    if (ingreso) {
      VerIngreso(ingreso);
      actualizarHospPaciente(pid, { activa: true, jaula: "" });
    }
    M(null);
    Q("");
    Pag(0);
    if (id !== pid) F(null);
    Id(pid);
    A(msg);
    recargar();
  }

  async function medicarDesdeNotificacion(item) {
    // 1. Cerrar modal y navegar directamente a la página de hospitalización del paciente
    setAbrirNotif(false);
    if (item.pacienteId) {
      if (item.pacienteId !== id) F(null);
      EF("");
      Id(item.pacienteId);
      VerIngreso(item.admisionId || "activa");
    }

    // 2. Registrar la medicación y quitarla de inmediato del Centro de Notificaciones
    try {
      const nuevoReg = await repo.notificaciones.registrarAplicacion(item);
      setPautasActivas((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, aplicaciones: [nuevoReg, ...(p.aplicaciones || [])] } : p
        )
      );
      A(`Medicación aplicada: ${item.pacienteNombre || "Paciente"} · ${item.producto} (${nuevoReg.fecha.slice(11)}).`);
      recargar();
    } catch (err) {
      A(err.message || "No se pudo registrar la medicación.");
    }
  }

  // Filtrar: una vez medicado en su turno actual, desaparece del Centro de Notificaciones
  const pendientesOrdenados = pautasActivas
    .map((item) => ({
      ...item,
      estado: calcularEstadoDosis(item, relojTick)
    }))
    .filter((item) => !item.estado.yaMedicadoEnTurno)
    .sort((a, b) => a.estado.diffMin - b.estado.diffMin);

  const urgentesCount = pendientesOrdenados.filter(
    (p) => p.estado.urgencia === "atrasado" || p.estado.urgencia === "proximo"
  ).length;
  const atrasadosCount = pendientesOrdenados.filter((p) => p.estado.urgencia === "atrasado").length;

  const esHospitalizado = (p) => Boolean(p.hospitalizado || p.abierta || p.ingreso_activo || hospMapa[p.id]?.activa);
  const pacientesHosp = resultado.items.filter((p) => esHospitalizado(p));
  const pacientesOtros = resultado.items.filter((p) => !esHospitalizado(p));

  const renderBotonPaciente = (p, enHospital) => {
    const jaula = p.jaula || hospMapa[p.id]?.jaula;
    return (
      <button className="ve-patient" key={p.id} aria-pressed={p.id === id} onClick={() => seleccionar(p.id)}>
        <AvatarPaciente pequeno paciente={p} src={repo.fotos.url(p.id, p.foto_id)} />
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
          <div className="ve-brand">
            <img src={marca} alt="Clínica Veterinaria El Pibe" />
            <b>Área clínica</b>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <button
              type="button"
              onClick={() => {
                setAbrirNotif(true);
                cargarNotificaciones();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.7rem",
                borderRadius: "999px",
                border: `1px solid ${atrasadosCount > 0 ? "#fca5a5" : urgentesCount > 0 ? "#fcd34d" : "#cbd5e1"}`,
                background: atrasadosCount > 0 ? "#fee2e2" : urgentesCount > 0 ? "#fef3c7" : "#f8fafc",
                color: atrasadosCount > 0 ? "#991b1b" : urgentesCount > 0 ? "#92400e" : "#1e293b",
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
                  background: atrasadosCount > 0 ? "#dc2626" : urgentesCount > 0 ? "#d97706" : "#64748b",
                  color: "#fff",
                  borderRadius: "999px",
                  padding: "0.05rem 0.45rem",
                  fontSize: "0.73rem"
                }}
              >
                {urgentesCount > 0 ? urgentesCount : pendientesOrdenados.length}
              </span>
            </button>

            <span className="ve-badge">{repo.demo ? "Demostración" : "Clínica El Pibe"}</span>
          </div>
        </div>
      </header>

      <main className="ve-container">
        {urgentesCount > 0 && (
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
                  {atrasadosCount > 0
                    ? `${atrasadosCount} medicación(es) atrasada(s)`
                    : `${urgentesCount} paciente(s) próximo(s) a medicar`}
                </strong>
                {" — "}
                {pendientesOrdenados
                  .slice(0, 2)
                  .map((p) => `${p.pacienteNombre || "Paciente"} (${p.producto} · ${p.estado.etiquetaTiempo})`)
                  .join(" | ")}
              </span>
            </div>
            <Boton
              principal
              onClick={() => {
                setAbrirNotif(true);
                cargarNotificaciones();
              }}
            >
              Abrir notificaciones ({urgentesCount})
            </Boton>
          </div>
        )}

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
              onCambioNotificaciones={() => cargarNotificaciones()}
              onAltaSuccess={(pid, msg) => {
                actualizarHospPaciente(pid, { activa: false });
                A(msg);
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
      </main>

      {abrirNotif && (
        <ModalCentroNotificaciones
          pendientes={pendientesOrdenados}
          pacientesLista={resultado.items}
          cerrar={() => setAbrirNotif(false)}
          onMedicarAhora={medicarDesdeNotificacion}
          onRefrescar={() => cargarNotificaciones()}
          cargando={cargaNotif}
          onIrAPaciente={(pacId, admId) => {
            seleccionar(pacId);
            VerIngreso(admId || "activa");
          }}
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
            F((prev) => (prev?.p.id === pid ? { ...prev, p: { ...prev.p, foto_id: fotoId } } : prev));
            guardar(pid, "Foto de identificación guardada.");
          }}
        />
      ) : (
        modal && <Formulario modelo={modal} cerrar={() => M(null)} guardado={guardar} recargar={recargar} />
      )}
    </div>
  );
}import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Camera, Search, Plus, Pencil, RefreshCw, ArrowLeft, ChevronRight,
  FolderOpen, Paperclip, Activity, FileText, X, Scissors, Receipt,
  LogOut, Droplets, CheckCircle2, Trash2, Sparkles, Upload,
  Bell, Clock, AlertTriangle, Syringe
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
  "Medicación IV / IM / SC / VO",
  "Medicamento tópico",
  "Curación de herida",
  "Baño medicado / terapéutico",
  "Ozonoterapia",
  "Nebulización"
];

// ============================================================================
// UTILIDADES DE CÁLCULO DE HORARIOS Y ADMINISTRACIÓN DEL DÍA
// ============================================================================
function parsearFechaEcuador(str, ahoraMs = Date.now()) {
  if (!str) return null;
  const limpia = String(str).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(limpia)) {
    const hoy = fechaLocal(new Date(ahoraMs)).slice(0, 10);
    const hhmm = limpia.slice(0, 5);
    const dHora = new Date(`${hoy}T${hhmm}:00-05:00`);
    return Number.isNaN(dHora.getTime()) ? null : dHora;
  }
  const conT = limpia.replace(" ", "T");
  const iso = conT.length === 16 ? `${conT}:00-05:00` : conT;
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
  const intervaloMin = parsearIntervaloMinutos(item.frecuencia);
  const hoyEC = fechaLocal(new Date(ahoraMs)).slice(0, 10);

  const appsParseadas = (item.aplicaciones || [])
    .map((ap) => {
      const dt = parsearFechaEcuador(ap.fecha, ahoraMs);
      return dt
        ? {
            ...ap,
            ts: dt.getTime(),
            fechaEC: fechaLocal(dt).slice(0, 10),
            horaEC: hora(dt)
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts);

  const administracionesHoy = [...appsParseadas]
    .filter((ap) => ap.fechaEC === hoyEC)
    .sort((a, b) => a.ts - b.ts);

  const tomasEsperadasDia = Math.max(1, Math.round(1440 / intervaloMin));

  let proximaDate = null;
  if (appsParseadas.length > 0) {
    proximaDate = new Date(appsParseadas[0].ts + intervaloMin * 60000);
  } else {
    proximaDate = parsearFechaEcuador(item.proximaManual || item.fechaInicio, ahoraMs);
  }

  if (!proximaDate) {
    proximaDate = new Date(ahoraMs);
  }

  const diffMin = Math.round((proximaDate.getTime() - ahoraMs) / 60000);
  const urgencia = diffMin < 0 ? "atrasado" : diffMin <= 60 ? "proximo" : "programado";

  return {
    proximaDate,
    proximaTexto: fechaLocal(proximaDate).replace("T", " "),
    proximaHora: hora(proximaDate),
    diffMin,
    urgencia,
    administracionesHoy,
    tomasEsperadasDia,
    etiquetaTiempo:
      diffMin < 0
        ? `Atrasado hace ${formatearTiempoRelativo(Math.abs(diffMin))}`
        : diffMin === 0
        ? "Toca ahora"
        : `En ${formatearTiempoRelativo(diffMin)} (${hora(proximaDate)})`
  };
}

function SelectorJaula({ valor }) {
  const opciones =
    valor && !OPCIONES_JAULAS.some(([v]) => v === valor)
      ? [...OPCIONES_JAULAS, [valor, valor]]
      : OPCIONES_JAULAS;
  return <Campo etiqueta="Jaula / Área" nombre="jaula" valor={valor || ""} opciones={opciones} />;
}

// ============================================================================
// CENTRO DE NOTIFICACIONES DE PRÓXIMOS A MEDICAR + ADMINISTRACIÓN DEL DÍA
// ============================================================================
function ModalCentroNotificaciones({
  pendientes,
  pacientesLista,
  cerrar,
  onMedicarAhora,
  onIrAPaciente,
  onRefrescar,
  cargando
}) {
  const dialog = useRef(null);
  const [filtro, setFiltro] = useState("urgentes");
  const [procesandoId, setProcesandoId] = useState("");

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  const urgentes = pendientes.filter((p) => p.estado.urgencia === "atrasado" || p.estado.urgencia === "proximo");
  const visibles = filtro === "urgentes" ? urgentes : pendientes;

  async function manejarMedicar(item) {
    if (procesandoId) return;
    setProcesandoId(item.id);
    try {
      await onMedicarAhora(item);
    } finally {
      setProcesandoId("");
    }
  }

  return (
    <dialog
      className="ve-dialog ve-dialog-clinico"
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
              <Bell size={19} /> Centro de Notificaciones · Próximos a medicar
            </h2>
            <p className="ve-meta">
              {urgentes.length} urgente(s) · {pendientes.length} medicación(es) activa(s)
            </p>
          </div>
          <div className="ve-actions">
            <Boton icono={RefreshCw} aria-label="Actualizar" onClick={onRefrescar} disabled={cargando} />
            <Boton icono={X} aria-label="Cerrar" onClick={cerrar} />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.45rem",
            marginTop: "0.75rem",
            padding: "0.55rem 0.65rem",
            background: "#f8fafc",
            borderRadius: "10px",
            border: "1px solid #e2e8f0"
          }}
        >
          <button
            type="button"
            onClick={() => setFiltro("urgentes")}
            className={filtro === "urgentes" ? "ve-button" : "ve-link"}
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.65rem" }}
          >
            Urgentes / Próximos ({urgentes.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltro("todos")}
            className={filtro === "todos" ? "ve-button" : "ve-link"}
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.65rem" }}
          >
            Todos activos ({pendientes.length})
          </button>
        </div>

        <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.85rem", maxHeight: "62vh", overflowY: "auto" }}>
          {cargando ? (
            <p className="ve-sub">Sincronizando medicaciones y administración del día…</p>
          ) : visibles.length === 0 ? (
            <div className="ve-empty" style={{ padding: "1.5rem 1rem" }}>
              <CheckCircle2 size={26} color="#16a34a" />
              <strong>
                {filtro === "urgentes"
                  ? "No hay pacientes atrasados ni próximos en la siguiente hora"
                  : "No hay medicaciones o inyecciones activas programadas"}
              </strong>
              <span>
                {filtro === "urgentes" && pendientes.length > 0
                  ? `Tienes ${pendientes.length} medicación(es) programada(s) para más tarde. Pulsa "Todos activos" para verlas.`
                  : "Las inyecciones y pautas agregadas en la Hoja de Hospitalización aparecerán aquí automáticamente."}
              </span>
            </div>
          ) : (
            visibles.map((item) => {
              const pacEncontrado = pacientesLista.find((p) => p.id === item.pacienteId);
              const nombrePac = item.pacienteNombre || pacEncontrado?.nombre || "Paciente hospitalizado";
              const especiePac = item.especie || pacEncontrado?.especie || "";
              const jaulaPac = item.jaula || pacEncontrado?.jaula || "Sin jaula";
              const esAtrasado = item.estado.urgencia === "atrasado";
              const esProximo = item.estado.urgencia === "proximo";
              const adminHoy = item.estado.administracionesHoy || [];

              return (
                <div
                  key={item.id}
                  style={{
                    border: `1px solid ${esAtrasado ? "#fca5a5" : esProximo ? "#fcd34d" : "#cbd5e1"}`,
                    borderLeft: `5px solid ${esAtrasado ? "#dc2626" : esProximo ? "#d97706" : "#0284c7"}`,
                    borderRadius: "10px",
                    padding: "0.8rem",
                    background: esAtrasado ? "#fef2f2" : esProximo ? "#fffbeb" : "#fff"
                  }}
                >
                  <div className="ve-row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                        <span
                          className="ve-badge"
                          style={{
                            background: esAtrasado ? "#dc2626" : esProximo ? "#f59e0b" : "#e0f2fe",
                            color: esAtrasado || esProximo ? "#fff" : "#0369a1",
                            fontWeight: 700
                          }}
                        >
                          {item.estado.etiquetaTiempo}
                        </span>
                        <strong style={{ fontSize: "0.98rem" }}>{nombrePac}</strong>
                        {especiePac && <span className="ve-meta">({especiePac})</span>}
                        <span className="ve-badge" style={{ background: "#f1f5f9", color: "#334155" }}>
                          {jaulaPac}
                        </span>
                      </div>

                      <p style={{ margin: "0.4rem 0 0.25rem", fontSize: "0.92rem" }}>
                        <span className="ve-badge" style={{ marginRight: "0.4rem" }}>
                          {item.tipo}
                        </span>
                        <strong>{item.producto}</strong>
                        {item.dosis ? ` · ${item.dosis}` : ""}
                      </p>

                      <p className="ve-meta">
                        Frecuencia: <strong>{item.frecuencia}</strong> · Duración: {item.duracion}
                      </p>

                      {/* Bloque explícito de Administración del día */}
                      <div
                        style={{
                          marginTop: "0.5rem",
                          padding: "0.45rem 0.65rem",
                          borderRadius: "8px",
                          background: "rgba(255, 255, 255, 0.85)",
                          border: "1px solid #e2e8f0",
                          fontSize: "0.82rem"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.35rem" }}>
                          <strong style={{ color: "#0f172a" }}>
                            Administración del día ({adminHoy.length}/{item.estado.tomasEsperadasDia} hoy)
                          </strong>
                          <span className="ve-meta">
                            Próxima dosis: <strong>{item.estado.proximaHora}</strong>
                          </span>
                        </div>

                        {adminHoy.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                            {adminHoy.map((ap) => (
                              <span
                                key={ap.id}
                                className="ve-badge"
                                style={{
                                  background: "#dcfce7",
                                  color: "#166534",
                                  fontWeight: 600
                                }}
                              >
                                ✓ {ap.horaEC} aplicada
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="ve-meta" style={{ margin: "0.25rem 0 0", color: "#b45309" }}>
                            Sin dosis aplicadas todavía en el día de hoy.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="ve-actions" style={{ flexShrink: 0 }}>
                      <Boton
                        principal
                        icono={CheckCircle2}
                        disabled={procesandoId === item.id}
                        onClick={() => manejarMedicar(item)}
                      >
                        {procesandoId === item.id ? "Guardando…" : "Medicar ahora"}
                      </Boton>
                      {item.pacienteId && (
                        <Boton
                          onClick={() => {
                            cerrar();
                            onIrAPaciente(item.pacienteId, item.admisionId);
                          }}
                        >
                          Ver hoja
                        </Boton>
                      )}
                    </div>
                  </div>
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
// PANEL DE TERAPIAS COMPLEMENTARIAS EN HOJA DE HOSPITALIZACIÓN
// ============================================================================
function PanelTerapiasComplementarias({ paciente, admision, profesionales, revision, onCambioNotificaciones }) {
  const admisionId = admision.id;
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const [tipo, setTipo] = useState(TIPOS_TERAPIA_HOSP[0]);
  const [producto, setProducto] = useState("");
  const [dosis, setDosis] = useState("");
  const [frecuencia, setFrecuencia] = useState("Cada 8h");
  const [duracion, setDuracion] = useState("5 días");
  const [primeraDosis, setPrimeraDosis] = useState(() => fechaLocal(new Date()));
  const [medico, setMedico] = useState("MVZ. Cristhian Romero");

  const cargar = useCallback(async (signal) => {
    setCargando(true);
    try {
      const items = await repo.modulos.listar(admisionId, "terapia_hosp", signal);
      setLista(items);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [admisionId]);

  useEffect(() => {
    const ac = new AbortController();
    cargar(ac.signal);
    return () => ac.abort();
  }, [cargar, revision]);

  async function agregarTerapia(e) {
    e.preventDefault();
    if (!producto.trim() || guardando) return;
    setGuardando(true);
    setError("");
    try {
      const nueva = {
        id: uuid(),
        admisionId,
        pacienteId: paciente?.id || "",
        pacienteNombre: paciente?.nombre || "",
        especie: paciente?.especie || "",
        jaula: admision?.jaula || "",
        tipo,
        producto: producto.trim(),
        dosis: dosis.trim(),
        frecuencia: frecuencia.trim(),
        duracion: duracion.trim(),
        proximaManual: primeraDosis.replace("T", " "),
        medico: medico.trim(),
        fechaInicio: fechaLocal(new Date()).replace("T", " "),
        activa: true,
        aplicaciones: []
      };
      const guardada = await repo.modulos.guardar(admisionId, "terapia_hosp", nueva);
      setLista((prev) => [guardada, ...prev]);
      setProducto("");
      setDosis("");
      if (onCambioNotificaciones) onCambioNotificaciones();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function registrarAplicacion(terapia) {
    const ahora = fechaLocal(new Date()).replace("T", " ");
    const doc = medico.trim() || "Médico de turno";
    const actualizada = {
      ...terapia,
      pacienteId: terapia.pacienteId || paciente?.id || "",
      pacienteNombre: terapia.pacienteNombre || paciente?.nombre || "",
      especie: terapia.especie || paciente?.especie || "",
      jaula: admision?.jaula || terapia.jaula || "",
      aplicaciones: [{ id: uuid(), fecha: ahora, medico: doc }, ...(terapia.aplicaciones || [])]
    };
    try {
      await repo.modulos.guardar(admisionId, "terapia_hosp", actualizada);
      setLista((prev) => prev.map((t) => (t.id === terapia.id ? actualizada : t)));
      if (onCambioNotificaciones) onCambioNotificaciones();
    } catch (err) {
      setError(err.message);
    }
  }

  async function alternarEstado(terapia) {
    const actualizada = { ...terapia, activa: !terapia.activa };
    try {
      await repo.modulos.guardar(admisionId, "terapia_hosp", actualizada);
      setLista((prev) => prev.map((t) => (t.id === terapia.id ? actualizada : t)));
      if (onCambioNotificaciones) onCambioNotificaciones();
    } catch (err) {
      setError(err.message);
    }
  }

  async function eliminarTerapia(terapiaId) {
    try {
      await repo.modulos.eliminar(terapiaId);
      setLista((prev) => prev.filter((t) => t.id !== terapiaId));
      if (onCambioNotificaciones) onCambioNotificaciones();
    } catch (err) {
      setError(err.message);
    }
  }

  const ahoraMs = Date.now();

  return (
    <section className="ve-panel ve-pad" style={{ marginTop: "1rem" }}>
      <div className="ve-row">
        <h2 style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <Syringe size={18} /> Terapias tópicas, curaciones, baños, ozono y nebulizaciones
        </h2>
        <span className="ve-meta">{cargando ? "Sincronizando…" : `${lista.length} registradas`}</span>
      </div>

      <form onSubmit={agregarTerapia} className="ve-campos" style={{ marginTop: "0.75rem" }}>
        <div className="ve-field">
          <label>Tipo de terapia / medicación</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_TERAPIA_HOSP.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </div>

        <div className="ve-field">
          <label>Fármaco / Producto / Solución *</label>
          <input
            type="text"
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            placeholder="Ej. Clorhexidina 2%, Nebulización, Pomada..."
            required
          />
        </div>

        <div className="ve-field">
          <label>Dosis / Vía (opcional)</label>
          <input
            type="text"
            value={dosis}
            onChange={(e) => setDosis(e.target.value)}
            placeholder="Ej. 1.2 ml IV, 10 min, aplicar en herida"
          />
        </div>

        <div className="ve-field">
          <label>Frecuencia *</label>
          <input
            type="text"
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value)}
            placeholder="Ej. Cada 6h, Cada 8h, Cada 12h, Cada 24h"
            required
          />
        </div>

        <div className="ve-field">
          <label>Primera / Próxima dosis *</label>
          <input
            type="datetime-local"
            value={primeraDosis}
            onChange={(e) => setPrimeraDosis(e.target.value)}
            required
          />
        </div>

        <div className="ve-field">
          <label>Por cuánto tiempo (Duración)</label>
          <input
            type="text"
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            placeholder="Ej. 5 días, 3 sesiones"
            required
          />
        </div>

        <div className="ve-field">
          <label>Médico responsable</label>
          <input
            type="text"
            value={medico}
            onChange={(e) => setMedico(e.target.value)}
            list="ve-prof-terapia"
          />
          <datalist id="ve-prof-terapia">
            {(profesionales || []).map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>

        <div className="ve-field" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="ve-button" disabled={guardando}>
            {guardando ? "Guardando…" : "+ Agregar terapia"}
          </button>
        </div>
      </form>

      {error && (
        <p className="ve-message" role="alert">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="ve-sub" style={{ marginTop: "0.75rem" }}>Cargando pautas…</p>
      ) : lista.length > 0 ? (
        <div style={{ display: "grid", gap: "0.65rem", marginTop: "1rem" }}>
          {lista.map((t) => {
            const estadoDosis = t.activa ? calcularEstadoDosis(t, ahoraMs) : null;
            return (
              <div
                key={t.id}
                style={{
                  border: "1px solid var(--borde, #dce3ea)",
                  borderRadius: "10px",
                  padding: "0.75rem",
                  background: t.activa ? "#fff" : "#f8fafc",
                  opacity: t.activa ? 1 : 0.78
                }}
              >
                <div className="ve-row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                      <span className="ve-badge">{t.tipo}</span>
                      <strong>{t.producto}</strong>
                      {t.dosis && <span className="ve-meta">({t.dosis})</span>}
                      {estadoDosis && (
                        <span
                          className="ve-badge"
                          style={{
                            background:
                              estadoDosis.urgencia === "atrasado"
                                ? "#fee2e2"
                                : estadoDosis.urgencia === "proximo"
                                ? "#fef3c7"
                                : "#e0f2fe",
                            color:
                              estadoDosis.urgencia === "atrasado"
                                ? "#991b1b"
                                : estadoDosis.urgencia === "proximo"
                                ? "#92400e"
                                : "#0369a1",
                            fontWeight: 700
                          }}
                        >
                          Próxima: {estadoDosis.etiquetaTiempo}
                        </span>
                      )}
                    </div>
                    <p className="ve-meta" style={{ marginTop: "0.25rem" }}>
                      Frecuencia: <strong>{t.frecuencia}</strong> · Duración: <strong>{t.duracion}</strong> · Indicó:{" "}
                      {t.medico || "Sin registrar"} ({t.fechaInicio})
                    </p>
                  </div>
                  <div className="ve-actions">
                    <Boton icono={CheckCircle2} onClick={() => registrarAplicacion(t)}>
                      Marcar realizada
                    </Boton>
                    <Boton onClick={() => alternarEstado(t)}>
                      {t.activa ? "Finalizar" : "Reactivar"}
                    </Boton>
                    <Boton icono={Trash2} aria-label="Eliminar" onClick={() => eliminarTerapia(t.id)} />
                  </div>
                </div>

                {(t.aplicaciones || []).length > 0 && (
                  <div style={{ marginTop: "0.5rem", paddingTop: "0.45rem", borderTop: "1px dashed #e2e8f0" }}>
                    <span className="ve-meta">
                      Aplicaciones registradas ({t.aplicaciones.length}):{" "}
                      {t.aplicaciones.map((ap) => `${ap.fecha} (${ap.medico})`).join(" · ")}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="ve-sub" style={{ marginTop: "0.75rem" }}>
          Sin terapias complementarias registradas en este ingreso.
        </p>
      )}
    </section>
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
                                • {ex.nombre} <span className="ve-meta">({ex.fecha})</span>
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
// PESTAÑA DE COTIZACIONES (TABLA CÓMODA SINCRONIZADA EN SUPABASE)
// ============================================================================
function crearFilasCotizacion() {
  return [
    { id: uuid(), tipoItem: "Medicina", descripcion: "", cantidad: "", nota: "" },
    { id: uuid(), tipoItem: "Material médico", descripcion: "", cantidad: "", nota: "" },
    { id: uuid(), tipoItem: "Insumo", descripcion: "", cantidad: "", nota: "" }
  ];
}

function PestanaCotizaciones({ paciente, profesionales, revision }) {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [numeroCot, setNumeroCot] = useState("");
  const [internista, setInternista] = useState("MVZ. Cristhian Romero");
  const [fecha, setFecha] = useState(fechaLocal(new Date()).slice(0, 10));
  const [filasTabla, setFilasTabla] = useState(() => crearFilasCotizacion());
  const [filtroCot, setFiltroCot] = useState("TODAS");
  const [avisoCot, setAvisoCot] = useState("");
  const [errorCot, setErrorCot] = useState("");

  const cargarCotizaciones = useCallback(async (signal) => {
    setCargando(true);
    try {
      const items = await repo.modulos.listar(paciente.id, "cotizacion", signal);
      setLista(items);
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
      const horaActual = hora(new Date());
      const nuevosRegistros = await Promise.all(
        filasValidas.map((f) =>
          repo.modulos.guardar(paciente.id, "cotizacion", {
            id: uuid(),
            numeroCotizacion: numeroCot.trim(),
            internista: internista.trim(),
            fecha,
            tipoItem: f.tipoItem,
            descripcion: f.descripcion.trim(),
            cantidad: f.cantidad.trim(),
            nota: f.nota.trim(),
            horaRegistro: horaActual
          })
        )
      );

      setLista((prev) => [...nuevosRegistros, ...prev]);
      setFilasTabla(crearFilasCotizacion());
      setAvisoCot(`Se guardaron en la nube ${nuevosRegistros.length} ítem(s) en la cotización #${numeroCot.trim()}.`);
      setTimeout(() => setAvisoCot(""), 4000);
    } catch (err) {
      setErrorCot(err.message || "No se pudo guardar la cotización.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarItem(itemId) {
    try {
      await repo.modulos.eliminar(itemId);
      setLista((prev) => prev.filter((it) => it.id !== itemId));
    } catch (err) {
      setErrorCot(err.message);
    }
  }

  const numerosUnicos = [...new Set(lista.map((it) => it.numeroCotizacion))];
  const filtrados = filtroCot === "TODAS" ? lista : lista.filter((it) => it.numeroCotizacion === filtroCot);

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
        <div className="ve-row">
          <h2>Historial de Cotizaciones e Insumos ({filtrados.length})</h2>
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
        </div>

        {cargando ? (
          <p className="ve-sub">Cargando cotizaciones…</p>
        ) : filtrados.length === 0 ? (
          <p className="ve-sub">Aún no se han cargado insumos o medicinas en cotizaciones para {paciente.nombre}.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0", color: "#334155" }}>
                  <th style={{ padding: "0.5rem 0.35rem" }}>N.º Cotización</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Fecha</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Tipo</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Material / Medicina / Insumo</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Cantidad</th>
                  <th style={{ padding: "0.5rem 0.35rem" }}>Internista</th>
                  <th style={{ width: "36px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((it) => (
                  <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.5rem 0.35rem" }}>
                      <span className="ve-badge">#{it.numeroCotizacion}</span>
                    </td>
                    <td style={{ padding: "0.5rem 0.35rem" }}>
                      {it.fecha} <span className="ve-meta">{it.horaRegistro}</span>
                    </td>
                    <td style={{ padding: "0.5rem 0.35rem" }}>{it.tipoItem}</td>
                    <td style={{ padding: "0.5rem 0.35rem" }}>
                      <strong>{it.descripcion}</strong>
                      {it.nota && <div className="ve-meta">{it.nota}</div>}
                    </td>
                    <td style={{ padding: "0.5rem 0.35rem", fontWeight: 700 }}>{it.cantidad}</td>
                    <td style={{ padding: "0.5rem 0.35rem" }}>{it.internista}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => eliminarItem(it.id)}
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
  onCambioNotificaciones
}) {
  const android = globalThis.Capacitor?.getPlatform?.() === "android";
  const { p, atenciones, anexos } = ficha;
  const [filtro, Filtro] = useState("todos");
  const [pestana, setPestana] = useState("clinica");
  const [altaTarget, setAltaTarget] = useState(null);

  const ultima = atenciones.find((a) => a.peso != null);
  const profesionales = [...new Set(atenciones.map((a) => a.profesional).filter(Boolean))];
  const hospitalAbierto = atenciones.find((a) => a.tipo === "hospitalizacion" && a.abierta);
  const admision = atenciones.find((a) => a.id === ingresoId && a.tipo === "hospitalizacion");

  useEffect(() => {
    if (onSyncHosp && p?.id) {
      onSyncHosp(p.id, hospitalAbierto ? { activa: true, jaula: hospitalAbierto.jaula || "" } : { activa: false });
    }
  }, [p?.id, hospitalAbierto?.id, hospitalAbierto?.abierta, hospitalAbierto?.jaula, onSyncHosp]);

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

        <PanelTerapiasComplementarias
          paciente={p}
          admision={admision}
          profesionales={profesionales}
          revision={revision}
          onCambioNotificaciones={onCambioNotificaciones}
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

  const campos = [
    ["Propietario", p.propietario],
    ["Cédula", p.cedula],
    ["Teléfono", p.telefono],
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

              <div className="ve-actions">
                <Boton icono={Camera} onClick={() => editarFoto()}>
                  {p.foto_id ? "Cambiar foto" : "Añadir foto"}
                </Boton>
                <Boton icono={Pencil} onClick={() => abrir({ clase: "paciente", d: p, pid: p.id })}>
                  Editar ficha
                </Boton>
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
    </div>
  );
}

// ============================================================================
// APLICACIÓN RAÍZ
// ============================================================================
export default function App() {
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

  // Estado del Centro de Notificaciones
  const [pautasActivas, setPautasActivas] = useState([]);
  const [cargaNotif, setCargaNotif] = useState(false);
  const [abrirNotif, setAbrirNotif] = useState(false);
  const [relojTick, setRelojTick] = useState(() => Date.now());

  function recargar() {
    Rev((n) => n + 1);
  }

  const actualizarHospPaciente = useCallback((pacienteId, info) => {
    setHospMapa((prev) => {
      const actual = prev[pacienteId];
      if (actual?.activa === info.activa && (actual?.jaula || "") === (info.jaula || "")) {
        return prev;
      }
      return { ...prev, [pacienteId]: info };
    });
  }, []);

  // Cargar notificaciones globales (Hoja de Hospitalización + Terapias)
  const cargarNotificaciones = useCallback(async (signal) => {
    setCargaNotif(true);
    try {
      const items = await repo.notificaciones.listarActivas(signal);
      setPautasActivas(items);
    } catch (e) {
      if (e.name !== "AbortError") console.error(e);
    } finally {
      setCargaNotif(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    cargarNotificaciones(ac.signal);
    return () => ac.abort();
  }, [cargarNotificaciones, rev]);

  useEffect(() => {
    const tReloj = setInterval(() => setRelojTick(Date.now()), 30000);
    const tSync = setInterval(() => cargarNotificaciones(), 90000);
    return () => {
      clearInterval(tReloj);
      clearInterval(tSync);
    };
  }, [cargarNotificaciones]);

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
          if (r.p) F(r);
          else {
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
  }, [id, ingresoId, abrirNotif]);

  function seleccionar(v) {
    VerIngreso("");
    if (v !== id) F(null);
    EF("");
    Id(v);
    A("");
  }

  function guardar(pid, msg, ingreso) {
    if (ingreso) {
      VerIngreso(ingreso);
      actualizarHospPaciente(pid, { activa: true, jaula: "" });
    }
    M(null);
    Q("");
    Pag(0);
    if (id !== pid) F(null);
    Id(pid);
    A(msg);
    recargar();
  }

  async function medicarDesdeNotificacion(item) {
    const nuevoReg = await repo.notificaciones.registrarAplicacion(item);
    setPautasActivas((prev) =>
      prev.map((p) =>
        p.id === item.id ? { ...p, aplicaciones: [nuevoReg, ...(p.aplicaciones || [])] } : p
      )
    );
    A(`Administración registrada: ${item.pacienteNombre || "Paciente"} · ${item.producto} (${nuevoReg.fecha.slice(11)}).`);
    recargar();
  }

  const pendientesOrdenados = pautasActivas
    .map((item) => ({
      ...item,
      estado: calcularEstadoDosis(item, relojTick)
    }))
    .sort((a, b) => a.estado.diffMin - b.estado.diffMin);

  const urgentesCount = pendientesOrdenados.filter(
    (p) => p.estado.urgencia === "atrasado" || p.estado.urgencia === "proximo"
  ).length;
  const atrasadosCount = pendientesOrdenados.filter((p) => p.estado.urgencia === "atrasado").length;

  const esHospitalizado = (p) => Boolean(p.hospitalizado || p.abierta || p.ingreso_activo || hospMapa[p.id]?.activa);
  const pacientesHosp = resultado.items.filter((p) => esHospitalizado(p));
  const pacientesOtros = resultado.items.filter((p) => !esHospitalizado(p));

  const renderBotonPaciente = (p, enHospital) => {
    const jaula = p.jaula || hospMapa[p.id]?.jaula;
    return (
      <button className="ve-patient" key={p.id} aria-pressed={p.id === id} onClick={() => seleccionar(p.id)}>
        <AvatarPaciente pequeno paciente={p} src={repo.fotos.url(p.id, p.foto_id)} />
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
          <div className="ve-brand">
            <img src={marca} alt="Clínica Veterinaria El Pibe" />
            <b>Área clínica</b>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <button
              type="button"
              onClick={() => {
                setAbrirNotif(true);
                cargarNotificaciones();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.7rem",
                borderRadius: "999px",
                border: `1px solid ${atrasadosCount > 0 ? "#fca5a5" : urgentesCount > 0 ? "#fcd34d" : "#cbd5e1"}`,
                background: atrasadosCount > 0 ? "#fee2e2" : urgentesCount > 0 ? "#fef3c7" : "#f8fafc",
                color: atrasadosCount > 0 ? "#991b1b" : urgentesCount > 0 ? "#92400e" : "#1e293b",
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
                  background: atrasadosCount > 0 ? "#dc2626" : urgentesCount > 0 ? "#d97706" : "#64748b",
                  color: "#fff",
                  borderRadius: "999px",
                  padding: "0.05rem 0.45rem",
                  fontSize: "0.73rem"
                }}
              >
                {urgentesCount > 0 ? urgentesCount : pendientesOrdenados.length}
              </span>
            </button>

            <span className="ve-badge">{repo.demo ? "Demostración" : "Clínica El Pibe"}</span>
          </div>
        </div>
      </header>

      <main className="ve-container">
        {urgentesCount > 0 && (
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
                  {atrasadosCount > 0
                    ? `${atrasadosCount} medicación(es) atrasada(s)`
                    : `${urgentesCount} paciente(s) próximo(s) a medicar`}
                </strong>
                {" — "}
                {pendientesOrdenados
                  .slice(0, 2)
                  .map((p) => `${p.pacienteNombre || "Paciente"} (${p.producto} · ${p.estado.etiquetaTiempo})`)
                  .join(" | ")}
              </span>
            </div>
            <Boton
              principal
              onClick={() => {
                setAbrirNotif(true);
                cargarNotificaciones();
              }}
            >
              Abrir notificaciones ({urgentesCount})
            </Boton>
          </div>
        )}

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
              onCambioNotificaciones={() => cargarNotificaciones()}
              onAltaSuccess={(pid, msg) => {
                actualizarHospPaciente(pid, { activa: false });
                A(msg);
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
      </main>

      {abrirNotif && (
        <ModalCentroNotificaciones
          pendientes={pendientesOrdenados}
          pacientesLista={resultado.items}
          cerrar={() => setAbrirNotif(false)}
          onMedicarAhora={medicarDesdeNotificacion}
          onRefrescar={() => cargarNotificaciones()}
          cargando={cargaNotif}
          onIrAPaciente={(pacId, admId) => {
            seleccionar(pacId);
            if (admId) VerIngreso(admId);
          }}
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
