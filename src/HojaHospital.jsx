import React,{useState,useRef,useEffect} from "react";
import {Camera,Pill,ArrowLeft,Plus,Pencil,Check,RefreshCw,X,ClipboardList} from "lucide-react";
import {Boton,Campo} from "./Campos.jsx";
import {AvatarPaciente,JaulaIngreso} from "./Identificacion.jsx";
import {GrupoClinico,ValoresClinicos} from "./CamposClinicos.jsx";
import {fechaCorta,fechaLocal,hora,uuid} from "./datos.mjs";
import {agendaDelDia,camposIngreso,camposMonitoreo,extraerCampos,frecuencia,instanteEcuador,minutosDe,moverDia,textoMinuto,turnos} from "./registro.mjs";

const vias=["Vía oral (VO)","Intravenosa (IV)","Subcutánea (SC)","Intramuscular (IM)","Tópica","Oftálmica","Ótica","Inhalatoria","Rectal"];
const OPCIONES_UBICACION=[
  ["","Seleccionar ubicación"],
  ["Olón","Olón"],
  ["La Libertad","La Libertad"],
  ["Santa Elena","Santa Elena"]
];
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
      <Campo etiqueta="Profesional que suspende" nombre="responsable" required maxLength={140} list="ve-personal"/>
    </>}</div>
    {mensaje&&<p className="ve-message" role="alert">{mensaje}</p>}
    <footer className="ve-actions ve-last"><Boton disabled={ocupado} onClick={cerrar}>{conflicto?"Volver a la hoja":"Cancelar"}</Boton>
      {!conflicto&&<button className="ve-button" type="submit" disabled={ocupado}>{ocupado?"Guardando…":esToma?"Confirmar registro":esNota?"Guardar evolución":esOrden?"Guardar pauta":"Confirmar suspensión"}</button>}</footer></form>
  </dialog>;
}

function ListaOrdenes({hoja,abrir}) {
  const vivas=[],anteriores=[];
  for (const o of hoja.ordenes) {
    const estado=estadoPauta(o,hoja.tomas);
    (estado==="Activa"||estado==="Programada"?vivas:anteriores).push({o,estado});
  }
  const fila=({o,estado},editable)=><article className="ve-pauta" key={o.id}>
    <div className="ve-pauta-cuerpo"><div className="ve-row"><strong>{o.medicina}</strong><span className={"ve-estado "+(estado==="Activa"?"ok":"")}>{estado}</span></div>
    <p>{o.dosis} · {o.via}</p><p className="ve-meta">{frecuencia(o)} · Desde {instanteCorto(o.inicio)}{o.fin?" · Hasta "+instanteCorto(o.fin):""}</p>
    <p className="ve-meta">Indicada por {o.responsable}{o.suspendida_en?" · Suspendida "+instanteCorto(o.suspendida_en)+" · "+o.retirada_por:""}</p></div>
    {editable&&hoja.abierta&&<div className="ve-miniacciones"><button type="button" onClick={()=>abrir({tipo:"orden",orden:o})}>Editar pauta</button>
    <button type="button" onClick={()=>abrir({tipo:"suspender",orden:o})}>Suspender</button></div>}
  </article>;
  return <section className="ve-bloque"><div className="ve-row"><h3>Medicación activa</h3>{hoja.abierta&&<Boton principal icono={Plus} onClick={()=>abrir({tipo:"orden"})}>Indicar medicación</Boton>}</div>
    {vivas.length?vivas.map(x=>fila(x,true)):<p className="ve-sub">Sin pautas activas o programadas.</p>}
    {anteriores.length>0&&<details className="ve-archivo-pautas"><summary>Pautas anteriores ({anteriores.length})</summary>{anteriores.map(x=>fila(x,false))}</details>}
  </section>;
}

function Agenda({hoja,dia,abrir}) {
  const filas=agendaDelDia(hoja,dia);
  return <section className="ve-bloque"><div className="ve-row"><h3>Administración del día</h3><span className="ve-meta">{filas.filter(x=>!x.toma).length} pendientes</span></div>
    {filas.length?<ol className="ve-agenda">{filas.map(({orden,programada,toma})=><li key={orden.id+programada}>
      <time dateTime={programada}>{hora(programada)}</time><div className="ve-agenda-info"><strong>{orden.medicina}</strong>
      <p>{orden.dosis} · {orden.via}</p><small>{frecuencia(orden)}</small>
      {toma&&<div className="ve-toma-firmada"><span className={"ve-estado "+(toma.estado==="administrada"?"ok":"omitida")}>{toma.estado==="administrada"?"Administrada":"Omitida"}</span>
        <span>{instanteCorto(toma.realizada)} · {toma.responsable} · {nombreTurno(toma.turno)}</span>{toma.nota&&<p>{toma.nota}</p>}</div>}
      </div>{!toma&&(hoja.abierta&&dia<=fechaHoy()?<Boton icono={Check} onClick={()=>abrir({tipo:"toma",orden,programada})}>Registrar dosis</Boton>:<span className="ve-meta">Sin registro</span>)}
    </li>)}</ol>:<p className="ve-sub">No hay dosis programadas para esta fecha.</p>}
  </section>;
}

