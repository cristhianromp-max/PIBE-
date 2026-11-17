import { crearFotos, normalizarJaula } from "./identificacion.mjs";
import { crearHospital } from "./hospital.mjs";

const DRIVE_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwdVKvZZ6d_YTIE8u7oEuFhK9tu1WGDxzDIwdP0lTxDRZFtLX29MP-p_YcKkvRj_ZFt/exec";

const etiquetas = { consulta: "Consulta", control: "Control", hospitalizacion: "Hospitalización", preventivo: "Preventivo" };
const limpiar = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function fechaLocal(d = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("es-EC", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(new Date(d))
      .map((p) => [p.type, p.value])
  );
  return partes.year + "-" + partes.month + "-" + partes.day + "T" + partes.hour + ":" + partes.minute;
}

function edad(f, estimada) {
  if (!f) return estimada || "Sin registrar";
  const [a, m, d] = f.split("-").map(Number),
    [b, n, e] = fechaLocal().slice(0, 10).split("-").map(Number);
  const meses = (b - a) * 12 + n - m - (e < d ? 1 : 0);
  if (meses < 0) return "Sin registrar";
  if (meses === 0) return "Menos de un mes";
  if (meses < 12) return meses + (meses === 1 ? " mes" : " meses");
  const anos = Math.floor(meses / 12);
  return anos + (anos === 1 ? " año" : " años");
}

const fechaCorta = (v) =>
  new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(v)
  );
const hora = (v) => fechaLocal(v).slice(11);
const porFecha = (a, b) => Date.parse(b.inicio) - Date.parse(a.inicio) || b.id.localeCompare(a.id);

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}

function fallo(m, c) {
  const e = new Error(m);
  e.codigo = c;
  return e;
}

function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo seleccionado."));
    reader.readAsDataURL(file);
  });
}

async function subirADrive(file, carpeta, nombreArchivo) {
  const base64 = await archivoABase64(file);
  const res = await fetch(DRIVE_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      carpeta,
      nombre: nombreArchivo || file.name || "archivo",
      mimeType: file.type || "application/octet-stream",
      base64
    })
  });
  if (!res.ok) throw Error("No se pudo conectar con Google Drive.");
  const json = await res.json().catch(() => ({}));
  const fileId = json.fileId || json.id;
  if (json.ok === false || !fileId) {
    throw Error(json.error || "Google Drive no devolvió el identificador del archivo.");
  }
  return { ...json, fileId };
}

async function eliminarDesdeDrive(fileId) {
  if (!fileId) return;
  const cleanId = String(fileId).replace(/^drive:/, "").trim();
  if (!cleanId) return;
  await fetch(DRIVE_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      accion: "eliminar",
      fileId: cleanId
    })
  }).catch(() => null);
}

function normalizarFrecuenciaTexto(raw) {
  if (raw == null || raw === "") return "Cada 12h";
  if (typeof raw === "number") return `Cada ${raw}h`;
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return `Cada ${s}h`;
  return s;
}

function convertirPautasHoja(rawHoja, meta = {}) {
  if (!rawHoja) return [];
  const pautasRaw = Array.isArray(rawHoja)
    ? rawHoja
    : rawHoja.pautas || rawHoja.medicaciones || rawHoja.tratamientos || rawHoja.hoja?.pautas || [];
  const adminsRaw = Array.isArray(rawHoja)
    ? []
    : rawHoja.administraciones || rawHoja.tomas || rawHoja.aplicaciones || rawHoja.hoja?.administraciones || [];

  if (!Array.isArray(pautasRaw)) return [];

  return pautasRaw
    .filter((p) => {
      if (!p || typeof p !== "object") return false;
      if (p.activa === false || p.activo === false || p.suspendida === true) return false;
      const st = String(p.estado || "").toLowerCase();
      if (st === "suspendida" || st === "finalizada" || st === "cancelada") return false;
      return true;
    })
    .map((p) => {
      const pautaId = String(p.id || uuid());
      const propias = p.administraciones || p.tomas || p.aplicaciones || [];
      const vinculadas = Array.isArray(adminsRaw)
        ? adminsRaw.filter((a) => String(a.pauta_id || a.pautaId || a.medicacion_id || a.medicacionId || "") === pautaId)
        : [];
      const todasApps = [...propias, ...vinculadas].map((a, i) => ({
        id: String(a.id || `${pautaId}-adm-${i}`),
        fecha: a.fecha || a.fecha_hora || a.fechaHora || a.aplicada_en || a.administrado_en || a.creado || "",
        medico: a.profesional || a.medico || a.aplicado_por || a.responsable || "",
        nota: a.nota || a.observacion || ""
      }));

      const via = p.via || p.ruta || "";
      const dosisBase = p.dosis || p.cantidad || p.volumen || "";
      const dosisTexto = [dosisBase, via].filter(Boolean).join(" · ");
      const nombreMed = p.medicamento || p.farmaco || p.producto || p.nombre || p.titulo || "Medicación";

      return {
        id: `hoja_${pautaId}`,
        pautaId,
        origenHoja: true,
        admisionId: String(p.atencion_id || p.admision_id || p.admisionId || meta.admisionId || ""),
        pacienteId: String(p.paciente_id || p.pacienteId || meta.pacienteId || ""),
        pacienteNombre: p.paciente_nombre || p.pacienteNombre || meta.pacienteNombre || "",
        especie: p.especie || meta.especie || "",
        jaula: p.jaula || meta.jaula || "",
        tipo: via ? `Medicación (${via})` : "Medicación hospitalaria",
        producto: nombreMed,
        dosis: dosisTexto,
        frecuencia: normalizarFrecuenciaTexto(p.frecuencia ?? p.cada ?? p.intervalo ?? p.horario),
        duracion: p.duracion || (p.dias ? `${p.dias} días` : "Según evolución"),
        proximaManual: p.proxima || p.proxima_toma || p.proximaManual || p.inicio || p.fecha_inicio || p.creado || "",
        fechaInicio: p.inicio || p.fecha_inicio || p.creado || "",
        medico: p.profesional || p.medico || "",
        activa: true,
        aplicaciones: todasApps
      };
    });
}

