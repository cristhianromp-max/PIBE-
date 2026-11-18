import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Droplets,
  Calculator,
  DollarSign,
  Receipt,
  CheckCircle2,
  Search,
  RefreshCw,
  MessageCircle,
  ExternalLink,
  Copy,
  Check,
  X,
  ArrowRight,
  FileText
} from "lucide-react";
import { Boton } from "./Campos.jsx";
import { fechaCorta, fechaLocal } from "./datos.mjs";

// ============================================================================
// UTILIDAD WHATSAPP ECUADOR (+593)
// ============================================================================
function enlaceWhatsAppCobro(telefono, mensaje) {
  const digitos = String(telefono || "").replace(/\D/g, "");
  if (!digitos) return "";
  let num = digitos;
  if (digitos.startsWith("09") && digitos.length === 10) {
    num = `593${digitos.slice(1)}`;
  } else if (digitos.startsWith("9") && digitos.length === 9) {
    num = `593${digitos}`;
  }
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}

// ============================================================================
// 1. CALCULADORA DE FLUIDOTERAPIA Y GOTEO VETERINARIO
// ============================================================================
const TASAS_MANTENIMIENTO = [
  { id: "canino_std", label: "Canino estándar (50 ml/kg/día)", valor: 50 },
  { id: "canino_peq", label: "Canino cachorro / mini (60 ml/kg/día)", valor: 60 },
  { id: "felino_std", label: "Felino estándar (40 ml/kg/día)", valor: 40 },
  { id: "felino_45", label: "Felino 45 ml/kg/día", valor: 45 },
  { id: "personalizado", label: "Personalizado (ml/kg/día)", valor: null }
];

const EQUIPOS_GOTEO = [
  { id: "micro60", label: "Microgotero (60 gotas/ml)", factor: 60 },
  { id: "macro20", label: "Macrogotero estándar (20 gotas/ml)", factor: 20 },
  { id: "macro15", label: "Macrogotero (15 gotas/ml)", factor: 15 },
  { id: "bomba", label: "Bomba de infusión (solo ml/h)", factor: 0 }
];

