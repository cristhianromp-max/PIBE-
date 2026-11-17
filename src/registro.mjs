export const turnos = {M: "Mañana", T: "Tarde", N: "Noche"};
export const tiposConsulta = ["consulta", "control"];
export const constantes = [
  {clave: "temperatura", nombre: "Temperatura", unidad: "°C", paso: "0.1"},
  {clave: "fc", nombre: "Frecuencia cardíaca", unidad: "lat/min", paso: "1"},
  {clave: "fr", nombre: "Frecuencia respiratoria", unidad: "resp/min", paso: "1"},
  {clave: "trc", nombre: "Llenado capilar", unidad: "s", paso: "0.1"},
  {clave: "spo2", nombre: "SpO₂", unidad: "%", paso: "0.1", max: 100}
];
export const camposConsulta = [
  {clave: "anamnesis", nombre: "Anamnesis"},
  {clave: "examen", nombre: "Examen físico"},
  {clave: "mucosas", nombre: "Mucosas", sugerencias: ["Rosadas", "Pálidas", "Congestivas", "Ictéricas", "Cianóticas"]},
  ...constantes,
  {clave: "diferenciales", nombre: "Diagnósticos diferenciales"},
  {clave: "presuntivo", nombre: "Diagnóstico presuntivo"},
  {clave: "definitivo", nombre: "Diagnóstico definitivo"},
  {clave: "tratamiento", nombre: "Tratamiento e indicaciones"}
];
export const camposIngreso = [
  {clave: "diagnostico", nombre: "Diagnóstico de ingreso"},
  {clave: "ubicacion", nombre: "Detalle de ubicación (opcional)", textoCorto:true},
  {clave: "dias", nombre: "Días recomendados", paso: "1"},
  {clave: "condicion", nombre: "Condición", opciones: [["EST","Estable (EST)"],["CRIT","Crítica (CRIT)"]]},
  {clave: "comportamiento", nombre: "Comportamiento", opciones: [["D","D"],["I","I"],["A","A"]]}
];
const binario = [["Sí","Sí"],["No","No"]];
export const camposMonitoreo = [
  {clave:"comida", nombre:"Alimentación e ingesta", sugerencias:["Comida húmeda", "Alimento seco", "Ayuno registrado"]},
  {clave:"conciencia", nombre:"Estado de conciencia", opciones:[["ACT","ACT"],["LET","LET"],["EST","EST"]]},
  ...constantes.slice(0,3),
  {clave:"vomitos", nombre:"Vómitos", opciones:binario},
  {clave:"diarreas", nombre:"Diarrea", opciones:binario},
  {clave:"orina", nombre:"Orina", opciones:binario},
  {clave:"heces", nombre:"Heces", opciones:binario},
  {clave:"deshidratacion", nombre:"Deshidratación", unidad:"%", paso:"0.1", max:100},
  {clave:"solucion", nombre:"Solución de fluidoterapia", textoCorto:true},
  {clave:"fluido", nombre:"Ritmo de fluidoterapia", unidad:"mL/h", paso:"any"}
];
export function camposDe(tipo) {
  if (tiposConsulta.includes(tipo)) return camposConsulta;
  return tipo === "hospitalizacion" ? camposIngreso : [];
}
export function extraerCampos(valores, campos) {
  const resultado = {};
  for (const campo of campos) {
    const valor = String(valores["clin_" + campo.clave] ?? "").trim();
    if (!valor) continue;
    if (!campo.paso) { resultado[campo.clave] = valor; continue; }
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0 || (campo.max != null && numero > campo.max)) {
      throw new Error("Revisa el valor de " + campo.nombre.toLowerCase() + ".");
    }
    resultado[campo.clave] = numero;
  }
  return resultado;
}
export function valorClinico(campo, valor) {
  const opcion = campo.opciones?.find(([clave])=>clave===valor);
  if (opcion) return opcion[1];
  if (typeof valor === "number") return String(valor).replace(".", ",") + (campo.unidad ? " " + campo.unidad : "");
  return String(valor);
}
export function instanteEcuador(local) {
  if (!local) throw new Error("Selecciona fecha y hora.");
  const fecha = new Date(local + ":00-05:00");
  if (!Number.isFinite(fecha.getTime())) throw new Error("Revisa la fecha y hora.");
  return fecha.toISOString();
}
export function textoMinuto(n) {
  return String(Math.floor(n/60)).padStart(2,"0") + ":" + String(n%60).padStart(2,"0");
}
export function minutosDe(hora) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error("Completa todos los horarios.");
  const [h,m] = hora.split(":").map(Number);
  return h*60+m;
}
export function frecuencia(o) {
  if (o.pauta === "unica") return "Dosis única";
  if (o.pauta === "horarios") return "Diaria · " + o.minutos.map(textoMinuto).join(", ");
  return "Cada " + o.intervalo_horas + (o.intervalo_horas===1?" hora":" horas");
}
export function moverDia(dia, pasos) {
  const d = new Date(dia + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate()+pasos);
  return d.toISOString().slice(0,10);
}
export function horasDelDia(orden, dia) {
  const desde = Date.parse(instanteEcuador(dia+"T00:00"));
  const inicio = Date.parse(orden.inicio);
  const limite = Math.min(desde+86400000, orden.fin ? Date.parse(orden.fin)+1 : Infinity,
    orden.suspendida_en ? Date.parse(orden.suspendida_en) : Infinity);
  const primera = Math.max(inicio,desde);
  if (primera>=limite) return [];
  let instantes;
  if (orden.pauta==="unica") instantes = [inicio];
  else if (orden.pauta==="horarios") instantes = orden.minutos.map(m=>desde+m*60000);
  else {
    const salto = Number(orden.intervalo_horas)*3600000;
    if (!Number.isFinite(salto) || salto<3600000) return [];
    instantes = [];
    for (let t=inicio+Math.ceil((primera-inicio)/salto)*salto; t<limite; t+=salto) instantes.push(t);
  }
  return instantes.filter(t=>t>=primera && t<limite).map(t=>new Date(t).toISOString());
}
export function agendaDelDia(hoja,dia) {
  const filas = new Map(), porId = new Map(hoja.ordenes.map(o=>[o.id,o]));
  const clave = (id,fecha)=>id + "|" + new Date(fecha).toISOString();
  for (const orden of hoja.ordenes) {
    for (const programada of horasDelDia(orden,dia)) filas.set(clave(orden.id,programada),{orden,programada,toma:null});
  }
  for (const toma of hoja.tomas) {
    const orden = porId.get(toma.orden_id);
    if (orden) filas.set(clave(orden.id,toma.programada),{orden,programada:toma.programada,toma});
  }
  return [...filas.values()].sort((a,b)=>Date.parse(a.programada)-Date.parse(b.programada)||a.orden.medicina.localeCompare(b.orden.medicina,"es")||a.orden.id.localeCompare(b.orden.id));
}
