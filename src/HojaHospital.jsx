import React, { useState, useRef, useEffect } from "react";
import {
  Camera,
  Pill,
  ArrowLeft,
  Plus,
  Pencil,
  Check,
  RefreshCw,
  X,
  ClipboardList,
  History,
  Save,
  Sparkles,
  Ban
} from "lucide-react";
import { Boton, Campo } from "./Campos.jsx";
import { AvatarPaciente, JaulaIngreso } from "./Identificacion.jsx";
import { GrupoClinico, ValoresClinicos } from "./CamposClinicos.jsx";
import { fechaCorta, fechaLocal, hora, uuid } from "./datos.mjs";
import {
  agendaDelDia,
  camposIngreso,
  camposMonitoreo,
  extraerCampos,
  frecuencia,
  instanteEcuador,
  minutosDe,
  moverDia,
  textoMinuto,
  turnos
} from "./registro.mjs";

const vias = [
  "Vía oral (VO)",
  "Intravenosa (IV)",
  "Subcutánea (SC)",
  "Intramuscular (IM)",
  "Tópica",
  "Oftálmica",
  "Ótica",
  "Inhalatoria",
  "Rectal"
];

const PROCEDIMIENTOS_SUGERIDOS = [
  "Curación de herida",
  "Nebulización",
  "Baño medicado",
  "Limpieza ocular",
  "Limpieza ótica",
  "Cambio de vendaje",
  "Fisioterapia / masajes",
  "Control de temperatura / glucosa"
];

const FRECUENCIAS_PROC = [
  ["24", "Cada 24h (1 vez al día)", ["09:00"]],
  ["12", "Cada 12h (2 veces al día)", ["08:00", "20:00"]],
  ["8", "Cada 8h (3 veces al día)", ["08:00", "16:00", "00:00"]],
  ["6", "Cada 6h (4 veces al día)", ["06:00", "12:00", "18:00", "00:00"]],
  ["unica", "Sesión única", ["Única"]]
];

const OPCIONES_UBICACION = [
  ["", "Seleccionar ubicación"],
  ["Olón", "Olón"],
  ["La Libertad", "La Libertad"],
  ["Santa Elena", "Santa Elena"]
];

const fechaHoy = () => fechaLocal().slice(0, 10);
const nombreTurno = (t) => turnos[t] || t;
const instanteCorto = (v) => (v ? fechaCorta(v) + " · " + hora(v) : "");

function turnoActual() {
  const h = Number(fechaLocal().slice(11, 13));
  const claves = Object.keys(turnos);
  if (h >= 6 && h < 14) return claves[0] || "manana";
  if (h >= 14 && h < 21) return claves[1] || "tarde";
  return claves[2] || claves[0] || "noche";
}