export function CalculadoraFluidoterapia({
  paciente = null,
  pesoInicial = "",
  admision = null,
  cerrar = null,
  onGuardarEnHospital = null
}) {
  const dialogRef = useRef(null);
  const esFelino = String(paciente?.especie || "").toLowerCase().includes("felin");

  const [peso, setPeso] = useState(() =>
    pesoInicial !== "" && pesoInicial != null ? String(pesoInicial) : ""
  );
  const [presetMant, setPresetMant] = useState(esFelino ? "felino_std" : "canino_std");
  const [tasaMantCustom, setTasaMantCustom] = useState(esFelino ? "40" : "50");
  const [deshidratacionPct, setDeshidratacionPct] = useState("0");
  const [horasReposicion, setHorasReposicion] = useState("24");
  const [perdidasContinuasDia, setPerdidasContinuasDia] = useState("0");
  const [equipoId, setEquipoId] = useState(() => {
    const pNum = parseFloat(pesoInicial);
    return !Number.isNaN(pNum) && pNum > 0 && pNum <= 10 ? "micro60" : "macro20";
  });
  const [solucion, setSolucion] = useState("Lactato de Ringer");
  const [copiado, setCopiado] = useState(false);
  const [guardandoHosp, setGuardandoHosp] = useState(false);
  const [avisoHosp, setAvisoHosp] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  const pesoKg = Math.max(0, parseFloat(peso) || 0);
  const tasaObj = TASAS_MANTENIMIENTO.find((t) => t.id === presetMant);
  const mlKgDia = tasaObj?.valor != null ? tasaObj.valor : Math.max(0, parseFloat(tasaMantCustom) || 0);

  const pctDeshid = Math.max(0, Math.min(20, parseFloat(deshidratacionPct) || 0));
  const horasRep = Math.max(1, parseFloat(horasReposicion) || 24);
  const perdidasDia = Math.max(0, parseFloat(perdidasContinuasDia) || 0);

  // Cálculos clínicos
  const mantenimientoDia = pesoKg * mlKgDia;
  const mantenimientoHora = mantenimientoDia / 24;

  const deficitTotalMl = pesoKg * pctDeshid * 10;
  const deficitHora = pctDeshid > 0 ? deficitTotalMl / horasRep : 0;

  const perdidasHora = perdidasDia / 24;

  const totalMlHora = mantenimientoHora + deficitHora + perdidasHora;
  const totalMl24h = mantenimientoDia + (pctDeshid > 0 ? Math.min(deficitTotalMl, deficitHora * 24) : 0) + perdidasDia;

  const equipoObj = EQUIPOS_GOTEO.find((e) => e.id === equipoId) || EQUIPOS_GOTEO[1];
  const gotasPorMinuto = equipoObj.factor > 0 ? (totalMlHora * equipoObj.factor) / 60 : 0;
  const segundosPorGota = gotasPorMinuto > 0 ? 60 / gotasPorMinuto : 0;

  // Referencia de bolos de rescate
  const boloMin = esFelino ? pesoKg * 5 : pesoKg * 10;
  const boloMax = esFelino ? pesoKg * 10 : pesoKg * 20;

  function construirTextoPlan() {
    const lineas = [
      `FLUIDOTERAPIA${paciente ? ` · ${paciente.nombre}` : ""} (${pesoKg.toFixed(2)} kg)`,
      `Solución: ${solucion}`,
      `• Mantenimiento (${mlKgDia} ml/kg/día): ${mantenimientoDia.toFixed(0)} ml/día (${mantenimientoHora.toFixed(1)} ml/h)`,
      pctDeshid > 0
        ? `• Déficit (${pctDeshid}% en ${horasRep}h): ${deficitTotalMl.toFixed(0)} ml totales (${deficitHora.toFixed(1)} ml/h)`
        : `• Déficit deshidratación: 0%`,
      perdidasDia > 0 ? `• Pérdidas continuas: ${perdidasDia.toFixed(0)} ml/día (${perdidasHora.toFixed(1)} ml/h)` : null,
      `→ VELOCIDAD TOTAL: ${totalMlHora.toFixed(1)} ml/hora (${totalMl24h.toFixed(0)} ml en 24h)`,
      equipoObj.factor > 0
        ? `→ GOTEO (${equipoObj.label}): ${Math.round(gotasPorMinuto)} gotas/min (1 gota cada ${segundosPorGota.toFixed(1)} s)`
        : `→ EQUIPO: Bomba de infusión a ${totalMlHora.toFixed(1)} ml/h`
    ].filter(Boolean);

    return lineas.join("\n");
  }

  async function copiarPlan() {
    try {
      await navigator.clipboard.writeText(construirTextoPlan());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {}
  }

  async function guardarEnObservacionesAdmision() {
    if (!onGuardarEnHospital || guardandoHosp || pesoKg <= 0) return;
    setGuardandoHosp(true);
    setAvisoHosp("");
    try {
      const sello = `[FLUIDOTERAPIA ${fechaLocal(new Date()).replace("T", " ")}]\n${construirTextoPlan()}`;
      await onGuardarEnHospital(sello);
      setAvisoHosp("Plan de fluidoterapia anexado a las observaciones de ingreso.");
      setTimeout(() => setAvisoHosp(""), 3500);
    } finally {
      setGuardandoHosp(false);
    }
  }

  const contenido = (
    <div>
      <div className="ve-row" style={{ alignItems: "flex-start", gap: "0.75rem" }}>
        <div>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.45rem" }}>
            <Droplets size={20} color="#0284c7" />
            Calculadora de Fluidoterapia{paciente ? ` · ${paciente.nombre}` : ""}
          </h2>
          <p className="ve-meta" style={{ marginTop: "0.2rem" }}>
            Cálculo de mantenimiento, reposición de deshidratación, pérdidas continuas y calibración de goteo.
          </p>
        </div>
        {cerrar && <Boton icono={X} aria-label="Cerrar" onClick={cerrar} />}
      </div>

      <div className="ve-campos" style={{ marginTop: "0.85rem" }}>
        <div className="ve-field">
          <label>Peso del paciente (kg) *</label>
          <input
            type="number"
            min="0.05"
            max="150"
            step="0.01"
            value={peso}
            onChange={(e) => {
              setPeso(e.target.value);
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val) && val > 0) {
                setEquipoId(val <= 10 ? "micro60" : "macro20");
              }
            }}
            placeholder="Ej. 12.5"
          />
        </div>

        <div className="ve-field">
          <label>Solución cristaloide</label>
          <select value={solucion} onChange={(e) => setSolucion(e.target.value)}>
            <option value="Lactato de Ringer">Lactato de Ringer (Hartmann)</option>
            <option value="Cloruro de Sodio 0.9%">Cloruro de Sodio 0.9% (Fisiológica)</option>
            <option value="Dextrosa 5% en NaCl 0.9%">Dextrosa 5% en NaCl 0.9%</option>
            <option value="Dextrosa 5% en Agua">Dextrosa 5% en Agua</option>
            <option value="Solución Polielectrolítica">Solución Polielectrolítica</option>
          </select>
        </div>

        <div className="ve-field">
          <label>Tasa de mantenimiento</label>
          <select value={presetMant} onChange={(e) => setPresetMant(e.target.value)}>
            {TASAS_MANTENIMIENTO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {presetMant === "personalizado" && (
          <div className="ve-field">
            <label>Mantenimiento manual (ml/kg/día)</label>
            <input
              type="number"
              min="1"
              max="200"
              step="1"
              value={tasaMantCustom}
              onChange={(e) => setTasaMantCustom(e.target.value)}
            />
          </div>
        )}

        <div className="ve-field">
          <label>Deshidratación estimada (%)</label>
          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <input
              type="number"
              min="0"
              max="15"
              step="0.5"
              value={deshidratacionPct}
              onChange={(e) => setDeshidratacionPct(e.target.value)}
              style={{ width: "85px" }}
            />
            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
              {["0", "5", "7", "8", "10"].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setDeshidratacionPct(pct)}
                  style={{
                    padding: "0.28rem 0.48rem",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: deshidratacionPct === pct ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                    background: deshidratacionPct === pct ? "#e0f2fe" : "#f8fafc",
                    color: deshidratacionPct === pct ? "#0369a1" : "#475569"
                  }}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="ve-field">
          <label>Reponer déficit en (horas)</label>
          <select value={horasReposicion} onChange={(e) => setHorasReposicion(e.target.value)}>
            <option value="24">24 horas (reposición gradual)</option>
            <option value="12">12 horas</option>
            <option value="8">8 horas</option>
            <option value="6">6 horas (deshidratación marcada)</option>
            <option value="4">4 horas</option>
          </select>
        </div>

        <div className="ve-field">
          <label>Pérdidas continuas (ml/día)</label>
          <input
            type="number"
            min="0"
            step="10"
            value={perdidasContinuasDia}
            onChange={(e) => setPerdidasContinuasDia(e.target.value)}
            placeholder="Vómitos / diarrea en 24h"
          />
        </div>

        <div className="ve-field">
          <label>Equipo de infusión / Venoclisis</label>
          <select value={equipoId} onChange={(e) => setEquipoId(e.target.value)}>
            {EQUIPOS_GOTEO.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* PANEL DE RESULTADOS EN TIEMPO REAL */}
      <div
        style={{
          marginTop: "1rem",
          borderRadius: "12px",
          border: "1.5px solid #bae6fd",
          background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
          padding: "0.95rem 1rem"
        }}
      >
        {pesoKg <= 0 ? (
          <p className="ve-meta" style={{ margin: 0, textAlign: "center" }}>
            Ingresa el peso del paciente en kilogramos para calcular la velocidad de infusión y el goteo.
          </p>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
                gap: "0.75rem"
              }}
            >
              <div style={{ background: "#fff", borderRadius: "10px", padding: "0.7rem 0.85rem", border: "1px solid #cbd5e1" }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                  Velocidad de infusión
                </span>
                <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0369a1", marginTop: "0.15rem" }}>
                  {totalMlHora.toFixed(1)} <span style={{ fontSize: "0.9rem" }}>ml/hora</span>
                </div>
                <div className="ve-meta" style={{ marginTop: "0.15rem" }}>
                  Total 24h: <strong>{totalMl24h.toFixed(0)} ml</strong>
                </div>
              </div>

              <div style={{ background: "#fff", borderRadius: "10px", padding: "0.7rem 0.85rem", border: "1px solid #cbd5e1" }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                  {equipoObj.factor > 0 ? `Goteo (${equipoObj.factor} gotas/ml)` : "Bomba de infusión"}
                </span>
                {equipoObj.factor > 0 ? (
                  <>
                    <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f766e", marginTop: "0.15rem" }}>
                      {Math.round(gotasPorMinuto)} <span style={{ fontSize: "0.9rem" }}>gotas/min</span>
                    </div>
                    <div className="ve-meta" style={{ marginTop: "0.15rem" }}>
                      1 gota cada <strong>{segundosPorGota.toFixed(1)} seg</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "#0f766e", marginTop: "0.15rem" }}>
                      {totalMlHora.toFixed(1)} <span style={{ fontSize: "0.9rem" }}>ml/h</span>
                    </div>
                    <div className="ve-meta" style={{ marginTop: "0.15rem" }}>
                      Programar flujo continuo
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Desglose por componente */}
            <div
              style={{
                marginTop: "0.75rem",
                paddingTop: "0.65rem",
                borderTop: "1px dashed #7dd3fc",
                display: "grid",
                gap: "0.25rem",
                fontSize: "0.83rem",
                color: "#0f172a"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Mantenimiento ({mlKgDia} ml/kg/día):</span>
                <strong>
                  {mantenimientoDia.toFixed(0)} ml/día ({mantenimientoHora.toFixed(1)} ml/h)
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Déficit deshidratación ({pctDeshid}% en {horasRep}h):</span>
                <strong>
                  {deficitTotalMl.toFixed(0)} ml totales ({deficitHora.toFixed(1)} ml/h)
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Pérdidas continuas:</span>
                <strong>
                  {perdidasDia.toFixed(0)} ml/día ({perdidasHora.toFixed(1)} ml/h)
                </strong>
              </div>
              <div
                style={{
                  marginTop: "0.3rem",
                  paddingTop: "0.3rem",
                  borderTop: "1px solid #bae6fd",
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#0369a1"
                }}
              >
                <span>Referencia bolo shock ({esFelino ? "Felino 5–10 ml/kg" : "Canino 10–20 ml/kg"} en 15 min):</span>
                <strong>
                  {boloMin.toFixed(0)} – {boloMax.toFixed(0)} ml
                </strong>
              </div>
            </div>
          </>
        )}
      </div>

      {avisoHosp && (
        <p className="ve-confirm" role="status" style={{ marginTop: "0.75rem" }}>
          {avisoHosp}
        </p>
      )}

      <footer className="ve-actions ve-last" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        {cerrar ? (
          <Boton onClick={cerrar}>Cerrar</Boton>
        ) : (
          <span />
        )}

        <div className="ve-actions" style={{ flexWrap: "wrap" }}>
          <Boton icono={copiado ? Check : Copy} onClick={copiarPlan} disabled={pesoKg <= 0}>
            {copiado ? "Pauta copiada" : "Copiar pauta"}
          </Boton>

          {admision && onGuardarEnHospital && (
            <button
              type="button"
              className="ve-button"
              onClick={guardarEnObservacionesAdmision}
              disabled={guardandoHosp || pesoKg <= 0}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <FileText size={15} />
              {guardandoHosp ? "Guardando…" : "Guardar en ingreso"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );

  if (cerrar) {
    return (
      <dialog
        className="ve-dialog ve-dialog-clinico"
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          cerrar();
        }}
        aria-label="Calculadora de Fluidoterapia"
      >
        {contenido}
      </dialog>
    );
  }

  return <section className="ve-panel ve-pad">{contenido}</section>;
}

// ============================================================================
// 2. PANEL GLOBAL DE CUENTAS POR COBRAR (TODAS LAS COTIZACIONES PENDIENTES)
// ============================================================================
export function PanelCuentasPorCobrar({
  repo,
  revision,
  onAbrirCotizacionesPaciente
}) {
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroMonto, setFiltroMonto] = useState("TODAS"); // "TODAS" | "CON_SALDO" | "SIN_SALDO"
  const [saldosEditados, setSaldosEditados] = useState({});
  const [procesandoKey, setProcesandoKey] = useState("");

  const cargarCuentasGlobales = useCallback(
    async (signal) => {
      setCargando(true);
      setError("");
      try {
        const pacsMap = new Map();
        for (let pag = 0; pag < 8; pag++) {
          const res = await repo.listar("", pag, signal);
          for (const p of res?.items || []) {
            pacsMap.set(p.id, p);
          }
          if (!res?.mas) break;
        }

        const pacientes = Array.from(pacsMap.values());
        const listasPorPaciente = await Promise.all(
          pacientes.map(async (pac) => {
            const items = await repo.modulos.listar(pac.id, "cotizacion", signal).catch(() => []);
            return { pac, items: items || [] };
          })
        );

        const pendientesGlobales = [];

        for (const { pac, items } of listasPorPaciente) {
          if (items.length === 0) continue;

          const mapaCot = new Map();
          for (const it of items) {
            const num = String(it.numeroCotizacion || "Sin número").trim();
            if (!mapaCot.has(num)) {
              mapaCot.set(num, {
                key: `${pac.id}__${num}`,
                paciente: pac,
                numeroCotizacion: num,
                items: [],
                linkPrefactura: "",
                estadoCobro: it.estadoCobro || "pendiente",
                saldoPendiente: 0,
                tieneSaldo: false
              });
            }
            const g = mapaCot.get(num);
            g.items.push(it);
            if (!g.linkPrefactura && it.linkPrefactura) {
              g.linkPrefactura = it.linkPrefactura;
            }
            if (!g.tieneSaldo && it.saldoPendiente !== undefined && it.saldoPendiente !== null) {
              g.saldoPendiente = Number(it.saldoPendiente) || 0;
              g.tieneSaldo = true;
            }
          }

          for (const grupo of mapaCot.values()) {
            if (grupo.estadoCobro !== "cobrado" || grupo.saldoPendiente > 0) {
              const fechas = [...new Set(grupo.items.map((i) => i.fecha).filter(Boolean))];
              const internistas = [...new Set(grupo.items.map((i) => i.internista).filter(Boolean))];
              pendientesGlobales.push({
                ...grupo,
                fecha:
                  fechas.length <= 1
                    ? fechas[0] || ""
                    : `${fechas[fechas.length - 1]} – ${fechas[0]}`,
                fechaOrden: fechas[0] || "",
                internistas: internistas.join(", ")
              });
            }
          }
        }

        pendientesGlobales.sort((a, b) => {
          if (b.saldoPendiente !== a.saldoPendiente) {
            return b.saldoPendiente - a.saldoPendiente;
          }
          return String(b.fechaOrden).localeCompare(String(a.fechaOrden));
        });

        setCuentas(pendientesGlobales);
        setSaldosEditados({});
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(e.message || "No se pudieron cargar las cuentas por cobrar.");
        }
      } finally {
        setCargando(false);
      }
    },
    [repo]
  );

  useEffect(() => {
    const ac = new AbortController();
    cargarCuentasGlobales(ac.signal);
    return () => ac.abort();
  }, [cargarCuentasGlobales, revision]);

  async function guardarSaldoGrupo(grupo) {
    if (procesandoKey === grupo.key) return;
    const raw = saldosEditados[grupo.key];
    if (raw === undefined) return;

    const nuevoSaldo = Math.max(0, parseFloat(raw) || 0);
    setProcesandoKey(grupo.key);
    setError("");
    try {
      await Promise.all(
        grupo.items.map((item) =>
          repo.modulos.guardar(grupo.paciente.id, "cotizacion", {
            ...item,
            estadoCobro: "pendiente",
            saldoPendiente: nuevoSaldo
          })
        )
      );

      setCuentas((prev) =>
        prev.map((c) =>
          c.key === grupo.key
            ? {
                ...c,
                saldoPendiente: nuevoSaldo,
                items: c.items.map((i) => ({ ...i, saldoPendiente: nuevoSaldo, estadoCobro: "pendiente" }))
              }
            : c
        )
      );
      setSaldosEditados((prev) => {
        const copia = { ...prev };
        delete copia[grupo.key];
        return copia;
      });
      setAviso(`Saldo actualizado a $${nuevoSaldo.toFixed(2)} en cotización #${grupo.numeroCotizacion}.`);
      setTimeout(() => setAviso(""), 3500);
    } catch (err) {
      setError(err.message || "No se pudo actualizar el saldo.");
    } finally {
      setProcesandoKey("");
    }
  }

  async function marcarComoCobrado(grupo) {
    if (procesandoKey === grupo.key) return;
    setProcesandoKey(grupo.key);
    setError("");
    try {
      await Promise.all(
        grupo.items.map((item) =>
          repo.modulos.guardar(grupo.paciente.id, "cotizacion", {
            ...item,
            estadoCobro: "cobrado",
            saldoPendiente: 0
          })
        )
      );

      setCuentas((prev) => prev.filter((c) => c.key !== grupo.key));
      setAviso(`Cotización #${grupo.numeroCotizacion} (${grupo.paciente.nombre}) marcada como cobrada.`);
      setTimeout(() => setAviso(""), 3500);
    } catch (err) {
      setError(err.message || "No se pudo marcar la cotización como cobrada.");
    } finally {
      setProcesandoKey("");
    }
  }

  const term = busqueda.trim().toLowerCase();
  const cuentasFiltradas = cuentas.filter((c) => {
    if (filtroMonto === "CON_SALDO" && c.saldoPendiente <= 0) return false;
    if (filtroMonto === "SIN_SALDO" && c.saldoPendiente > 0) return false;
    if (!term) return true;
    return (
      String(c.paciente.nombre || "").toLowerCase().includes(term) ||
      String(c.paciente.propietario || "").toLowerCase().includes(term) ||
      String(c.paciente.cedula || "").toLowerCase().includes(term) ||
      String(c.numeroCotizacion || "").toLowerCase().includes(term)
    );
  });

  const totalPorCobrar = cuentas.reduce((acc, c) => acc + (Number(c.saldoPendiente) || 0), 0);
  const propietariosUnicos = new Set(cuentas.map((c) => c.paciente.propietario)).size;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="ve-row" style={{ flexWrap: "wrap", gap: "0.6rem" }}>
        <div>
          <h1 className="ve-heading" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <DollarSign size={24} color="#0f766e" /> Cuentas por cobrar
          </h1>
          <p className="ve-sub">
            Resumen global de todas las cotizaciones pendientes y saldos abiertos en Clínica Veterinaria El Pibe.
          </p>
        </div>

        <Boton icono={RefreshCw} onClick={() => cargarCuentasGlobales()} disabled={cargando}>
          {cargando ? "Actualizando…" : "Actualizar"}
        </Boton>
      </div>

      {/* KPIs DE RESUMEN */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "0.85rem"
        }}
      >
        <div
          className="ve-panel ve-pad"
          style={{ borderLeft: "4px solid #d97706", background: "#fffbeb" }}
        >
          <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#92400e", textTransform: "uppercase" }}>
            Total saldo por cobrar
          </span>
          <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "#92400e", marginTop: "0.2rem" }}>
            ${totalPorCobrar.toFixed(2)}
          </div>
          <span className="ve-meta">Suma de valores pendientes asignados</span>
        </div>

        <div className="ve-panel ve-pad" style={{ borderLeft: "4px solid #dc2626" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
            Cotizaciones pendientes
          </span>
          <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "#0f172a", marginTop: "0.2rem" }}>
            {cuentas.length}
          </div>
          <span className="ve-meta">En estado pendiente de cobro</span>
        </div>

        <div className="ve-panel ve-pad" style={{ borderLeft: "4px solid #0284c7" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>
            Propietarios con cuenta abierta
          </span>
          <div style={{ fontSize: "1.65rem", fontWeight: 800, color: "#0f172a", marginTop: "0.2rem" }}>
            {propietariosUnicos}
          </div>
          <span className="ve-meta">Clientes con saldo o prefactura activa</span>
        </div>
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

      {/* FILTROS Y TABLA GLOBAL */}
      <section className="ve-panel ve-pad">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.85rem"
          }}
        >
          <div className="ve-search" style={{ flex: "1 1 260px", maxWidth: "420px", margin: 0 }}>
            <Search size={17} />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por paciente, propietario, cédula o # cotización…"
            />
          </div>

          <div className="ve-actions" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setFiltroMonto("TODAS")}
              className={filtroMonto === "TODAS" ? "ve-button" : "ve-link"}
              style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
            >
              Todas ({cuentas.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroMonto("CON_SALDO")}
              className={filtroMonto === "CON_SALDO" ? "ve-button" : "ve-link"}
              style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
            >
              Con monto ($) ({cuentas.filter((c) => c.saldoPendiente > 0).length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroMonto("SIN_SALDO")}
              className={filtroMonto === "SIN_SALDO" ? "ve-button" : "ve-link"}
              style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
            >
              Sin monto ($0) ({cuentas.filter((c) => c.saldoPendiente <= 0).length})
            </button>
          </div>
        </div>

        {cargando ? (
          <p className="ve-sub">Analizando cotizaciones de todos los pacientes…</p>
        ) : cuentasFiltradas.length === 0 ? (
          <div className="ve-empty">
            <CheckCircle2 size={26} color="#16a34a" />
            <strong>Sin cuentas pendientes</strong>
            <span>No hay cotizaciones pendientes que coincidan con el filtro actual.</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #e2e8f0", color: "#334155" }}>
                  <th style={{ padding: "0.55rem 0.4rem" }}>Paciente / Propietario</th>
                  <th style={{ padding: "0.55rem 0.4rem" }}>Cotización</th>
                  <th style={{ padding: "0.55rem 0.4rem" }}>Detalle de consumos</th>
                  <th style={{ padding: "0.55rem 0.4rem", width: "185px" }}>Saldo pendiente ($)</th>
                  <th style={{ padding: "0.55rem 0.4rem", textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cuentasFiltradas.map((grupo) => {
                  const valorActual =
                    saldosEditados[grupo.key] !== undefined
                      ? saldosEditados[grupo.key]
                      : grupo.saldoPendiente > 0
                      ? String(grupo.saldoPendiente)
                      : "";
                  const cambioPendiente = saldosEditados[grupo.key] !== undefined;

                  const mensajeWa = [
                    `Hola *${grupo.paciente.propietario}*, le saludamos de *Clínica Veterinaria El Pibe*.`,
                    `Le recordamos que mantiene un saldo pendiente correspondiente a la atención de *${grupo.paciente.nombre}* (Cotización *#${grupo.numeroCotizacion}*)${
                      grupo.saldoPendiente > 0 ? ` por un valor de *$${grupo.saldoPendiente.toFixed(2)}*` : ""
                    }.`,
                    grupo.linkPrefactura ? `Detalle: ${grupo.linkPrefactura}` : null,
                    "Quedamos atentos ante cualquier consulta. ¡Gracias!"
                  ]
                    .filter(Boolean)
                    .join("\n");

                  const urlWa = enlaceWhatsAppCobro(grupo.paciente.telefono, mensajeWa);
                  const vistaPrevia = grupo.items
                    .slice(0, 3)
                    .map((i) => `${i.descripcion} (${i.cantidad})`)
                    .join(" · ");

                  return (
                    <tr key={grupo.key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "0.65rem 0.4rem" }}>
                        <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>
                          {grupo.paciente.nombre}
                        </strong>
                        <span className="ve-meta" style={{ marginLeft: "0.35rem" }}>
                          ({grupo.paciente.especie})
                        </span>
                        <div style={{ fontSize: "0.83rem", color: "#334155", marginTop: "0.1rem" }}>
                          {grupo.paciente.propietario}
                          {grupo.paciente.cedula ? ` · C.I. ${grupo.paciente.cedula}` : ""}
                        </div>
                        {urlWa && (
                          <a
                            href={urlWa}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.28rem",
                              marginTop: "0.25rem",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              color: "#15803d",
                              textDecoration: "underline"
                            }}
                          >
                            <MessageCircle size={13} /> Recordar por WhatsApp ({grupo.paciente.telefono})
                          </a>
                        )}
                      </td>

                      <td style={{ padding: "0.65rem 0.4rem", whiteSpace: "nowrap" }}>
                        <span className="ve-badge" style={{ fontWeight: 700 }}>
                          #{grupo.numeroCotizacion}
                        </span>
                        <div className="ve-meta" style={{ marginTop: "0.2rem" }}>
                          {grupo.fecha || "Sin fecha"}
                        </div>
                        {grupo.linkPrefactura && (
                          <a
                            href={grupo.linkPrefactura}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ve-link"
                            style={{ fontSize: "0.77rem", padding: 0, display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
                          >
                            <ExternalLink size={12} /> Contífico
                          </a>
                        )}
                      </td>

                      <td style={{ padding: "0.65rem 0.4rem" }}>
                        <div style={{ color: "#1e293b" }}>
                          {vistaPrevia}
                          {grupo.items.length > 3 ? ` (+${grupo.items.length - 3} más)` : ""}
                        </div>
                        <div className="ve-meta" style={{ marginTop: "0.15rem" }}>
                          {grupo.items.length} ítem(s) · {grupo.internistas || "Sin internista"}
                        </div>
                      </td>

                      <td style={{ padding: "0.65rem 0.4rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <span style={{ fontWeight: 700, color: "#475569" }}>$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={valorActual}
                            onChange={(e) =>
                              setSaldosEditados((prev) => ({
                                ...prev,
                                [grupo.key]: e.target.value
                              }))
                            }
                            placeholder="0.00"
                            style={{
                              width: "92px",
                              padding: "0.32rem 0.45rem",
                              borderRadius: "6px",
                              border:
                                Number(valorActual) > 0
                                  ? "1.5px solid #d97706"
                                  : "1px solid #cbd5e1",
                              background: Number(valorActual) > 0 ? "#fffbeb" : "#fff",
                              fontWeight: 700,
                              color: Number(valorActual) > 0 ? "#92400e" : "#0f172a"
                            }}
                          />
                          {cambioPendiente && (
                            <button
                              type="button"
                              onClick={() => guardarSaldoGrupo(grupo)}
                              disabled={procesandoKey === grupo.key}
                              className="ve-button"
                              style={{ padding: "0.3rem 0.55rem", fontSize: "0.75rem" }}
                            >
                              OK
                            </button>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: "0.65rem 0.4rem", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => marcarComoCobrado(grupo)}
                            disabled={procesandoKey === grupo.key}
                            style={{
                              background: "#dcfce7",
                              color: "#166534",
                              border: "1px solid #86efac",
                              borderRadius: "8px",
                              padding: "0.35rem 0.6rem",
                              fontWeight: 700,
                              fontSize: "0.78rem",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem"
                            }}
                          >
                            <CheckCircle2 size={14} />
                            {procesandoKey === grupo.key ? "…" : "Cobrado"}
                          </button>

                          <Boton
                            icono={ArrowRight}
                            onClick={() => onAbrirCotizacionesPaciente(grupo.paciente.id)}
                          >
                            Ficha
                          </Boton>
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
    </div>
  );
}
