import React, { useState } from "react";
import {
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileText,
  MapPin,
  Pill,
  Sparkles,
  Search,
  LayoutGrid,
  ListFilter
} from "lucide-react";
import { Boton } from "./Campos.jsx";
import { AvatarPaciente } from "./Identificacion.jsx";
import { fechaCorta, hora } from "./datos.mjs";
import { camposMonitoreo } from "./registro.mjs";

function formatearTiempoRelativo(minutosAbs) {
  if (minutosAbs < 1) return "ahora mismo";
  if (minutosAbs < 60) return `${minutosAbs} min`;
  const h = Math.floor(minutosAbs / 60);
  const m = minutosAbs % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function resumirMonitoreo(nota) {
  if (!nota) return null;
  const mon = nota.monitoreo || {};
  const valores = [];

  for (const campo of camposMonitoreo || []) {
    const val = mon[campo.nombre];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      const etiquetaCorta = (campo.etiqueta || campo.nombre).split("(")[0].trim();
      valores.push(`${etiquetaCorta}: ${val}`);
    }
  }

  return {
    horaTexto: nota.momento ? hora(nota.momento) : "",
    responsable: nota.responsable || "",
    valores: valores.slice(0, 4),
    texto: nota.nota || ""
  };
}

export function PizarraHospital({
  pacientesSala,
  fotosRepo,
  cargando,
  relojTick,
  onRefrescar,
  onAbrirHoja,
  onAbrirExpediente
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroJaula, setFiltroJaula] = useState("TODAS");
  const [filtroUrgencia, setFiltroUrgencia] = useState("TODOS");
  const [agruparPorJaula, setAgruparPorJaula] = useState(false);

  // Enriquecer cada paciente hospitalizado con el estado de su próxima dosis/procedimiento
  const tarjetas = (pacientesSala || []).map((item) => {
    const { pac, adm, pendientes = [], ultimaNota } = item;

    const itemsEvaluados = pendientes
      .map((p) => {
        const diffMin = Math.round((p.slotTs - relojTick) / 60000);
        const urgencia = diffMin < 0 ? "atrasado" : diffMin <= 180 ? "proximo" : "programado";
        return {
          ...p,
          diffMin,
          urgencia,
          etiquetaTiempo:
            diffMin < 0
              ? `Atrasado ${formatearTiempoRelativo(Math.abs(diffMin))}`
              : diffMin === 0
              ? "Toca ahora"
              : `En ${formatearTiempoRelativo(diffMin)} (${p.hor})`
        };
      })
      .sort((a, b) => a.diffMin - b.diffMin);

    const siguiente = itemsEvaluados[0] || null;
    const siguientesCola = itemsEvaluados.slice(1, 4);

    const urgenciaCard = !siguiente
      ? "al_dia"
      : siguiente.diffMin < 0
      ? "atrasado"
      : siguiente.diffMin <= 180
      ? "proximo"
      : "programado";

    const inicioTs = adm.inicio ? Date.parse(adm.inicio) : relojTick;
    const diasEstancia = Math.max(1, Math.floor((relojTick - inicioTs) / 86400000) + 1);

    return {
      pac,
      adm,
      jaula: adm.jaula || "Sin jaula asignada",
      ubicacion: adm.detalle_clinico?.ubicacion || "",
      diasEstancia,
      siguiente,
      siguientesCola,
      urgenciaCard,
      control: resumirMonitoreo(ultimaNota)
    };
  });

  // Contadores globales de sala
  const totalHospitalizados = tarjetas.length;
  const totalAtrasados = tarjetas.filter((t) => t.urgenciaCard === "atrasado").length;
  const totalProximos = tarjetas.filter((t) => t.urgenciaCard === "proximo").length;

  // Jaulas activas para filtro
  const jaulasUnicas = [...new Set(tarjetas.map((t) => t.jaula))];

  // Aplicar filtros y orden
  const termino = busqueda.trim().toLowerCase();
  const filtradas = tarjetas
    .filter((t) => {
      if (filtroJaula !== "TODAS" && t.jaula !== filtroJaula) return false;
      if (filtroUrgencia === "ATRASADOS" && t.urgenciaCard !== "atrasado") return false;
      if (filtroUrgencia === "PROXIMOS" && t.urgenciaCard !== "atrasado" && t.urgenciaCard !== "proximo") {
        return false;
      }
      if (termino) {
        const texto = [t.pac.nombre, t.pac.especie, t.pac.propietario, t.adm.titulo, t.jaula, t.ubicacion]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!texto.includes(termino)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (agruparPorJaula) {
        const cmpJaula = a.jaula.localeCompare(b.jaula);
        if (cmpJaula !== 0) return cmpJaula;
      }
      const diffA = a.siguiente ? a.siguiente.diffMin : 999999;
      const diffB = b.siguiente ? b.siguiente.diffMin : 999999;
      return diffA - diffB;
    });

  const renderTarjeta = (t) => {
    const { pac, adm, jaula, ubicacion, diasEstancia, siguiente, siguientesCola, urgenciaCard, control } = t;
    const fotoId = pac.foto_id || pac.fotoId;

    const estiloBorde =
      urgenciaCard === "atrasado"
        ? "2px solid #ef4444"
        : urgenciaCard === "proximo"
        ? "2px solid #f59e0b"
        : "1px solid #cbd5e1";

    const fondoSiguiente =
      urgenciaCard === "atrasado"
        ? "#fef2f2"
        : urgenciaCard === "proximo"
        ? "#fffbeb"
        : urgenciaCard === "programado"
        ? "#f0fdfa"
        : "#f8fafc";

    const colorSiguiente =
      urgenciaCard === "atrasado"
        ? "#991b1b"
        : urgenciaCard === "proximo"
        ? "#92400e"
        : urgenciaCard === "programado"
        ? "#115e59"
        : "#475569";

    return (
      <article
        key={adm.id}
        style={{
          background: "#fff",
          border: estiloBorde,
          borderRadius: "14px",
          padding: "0.95rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: "0.75rem",
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.05)"
        }}
      >
        {/* Cabecera de Jaula y Días */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
              <span
                className="ve-badge"
                style={{
                  background: "#0f172a",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "0.74rem",
                  padding: "0.2rem 0.55rem"
                }}
              >
                {jaula}
              </span>
              {ubicacion && (
                <span
                  className="ve-badge"
                  style={{
                    background: "#e0f2fe",
                    color: "#0369a1",
                    fontWeight: 700,
                    fontSize: "0.72rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.2rem"
                  }}
                >
                  <MapPin size={11} /> {ubicacion}
                </span>
              )}
            </div>

            <span className="ve-meta" style={{ fontWeight: 700 }}>
              Día {diasEstancia} · Ingreso {fechaCorta(adm.inicio)}
            </span>
          </div>

          {/* Identidad y Diagnóstico */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <AvatarPaciente pequeno paciente={pac} src={fotosRepo?.url(pac.id, fotoId)} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{pac.nombre}</strong>
                <span className="ve-meta">
                  {pac.especie}
                  {adm.peso != null ? ` · ${Number(adm.peso).toLocaleString("es-EC")} kg` : ""}
                </span>
              </div>
              <p
                style={{
                  margin: "0.15rem 0 0",
                  fontSize: "0.86rem",
                  fontWeight: 600,
                  color: "#334155",
                  lineHeight: 1.3
                }}
              >
                {adm.titulo}
              </p>
            </div>
          </div>

          {/* Bloque destacado: Próxima medicación o procedimiento */}
          <div
            style={{
              background: fondoSiguiente,
              border: `1px solid ${
                urgenciaCard === "atrasado"
                  ? "#fecaca"
                  : urgenciaCard === "proximo"
                  ? "#fde68a"
                  : urgenciaCard === "programado"
                  ? "#99f6e4"
                  : "#e2e8f0"
              }`,
              borderRadius: "10px",
              padding: "0.65rem 0.75rem",
              color: colorSiguiente
            }}
          >
            {siguiente ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.74rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                    {siguiente.esProcedimiento ? <Sparkles size={13} /> : <Pill size={13} />}
                    {siguiente.esProcedimiento ? "Próximo procedimiento" : "Próxima medicación"}
                  </span>
                  <span
                    className="ve-badge"
                    style={{
                      background:
                        urgenciaCard === "atrasado"
                          ? "#dc2626"
                          : urgenciaCard === "proximo"
                          ? "#d97706"
                          : "#0f766e",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: "0.73rem"
                    }}
                  >
                    {siguiente.etiquetaTiempo}
                  </span>
                </div>

                <div style={{ marginTop: "0.3rem", fontWeight: 800, fontSize: "0.94rem", color: "#0f172a" }}>
                  {siguiente.producto}
                </div>
                {siguiente.dosis && (
                  <div style={{ fontSize: "0.82rem", color: "#334155", marginTop: "0.1rem" }}>
                    {siguiente.dosis}
                  </div>
                )}

                {siguientesCola.length > 0 && (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      paddingTop: "0.45rem",
                      borderTop: "1px dashed rgba(15, 23, 42, 0.15)",
                      display: "grid",
                      gap: "0.22rem",
                      fontSize: "0.78rem",
                      color: "#334155"
                    }}
                  >
                    {siguientesCola.map((prox) => (
                      <div key={prox.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.4rem" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          • {prox.producto}
                        </span>
                        <strong style={{ whiteSpace: "nowrap" }}>{prox.hor}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.85rem", fontWeight: 700, color: "#166534" }}>
                <CheckCircle2 size={16} color="#16a34a" />
                <span>Sin dosis ni procedimientos pendientes por hoy</span>
              </div>
            )}
          </div>

          {/* Último control / monitoreo del día */}
          {control && (control.valores.length > 0 || control.texto) && (
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "0.5rem 0.65rem",
                fontSize: "0.8rem",
                color: "#334155"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#0f172a", marginBottom: "0.2rem" }}>
                <span>Último control ({control.horaTexto})</span>
                {control.responsable && <span className="ve-meta">{control.responsable}</span>}
              </div>
              {control.valores.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.2rem" }}>
                  {control.valores.map((v, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: "#fff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        padding: "0.1rem 0.4rem",
                        fontSize: "0.75rem",
                        fontWeight: 600
                      }}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              )}
              {control.texto && (
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    color: "#475569",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden"
                  }}
                >
                  {control.texto}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Botones de acción rápida */}
        <div className="ve-actions" style={{ paddingTop: "0.35rem", borderTop: "1px solid #f1f5f9", justifyContent: "space-between" }}>
          <Boton icono={FileText} onClick={() => onAbrirExpediente(pac.id)}>
            Expediente
          </Boton>
          <Boton principal icono={Activity} onClick={() => onAbrirHoja(pac.id, adm.id)}>
            Abrir hoja
          </Boton>
        </div>
      </article>
    );
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* Cabecera de Pizarra */}
      <div className="ve-row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 className="ve-heading" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <LayoutGrid size={22} /> Pizarra general de hospitalización
          </h1>
          <p className="ve-sub">
            Vista panorámica de jaulas activas, últimos controles y próximas dosis en tiempo real.
          </p>
        </div>

        <div className="ve-actions" style={{ flexWrap: "wrap" }}>
          <Boton icono={RefreshCw} onClick={onRefrescar} disabled={cargando}>
            {cargando ? "Actualizando…" : "Actualizar pizarra"}
          </Boton>
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem"
        }}
      >
        <div className="ve-panel ve-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span className="ve-meta">Pacientes en sala</span>
            <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f172a" }}>{totalHospitalizados}</div>
          </div>
          <Activity size={24} color="#0f766e" />
        </div>

        <div
          className="ve-panel ve-pad"
          onClick={() => setFiltroUrgencia(filtroUrgencia === "ATRASADOS" ? "TODOS" : "ATRASADOS")}
          style={{
            cursor: "pointer",
            background: totalAtrasados > 0 ? "#fef2f2" : "#fff",
            borderColor: totalAtrasados > 0 ? "#fca5a5" : undefined,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div>
            <span className="ve-meta" style={{ color: totalAtrasados > 0 ? "#991b1b" : undefined }}>
              Dosis atrasadas
            </span>
            <div style={{ fontSize: "1.45rem", fontWeight: 800, color: totalAtrasados > 0 ? "#dc2626" : "#0f172a" }}>
              {totalAtrasados}
            </div>
          </div>
          <AlertTriangle size={24} color={totalAtrasados > 0 ? "#dc2626" : "#94a3b8"} />
        </div>

        <div
          className="ve-panel ve-pad"
          onClick={() => setFiltroUrgencia(filtroUrgencia === "PROXIMOS" ? "TODOS" : "PROXIMOS")}
          style={{
            cursor: "pointer",
            background: totalProximos > 0 ? "#fffbeb" : "#fff",
            borderColor: totalProximos > 0 ? "#fcd34d" : undefined,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div>
            <span className="ve-meta" style={{ color: totalProximos > 0 ? "#92400e" : undefined }}>
              Próximos (&lt; 3 horas)
            </span>
            <div style={{ fontSize: "1.45rem", fontWeight: 800, color: totalProximos > 0 ? "#d97706" : "#0f172a" }}>
              {totalProximos}
            </div>
          </div>
          <Clock size={24} color={totalProximos > 0 ? "#d97706" : "#94a3b8"} />
        </div>
      </div>

      {/* Barra de filtros */}
      <section className="ve-panel ve-pad" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", justifyContent: "space-between" }}>
        <div className="ve-search" style={{ flex: "1 1 240px", margin: 0 }}>
          <Search size={16} />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Filtrar por paciente, jaula o diagnóstico…"
            aria-label="Filtrar pizarra de hospitalización"
          />
        </div>

        <div className="ve-actions" style={{ flexWrap: "wrap", gap: "0.45rem" }}>
          <select
            className="ve-select"
            value={filtroJaula}
            onChange={(e) => setFiltroJaula(e.target.value)}
            aria-label="Filtrar por jaula"
          >
            <option value="TODAS">Todas las jaulas ({totalHospitalizados})</option>
            {jaulasUnicas.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>

          <select
            className="ve-select"
            value={filtroUrgencia}
            onChange={(e) => setFiltroUrgencia(e.target.value)}
            aria-label="Filtrar por urgencia"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="ATRASADOS">Solo atrasados ({totalAtrasados})</option>
            <option value="PROXIMOS">Urgentes (&lt; 3 horas)</option>
          </select>

          <button
            type="button"
            onClick={() => setAgruparPorJaula((v) => !v)}
            className={agruparPorJaula ? "ve-button" : "ve-link"}
            style={{ fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <ListFilter size={15} />
            {agruparPorJaula ? "Ordenado por jaula" : "Ordenar por jaula"}
          </button>
        </div>
      </section>

      {/* Grid de pacientes hospitalizados */}
      {cargando && tarjetas.length === 0 ? (
        <div className="ve-panel ve-empty">
          <p className="ve-sub">Cargando pizarra de hospitalización…</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="ve-panel ve-empty">
          <Activity size={28} />
          <strong>
            {totalHospitalizados === 0
              ? "No hay pacientes hospitalizados actualmente"
              : "Ningún paciente coincide con el filtro"}
          </strong>
          <span>
            {totalHospitalizados === 0
              ? "Cuando ingreses un paciente a hospitalización aparecerá automáticamente en esta pizarra."
              : "Prueba cambiando el filtro de jaula o urgencia."}
          </span>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(315px, 1fr))",
            gap: "0.95rem",
            alignItems: "stretch"
          }}
        >
          {filtradas.map(renderTarjeta)}
        </div>
      )}
    </div>
  );
}