function sumarDiasFecha(isoFecha, dias) {
  const [y, m, d] = isoFecha.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

function diferenciaDias(inicioIso, actualIso) {
  const a = Date.parse(inicioIso + "T00:00:00Z");
  const b = Date.parse(actualIso + "T00:00:00Z");
  return Math.floor((b - a) / 86400000) + 1;
}

function estadoPauta(o, tomas) {
  if (o.suspendida_en) return "Suspendida";
  if (o.pauta === "unica" && (tomas.some((t) => t.orden_id === o.id) || o.unica_registrada)) return "Finalizada";
  if (o.fin && Date.parse(o.fin) < Date.now()) return "Finalizada";
  if (Date.parse(o.inicio) > Date.now()) return "Programada";
  return "Activa";
}

function FranjaTurno({ valor }) {
  return (
    <Campo
      etiqueta="Turno"
      nombre="turno"
      valor={valor}
      opciones={[["", "Seleccionar turno"], ...Object.entries(turnos)]}
      required
    />
  );
}

function CamposOrden({ orden, admision, responsableDefault }) {
  const [pauta, cambiarPauta] = useState(orden?.pauta || "horarios");
  const [horarios, cambiarHorarios] = useState(
    orden?.minutos?.length ? orden.minutos.map(textoMinuto) : ["08:00", "20:00"]
  );
  const inicio = orden
    ? fechaLocal(Math.max(Date.now(), Date.parse(orden.inicio)))
    : fechaLocal(Math.max(Date.now(), Date.parse(admision.inicio)));

  return (
    <>
      <Campo etiqueta="Fármaco / Medicamento" nombre="medicina" valor={orden?.medicina} required maxLength={180} />
      <Campo
        etiqueta="Dosis y unidad"
        nombre="dosis"
        valor={orden?.dosis}
        placeholder="Ej. 1.5 ml o 250 mg"
        required
        maxLength={120}
      />
      <div>
        <Campo
          etiqueta="Vía de administración"
          nombre="via"
          list="ve-vias"
          valor={orden?.via}
          required
          maxLength={100}
        />
        <datalist id="ve-vias">
          {vias.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </div>
      <Campo
        etiqueta="Frecuencia"
        nombre="pauta"
        valor={pauta}
        onChange={(e) => cambiarPauta(e.target.value)}
        opciones={[
          ["horarios", "Horarios fijos cada día"],
          ["intervalo", "Cada cierto número de horas"],
          ["unica", "Dosis única"]
        ]}
      />
      {pauta === "intervalo" && (
        <Campo
          etiqueta="Intervalo (horas)"
          nombre="intervalo_horas"
          tipo="number"
          min="1"
          max="8760"
          step="1"
          valor={orden?.intervalo_horas || 12}
          required
        />
      )}
      <Campo
        etiqueta={pauta === "horarios" ? "Pauta vigente desde" : "Primera dosis"}
        nombre="inicio"
        tipo="datetime-local"
        valor={inicio}
        required
      />
      {pauta !== "unica" && (
        <Campo
          etiqueta="Vigente hasta (opcional)"
          nombre="fin"
          tipo="datetime-local"
          valor={orden?.fin && Date.parse(orden.fin) > Date.now() ? fechaLocal(orden.fin) : ""}
        />
      )}
      {pauta === "horarios" && (
        <fieldset className="ve-grupo ve-ancho">
          <legend>Horarios de cada día</legend>
          <div className="ve-horas">
            {horarios.map((v, i) => (
              <div className="ve-hora" key={i}>
                <label className="ve-field">
                  Hora {i + 1}
                  <input
                    aria-label={"Hora " + (i + 1)}
                    name="horario"
                    type="time"
                    value={v}
                    required
                    onChange={(e) => cambiarHorarios((h) => h.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                </label>
                {horarios.length > 1 && (
                  <Boton
                    aria-label={"Quitar hora " + (i + 1)}
                    icono={X}
                    onClick={() => cambiarHorarios((h) => h.filter((_, j) => i !== j))}
                  />
                )}
              </div>
            ))}
          </div>
          <Boton icono={Plus} onClick={() => cambiarHorarios((h) => [...h, ""])}>
            Añadir horario
          </Boton>
        </fieldset>
      )}
      {orden && (
        <p className="ve-meta ve-ancho">
          Al guardar, la pauta anterior se suspende desde ahora. Sus registros quedan en la fecha en que se realizaron.
        </p>
      )}
      <Campo
        etiqueta="Médico / Internista que indica"
        nombre="responsable"
        valor={responsableDefault}
        required
        maxLength={140}
        list="ve-personal"
      />
    </>
  );
}

function ModalHospital({ accion, admision, paciente, personal, repo, cerrar, guardado, actualizar, dia, internista }) {
  const dialog = useRef(null),
    enviando = useRef(false),
    operacion = useRef(null);
  if (!operacion.current) operacion.current = uuid();
  const [ocupado, Ocupado] = useState(false),
    [mensaje, Mensaje] = useState(""),
    [conflicto, Conflicto] = useState(false);
  const [freqProc, setFreqProc] = useState("12");

  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, []);

  const esOrden = accion.tipo === "orden";
  const esNota = accion.tipo === "nota";
  const esProc = accion.tipo === "procedimiento";
  const orden = accion.orden;

  const titulo = esOrden
    ? orden
      ? "Editar fármaco"
      : "Agregar fármaco"
    : esProc
    ? "Agregar procedimiento o cuidado"
    : esNota
    ? "Añadir evolución"
    : "Suspender fármaco";

  const localAhora = fechaLocal(),
    horaNota = dia === fechaHoy() ? localAhora : dia + "T" + localAhora.slice(11);

  async function enviar(e) {
    e.preventDefault();
    if (enviando.current || conflicto) return;
    const form = new FormData(e.currentTarget),
      v = Object.fromEntries(form);
    enviando.current = true;
    Ocupado(true);
    Mensaje("");
    try {
      const id = operacion.current,
        resp = String(v.responsable || "").trim();
      if (!resp) throw new Error("Indica el nombre del responsable.");
      try {
        sessionStorage.setItem("pibe_internista", resp);
      } catch {}

      let verDia = dia;
      if (esOrden) {
        const inicio = instanteEcuador(v.inicio);
        const minutos =
          v.pauta === "horarios" ? form.getAll("horario").map(minutosDe).sort((a, b) => a - b) : [];
        if (new Set(minutos).size !== minutos.length) throw new Error("Hay horarios repetidos en la pauta.");
        const fin = v.fin ? instanteEcuador(v.fin) : null;
        if (fin && fin < inicio) throw new Error("La fecha final debe ser posterior o igual al inicio.");
        const datos = {
          id,
          reemplaza: orden?.id || null,
          medicina: v.medicina.trim(),
          dosis: v.dosis.trim(),
          via: v.via.trim(),
          pauta: v.pauta,
          intervalo_horas: v.pauta === "intervalo" ? Number(v.intervalo_horas) : null,
          minutos,
          inicio,
          fin,
          responsable: resp
        };
        if (!datos.medicina || !datos.dosis || !datos.via)
          throw new Error("Completa el fármaco, la dosis y la vía.");
        await repo.prescribir(admision.id, datos);
        verDia = v.inicio.slice(0, 10);
      } else if (esProc) {
        if (!repo.modulos) throw new Error("No se encontró el almacenamiento de procedimientos.");
        const nombre = String(v.nombre_proc || "").trim();
        if (!nombre) throw new Error("Escribe el nombre del procedimiento.");
        const diasDuracion = Math.max(1, Number(v.dias_duracion || 1));
        const fechaInicio = v.fecha_inicio || dia;
        const fechaFin = freqProc === "unica" ? fechaInicio : sumarDiasFecha(fechaInicio, diasDuracion - 1);
        const freqObj = FRECUENCIAS_PROC.find((f) => f[0] === freqProc) || FRECUENCIAS_PROC[1];
        const nuevoProc = {
          id,
          admisionId: admision.id,
          nombre,
          indicaciones: String(v.indicaciones || "").trim(),
          frecuenciaCodigo: freqObj[0],
          frecuenciaTexto: freqObj[1],
          horarios: freqObj[2],
          diasDuracion: freqProc === "unica" ? 1 : diasDuracion,
          fechaInicio,
          fechaFin,
          indicadoPor: resp,
          activa: true,
          creado: new Date().toISOString(),
          registros: []
        };
        await repo.modulos.guardar(admision.id, "proc_hosp", nuevoProc);
        verDia = fechaInicio;
      } else if (esNota) {
        const monitoreo = extraerCampos(v, camposMonitoreo);
        if (!v.nota.trim() && !Object.keys(monitoreo).length)
          throw new Error("Añade una observación o al menos un dato de monitoreo.");
        await repo.agregarEvolucion(admision.id, {
          id,
          momento: instanteEcuador(v.momento),
          turno: v.turno,
          responsable: resp,
          nota: v.nota.trim(),
          monitoreo
        });
        verDia = v.momento.slice(0, 10);
      } else {
        await repo.suspender(admision.id, orden.id, resp);
      }

      guardado(
        esOrden
          ? "Fármaco agregado a la hoja."
          : esProc
          ? "Procedimiento agregado a la hoja."
          : esNota
          ? "Evolución añadida."
          : "Fármaco suspendido.",
        verDia
      );
    } catch (error) {
      Mensaje(error.message);
      if (error.codigo === "40001") {
        Conflicto(true);
        actualizar();
      }
    } finally {
      enviando.current = false;
      Ocupado(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="ve-dialog ve-dialog-clinico"
      aria-labelledby="dialog-hospital"
      onCancel={(e) => {
        e.preventDefault();
        if (!enviando.current) cerrar();
      }}
    >
      <form onSubmit={enviar}>
        <header className="ve-row">
          <div>
            <p className="ve-meta">{paciente.nombre} · Hospitalización</p>
            <h2 id="dialog-hospital">{titulo}</h2>
          </div>
          <Boton icono={X} aria-label="Cerrar" disabled={ocupado} onClick={cerrar} />
        </header>
        <datalist id="ve-personal">
          {personal.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="ve-campos">
          {esOrden ? (
            <CamposOrden orden={orden} admision={admision} responsableDefault={internista} />
          ) : esProc ? (
            <>
              <div>
                <Campo
                  etiqueta="Procedimiento / Cuidado"
                  nombre="nombre_proc"
                  list="ve-procs-sugeridos"
                  placeholder="Ej. Curación de herida, Nebulización..."
                  required
                  maxLength={160}
                />
                <datalist id="ve-procs-sugeridos">
                  {PROCEDIMIENTOS_SUGERIDOS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <Campo
                etiqueta="Frecuencia"
                nombre="frecuencia_proc"
                valor={freqProc}
                onChange={(e) => setFreqProc(e.target.value)}
                opciones={FRECUENCIAS_PROC.map(([val, label]) => [val, label])}
              />
              <Campo
                etiqueta="Fecha de inicio"
                nombre="fecha_inicio"
                tipo="date"
                valor={dia}
                min={admision.inicio.slice(0, 10)}
                required
              />
              {freqProc !== "unica" && (
                <Campo
                  etiqueta="Por cuánto tiempo (días)"
                  nombre="dias_duracion"
                  tipo="number"
                  min="1"
                  max="60"
                  step="1"
                  valor={3}
                  required
                />
              )}
              <div className="ve-ancho">
                <Campo
                  etiqueta="Indicaciones clínicas"
                  nombre="indicaciones"
                  tipo="textarea"
                  placeholder="Ej. Limpiar con clorhexidina diluida, aplicar pomada y cubrir con gasa estéril."
                  maxLength={4000}
                />
              </div>
              <Campo
                etiqueta="Médico / Internista que indica"
                nombre="responsable"
                valor={internista}
                required
                maxLength={140}
                list="ve-personal"
              />
            </>
          ) : esNota ? (
            <>
              <Campo
                etiqueta="Fecha y hora del monitoreo"
                nombre="momento"
                tipo="datetime-local"
                valor={horaNota}
                min={fechaLocal(admision.inicio)}
                required
              />
              <FranjaTurno valor={turnoActual()} />
              <Campo
                etiqueta="Internista responsable"
                nombre="responsable"
                valor={internista}
                required
                maxLength={140}
                list="ve-personal"
              />
              <div className="ve-ancho">
                <Campo etiqueta="Observaciones del paciente" nombre="nota" tipo="textarea" maxLength={12000} />
              </div>
              <GrupoClinico titulo="Monitoreo del turno" campos={camposMonitoreo} datos={{}} prefijo="monitoreo" />
            </>
          ) : (
            <>
              <div className="ve-orden-resumen ve-ancho">
                <strong>{orden.medicina}</strong>
                <span>
                  {orden.dosis} · {orden.via} · {frecuencia(orden)}
                </span>
              </div>
              <p className="ve-meta ve-ancho">
                La suspensión retira las próximas dosis de la hoja. Las administraciones ya registradas siguen visibles.
              </p>
              <Campo
                etiqueta="Profesional que suspende"
                nombre="responsable"
                valor={internista}
                required
                maxLength={140}
                list="ve-personal"
              />
            </>
          )}
        </div>
        {mensaje && (
          <p className="ve-message" role="alert">
            {mensaje}
          </p>
        )}
        <footer className="ve-actions ve-last">
          <Boton disabled={ocupado} onClick={cerrar}>
            {conflicto ? "Volver a la hoja" : "Cancelar"}
          </Boton>
          {!conflicto && (
            <button className="ve-button" type="submit" disabled={ocupado}>
              {ocupado
                ? "Guardando…"
                : esOrden
                ? "Guardar fármaco"
                : esProc
                ? "Guardar procedimiento"
                : esNota
                ? "Guardar evolución"
                : "Confirmar suspensión"}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}

function ModalHistorialCompleto({ paciente, historialUnificado, cerrar }) {
  const dialog = useRef(null);
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, []);

  const filtrados = historialUnificado.filter((item) => {
    if (filtro === "medicacion") return item.categoria === "medicacion";
    if (filtro === "procedimiento") return item.categoria === "procedimiento";
    return true;
  });

  return (
    <dialog
      ref={dialog}
      className="ve-dialog ve-dialog-clinico ve-modal-historial"
      aria-labelledby="titulo-historial-hosp"
      onCancel={(e) => {
        e.preventDefault();
        cerrar();
      }}
    >
      <header className="ve-row">
        <div>
          <p className="ve-meta">{paciente.nombre} · Registro cronológico</p>
          <h2 id="titulo-historial-hosp">Historial de medicación y procedimientos</h2>
        </div>
        <Boton icono={X} aria-label="Cerrar historial" onClick={cerrar} />
      </header>

      <div className="ve-hist-filtros">
        <button
          type="button"
          className={filtro === "todos" ? "activo" : ""}
          onClick={() => setFiltro("todos")}
        >
          Todo ({historialUnificado.length})
        </button>
        <button
          type="button"
          className={filtro === "medicacion" ? "activo" : ""}
          onClick={() => setFiltro("medicacion")}
        >
          Medicación ({historialUnificado.filter((x) => x.categoria === "medicacion").length})
        </button>
        <button
          type="button"
          className={filtro === "procedimiento" ? "activo" : ""}
          onClick={() => setFiltro("procedimiento")}
        >
          Procedimientos ({historialUnificado.filter((x) => x.categoria === "procedimiento").length})
        </button>
      </div>

      <div className="ve-hist-tabla-wrap">
        {filtrados.length ? (
          <table className="ve-tabla-clinica">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Tipo</th>
                <th>Fármaco / Procedimiento</th>
                <th>Detalle / Dosis</th>
                <th>Estado</th>
                <th>Internista</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((it) => (
                <tr key={it.id}>
                  <td className="ve-nowrap">{instanteCorto(it.fechaHora)}</td>
                  <td>
                    <span className={"ve-badge-cat " + it.categoria}>
                      {it.categoria === "medicacion" ? "Fármaco" : "Procedimiento"}
                    </span>
                  </td>
                  <td>
                    <strong>{it.titulo}</strong>
                  </td>
                  <td>
                    <span>{it.detalle}</span>
                    {it.nota && <small className="ve-nota-mini">Nota: {it.nota}</small>}
                  </td>
                  <td>
                    <span className={"ve-estado " + (it.estado === "Omitida" ? "omitida" : "ok")}>
                      {it.estado}
                    </span>
                  </td>
                  <td>
                    <strong>{it.responsable || "—"}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="ve-sub">Aún no hay medicaciones ni procedimientos registrados en esta hospitalización.</p>
        )}
      </div>

      <footer className="ve-actions ve-last">
        <Boton principal onClick={cerrar}>
          Cerrar historial
        </Boton>
      </footer>
    </dialog>
  );
}

function SeccionTabularMedica({
  hoja,
  dia,
  admision,
  repo,
  personal,
  internista,
  setInternista,
  procedimientos,
  recargarProcedimientos,
  abrirModal,
  onGuardadoExitoso,
  pendientesMed,
  setPendientesMed,
  pendientesProc,
  setPendientesProc
}) {
  const [turnoMed, setTurnoMed] = useState(turnoActual);
  const [guardandoMed, setGuardandoMed] = useState(false);
  const [errorMed, setErrorMed] = useState("");

  const [guardandoProc, setGuardandoProc] = useState(false);
  const [errorProc, setErrorProc] = useState("");
  const [suspendiendoProcId, setSuspendiendoProcId] = useState("");

  const esFechaValidaParaMarcar = hoja.abierta && dia <= fechaHoy();

  // Agrupar agenda del día por orden (fármaco) para mostrarla en filas de tabla
  const filasAgenda = agendaDelDia(hoja, dia);
  const ordenesVivas = hoja.ordenes.filter((o) => {
    const st = estadoPauta(o, hoja.tomas);
    return st === "Activa" || st === "Programada";
  });
  const ordenesAnteriores = hoja.ordenes.filter((o) => {
    const st = estadoPauta(o, hoja.tomas);
    return st !== "Activa" && st !== "Programada";
  });

  const filasPorOrden = ordenesVivas.map((orden) => {
    const tomasDelDia = filasAgenda.filter((f) => f.orden.id === orden.id);
    return {
      orden,
      estado: estadoPauta(orden, hoja.tomas),
      slots: tomasDelDia
    };
  });

  function toggleDosisPendiente(orden, programada) {
    const key = `${orden.id}|${programada}`;
    setPendientesMed((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = {
          orden,
          programada,
          estado: "administrada",
          nota: ""
        };
      }
      return next;
    });
  }

  function cambiarEstadoPendiente(key, nuevoEstado) {
    setPendientesMed((prev) => {
      if (!prev[key]) return prev;
      return {
        ...prev,
        [key]: { ...prev[key], estado: nuevoEstado }
      };
    });
  }

  function cambiarNotaPendiente(key, nota) {
    setPendientesMed((prev) => {
      if (!prev[key]) return prev;
      return {
        ...prev[key],
        nota
      };
    });
  }

  const listaPendientesMed = Object.entries(pendientesMed);

  async function guardarCambiosMedicacion() {
    if (!listaPendientesMed.length || guardandoMed) return;
    const resp = internista.trim();
    if (!resp) {
      setErrorMed("Escribe el nombre del médico internista antes de guardar.");
      return;
    }
    setGuardandoMed(true);
    setErrorMed("");
    try {
      try {
        sessionStorage.setItem("pibe_internista", resp);
      } catch {}

      const ahora = fechaLocal();
      const realizadaIso = instanteEcuador(dia === fechaHoy() ? ahora : `${dia}T${ahora.slice(11)}`);

      for (const [, item] of listaPendientesMed) {
        const idToma = uuid();
        await repo.registrarToma(admision.id, {
          id: idToma,
          orden_id: item.orden.id,
          programada: item.programada,
          realizada: realizadaIso,
          estado: item.estado,
          turno: turnoMed || turnoActual(),
          responsable: resp,
          nota: (item.nota || "").trim()
        });

        if (repo.modulos) {
          await repo.modulos
            .guardar(admision.id, "hosp_historial", {
              id: idToma,
              categoria: "medicacion",
              fechaHora: realizadaIso,
              titulo: item.orden.medicina,
              detalle: `${item.orden.dosis} · ${item.orden.via} (Prog. ${hora(item.programada)})`,
              estado: item.estado === "administrada" ? "Administrada" : "Omitida",
              responsable: resp,
              nota: (item.nota || "").trim()
            })
            .catch(() => null);
        }
      }

      setPendientesMed({});
      onGuardadoExitoso(
        listaPendientesMed.length === 1
          ? "1 dosis registrada correctamente."
          : `${listaPendientesMed.length} dosis registradas correctamente.`
      );
    } catch (err) {
      setErrorMed(err.message || "No se pudieron guardar las dosis marcadas.");
    } finally {
      setGuardandoMed(false);
    }
  }

  // Filtrar procedimientos vigentes para el día seleccionado
  const procsDelDia = procedimientos.filter((p) => {
    if (p.activa === false) return false;
    if (p.fechaInicio && dia < p.fechaInicio) return false;
    if (p.fechaFin && dia > p.fechaFin) return false;
    return true;
  });

  function toggleProcPendiente(proc, horario) {
    const key = `${proc.id}|${dia}|${horario}`;
    setPendientesProc((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = { proc, horario, nota: "" };
      }
      return next;
    });
  }

  const listaPendientesProc = Object.entries(pendientesProc);

  async function guardarCambiosProcedimientos() {
    if (!listaPendientesProc.length || guardandoProc) return;
    const resp = internista.trim();
    if (!resp) {
      setErrorProc("Escribe el nombre del médico internista antes de guardar.");
      return;
    }
    if (!repo.modulos) {
      setErrorProc("No está disponible el almacenamiento de procedimientos.");
      return;
    }
    setGuardandoProc(true);
    setErrorProc("");
    try {
      try {
        sessionStorage.setItem("pibe_internista", resp);
      } catch {}

      const ahora = fechaLocal();
      const realizadaIso = instanteEcuador(dia === fechaHoy() ? ahora : `${dia}T${ahora.slice(11)}`);

      // Agrupar nuevas realizaciones por procedimiento
      const porProc = new Map();
      for (const [, item] of listaPendientesProc) {
        if (!porProc.has(item.proc.id)) {
          porProc.set(item.proc.id, { proc: item.proc, nuevos: [] });
        }
        const regId = uuid();
        porProc.get(item.proc.id).nuevos.push({
          id: regId,
          fechaDia: dia,
          horario: item.horario,
          realizadaEn: realizadaIso,
          responsable: resp,
          nota: item.nota || ""
        });

        await repo.modulos
          .guardar(admision.id, "hosp_historial", {
            id: regId,
            categoria: "procedimiento",
            fechaHora: realizadaIso,
            titulo: item.proc.nombre,
            detalle: `${item.proc.indicaciones || item.proc.frecuenciaTexto} (${item.horario})`,
            estado: "Realizado",
            responsable: resp,
            nota: item.nota || ""
          })
          .catch(() => null);
      }

      for (const { proc, nuevos } of porProc.values()) {
        const actualizado = {
          ...proc,
          registros: [...(proc.registros || []), ...nuevos]
        };
        await repo.modulos.guardar(admision.id, "proc_hosp", actualizado);
      }

      setPendientesProc({});
      await recargarProcedimientos();
      onGuardadoExitoso(
        listaPendientesProc.length === 1
          ? "1 procedimiento registrado."
          : `${listaPendientesProc.length} procedimientos registrados.`
      );
    } catch (err) {
      setErrorProc(err.message || "No se pudieron guardar los procedimientos.");
    } finally {
      setGuardandoProc(false);
    }
  }

  async function finalizarProcedimiento(proc) {
    if (!repo.modulos || suspendiendoProcId) return;
    setSuspendiendoProcId(proc.id);
    try {
      await repo.modulos.guardar(admision.id, "proc_hosp", {
        ...proc,
        activa: false,
        finalizadoEn: new Date().toISOString()
      });
      await recargarProcedimientos();
      onGuardadoExitoso("Procedimiento finalizado.");
    } catch (err) {
      setErrorProc(err.message || "No se pudo finalizar el procedimiento.");
    } finally {
      setSuspendiendoProcId("");
    }
  }

  return (
    <div className="ve-hoja-tabular-contenedor">
      {/* Barra común de identificación de turno e internista */}
      <div className="ve-barra-internista">
        <div className="ve-internista-campo">
          <label htmlFor="ve-input-internista">Médico / Internista que administra</label>
          <input
            id="ve-input-internista"
            type="text"
            list="ve-personal-hoja"
            placeholder="Ej. ROMERO / Dra. Vega"
            value={internista}
            onChange={(e) => setInternista(e.target.value)}
            maxLength={120}
          />
          <datalist id="ve-personal-hoja">
            {personal.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="ve-internista-campo ve-turno-select">
          <label htmlFor="ve-select-turno">Turno</label>
          <select id="ve-select-turno" value={turnoMed} onChange={(e) => setTurnoMed(e.target.value)}>
            {Object.entries(turnos).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* =====================================================================
          SECCIÓN 1: TABLA DE MEDICACIÓN
         ===================================================================== */}
      <section className="ve-bloque ve-bloque-tabla">
        <div className="ve-row">
          <div>
            <h3>Tabla de medicación ({fechaCorta(dia + "T12:00:00")})</h3>
            <p className="ve-meta">Marca las dosis suministradas y pulsa Guardar cambios</p>
          </div>
          {hoja.abierta && (
            <Boton principal icono={Plus} onClick={() => abrirModal({ tipo: "orden" })}>
              Agregar fármaco
            </Boton>
          )}
        </div>

        {filasPorOrden.length ? (
          <div className="ve-tabla-scroll">
            <table className="ve-tabla-clinica">
              <thead>
                <tr>
                  <th>Fármaco y dosis</th>
                  <th>Vía / Frecuencia</th>
                  <th>Dosis del día (marcar suministradas)</th>
                  {hoja.abierta && <th className="ve-col-acciones">Pauta</th>}
                </tr>
              </thead>
              <tbody>
                {filasPorOrden.map(({ orden, estado, slots }) => (
                  <tr key={orden.id}>
                    <td>
                      <div className="ve-celda-farmaco">
                        <strong>{orden.medicina}</strong>
                        <span className="ve-dosis-pill">{orden.dosis}</span>
                      </div>
                      <small className="ve-meta">
                        Indicado por {orden.responsable}
                        {orden.fin ? ` · Hasta ${instanteCorto(orden.fin)}` : ""}
                      </small>
                    </td>
                    <td>
                      <div>{orden.via}</div>
                      <small className="ve-meta">{frecuencia(orden)}</small>
                    </td>
                    <td>
                      {slots.length ? (
                        <div className="ve-slots-grid">
                          {slots.map(({ programada, toma }) => {
                            const key = `${orden.id}|${programada}`;
                            const pendiente = pendientesMed[key];
                            const horaTexto = hora(programada);

                            if (toma) {
                              const esOmitida = toma.estado === "omitida";
                              return (
                                <div
                                  key={programada}
                                  className={`ve-slot-chip ${esOmitida ? "omitida" : "aplicada"}`}
                                  title={`${esOmitida ? "Omitida" : "Administrada"} el ${instanteCorto(
                                    toma.realizada
                                  )} por ${toma.responsable}${toma.nota ? " · " + toma.nota : ""}`}
                                >
                                  <span className="ve-slot-hora">
                                    {esOmitida ? "✕" : "✓"} {horaTexto}
                                  </span>
                                  <span className="ve-slot-firmante">{toma.responsable}</span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={programada}
                                className={`ve-slot-check-box ${pendiente ? "marcado" : ""}`}
                              >
                                <label className="ve-check-label">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(pendiente)}
                                    disabled={!esFechaValidaParaMarcar || guardandoMed}
                                    onChange={() => toggleDosisPendiente(orden, programada)}
                                  />
                                  <span>{horaTexto}</span>
                                </label>
                                {pendiente && (
                                  <div className="ve-pendiente-opciones">
                                    <select
                                      aria-label="Estado de la dosis"
                                      value={pendiente.estado}
                                      onChange={(e) => cambiarEstadoPendiente(key, e.target.value)}
                                    >
                                      <option value="administrada">Administrada</option>
                                      <option value="omitida">Omitida</option>
                                    </select>
                                    <input
                                      type="text"
                                      placeholder="Nota opcional..."
                                      value={pendiente.nota}
                                      onChange={(e) => cambiarNotaPendiente(key, e.target.value)}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="ve-meta">
                          {estado === "Programada"
                            ? `Inicia ${instanteCorto(orden.inicio)}`
                            : "Sin tomas programadas este día"}
                        </span>
                      )}
                    </td>
                    {hoja.abierta && (
                      <td className="ve-col-acciones">
                        <div className="ve-miniacciones">
                          <button
                            type="button"
                            title="Editar fármaco"
                            onClick={() => abrirModal({ tipo: "orden", orden })}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            title="Suspender fármaco"
                            onClick={() => abrirModal({ tipo: "suspender", orden })}
                          >
                            Suspender
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ve-sub">No hay fármacos activos. Pulsa &ldquo;Agregar fármaco&rdquo; para iniciar el esquema.</p>
        )}

        {errorMed && (
          <p className="ve-message" role="alert">
            {errorMed}
          </p>
        )}

        {listaPendientesMed.length > 0 && (
          <div className="ve-barra-guardar">
            <span>
              <strong>{listaPendientesMed.length}</strong>{" "}
              {listaPendientesMed.length === 1 ? "dosis marcada" : "dosis marcadas"} sin guardar (Internista:{" "}
              <strong>{internista.trim() || "Sin nombre"}</strong>)
            </span>
            <div className="ve-actions">
              <Boton disabled={guardandoMed} onClick={() => setPendientesMed({})}>
                Descartar
              </Boton>
              <button
                type="button"
                className="ve-button"
                disabled={guardandoMed}
                onClick={guardarCambiosMedicacion}
              >
                <Save size={16} />
                {guardandoMed ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}

        {ordenesAnteriores.length > 0 && (
          <details className="ve-archivo-pautas" style={{ marginTop: "0.75rem" }}>
            <summary>Fármacos suspendidos o finalizados ({ordenesAnteriores.length})</summary>
            <div className="ve-lista-suspendidas">
              {ordenesAnteriores.map((o) => (
                <div key={o.id} className="ve-item-suspendido">
                  <strong>{o.medicina}</strong> ({o.dosis} · {o.via}) — {estadoPauta(o, hoja.tomas)}
                  {o.suspendida_en ? ` el ${instanteCorto(o.suspendida_en)} por ${o.retirada_por}` : ""}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* =====================================================================
          SECCIÓN 2: PROCEDIMIENTOS Y CUIDADOS (CURACIONES, BAÑOS, NEBULIZACIONES)
         ===================================================================== */}
      <section className="ve-bloque ve-bloque-tabla">
        <div className="ve-row">
          <div>
            <h3>
              <Sparkles size={17} style={{ verticalAlign: "text-bottom", marginRight: "6px" }} />
              Procedimientos y cuidados
            </h3>
            <p className="ve-meta">Curaciones, baños medicados, nebulizaciones y terapias físicas</p>
          </div>
          {hoja.abierta && (
            <Boton principal icono={Plus} onClick={() => abrirModal({ tipo: "procedimiento" })}>
              Agregar procedimiento
            </Boton>
          )}
        </div>

        {procsDelDia.length ? (
          <div className="ve-tabla-scroll">
            <table className="ve-tabla-clinica">
              <thead>
                <tr>
                  <th>Procedimiento e indicaciones</th>
                  <th>Frecuencia / Duración</th>
                  <th>Realización del día (marcar completados)</th>
                  {hoja.abierta && <th className="ve-col-acciones">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {procsDelDia.map((proc) => {
                  const horarios = Array.isArray(proc.horarios) && proc.horarios.length ? proc.horarios : ["09:00"];
                  const registrosDelDia = (proc.registros || []).filter((r) => r.fechaDia === dia);
                  const diaNumero = proc.fechaInicio ? Math.max(1, diferenciaDias(proc.fechaInicio, dia)) : 1;

                  return (
                    <tr key={proc.id}>
                      <td>
                        <strong>{proc.nombre}</strong>
                        {proc.indicaciones && <p className="ve-proc-indicaciones">{proc.indicaciones}</p>}
                        <small className="ve-meta">Indicado por {proc.indicadoPor || "—"}</small>
                      </td>
                      <td>
                        <div>{proc.frecuenciaTexto}</div>
                        <small className="ve-meta">
                          {proc.frecuenciaCodigo === "unica"
                            ? "Sesión única"
                            : `Día ${diaNumero} de ${proc.diasDuracion || 1}`}
                        </small>
                      </td>
                      <td>
                        <div className="ve-slots-grid">
                          {horarios.map((hor) => {
                            const hecho = registrosDelDia.find((r) => r.horario === hor);
                            const key = `${proc.id}|${dia}|${hor}`;
                            const marcado = Boolean(pendientesProc[key]);

                            if (hecho) {
                              return (
                                <div
                                  key={hor}
                                  className="ve-slot-chip aplicada"
                                  title={`Realizado el ${instanteCorto(hecho.realizadaEn)} por ${hecho.responsable}`}
                                >
                                  <span className="ve-slot-hora">✓ {hor}</span>
                                  <span className="ve-slot-firmante">{hecho.responsable}</span>
                                </div>
                              );
                            }

                            return (
                              <div key={hor} className={`ve-slot-check-box ${marcado ? "marcado" : ""}`}>
                                <label className="ve-check-label">
                                  <input
                                    type="checkbox"
                                    checked={marcado}
                                    disabled={!esFechaValidaParaMarcar || guardandoProc}
                                    onChange={() => toggleProcPendiente(proc, hor)}
                                  />
                                  <span>{hor}</span>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      {hoja.abierta && (
                        <td className="ve-col-acciones">
                          <div className="ve-miniacciones">
                            <button
                              type="button"
                              disabled={suspendiendoProcId === proc.id}
                              onClick={() => finalizarProcedimiento(proc)}
                            >
                              <Ban size={13} style={{ marginRight: "3px" }} />
                              Finalizar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ve-sub">
            Sin procedimientos activos para esta fecha. Usa &ldquo;Agregar procedimiento&rdquo; para curaciones, baños o nebulizaciones.
          </p>
        )}

        {errorProc && (
          <p className="ve-message" role="alert">
            {errorProc}
          </p>
        )}

        {listaPendientesProc.length > 0 && (
          <div className="ve-barra-guardar">
            <span>
              <strong>{listaPendientesProc.length}</strong>{" "}
              {listaPendientesProc.length === 1 ? "procedimiento marcado" : "procedimientos marcados"} sin guardar
              (Internista: <strong>{internista.trim() || "Sin nombre"}</strong>)
            </span>
            <div className="ve-actions">
              <Boton disabled={guardandoProc} onClick={() => setPendientesProc({})}>
                Descartar
              </Boton>
              <button
                type="button"
                className="ve-button"
                disabled={guardandoProc}
                onClick={guardarCambiosProcedimientos}
              >
                <Save size={16} />
                {guardandoProc ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Evoluciones({ hoja, dia, abrir }) {
  return (
    <section className="ve-bloque">
      <div className="ve-row">
        <h3>Evoluciones del día</h3>
        {hoja.abierta && dia <= fechaHoy() && (
          <Boton principal icono={Plus} onClick={() => abrir({ tipo: "nota" })}>
            Añadir evolución
          </Boton>
        )}
      </div>
      {hoja.notas.length ? (
        <ol className="ve-evoluciones">
          {hoja.notas.map((n) => (
            <li key={n.id}>
              <div className="ve-row">
                <strong>
                  {hora(n.momento)} · {n.responsable}
                </strong>
                <span className="ve-estado">{nombreTurno(n.turno)}</span>
              </div>
              {n.nota && <p className="ve-nota">{n.nota}</p>}
              <ValoresClinicos datos={n.monitoreo} campos={camposMonitoreo} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="ve-sub">Todavía no hay observaciones registradas para esta fecha.</p>
      )}
    </section>
  );
}

export function HojaHospital({
  paciente,
  admision,
  profesionales,
  repo,
  fotos,
  editarFoto,
  actualizarFicha,
  volver,
  editar,
  revision,
  onGuardarUbicacion
}) {
  const [dia, Dia] = useState(fechaHoy),
    [tab, Tab] = useState("medicacion"),
    [rev, Rev] = useState(0);
  const [resultado, Resultado] = useState(null),
    [error, ErrorHoja] = useState(""),
    [aviso, Aviso] = useState(""),
    [accion, Accion] = useState(null);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  const [internista, setInternista] = useState(() => {
    try {
      return sessionStorage.getItem("pibe_internista") || admision.profesional || "";
    } catch {
      return admision.profesional || "";
    }
  });

  const [pendientesMed, setPendientesMed] = useState({});
  const [pendientesProc, setPendientesProc] = useState({});
  const [procedimientos, setProcedimientos] = useState([]);
  const [historialExtra, setHistorialExtra] = useState([]);

  const datos = admision.detalle_clinico || {};
  const [ubicacionActual, setUbicacionActual] = useState(datos.ubicacion || "");
  const [guardandoUbicacion, setGuardandoUbicacion] = useState(false);

  useEffect(() => {
    setUbicacionActual(datos.ubicacion || "");
  }, [admision.id, datos.ubicacion]);

  function actualizar() {
    Rev((n) => n + 1);
  }

  async function cargarProcedimientosYHistorial(signal) {
    if (!repo.modulos) return;
    try {
      const [procs, hist] = await Promise.all([
        repo.modulos.listar(admision.id, "proc_hosp", signal).catch(() => []),
        repo.modulos.listar(admision.id, "hosp_historial", signal).catch(() => [])
      ]);
      setProcedimientos(Array.isArray(procs) ? procs : []);
      setHistorialExtra(Array.isArray(hist) ? hist : []);
    } catch {}
  }

  useEffect(() => {
    const ac = new AbortController();
    let vigente = true;
    async function leer() {
      try {
        const [h] = await Promise.all([
          repo.hoja(admision.id, dia, ac.signal),
          cargarProcedimientosYHistorial(ac.signal)
        ]);
        if (vigente) {
          Resultado({ id: admision.id, dia, hoja: h });
          ErrorHoja("");
        }
      } catch (e) {
        if (vigente) ErrorHoja(e.message || "No se pudo leer la hoja.");
      }
    }
    leer();
    const timer = setInterval(() => {
      if (!document.hidden && !Object.keys(pendientesMed).length && !Object.keys(pendientesProc).length) {
        actualizar();
      }
    }, 30000);
    return () => {
      vigente = false;
      ac.abort();
      clearInterval(timer);
    };
  }, [admision.id, dia, rev, revision]);

  const h = resultado?.id === admision.id && resultado?.dia === dia ? resultado.hoja : null;

  function cambiarDia(nuevo) {
    if (!nuevo || nuevo === dia) return;
    const hayPendientes = Object.keys(pendientesMed).length > 0 || Object.keys(pendientesProc).length > 0;
    if (hayPendientes) {
      const confirmar = window.confirm("Tienes dosis o procedimientos marcados sin guardar. ¿Cambiar de fecha de todos modos?");
      if (!confirmar) return;
      setPendientesMed({});
      setPendientesProc({});
    }
    Dia(nuevo);
    Aviso("");
    ErrorHoja("");
  }

  function guardado(mensaje, verDia) {
    Accion(null);
    if (verDia) Dia(verDia);
    Aviso(mensaje);
    actualizar();
  }

  const fotoId = paciente.foto_id || h?.foto_id || null,
    jaula = h ? h.jaula : admision.jaula;
  const ingresoAbierto = h?.abierta ?? admision.abierta;

  function jaulaGuardada(nueva) {
    Resultado((prev) => prev && { ...prev, hoja: { ...prev.hoja, jaula: nueva } });
    Aviso("Jaula actualizada.");
    actualizar();
    actualizarFicha();
  }

  async function cambiarUbicacion(e) {
    const nueva = e.target.value;
    const anterior = ubicacionActual;
    setUbicacionActual(nueva);
    if (!onGuardarUbicacion) return;
    setGuardandoUbicacion(true);
    ErrorHoja("");
    try {
      await onGuardarUbicacion(nueva);
      Aviso("Ubicación actualizada.");
    } catch (err) {
      setUbicacionActual(anterior);
      ErrorHoja(err.message || "No se pudo guardar la ubicación.");
    } finally {
      setGuardandoUbicacion(false);
    }
  }

  const opcionesUbicacion =
    ubicacionActual && !OPCIONES_UBICACION.some(([v]) => v === ubicacionActual)
      ? [...OPCIONES_UBICACION, [ubicacionActual, ubicacionActual]]
      : OPCIONES_UBICACION;

  const camposIngresoSinUbicacion = camposIngreso.filter((c) => c.nombre !== "ubicacion");
  const personal = [
    ...new Set(
      [
        ...profesionales,
        internista,
        ...(h?.ordenes || []).map((x) => x.responsable),
        ...(h?.notas || []).map((x) => x.responsable),
        ...(h?.tomas || []).map((x) => x.responsable),
        ...procedimientos.map((x) => x.indicadoPor)
      ].filter(Boolean)
    )
  ];

  // Unificar historial completo (tomas de Supabase + historialExtra + registros de procedimientos)
  const historialUnificado = (() => {
    const mapa = new Map();

    // 1. Tomas devueltas por la hoja
    for (const t of h?.tomas || []) {
      const ord = (h?.ordenes || []).find((o) => o.id === t.orden_id);
      mapa.set(t.id, {
        id: t.id,
        categoria: "medicacion",
        fechaHora: t.realizada || t.programada,
        titulo: ord?.medicina || "Medicación",
        detalle: ord ? `${ord.dosis} · ${ord.via}` : "",
        estado: t.estado === "omitida" ? "Omitida" : "Administrada",
        responsable: t.responsable,
        nota: t.nota || ""
      });
    }

    // 2. Registros dentro de cada procedimiento
    for (const proc of procedimientos) {
      for (const r of proc.registros || []) {
        if (!mapa.has(r.id)) {
          mapa.set(r.id, {
            id: r.id,
            categoria: "procedimiento",
            fechaHora: r.realizadaEn || `${r.fechaDia}T09:00:00-05:00`,
            titulo: proc.nombre,
            detalle: `${proc.indicaciones || proc.frecuenciaTexto} (${r.horario})`,
            estado: "Realizado",
            responsable: r.responsable,
            nota: r.nota || ""
          });
        }
      }
    }

    // 3. Auditoría acumulada de todos los días (hosp_historial)
    for (const item of historialExtra) {
      if (!mapa.has(item.id)) {
        mapa.set(item.id, item);
      }
    }

    return Array.from(mapa.values()).sort((a, b) => Date.parse(b.fechaHora || 0) - Date.parse(a.fechaHora || 0));
  })();

  return (
    <div className="ve-paper">
      <style>{`
        .ve-hoja-tabular-contenedor { display: flex; flex-direction: column; gap: 1.25rem; }
        .ve-barra-internista {
          display: flex; flex-wrap: wrap; gap: 0.85rem; align-items: flex-end;
          background: #f0f7f7; border: 1px solid #cce3e3; border-radius: 10px; padding: 0.75rem 1rem;
        }
        .ve-internista-campo { display: flex; flex-direction: column; gap: 0.25rem; flex: 1 1 230px; }
        .ve-internista-campo.ve-turno-select { flex: 0 1 180px; }
        .ve-internista-campo label { font-size: 0.8rem; font-weight: 600; color: #164e4e; }
        .ve-internista-campo input, .ve-internista-campo select {
          padding: 0.48rem 0.65rem; border: 1px solid #b8d4d4; border-radius: 8px;
          background: #fff; font-size: 0.92rem; color: #112a2a;
        }
        .ve-bloque-tabla { border: 1px solid #dce6e6; border-radius: 12px; padding: 1rem; background: #fff; }
        .ve-tabla-scroll { overflow-x: auto; margin-top: 0.75rem; border: 1px solid #e2ecec; border-radius: 10px; }
        .ve-tabla-clinica { width: 100%; border-collapse: collapse; font-size: 0.9rem; text-align: left; }
        .ve-tabla-clinica th {
          background: #f4f8f8; color: #184e4e; font-weight: 600; padding: 0.65rem 0.8rem;
          border-bottom: 1px solid #dce6e6; white-space: nowrap;
        }
        .ve-tabla-clinica td {
          padding: 0.7rem 0.8rem; border-bottom: 1px solid #edf3f3; vertical-align: top;
        }
        .ve-tabla-clinica tr:last-child td { border-bottom: none; }
        .ve-celda-farmaco { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
        .ve-dosis-pill {
          background: #e6f4f4; color: #0f5c5c; font-weight: 600; font-size: 0.8rem;
          padding: 0.12rem 0.5rem; border-radius: 999px;
        }
        .ve-proc-indicaciones { margin: 0.25rem 0; font-size: 0.86rem; color: #2b4444; }
        .ve-slots-grid { display: flex; flex-wrap: wrap; gap: 0.45rem; }
        .ve-slot-chip {
          display: inline-flex; flex-direction: column; padding: 0.3rem 0.55rem; border-radius: 8px;
          font-size: 0.8rem; line-height: 1.2; border: 1px solid transparent;
        }
        .ve-slot-chip.aplicada { background: #e8f7ee; border-color: #b7e4c7; color: #1b5e20; }
        .ve-slot-chip.omitida { background: #fdecea; border-color: #f5c2c7; color: #9b1c1c; }
        .ve-slot-hora { font-weight: 700; }
        .ve-slot-firmante { font-size: 0.74rem; opacity: 0.9; }
        .ve-slot-check-box {
          display: inline-flex; flex-direction: column; gap: 0.35rem; padding: 0.35rem 0.6rem;
          border: 1px dashed #9ec2c2; border-radius: 8px; background: #fafdfd;
        }
        .ve-slot-check-box.marcado {
          border-style: solid; border-color: #0f5c5c; background: #e8f5f5;
        }
        .ve-check-label {
          display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 600;
          cursor: pointer; user-select: none; color: #123c3c;
        }
        .ve-check-label input[type="checkbox"] { width: 16px; height: 16px; accent-color: #0f5c5c; cursor: pointer; }
        .ve-pendiente-opciones { display: flex; flex-direction: column; gap: 0.25rem; }
        .ve-pendiente-opciones select, .ve-pendiente-opciones input {
          font-size: 0.78rem; padding: 0.22rem 0.4rem; border: 1px solid #b5d1d1; border-radius: 6px;
        }
        .ve-col-acciones { width: 1%; white-space: nowrap; }
        .ve-barra-guardar {
          margin-top: 0.85rem; padding: 0.7rem 0.95rem; border-radius: 10px;
          background: #fff8e6; border: 1px solid #f3d27a;
          display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem;
        }
        .ve-lista-suspendidas { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.5rem; font-size: 0.85rem; }
        .ve-modal-historial { max-width: 860px; width: 95vw; }
        .ve-hist-filtros { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.75rem 0; }
        .ve-hist-filtros button {
          padding: 0.4rem 0.8rem; border-radius: 999px; border: 1px solid #c6dada;
          background: #f5fafa; color: #174949; font-weight: 600; font-size: 0.84rem; cursor: pointer;
        }
        .ve-hist-filtros button.activo { background: #0f5c5c; color: #fff; border-color: #0f5c5c; }
        .ve-hist-tabla-wrap { max-height: 55vh; overflow: auto; border: 1px solid #dce6e6; border-radius: 10px; }
        .ve-badge-cat {
          display: inline-block; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.76rem; font-weight: 700;
        }
        .ve-badge-cat.medicacion { background: #e3f2fd; color: #0d47a1; }
        .ve-badge-cat.procedimiento { background: #f3e5f5; color: #6a1b9a; }
        .ve-nota-mini { display: block; color: #4d6666; margin-top: 0.15rem; }
        .ve-nowrap { white-space: nowrap; }
      `}</style>

      <section className="ve-panel ve-hoja">
        <div className="ve-sala-cab">
          <button type="button" className="ve-link" onClick={volver}>
            <ArrowLeft size={16} /> Historia de {paciente.nombre}
          </button>
          <div className="ve-row ve-cab-identidad">
            <div className="ve-identity">
              <AvatarPaciente paciente={paciente} src={fotos.url(paciente.id, fotoId)} />
              <div>
                <p className="ve-meta">Hospitalización · {paciente.codigo}</p>
                <h2>{paciente.nombre}</h2>
              </div>
            </div>
            <div className="ve-actions">
              <Boton icono={History} onClick={() => setMostrarHistorial(true)}>
                Historial ({historialUnificado.length})
              </Boton>
              <Boton icono={Camera} onClick={() => editarFoto(fotoId)}>
                {fotoId ? "Cambiar foto" : "Añadir foto"}
              </Boton>
              <span className={"ve-estado " + (ingresoAbierto ? "ok" : "")}>
                {ingresoAbierto ? "Ingreso activo" : "Ingreso cerrado"}
              </span>
            </div>
          </div>
          <JaulaIngreso
            ingreso={admision.id}
            actual={jaula}
            abierta={ingresoAbierto}
            asignar={repo.asignarJaula}
            alCambiar={jaulaGuardada}
            actualizar={actualizar}
          />
          <p className="ve-sala-motivo">{admision.titulo}</p>
          <div className="ve-sala-datos">
            <span>Ingreso · {instanteCorto(admision.inicio)}</span>
            {ubicacionActual && <span>Ubicación · {ubicacionActual}</span>}
            {admision.peso != null && <span>{admision.peso} kg</span>}
            {admision.profesional && <span>{admision.profesional}</span>}
          </div>
          <details className="ve-ingreso-detalles">
            <summary>Datos de ingreso</summary>
            {ingresoAbierto && (
              <div style={{ maxWidth: "280px", margin: "0.6rem 0" }}>
                <Campo
                  etiqueta={guardandoUbicacion ? "Detalle de ubicación (guardando…)" : "Detalle de ubicación (opcional)"}
                  nombre="ubicacion"
                  valor={ubicacionActual}
                  opciones={opcionesUbicacion}
                  onChange={cambiarUbicacion}
                  disabled={guardandoUbicacion}
                />
              </div>
            )}
            <ValoresClinicos campos={ingresoAbierto ? camposIngresoSinUbicacion : camposIngreso} datos={datos} />
            {admision.resumen && <p className="ve-nota">{admision.resumen}</p>}
            <Boton icono={Pencil} onClick={editar}>
              Editar ingreso
            </Boton>
          </details>
        </div>

        <nav className="ve-pestanas" aria-label="Hoja de hospitalización">
          <button aria-pressed={tab === "medicacion"} onClick={() => Tab("medicacion")}>
            <Pill size={17} /> Medicación y procedimientos
          </button>
          <button aria-pressed={tab === "evolucion"} onClick={() => Tab("evolucion")}>
            <ClipboardList size={17} /> Evolución y monitoreo
          </button>
        </nav>

        <div className="ve-turno-cuerpo">
          <div className="ve-dia">
            <label className="ve-field">
              Fecha de la hoja
              <input type="date" value={dia} onChange={(e) => cambiarDia(e.target.value)} />
            </label>
            <div className="ve-dia-botones">
              <button aria-label="Día anterior" onClick={() => cambiarDia(moverDia(dia, -1))}>
                ‹
              </button>
              <button onClick={() => cambiarDia(fechaHoy())}>Hoy</button>
              <button aria-label="Día siguiente" onClick={() => cambiarDia(moverDia(dia, 1))}>
                ›
              </button>
              <Boton icono={RefreshCw} aria-label="Actualizar hoja" onClick={actualizar} />
            </div>
          </div>

          {aviso && (
            <p className="ve-confirm" role="status">
              {aviso}
            </p>
          )}
          {error && (
            <div role="alert" className="ve-message">
              {error} <Boton onClick={actualizar}>Reintentar</Boton>
            </div>
          )}
          {!h && !error && (
            <p className="ve-sub" role="status">
              Cargando hoja…
            </p>
          )}

          {h &&
            (tab === "medicacion" ? (
              <SeccionTabularMedica
                hoja={h}
                dia={dia}
                admision={admision}
                repo={repo}
                personal={personal}
                internista={internista}
                setInternista={setInternista}
                procedimientos={procedimientos}
                recargarProcedimientos={() => cargarProcedimientosYHistorial()}
                abrirModal={Accion}
                onGuardadoExitoso={(msg) => {
                  Aviso(msg);
                  actualizar();
                }}
                pendientesMed={pendientesMed}
                setPendientesMed={setPendientesMed}
                pendientesProc={pendientesProc}
                setPendientesProc={setPendientesProc}
              />
            ) : (
              <Evoluciones hoja={h} dia={dia} abrir={Accion} />
            ))}
        </div>
      </section>

      {accion && (
        <ModalHospital
          accion={accion}
          admision={admision}
          paciente={paciente}
          personal={personal}
          repo={repo}
          cerrar={() => Accion(null)}
          actualizar={actualizar}
          guardado={guardado}
          dia={dia}
          internista={internista}
        />
      )}

      {mostrarHistorial && (
        <ModalHistorialCompleto
          paciente={paciente}
          historialUnificado={historialUnificado}
          cerrar={() => setMostrarHistorial(false)}
        />
      )}
    </div>
  );
}
