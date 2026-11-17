import React,{useState,useRef,useEffect} from "react";
import {Camera,Pill,ArrowLeft,Plus,Pencil,Check,RefreshCw,X,ClipboardList} from "lucide-react";
import {Boton,Campo} from "./Campos.jsx";
import {AvatarPaciente,JaulaIngreso} from "./Identificacion.jsx";
import {GrupoClinico,ValoresClinicos} from "./CamposClinicos.jsx";
import {fechaCorta,fechaLocal,hora,uuid} from "./datos.mjs";
import {agendaDelDia,camposIngreso,camposMonitoreo,extraerCampos,frecuencia,instanteEcuador,minutosDe,moverDia,textoMinuto,turnos} from "./registro.mjs";

const vias=["Vía oral (VO)","Intravenosa (IV)","Subcutánea (SC)","Intramuscular (IM)","Tópica","Oftálmica","Ótica","Inhalatoria","Rectal"];
const fechaHoy=()=>fechaLocal().slice(0,10);
const nombreTurno=t=>turnos[t]||t;
const instanteCorto=v=>fechaCorta(v)+" · "+hora(v);
function estadoPauta(o,tomas) {
  if (o.suspendida_en) return "Suspendida";
  if (o.pauta==="unica" && (tomas.some(t=>t.orden_id===o.id)||o.unica_registrada)) return "Finalizada";
  if (o.fin && Date.parse(o.fin)<Date.now()) return "Finalizada";
  if (Date.parse(o.inicio)>Date.now()) return "Programada";
  return "Activa";
}
function FranjaTurno() {
  return <Campo etiqueta="Turno" nombre="turno" opciones={[["","Seleccionar turno"],...Object.entries(turnos)]} required/>;
}
function CamposOrden({orden,admision}) {
  const [pauta,cambiarPauta]=useState(orden?.pauta||"horarios");
  const [horarios,cambiarHorarios]=useState(orden?.minutos?.length?orden.minutos.map(textoMinuto):[""]);
  const inicio=orden?fechaLocal(Math.max(Date.now(),Date.parse(orden.inicio))):fechaLocal(Math.max(Date.now(),Date.parse(admision.inicio)));
  return <>
    <Campo etiqueta="Medicamento" nombre="medicina" valor={orden?.medicina} required maxLength={180}/>
    <Campo etiqueta="Dosis y unidad" nombre="dosis" valor={orden?.dosis} placeholder="Cantidad y unidad indicadas" required maxLength={120}/>
    <div><Campo etiqueta="Vía de administración" nombre="via" list="ve-vias" valor={orden?.via} required maxLength={100}/><datalist id="ve-vias">{vias.map(x=><option key={x} value={x}/>)}</datalist></div>
    <Campo etiqueta="Frecuencia" nombre="pauta" valor={pauta} onChange={e=>cambiarPauta(e.target.value)} opciones={[["horarios","Horarios fijos cada día"],["intervalo","Cada cierto número de horas"],["unica","Dosis única"]]}/>
    {pauta==="intervalo"&&<Campo etiqueta="Intervalo (horas)" nombre="intervalo_horas" tipo="number" min="1" max="8760" step="1" valor={orden?.intervalo_horas} required/>}
    <Campo etiqueta={pauta==="horarios"?"Pauta vigente desde":"Primera dosis"} nombre="inicio" tipo="datetime-local" valor={inicio} required/>
    {pauta!=="unica"&&<Campo etiqueta="Vigente hasta (opcional)" nombre="fin" tipo="datetime-local" valor={orden?.fin&&Date.parse(orden.fin)>Date.now()?fechaLocal(orden.fin):""}/>}
    {pauta==="horarios"&&<fieldset className="ve-grupo ve-ancho"><legend>Horarios de cada día</legend><div className="ve-horas">{horarios.map((v,i)=><div className="ve-hora" key={i}><label className="ve-field">Hora {i+1}<input aria-label={"Hora "+(i+1)} name="horario" type="time" value={v} required onChange={e=>cambiarHorarios(h=>h.map((x,j)=>j===i?e.target.value:x))}/></label>
      {horarios.length>1&&<Boton aria-label={"Quitar hora "+(i+1)} icono={X} onClick={()=>cambiarHorarios(h=>h.filter((_,j)=>i!==j))}/>}</div>)}</div><Boton icono={Plus} onClick={()=>cambiarHorarios(h=>[...h,""])}>Añadir horario</Boton></fieldset>}
    {orden&&<p className="ve-meta ve-ancho">Al guardar, la pauta anterior se suspende desde ahora. Sus registros quedan en la fecha en que se realizaron.</p>}
    <Campo etiqueta="Profesional que indica la pauta" nombre="responsable" required maxLength={140} list="ve-personal"/>
  </>;
}
function ModalHospital({accion,admision,paciente,personal,repo,cerrar,guardado,actualizar,dia}) {
  const dialog=useRef(null), enviando=useRef(false), operacion=useRef(null);
  if (!operacion.current) operacion.current=uuid();
  const [ocupado,Ocupado]=useState(false), [mensaje,Mensaje]=useState(""),[conflicto,Conflicto]=useState(false);
  const [estado,Estado]=useState("administrada");
  useEffect(()=>{const el=dialog.current;el.showModal();return()=>{if(el.open)el.close();};},[]);
  const esOrden=accion.tipo==="orden", esToma=accion.tipo==="toma", esNota=accion.tipo==="nota";
  const orden=accion.orden;
  const titulo=esOrden?(orden?"Editar pauta":"Indicar medicación"):esToma?"Registrar dosis":esNota?"Añadir evolución":"Suspender medicación";
  const localAhora=fechaLocal(), horaNota=dia===fechaHoy()?localAhora:dia+"T"+localAhora.slice(11);
  async function enviar(e) {
    e.preventDefault(); if(enviando.current||conflicto) return;
    const form=new FormData(e.currentTarget), v=Object.fromEntries(form);
    enviando.current=true; Ocupado(true); Mensaje("");
    try {
      const id=operacion.current, resp=String(v.responsable||"").trim();
      if (!resp) throw new Error("Indica el nombre del responsable.");
      let verDia=dia;
      if (esOrden) {
        const inicio=instanteEcuador(v.inicio);
        const minutos=v.pauta==="horarios"?form.getAll("horario").map(minutosDe).sort((a,b)=>a-b):[];
        if (new Set(minutos).size!==minutos.length) throw new Error("Hay horarios repetidos en la pauta.");
        const fin=v.fin?instanteEcuador(v.fin):null;
        if (fin && fin<inicio) throw new Error("La fecha final debe ser posterior o igual al inicio.");
        const datos={id,reemplaza:orden?.id||null,medicina:v.medicina.trim(),dosis:v.dosis.trim(),via:v.via.trim(),pauta:v.pauta,
          intervalo_horas:v.pauta==="intervalo"?Number(v.intervalo_horas):null,minutos,inicio,fin,responsable:resp};
        if (!datos.medicina||!datos.dosis||!datos.via) throw new Error("Completa el medicamento, la dosis y la vía.");
        await repo.prescribir(admision.id,datos);
        verDia=v.inicio.slice(0,10);
      } else if (esToma) {
        if(estado==="omitida"&&!v.nota.trim()) throw new Error("Escribe el motivo de la omisión.");
        await repo.registrarToma(admision.id,{id,orden_id:orden.id,programada:accion.programada,realizada:instanteEcuador(v.realizada),estado,turno:v.turno,responsable:resp,nota:v.nota.trim()});
      } else if (esNota) {
        const monitoreo=extraerCampos(v,camposMonitoreo);
        if (!v.nota.trim()&&!Object.keys(monitoreo).length) throw new Error("Añade una observación o al menos un dato de monitoreo.");
        await repo.agregarEvolucion(admision.id,{id,momento:instanteEcuador(v.momento),turno:v.turno,responsable:resp,nota:v.nota.trim(),monitoreo});
        verDia=v.momento.slice(0,10);
      } else await repo.suspender(admision.id,orden.id,resp);
      guardado(esOrden?"Pauta guardada.":esToma?(estado==="administrada"?"Administración registrada.":"Omisión registrada."):esNota?"Evolución añadida.":"Medicación suspendida.",verDia);
    } catch(error) { Mensaje(error.message); if(error.codigo==="40001") {Conflicto(true);actualizar();} }
    finally {enviando.current=false; Ocupado(false);}
  }
  return <dialog ref={dialog} className="ve-dialog ve-dialog-clinico" aria-labelledby="dialog-hospital" onCancel={e=>{e.preventDefault();if(!enviando.current)cerrar();}}>
    <form onSubmit={enviar}><header className="ve-row"><div><p className="ve-meta">{paciente.nombre} · Hospitalización</p><h2 id="dialog-hospital">{titulo}</h2></div><Boton icono={X} aria-label="Cerrar" disabled={ocupado} onClick={cerrar}/></header>
    <datalist id="ve-personal">{personal.map(n=><option key={n} value={n}/>)}</datalist>
    <div className="ve-campos">{esOrden?<CamposOrden orden={orden} admision={admision}/>:esToma?<>
      <div className="ve-orden-resumen ve-ancho"><strong>{orden.medicina}</strong><span>{orden.dosis} · {orden.via}</span><span>Prevista para {instanteCorto(accion.programada)}</span></div>
      <Campo etiqueta="Resultado" nombre="estado" valor={estado} onChange={e=>Estado(e.target.value)} opciones={[["administrada","Administrada"],["omitida","Omitida"]]}/>
      <Campo etiqueta="Fecha y hora real" nombre="realizada" tipo="datetime-local" valor={dia===fechaHoy()?localAhora:""} min={fechaLocal(admision.inicio)} required/>
      <FranjaTurno/><Campo etiqueta="Responsable del registro" nombre="responsable" required maxLength={140} list="ve-personal"/>
      <div className="ve-ancho"><Campo etiqueta={estado==="omitida"?"Motivo de la omisión":"Observación (opcional)"} nombre="nota" tipo="textarea" maxLength={12000} required={estado==="omitida"}/></div>
    </>:esNota?<>
      <Campo etiqueta="Fecha y hora del monitoreo" nombre="momento" tipo="datetime-local" valor={horaNota} min={fechaLocal(admision.inicio)} required/>
      <FranjaTurno/><Campo etiqueta="Internista responsable" nombre="responsable" required maxLength={140} list="ve-personal"/>
      <div className="ve-ancho"><Campo etiqueta="Observaciones del paciente" nombre="nota" tipo="textarea" maxLength={12000}/></div>
      <GrupoClinico titulo="Monitoreo del turno" campos={camposMonitoreo} datos={{}} prefijo="monitoreo"/>
    </>:<>
      <div className="ve-orden-resumen ve-ancho"><strong>{orden.medicina}</strong><span>{orden.dosis} · {orden.via} · {frecuencia(orden)}</span></div>
      <p className="ve-meta ve-ancho">La suspensión retira las próximas dosis de la hoja. Las administraciones ya registradas siguen visibles.</p>
      <Campo etiqueta="Profesional que suspende" nombre="responsable" required maxLength={14