function Evoluciones({hoja,dia,abrir}) {
  return <section className="ve-bloque"><div className="ve-row"><h3>Evoluciones del día</h3>{hoja.abierta&&dia<=fechaHoy()&&<Boton principal icono={Plus} onClick={()=>abrir({tipo:"nota"})}>Añadir evolución</Boton>}</div>
    {hoja.notas.length?<ol className="ve-evoluciones">{hoja.notas.map(n=><li key={n.id}><div className="ve-row"><strong>{hora(n.momento)} · {n.responsable}</strong><span className="ve-estado">{nombreTurno(n.turno)}</span></div>
      {n.nota&&<p className="ve-nota">{n.nota}</p>}<ValoresClinicos datos={n.monitoreo} campos={camposMonitoreo}/></li>)}</ol>:<p className="ve-sub">Todavía no hay observaciones registradas para esta fecha.</p>}
  </section>;
}

export function HojaHospital({paciente,admision,profesionales,repo,fotos,editarFoto,actualizarFicha,volver,editar,revision,onGuardarUbicacion}) {
  const [dia,Dia]=useState(fechaHoy),[tab,Tab]=useState("medicacion"),[rev,Rev]=useState(0);
  const [resultado,Resultado]=useState(null),[error,ErrorHoja]=useState(""),[aviso,Aviso]=useState(""),[accion,Accion]=useState(null);
  const datos=admision.detalle_clinico||{};
  const [ubicacionActual,setUbicacionActual]=useState(datos.ubicacion||"");
  const [guardandoUbicacion,setGuardandoUbicacion]=useState(false);

  useEffect(()=>{
    setUbicacionActual(datos.ubicacion||"");
  },[admision.id,datos.ubicacion]);

  function actualizar(){Rev(n=>n+1);}

  useEffect(()=>{
    const ac=new AbortController(); let vigente=true;
    async function leer() {
      try {const h=await repo.hoja(admision.id,dia,ac.signal); if(vigente){Resultado({id:admision.id,dia,hoja:h}); ErrorHoja("");}}
      catch(e){if(vigente) ErrorHoja(e.message||"No se pudo leer la hoja.");}
    }
    leer();
    const timer=setInterval(()=>{if(!document.hidden)actualizar();},30000);
    return ()=>{vigente=false;ac.abort();clearInterval(timer);};
  },[admision.id,dia,rev,revision]);

  const h=resultado?.id===admision.id&&resultado?.dia===dia?resultado.hoja:null;
  function cambiarDia(nuevo){if(nuevo){Dia(nuevo);Aviso("");ErrorHoja("");}}
  function guardado(mensaje,verDia){Accion(null);Dia(verDia);Aviso(mensaje);actualizar();}

  const fotoId=paciente.foto_id||h?.foto_id||null, jaula=h?h.jaula:admision.jaula;
  const ingresoAbierto=h?.abierta??admision.abierta;

  function jaulaGuardada(nueva) {
    Resultado(prev=>prev&&{...prev,hoja:{...prev.hoja,jaula:nueva}});
    Aviso("Jaula actualizada.");actualizar();actualizarFicha();
  }

  async function cambiarUbicacion(e) {
    const nueva=e.target.value;
    const anterior=ubicacionActual;
    setUbicacionActual(nueva);
    if (!onGuardarUbicacion) return;
    setGuardandoUbicacion(true);
    ErrorHoja("");
    try {
      await onGuardarUbicacion(nueva);
      Aviso("Ubicación actualizada.");
    } catch (err) {
      setUbicacionActual(anterior);
      ErrorHoja(err.message||"No se pudo guardar la ubicación.");
    } finally {
      setGuardandoUbicacion(false);
    }
  }

  const opcionesUbicacion=ubicacionActual&&!OPCIONES_UBICACION.some(([v])=>v===ubicacionActual)
    ?[...OPCIONES_UBICACION,[ubicacionActual,ubicacionActual]]
    :OPCIONES_UBICACION;

  const camposIngresoSinUbicacion=camposIngreso.filter(c=>c.nombre!=="ubicacion");
  const personal=[...new Set([...profesionales,...(h?.ordenes||[]).map(x=>x.responsable),...(h?.notas||[]).map(x=>x.responsable),...(h?.tomas||[]).map(x=>x.responsable)].filter(Boolean))];

  return <div className="ve-paper"><section className="ve-panel ve-hoja">
    <div className="ve-sala-cab"><button type="button" className="ve-link" onClick={volver}><ArrowLeft size={16}/> Historia de {paciente.nombre}</button>
      <div className="ve-row ve-cab-identidad"><div className="ve-identity"><AvatarPaciente paciente={paciente} src={fotos.url(paciente.id,fotoId)}/><div><p className="ve-meta">Hospitalización · {paciente.codigo}</p><h2>{paciente.nombre}</h2></div></div><div className="ve-actions"><Boton icono={Camera} onClick={()=>editarFoto(fotoId)}>{fotoId?"Cambiar foto":"Añadir foto"}</Boton><span className={"ve-estado "+(ingresoAbierto?"ok":"")}>{ingresoAbierto?"Ingreso activo":"Ingreso cerrado"}</span></div></div>
      <JaulaIngreso ingreso={admision.id} actual={jaula} abierta={ingresoAbierto} asignar={repo.asignarJaula} alCambiar={jaulaGuardada} actualizar={actualizar}/>
      <p className="ve-sala-motivo">{admision.titulo}</p><div className="ve-sala-datos"><span>Ingreso · {instanteCorto(admision.inicio)}</span>{ubicacionActual&&<span>Ubicación · {ubicacionActual}</span>}{admision.peso!=null&&<span>{admision.peso} kg</span>}{admision.profesional&&<span>{admision.profesional}</span>}</div>
      <details className="ve-ingreso-detalles">
        <summary>Datos de ingreso</summary>
        {ingresoAbierto&&(
          <div style={{maxWidth:"280px",margin:"0.6rem 0"}}>
            <Campo
              etiqueta={guardandoUbicacion?"Detalle de ubicación (guardando…)":"Detalle de ubicación (opcional)"}
              nombre="ubicacion"
              valor={ubicacionActual}
              opciones={opcionesUbicacion}
              onChange={cambiarUbicacion}
              disabled={guardandoUbicacion}
            />
          </div>
        )}
        <ValoresClinicos campos={ingresoAbierto?camposIngresoSinUbicacion:camposIngreso} datos={datos}/>
        {admision.resumen&&<p className="ve-nota">{admision.resumen}</p>}
        <Boton icono={Pencil} onClick={editar}>Editar ingreso</Boton>
      </details>
    </div>
    <nav className="ve-pestanas" aria-label="Hoja de hospitalización"><button aria-pressed={tab==="medicacion"} onClick={()=>Tab("medicacion")}><Pill size={17}/> Medicación</button><button aria-pressed={tab==="evolucion"} onClick={()=>Tab("evolucion")}><ClipboardList size={17}/> Evolución y monitoreo</button></nav>
    <div className="ve-turno-cuerpo">
      <div className="ve-dia"><label className="ve-field">Fecha de la hoja<input type="date" value={dia} onChange={e=>cambiarDia(e.target.value)}/></label><div className="ve-dia-botones">
        <button aria-label="Día anterior" onClick={()=>cambiarDia(moverDia(dia,-1))}>‹</button><button onClick={()=>cambiarDia(fechaHoy())}>Hoy</button><button aria-label="Día siguiente" onClick={()=>cambiarDia(moverDia(dia,1))}>›</button><Boton icono={RefreshCw} aria-label="Actualizar hoja" onClick={actualizar}/></div></div>
      {aviso&&<p className="ve-confirm" role="status">{aviso}</p>}
      {error&&<div role="alert" className="ve-message">{error} <Boton onClick={actualizar}>Reintentar</Boton></div>}
      {!h&&!error&&<p className="ve-sub" role="status">Cargando hoja…</p>}
      {h&&(tab==="medicacion"?<><ListaOrdenes hoja={h} abrir={Accion}/><Agenda hoja={h} dia={dia} abrir={Accion}/></>:<Evoluciones hoja={h} dia={dia} abrir={Accion}/>)}
    </div></section>
    {accion&&<ModalHospital accion={accion} admision={admision} paciente={paciente} personal={personal} repo={repo} cerrar={()=>Accion(null)} actualizar={actualizar} guardado={guardado} dia={dia}/>}
  </div>;
}
