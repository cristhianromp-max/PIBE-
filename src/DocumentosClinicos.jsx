import React, { useEffect, useState, useRef, useCallback } from "react";
import { Plus, Trash2, Printer, FileText, X } from "lucide-react";
import { fechaCorta, fechaLocal, edad, uuid } from "./datos.mjs";
import { marca } from "./config";
import { Boton } from "./Campos.jsx";

export const RECETAS_RAPIDAS = [
  { nombre: "Doxi 200", dosis: "1 comp", frecuencia: "Cada 24h", duracion: "14 días" },
  { nombre: "Doxi 100", dosis: "1 comp", frecuencia: "Cada 24h", duracion: "14 días" },
  { nombre: "Quercetol 100 MG", dosis: "1 comp", frecuencia: "Cada 12h", duracion: "5 días" },
  { nombre: "Diagel", dosis: "", frecuencia: "Cada 12h", duracion: "5 días" },
  { nombre: "Hepamerz", dosis: "", frecuencia: "Cada 12h", duracion: "15 días" },
  { nombre: "Clamox", dosis: "", frecuencia: "Cada 12h", duracion: "7 días" },
  { nombre: "Previcox", dosis: "", frecuencia: "Cada 24h", duracion: "5 días" },
  { nombre: "Meloxicam", dosis: "", frecuencia: "Cada 24h", duracion: "3 días" },
  { nombre: "Sponge clean", dosis: "Aplicar tópico", frecuencia: "Cada 12h", duracion: "7 días" },
  { nombre: "Spectryl 20", dosis: "1 pipeta", frecuencia: "Dosis única", duracion: "1 día" },
  { nombre: "Spectryl 10", dosis: "1 pipeta", frecuencia: "Dosis única", duracion: "1 día" },
  { nombre: "Liv 52", dosis: "", frecuencia: "Cada 12h", duracion: "15 días" },
  { nombre: "Carminal", dosis: "", frecuencia: "Cada 12h", duracion: "7 días" },
  { nombre: "Anti hemok", dosis: "", frecuencia: "Cada 12h", duracion: "5 días" },
  { nombre: "Neumoflogin", dosis: "", frecuencia: "Cada 12h", duracion: "7 días" }
];

function crearFilasReceta() {
  return [{ id: uuid(), medicamento: "", dosis: "", frecuencia: "", duracion: "" }];
}

function insertarMedicamentoRapido(filasActuales, med) {
  const idxVacia = filasActuales.findIndex((f) => !f.medicamento.trim());
  if (idxVacia !== -1) {
    return filasActuales.map((f, idx) =>
      idx === idxVacia
        ? {
            ...f,
            medicamento: med.nombre,
            dosis: f.dosis || med.dosis || "",
            frecuencia: f.frecuencia || med.frecuencia || "",
            duracion: f.duracion || med.duracion || ""
          }
        : f
    );
  }
  return [
    ...filasActuales,
    {
      id: uuid(),
      medicamento: med.nombre,
      dosis: med.dosis || "",
      frecuencia: med.frecuencia || "",
      duracion: med.duracion || ""
    }
  ];
}

