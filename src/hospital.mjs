import {horasDelDia, instanteEcuador, moverDia} from "./registro.mjs";
import {normalizarJaula} from "./identificacion.mjs";
export function crearHospital(rpc, demo, eventos, fechaLocal, pacientes=[]) {
  const ordenes=[], tomas=[], notas=[];
  const fechaDia = instante=>fechaLocal(instante).slice(0,10);
  const ahora = ()=>new Date().toISOString();
  const errorCambio = mensaje=>Object.assign(new Error(mensaje),{codigo:"40001"});
  if (demo) {
    const evento=eventos.find(v=>v.tipo==="hospitalizacion" && v.abierta);
    if (evento) {
      const ayer=moverDia(fechaDia(new Date()),-1);
      evento.inicio=instanteEcuador(ayer+"T07:00");
      evento.jaula="Gatera";
      evento.detalle_clinico={ubicacion:"Sala felina",condicion:"EST"};
      ordenes.push({id:"pauta-demo",ingreso_id:evento.id,medicina:"Medicación de demostración",dosis:"1 unidad",via:"Vía oral (VO)",pauta:"horarios",minutos:[540,1260],inicio:instanteEcuador(ayer+"T08:00"),responsable:"Dra. Elena Vega",suspendida_en:null});
      notas.push({id:"nota-demo",ingreso_id:evento.id,momento:instanteEcuador(ayer+"T09:00"),turno:"M",responsable:"Dra. Elena Vega",nota:"Se registra la ingesta durante el turno.",monitoreo:{comida:"Comida húmeda"}});
    }
  }
  function ingresoLocal(id) {
    const v=eventos.find(x=>x.id===id && x.tipo==="hospitalizacion");
    if (!v?.abierta) throw new Error("La hospitalización está cerrada o ya no existe.");
    return v;
  }
  async function hoja(ingreso,dia,signal) {
    if (!demo) {
      const h=await rpc("pibe_hoja_identificada",{ingreso,dia},signal);
      if (!h) throw new Error("La hoja de hospitalización ya no está disponible.");
      return h;
    }
    const v=eventos.find(x=>x.id===ingreso);
    const orden=ordenes.filter(x=>x.ingreso_id===ingreso);
    return {jaula:v?.jaula??null,foto_id:pacientes.find(p=>p.id===v?.paciente_id)?.foto_id??null,abierta:!!v?.abierta,ordenes:orden.map(x=>({...x,unica_registrada:x.pauta==="unica"&&tomas.some(t=>t.orden_id===x.id)})),tomas:tomas.filter(t=>orden.some(o=>o.id===t.orden_id)&&fechaDia(t.programada)===dia),notas:notas.filter(n=>n.ingreso_id===ingreso&&fechaDia(n.momento)===dia).sort((a,b)=>Date.parse(b.momento)-Date.parse(a.momento))};
  }
  async function asignarJaula(ingreso,valor,previo) {
    const nueva=normalizarJaula(valor), anterior=normalizarJaula(previo);
    if (!demo) return rpc("pibe_asignar_jaula",{ingreso,nueva,anterior});
    const v=ingresoLocal(ingreso), actual=v.jaula??null;
    if (actual===nueva) return actual;
    if (actual!==anterior) throw errorCambio("Otro profesional cambió la jaula. Actualiza la hoja.");
    v.jaula=nueva;
    v.version++;
    return nueva;
  }
  async function prescribir(ingreso,datos) {
    if (!demo) return rpc("pibe_prescribir",{ingreso,datos});
    const v=ingresoLocal(ingreso);
    if (ordenes.some(o=>o.id===datos.id&&o.ingreso_id===ingreso)) return datos.id;
    if (Date.parse(datos.inicio)<Math.floor(Date.parse(v.inicio)/60000)*60000 || (datos.fin&&Date.parse(datos.fin)<Date.parse(datos.inicio))) throw new Error("Revisa las fechas de la prescripción con respecto al ingreso.");
    if (datos.reemplaza) {
      const vieja=ordenes.find(o=>o.id===datos.reemplaza&&o.ingreso_id===ingreso);
      if (!vieja||vieja.suspendida_en) throw errorCambio("La pauta ya cambió. Actualiza la hoja.");
      const corte=Math.floor(Date.now()/60000)*60000;
      if (Date.parse(datos.inicio)<corte || tomas.some(t=>t.orden_id===vieja.id&&Date.parse(t.programada)>=Date.parse(datos.inicio))) throw new Error("Elige una nueva hora de inicio posterior a las tomas ya registradas y a la hora actual.");
      vieja.suspendida_en=new Date(corte).toISOString(); vieja.retirada_por=datos.responsable;
    }
    ordenes.push({...datos,ingreso_id:ingreso,suspendida_en:null}); return datos.id;
  }
  async function suspender(ingreso,orden,responsable) {
    if (!demo) return rpc("pibe_suspender_orden",{ingreso,orden,responsable});
    ingresoLocal(ingreso);
    const o=ordenes.find(x=>x.id===orden&&x.ingreso_id===ingreso);
    if (!o) throw new Error("La orden no corresponde al ingreso.");
    if (!o.suspendida_en) {o.suspendida_en=ahora(); o.retirada_por=responsable;}
    return orden;
  }
  async function registrarToma(ingreso,datos) {
    if (!demo) return rpc("pibe_registrar_toma",{ingreso,datos});
    const v=ingresoLocal(ingreso), o=ordenes.find(x=>x.id===datos.orden_id&&x.ingreso_id===ingreso);
    const previa=tomas.find(t=>t.orden_id===datos.orden_id&&Date.parse(t.programada)===Date.parse(datos.programada));
    if (previa?.id===datos.id) return datos.id;
    if (previa) throw errorCambio("Esa dosis ya fue registrada. Actualiza para ver el registro.");
    const ts=Date.parse(datos.realizada), dia=fechaDia(datos.programada);
    if (!o || !horasDelDia(o,dia).includes(new Date(datos.programada).toISOString()) || ts>Date.now() || ts<Math.floor(Date.parse(v.inicio)/60000)*60000 || (o.suspendida_en && ts>=Date.parse(o.suspendida_en)) || dia>fechaDia(new Date())) throw new Error("Revisa la hora real y la vigencia de la pauta.");
    if (datos.estado==="omitida"&&!datos.nota?.trim()) throw new Error("Indica el motivo de la omisión.");
    tomas.push({...datos}); return datos.id;
  }
  async function agregarEvolucion(ingreso,datos) {
    if (!demo) return rpc("pibe_agregar_evolucion",{ingreso,datos});
    const v=ingresoLocal(ingreso);
    if (notas.some(n=>n.id===datos.id&&n.ingreso_id===ingreso)) return datos.id;
    const ts=Date.parse(datos.momento);
    if (ts>Date.now() || ts<Math.floor(Date.parse(v.inicio)/60000)*60000) throw new Error("Revisa la fecha de la evolución.");
    notas.push({...datos,ingreso_id:ingreso}); return datos.id;
  }
  function validarEdicion(anterior,siguiente) {
    if (!demo||!anterior) return;
    const ingreso=anterior.id, ord=ordenes.filter(o=>o.ingreso_id===ingreso), ev=notas.filter(n=>n.ingreso_id===ingreso);
    const grupo=t=>t==="control"?"consulta":t;
    if (grupo(anterior.tipo)!==grupo(siguiente.tipo)&&(Object.keys(anterior.detalle_clinico||{}).length||ord.length||ev.length)) throw new Error("Esta atención contiene datos clínicos. Crea otra atención para cambiar de tipo.");
    const nuevoInicio=Date.parse(instanteEcuador(siguiente.fecha_local));
    if (anterior.tipo==="hospitalizacion" && (ord.some(o=>Date.parse(o.inicio)<nuevoInicio)||ev.some(n=>Date.parse(n.momento)<nuevoInicio))) throw new Error("El ingreso debe ser anterior a sus registros.");
    if (anterior.abierta&&!siguiente.abierta) for (const o of ord) if (!o.suspendida_en) {o.suspendida_en=ahora();o.retirada_por=siguiente.profesional||"Cierre del ingreso";}
  }
  return {hoja,asignarJaula,prescribir,suspender,registrarToma,agregarEvolucion,validarEdicion};
}