function crearRepositorio(config) {
  const demo = !config.url || !config.clave;
  const pacientes = [
    ["Nube", "Felino", "Común europeo", "Hembra", "2021-03-14", "María Ávila", "0000000101", "HC-0104"],
    ["Nube", "Canino", "Mestizo", "Macho", "2023-10-01", "Andrés Luna", "0000000102", "HC-0108"],
    ["Mora", "Canino", "Beagle", "Hembra", "2022-06-20", "María Ávila", "0000000101", "HC-0111"],
    ["Kiwi", "Felino", "Mestizo", "Macho", null, "Sofía Ríos", "0000000103", "HC-0120"]
  ].map(([nombre, especie, raza, sexo, nacimiento, propietario, cedula, codigo], i) => ({
    id: "prueba-" + (i + 1),
    nombre,
    especie,
    raza,
    sexo,
    nacimiento,
    propietario,
    cedula,
    codigo,
    telefono: "",
    version: 1,
    version_propietario: 1,
    dueno: "dueno-" + cedula
  }));

  const eventos = [
    [0, "hospitalizacion", "2026-11-16T08:30:00-05:00", "Ingreso a observación", "Ingresó para seguimiento de la ingesta. Sala felina, turno de la mañana.", "Dra. Elena Vega", true, 3.8],
    [0, "consulta", "2026-11-14T16:15:00-05:00", "Evaluación del apetito", "La tutora refiere menor consumo de alimento. Se registraron antecedentes y examen físico.", "Dr. Luis Prado", false, 3.9],
    [0, "control", "2026-09-11T10:00:00-05:00", "Revisión de peso", "Se comparó el peso con el registro anterior.", "Dra. Elena Vega", false, 4.1],
    [0, "preventivo", "2026-06-02T09:15:00-05:00", "Visita preventiva", "Se revisó el carné y se documentó la atención preventiva.", "Dr. Luis Prado", false, 4.1],
    [1, "control", "2026-11-15T14:15:00-05:00", "Control ambulatorio", "Revisión del estado general y seguimiento del peso.", "Dra. Elena Vega", false, 11.7],
    [1, "consulta", "2026-07-12T10:20:00-05:00", "Primera consulta", "Apertura de la historia y examen físico.", "Dr. Luis Prado", false, 11.2],
    [2, "preventivo", "2026-11-12T11:00:00-05:00", "Revisión preventiva", "Actualización del registro preventivo.", "Dra. Elena Vega", false, 13.2]
  ].map(([p, tipo, inicio, titulo, resumen, profesional, abierta, peso], i) => ({
    id: "visita-" + i,
    paciente_id: "prueba-" + (p + 1),
    tipo,
    inicio: new Date(inicio).toISOString(),
    titulo,
    resumen,
    profesional,
    abierta,
    peso,
    version: 1
  }));

  const demoRegistros = [];

  async function rpc(nombre, datos, signal, rango) {
    const r = await fetch(config.url + "/rest/v1/rpc/" + nombre, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      signal,
      headers: {
        "Content-Type": "application/json",
        apikey: config.clave,
        ...(rango ? { Range: rango, "Range-Unit": "items" } : {})
      },
      body: JSON.stringify(datos)
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      const legible =
        e.code === "40001" || e.code === "22023"
          ? e.message
          : e.code === "23505"
          ? "Ya existe una cédula idéntica o un ingreso activo para este paciente."
          : e.code === "23514"
          ? "Revisa los valores del formulario."
          : "No se pudo completar la operación. Revisa la conexión e inténtalo de nuevo.";
      throw fallo(legible, e.code);
    }
    return r.json();
  }

  // ==========================================================================
  // SINCRONIZACIÓN MULTIDISPOSITIVO EN SUPABASE (pibe_registros_extra)
  // ==========================================================================
  const headersSupabase = {
    "Content-Type": "application/json",
    apikey: config.clave
  };

  const modulos = {
    async listar(pacienteId, modulo, signal) {
      if (demo) {
        return demoRegistros
          .filter((r) => r.paciente_id === String(pacienteId) && r.modulo === modulo)
          .map((r) => ({ ...r.datos, id: r.id, _parent_id: r.paciente_id }));
      }

      const url =
        `${config.url}/rest/v1/pibe_registros_extra?` +
        `paciente_id=eq.${encodeURIComponent(String(pacienteId))}` +
        `&modulo=eq.${encodeURIComponent(modulo)}` +
        `&order=creado.desc`;

      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        signal,
        headers: headersSupabase
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 404 || err.code === "42P01" || err.code === "PGRST205") {
          throw Error("Falta crear la tabla pibe_registros_extra en Supabase SQL Editor.");
        }
        throw Error(err.message || `Error ${res.status} al leer registros compartidos.`);
      }

      const filas = await res.json();
      return filas.map((f) => ({ ...(f.datos || {}), id: f.id, _parent_id: f.paciente_id, _creado: f.creado }));
    },

    async guardar(pacienteId, modulo, item) {
      const idReg = item.id || uuid();
      const registroCompleto = { ...item, id: idReg };
      const fila = {
        id: idReg,
        paciente_id: String(pacienteId),
        modulo,
        datos: registroCompleto,
        actualizado: new Date().toISOString()
      };

      if (demo) {
        const idx = demoRegistros.findIndex((r) => r.id === idReg);
        if (idx >= 0) demoRegistros[idx] = fila;
        else demoRegistros.unshift(fila);
        return registroCompleto;
      }

      const res = await fetch(`${config.url}/rest/v1/pibe_registros_extra?on_conflict=id`, {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: {
          ...headersSupabase,
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify(fila)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 404 || err.code === "42P01" || err.code === "PGRST205") {
          throw Error("Falta crear la tabla pibe_registros_extra en Supabase SQL Editor.");
        }
        throw Error(err.message || `Error ${res.status} al guardar en la nube.`);
      }

      return registroCompleto;
    },

    async eliminar(idReg) {
      if (demo) {
        const idx = demoRegistros.findIndex((r) => r.id === idReg);
        if (idx >= 0) demoRegistros.splice(idx, 1);
        return;
      }

      const res = await fetch(`${config.url}/rest/v1/pibe_registros_extra?id=eq.${encodeURIComponent(String(idReg))}`, {
        method: "DELETE",
        cache: "no-store",
        credentials: "omit",
        headers: headersSupabase
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Error(err.message || "No se pudo eliminar el registro de la nube.");
      }
    }
  };

  // ==========================================================================
  // PUENTE AUTOMÁTICO CON HOJA DE HOSPITALIZACIÓN (INYECCIONES Y PAUTAS)
  // ==========================================================================
  const hospitalBase = crearHospital(rpc, demo, eventos, fechaLocal, pacientes);

  async function sincronizarSnapshotHoja(admisionId, resultadoHoja) {
    if (!admisionId || !resultadoHoja || typeof resultadoHoja !== "object") return;
    const tienePautas =
      Array.isArray(resultadoHoja.pautas) ||
      Array.isArray(resultadoHoja.medicaciones) ||
      Array.isArray(resultadoHoja.hoja?.pautas);
    if (!tienePautas) return;

    const pautasConvertidas = convertirPautasHoja(resultadoHoja, { admisionId });
    await modulos
      .guardar(admisionId, "hoja_hosp_sync", {
        id: `hoja_sync_${admisionId}`,
        admisionId: String(admisionId),
        pautas: pautasConvertidas,
        actualizado: new Date().toISOString()
      })
      .catch(() => null);
  }

  const hospital = new Proxy(hospitalBase, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== "function") return orig;
      return function (...args) {
        const res = orig.apply(target, args);
        if (res && typeof res.then === "function") {
          return res.then((val) => {
            const first = args[0];
            const admId =
              typeof first === "string"
                ? first
                : first && typeof first === "object"
                ? first.admision_id || first.atencion_id || first.admision || first.ingreso || first.id
                : "";
            if (admId && val && typeof val === "object") {
              sincronizarSnapshotHoja(admId, val);
            }
            return val;
          });
        }
        return res;
      };
    }
  });

  async function leerHojaDirecta(admisionId, signal)