function imprimirRecetaVentana(paciente, receta) {
  const ventana = window.open("", "_blank", "width=820,height=900");
  if (!ventana) {
    alert("Activa las ventanas emergentes para imprimir o guardar la receta en PDF.");
    return;
  }

  const filasHtml = (receta.items || [])
    .map(
      (it, i) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${i + 1}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;"><strong>${it.medicamento}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.dosis || "-"}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.frecuencia || "-"}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.duracion || "-"}</td>
      </tr>`
    )
    .join("");

  ventana.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Receta_${paciente.nombre}_${receta.fecha}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; padding: 28px; max-width: 760px; margin: auto; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 18px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 18px; }
          th { background: #f0fdfa; color: #115e59; text-align: left; padding: 8px; border-bottom: 2px solid #5eead4; }
          .notas { background: #fffbeb; border: 1px solid #fde68a; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 36px; }
          .firma { margin-top: 48px; text-align: center; font-size: 13px; }
          .linea { width: 240px; border-top: 1px solid #334155; margin: 0 auto 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h2 style="margin:0;color:#0f766e;">Clínica Veterinaria "El Pibe"</h2>
            <p style="margin:2px 0 0;font-size:12px;color:#475569;">Receta Médica Veterinaria</p>
          </div>
          ${marca ? `<img src="${marca}" alt="Logo" style="height:46px;object-fit:contain;" />` : ""}
        </div>

        <div class="grid">
          <div><strong>Paciente:</strong> ${paciente.nombre} (${paciente.especie || ""})</div>
          <div><strong>Fecha:</strong> ${receta.fecha}</div>
          <div><strong>Raza / Sexo:</strong> ${[paciente.raza, paciente.sexo].filter(Boolean).join(" · ") || "Sin registrar"}</div>
          <div><strong>Edad:</strong> ${edad(paciente.nacimiento, paciente.edad_estimada) || "Sin registrar"}</div>
          <div><strong>Propietario:</strong> ${paciente.propietario || "Sin registrar"}</div>
          <div><strong>Teléfono:</strong> ${paciente.telefono || "Sin registrar"}</div>
        </div>

        <h3 style="margin:0 0 8px;font-size:15px;color:#0f766e;">Rp / Prescripción</h3>
        <table>
          <thead>
            <tr>
              <th style="width:30px;">#</th>
              <th>Medicamento</th>
              <th>Dosis</th>
              <th>Frecuencia</th>
              <th>Duración</th>
            </tr>
          </thead>
          <tbody>${filasHtml}</tbody>
        </table>

        ${
          receta.indicaciones
            ? `<div class="notas"><strong>Indicaciones y recomendaciones:</strong><br/>${receta.indicaciones.replace(/\n/g, "<br/>")}</div>`
            : ""
        }

        <div class="firma">
          <div class="linea"></div>
          <strong>${receta.medico}</strong><br/>
          <span>Médico Veterinario Zootecnista</span>
        </div>

        <script>window.onload = function() { window.print(); };</script>
      </body>
    </html>
  `);
  ventana.document.close();
}

function FormularioRecetaBloque({ paciente, profesionales, repo, onGuardada }) {
  const [medico, setMedico] = useState("MVZ. Cristhian Romero");
  const [fecha, setFecha] = useState(fechaLocal(new Date()).slice(0, 10));
  const [indicaciones, setIndicaciones] = useState("");
  const [filas, setFilas] = useState(() => crearFilasReceta());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  function actualizarFila(id, campo, valor) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }

  function agregarFila() {
    setFilas((prev) => [...prev, { id: uuid(), medicamento: "", dosis: "", frecuencia: "", duracion: "" }]);
  }

  function quitarFila(id) {
    setFilas((prev) => (prev.length > 1 ? prev.filter((f) => f.id !== id) : crearFilasReceta()));
  }

  async function guardar(e) {
    e.preventDefault();
    if (!medico.trim() || guardando) return;
    const validos = filas.filter((f) => f.medicamento.trim());
    if (validos.length === 0) {
      setError("Agrega al menos un medicamento.");
      return;
    }

    setGuardando(true);
    setError("");
    try {
      const nueva = {
        id: uuid(),
        fecha,
        medico: medico.trim(),
        indicaciones: indicaciones.trim(),
        items: validos
      };

      const guardada = await repo.modulos.guardar(paciente.id, "receta", nueva);
      setFilas(crearFilasReceta());
      setIndicaciones("");
      setAviso("Receta guardada correctamente.");
      setTimeout(() => setAviso(""), 3500);
      if (onGuardada) onGuardada(guardada);
    } catch (err) {
      setError(err.message || "No se pudo guardar la receta.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} style={{ display: "grid", gap: "0.85rem" }}>
      <div className="ve-campos">
        <div className="ve-field">
          <label>Médico veterinario *</label>
          <input
            type="text"
            value={medico}
            onChange={(e) => setMedico(e.target.value)}
            list="ve-prof-recetas"
            required
          />
          <datalist id="ve-prof-recetas">
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

      {/* Botones rápidos de medicamentos */}
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
          {RECETAS_RAPIDAS.map((med) => (
            <button
              key={med.nombre}
              type="button"
              onClick={() => setFilas((prev) => insertarMedicamentoRapido(prev, med))}
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
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#f1f5f9", color: "#334155", borderBottom: "1px solid #cbd5e1" }}>
              <th style={{ padding: "0.5rem", width: "36px" }}>#</th>
              <th style={{ padding: "0.5rem" }}>Medicamento</th>
              <th style={{ padding: "0.5rem", width: "130px" }}>Dosis</th>
              <th style={{ padding: "0.5rem", width: "145px" }}>Frecuencia</th>
              <th style={{ padding: "0.5rem", width: "115px" }}>Duración</th>
              <th style={{ padding: "0.5rem", width: "38px" }}></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, idx) => (
              <tr key={fila.id} style={{ borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
                <td style={{ padding: "0.4rem 0.5rem", color: "#64748b", fontWeight: 700 }}>{idx + 1}</td>
                <td style={{ padding: "0.35rem 0.4rem" }}>
                  <input
                    type="text"
                    value={fila.medicamento}
                    onChange={(e) => actualizarFila(fila.id, "medicamento", e.target.value)}
                    placeholder="Nombre del medicamento..."
                    style={{ width: "100%", padding: "0.42rem 0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </td>
                <td style={{ padding: "0.35rem 0.4rem" }}>
                  <input
                    type="text"
                    value={fila.dosis}
                    onChange={(e) => actualizarFila(fila.id, "dosis", e.target.value)}
                    placeholder="Ej. 1 comp / 2 ml"
                    style={{ width: "100%", padding: "0.42rem 0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </td>
                <td style={{ padding: "0.35rem 0.4rem" }}>
                  <input
                    type="text"
                    value={fila.frecuencia}
                    onChange={(e) => actualizarFila(fila.id, "frecuencia", e.target.value)}
                    placeholder="Ej. Cada 12h"
                    style={{ width: "100%", padding: "0.42rem 0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </td>
                <td style={{ padding: "0.35rem 0.4rem" }}>
                  <input
                    type="text"
                    value={fila.duracion}
                    onChange={(e) => actualizarFila(fila.id, "duracion", e.target.value)}
                    placeholder="Ej. 7 días"
                    style={{ width: "100%", padding: "0.42rem 0.55rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </td>
                <td style={{ textAlign: "center" }}>
                  <button type="button" onClick={() => quitarFila(fila.id)} className="ve-link" title="Quitar fila">
                    <X size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ve-field">
        <label>Indicaciones adicionales (opcional)</label>
        <textarea
          rows={2}
          value={indicaciones}
          onChange={(e) => setIndicaciones(e.target.value)}
          placeholder="Ej. Dar después de comer, mantener hidratado, control en 7 días..."
        />
      </div>

      {error && (
        <p className="ve-message" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      {aviso && (
        <p className="ve-confirm" role="status" style={{ margin: 0 }}>
          {aviso}
        </p>
      )}

      <div className="ve-actions">
        <Boton icono={Plus} onClick={agregarFila}>
          Agregar fila
        </Boton>
        <button type="submit" className="ve-button" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar receta"}
        </button>
      </div>
    </form>
  );
}

export function PestanaRecetas({ paciente, atenciones, anexos = [], profesionales, repo, revision, onRecargar }) {
  const android = globalThis.Capacitor?.getPlatform?.() === "android";
  const [recetas, setRecetas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(
    async (signal) => {
      setCargando(true);
      try {
        const items = await repo.modulos.listar(paciente.id, "receta", signal);
        setRecetas(items || []);
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      } finally {
        setCargando(false);
      }
    },
    [paciente.id, repo]
  );

  useEffect(() => {
    const ac = new AbortController();
    cargar(ac.signal);
    return () => ac.abort();
  }, [cargar, revision]);

  async function eliminar(id) {
    try {
      await repo.modulos.eliminar(id);
      setRecetas((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(err.message || "No se pudo eliminar la receta.");
    }
  }

  const recetasPdf = anexos.filter((x) => String(x.nombre || "").startsWith("Receta_"));

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section className="ve-panel ve-pad">
        <div className="ve-row" style={{ marginBottom: "0.75rem" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.45rem", margin: 0 }}>
            <FileText size={18} /> Nueva receta médica
          </h2>
        </div>

        <FormularioRecetaBloque
          paciente={paciente}
          profesionales={profesionales}
          repo={repo}
          onGuardada={(nueva) => {
            setRecetas((prev) => [nueva, ...prev]);
            if (onRecargar) onRecargar();
          }}
        />
      </section>

      <section className="ve-panel ve-pad">
        <div className="ve-row">
          <h2>Historial de Recetas ({recetas.length + recetasPdf.length})</h2>
        </div>

        {cargando ? (
          <p className="ve-sub">Cargando recetas…</p>
        ) : recetas.length === 0 && recetasPdf.length === 0 ? (
          <p className="ve-sub">Aún no hay recetas emitidas para {paciente.nombre}.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
            {recetas.map((rec) => (
              <div
                key={rec.id}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  padding: "0.85rem",
                  background: "#fff"
                }}
              >
                <div className="ve-row" style={{ alignItems: "flex-start" }}>
                  <div>
                    <span className="ve-badge" style={{ background: "#f0fdfa", color: "#0f766e", fontWeight: 700 }}>
                      {rec.fecha}
                    </span>
                    <p className="ve-meta" style={{ marginTop: "0.25rem" }}>
                      Médico: <strong>{rec.medico}</strong> · {(rec.items || []).length} medicamento(s)
                    </p>
                  </div>
                  <div className="ve-actions">
                    <button
                      type="button"
                      className="ve-button"
                      onClick={() => imprimirRecetaVentana(paciente, rec)}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}
                    >
                      <Printer size={14} /> Imprimir / PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(rec.id)}
                      className="ve-link"
                      title="Eliminar receta"
                      style={{ color: "#dc2626" }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gap: "0.3rem", marginTop: "0.6rem", fontSize: "0.85rem" }}>
                  {(rec.items || []).map((it, i) => (
                    <div key={i} style={{ padding: "0.35rem 0.55rem", background: "#f8fafc", borderRadius: "6px" }}>
                      <strong>
                        {i + 1}. {it.medicamento}
                      </strong>
                      {it.dosis ? ` · Dosis: ${it.dosis}` : ""}
                      {it.frecuencia ? ` · ${it.frecuencia}` : ""}
                      {it.duracion ? ` · ${it.duracion}` : ""}
                    </div>
                  ))}
                  {rec.indicaciones && (
                    <p className="ve-meta" style={{ margin: "0.25rem 0 0" }}>
                      <strong>Indicaciones:</strong> {rec.indicaciones}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {recetasPdf.map((x) => (
              <div className="ve-archivo" key={x.id}>
                <div>
                  <strong>{x.nombre}</strong>
                  <p className="ve-meta">
                    {atenciones?.find((a) => a.id === x.atencion_id)?.titulo || "Archivo PDF"} ·{" "}
                    {Math.max(1, Math.round(x.bytes / 1024))} KB
                  </p>
                </div>
                <div className="ve-actions">
                  <a
                    href={repo.enlace(x, false)}
                    target={android ? "_self" : "_blank"}
                    rel="noopener noreferrer"
                    className="ve-link"
                  >
                    Ver
                  </a>
                  <a
                    href={repo.enlace(x, true)}
                    download={android ? undefined : x.nombre}
                    className="ve-link"
                  >
                    Descargar
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function ModalDocumentosClinicos({ paciente, profesionales, repo, cerrar, onRecetaGuardada }) {
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
      className="ve-dialog ve-dialog-clinico"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        cerrar();
      }}
      aria-labelledby="titulo-modal-docs"
    >
      <div>
        <div className="ve-row" style={{ marginBottom: "0.75rem" }}>
          <div>
            <h2 id="titulo-modal-docs" style={{ margin: 0 }}>
              Emitir receta · {paciente.nombre}
            </h2>
            <p className="ve-meta" style={{ margin: "0.2rem 0 0" }}>
              Propietario: {paciente.propietario} · {fechaCorta(new Date())}
            </p>
          </div>
          <Boton icono={X} aria-label="Cerrar" onClick={cerrar} />
        </div>

        <FormularioRecetaBloque
          paciente={paciente}
          profesionales={profesionales}
          repo={repo}
          onGuardada={() => {
            cerrar();
            if (onRecetaGuardada) onRecetaGuardada();
          }}
        />
      </div>
    </dialog>
  );
}
