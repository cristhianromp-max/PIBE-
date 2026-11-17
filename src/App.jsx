import React,{useEffect,useState,useRef} from "react";
import {Camera,Search,Plus,Pencil,RefreshCw,ArrowLeft,ChevronRight,FolderOpen,Paperclip,Activity,FileText,X} from "lucide-react";
import {crearRepositorio,etiquetas,fechaCorta,fechaLocal,hora,edad,uuid} from "./datos.mjs";
import {config,marca} from "./config";
import "./estilos.css";
import {Boton,Campo} from "./Campos.jsx";
import {CamposClinicos,ValoresClinicos} from "./CamposClinicos.jsx";
import {AvatarPaciente,CampoJaula,EditorFoto} from "./Identificacion.jsx";
import {HojaHospital} from "./HojaHospital.jsx";
import {camposDe,extraerCampos} from "./registro.mjs";
const repo=crearRepositorio(config);
function Formulario({modelo,cerrar,guardado,recargar}){
 const {clase,d,pid}=modelo;const paciente=clase==="paciente",estudio=clase==="examen";
 const [tipo,Tipo]=useState(d.tipo||"consulta"),[enviando,Enviando]=useState(false),[error,ErrorF]=useState(""),[conflicto,Conflicto]=useState(false);
 const dialog=useRef(null),operacion=useRef(d.id||uuid()),ocupado=useRef(false),ultimoArchivo=useRef(null);
 useEffect(()=>{const el=dialog.current;if(el&&!el.open)el.showModal();return()=>{if(el?.open)el.close();};},[]);
 async function enviar(e){
  e.preventDefault();if(ocupado.current||conflicto)return;
  const datos=Object.fromEntries(new FormData(e.currentTarget));ocupado.current=true;Enviando(true);ErrorF("");
  try{
    if(estudio){
      const archivo=datos.archivo;if(!archivo?.size)throw Error("Selecciona un archivo.");
      const firma=[archivo.name,archivo.size,archivo.lastModified,datos.visita,datos.categoria].join("|");
      if(ultimoArchivo.current!==firma){operacion.current=uuid();ultimoArchivo.current=firma;}
      await repo.subir(operacion.current,datos.visita,archivo,datos.categoria);
    }else if(paciente){
      await repo.guardarPaciente({...datos,id:operacion.current,version:d.version||0,version_propietario:d.version_propietario||0});
    }else{
      const detalle_clinico=extraerCampos(datos,camposDe(tipo));
      const comunes=Object.fromEntries(Object.entries(datos).filter(([k])=>!k.startsWith("clin_")));
      await repo.guardarAtencion({...comunes,detalle_clinico,id:operacion.current,paciente_id:pid,version:d.version||0,abierta:tipo==="hospitalizacion"&&datos.abierta==="on"});
    }
    guardado(paciente?operacion.current:pid,estudio?"Examen adjuntado.":"Cambios guardados.",!paciente&&!estudio&&tipo==="hospitalizacion"?operacion.current:null);
  }catch(e){ErrorF(e.message||"No se pudo guardar.");if(e.codigo==="40001")Conflicto(true);}
  finally{ocupado.current=false;Enviando(false);}
 }
 return <dialog className={"ve-dialog "+(!paciente&&!estudio?"ve-dialog-clinico":"")} ref={dialog} onCancel={e=>{e.preventDefault();if(!ocupado.current)cerrar();}} aria-labelledby="titulo-form">
  <form onSubmit={enviar}><div className="ve-row"><h2 id="titulo-form">{estudio?"Adjuntar examen":paciente?(d.version?"Editar paciente":"Nuevo paciente"):(d.version?"Editar "+(etiquetas[tipo]||"atención").toLowerCase():tipo==="hospitalizacion"?"Nuevo ingreso":tipo==="consulta"?"Nueva consulta":"Nueva atención")}</h2><Boton icono={X} aria-label="Cerrar" onClick={cerrar} disabled={enviando}/></div>
  <div className="ve-campos">{paciente?<><Campo etiqueta="Nombre del paciente" nombre="nombre" valor={d.nombre} required maxLength={100}/><Campo etiqueta="Especie" nombre="especie" valor={d.especie||""} opciones={[["","Seleccionar"],...["Canino","Felino","Ave","Conejo","Otra",...([d.especie].filter(x=>x&&!["Canino","Felino","Ave","Conejo","Otra"].includes(x)))].map(v=>[v,v])]} required/><Campo etiqueta="Raza" nombre="raza" valor={d.raza}/><Campo etiqueta="Sexo" nombre="sexo" valor={d.sexo} opciones={[["","Sin registrar"],["Macho","Macho"],["Hembra","Hembra"],["Indeterminado","Indeterminado"]]}/><Campo etiqueta="Fecha de nacimiento" nombre="nacimiento" valor={d.nacimiento} tipo="date" max={fechaLocal().slice(0,10)}/><Campo etiqueta="Edad estimada" nombre="edad_estimada" valor={d.edad_estimada} placeholder="Si desconoces la fecha"/><Campo etiqueta="Propietario" nombre="propietario" valor={d.propietario} required maxLength={140}/><Campo etiqueta="Cédula" nombre="cedula" valor={d.cedula} minLength={3} maxLength={32}/><Campo etiqueta="Teléfono" nombre="telefono" valor={d.telefono} tipo="tel" maxLength={40}/>{d.version>0&&<p className="ve-meta ve-ancho">Los cambios del propietario se reflejan en sus otras mascotas.</p>}</>:estudio?<><Campo etiqueta="Visita a la que pertenece" nombre="visita" valor={d.visita} opciones={modelo.atenciones.map(a=>[a.id,fechaCorta(a.inicio)+" · "+a.titulo])} required/><Campo etiqueta="Tipo de archivo" nombre="categoria" valor="diagnostico" opciones={[["diagnostico","Estudio diagnóstico o PDF · conservar original"],["foto","Foto de seguimiento · optimizar tamaño"]]}/><label className="ve-field ve-ancho">Archivo<input type="file" name="archivo" accept="application/pdf,image/jpeg,image/png,image/webp" required/></label><p className="ve-meta ve-ancho">PDF, JPG, PNG o WebP. Máximo 20 MiB por archivo.</p></>:<><Campo etiqueta="Tipo de atención" nombre="tipo" valor={tipo} opciones={Object.entries(etiquetas)} onChange={e=>Tipo(e.target.value)}/><Campo etiqueta="Fecha y hora en Ecuador" nombre="fecha_local" tipo="datetime-local" valor={fechaLocal(d.inicio||new Date())} required/><Campo etiqueta={tipo==="hospitalizacion"?"Motivo de ingreso":"Motivo de la atención"} nombre="titulo" valor={d.titulo} required maxLength={200}/><Campo etiqueta="Profesional que atendió (opcional)" nombre="profesional" valor={d.profesional} list="ve-profesionales" maxLength={140}/><datalist id="ve-profesionales">{(modelo.profesionales||[]).map(n=><option key={n} value={n}/>)}</datalist><Campo etiqueta="Peso en kg" nombre="peso" tipo="number" min="0.001" max="9999.999" step="0.001" valor={d.peso}/>{tipo==="hospitalizacion"&&<CampoJaula valor={d.jaula}/>}{tipo==="hospitalizacion"&&<label className="ve-check"><input type="checkbox" name="abierta" defaultChecked={d.abierta??true}/> Hospitalización activa</label>}{d.abierta&&tipo==="hospitalizacion"&&<p className="ve-meta ve-ancho">Al cerrar el ingreso se suspenden sus pautas activas.</p>}<CamposClinicos tipo={tipo} datos={d.detalle_clinico||{}}/><div className="ve-ancho"><Campo etiqueta={tipo==="hospitalizacion"?"Observaciones de ingreso":"Observaciones"} nombre="resumen" tipo="textarea" valor={d.resumen}/></div></>}</div>
  {error&&<p className="ve-message" role="alert">{error}</p>}<footer className="ve-actions ve-last"><Boton onClick={cerrar} disabled={enviando}>Cancelar</Boton>{conflicto?<Boton principal onClick={()=>{cerrar();recargar();}}>Actualizar ficha</Boton>:<button type="submit" className="ve-button" disabled={enviando}>{enviando?"Guardando…":estudio?"Subir examen":"Guardar"}</button>}</footer></form></dialog>;
}
function Historia({ficha,abrir,volver,ingresoId,verIngreso,revision,recargar}){
 const android=globalThis.Capacitor?.getPlatform?.()==="android";
 const {p,atenciones,anexos}=ficha;const [filtro,Filtro]=useState("todos");const ultima=atenciones.find(a=>a.peso!=null);
 const profesionales=[...new Set(atenciones.map(a=>a.profesional).filter(Boolean))];
 const hospitalAbierto=atenciones.find(a=>a.tipo==="hospitalizacion"&&a.abierta);
 const admision=atenciones.find(a=>a.id===ingresoId&&a.tipo==="hospitalizacion");
 function formulario(d){abrir({clase:"atencion",d,pid:p.id,profesionales});}
 function editarFoto(actual=p.foto_id){abrir({clase:"foto",d:p,fotoActual:actual??null});}
 if(admision) return <HojaHospital paciente={p} admision={admision} profesionales={profesionales} repo={repo.hospital} fotos={repo.fotos} editarFoto={editarFoto} actualizarFicha={recargar} volver={()=>verIngreso("")} editar={()=>formulario(admision)} revision={revision}/>;
 const campos=[["Propietario",p.propietario],["Cédula",p.cedula],["Teléfono",p.telefono],["Sexo",p.sexo],["Raza",p.raza],["Edad",edad(p.nacimiento,p.edad_estimada)],["Último peso",ultima&&Number(ultima.peso).toLocaleString("es-EC")+" kg · "+fechaCorta(ultima.inicio)]];
 const lista=atenciones.filter(a=>filtro==="todos"||a.tipo===filtro);
 return <div className="ve-paper"><div><button className="ve-link ve-back" onClick={volver}><ArrowLeft size={16}/> Pacientes</button><section className="ve-panel"><div className="ve-cardtop"><div className="ve-titlerow"><div className="ve-identity"><AvatarPaciente paciente={p} src={repo.fotos.url(p.id,p.foto_id)}/><div><p className="ve-meta">{p.codigo} · {p.especie}</p><h2>{p.nombre}</h2></div></div><div className="ve-actions"><Boton icono={Camera} onClick={()=>editarFoto()}>{p.foto_id?"Cambiar foto":"Añadir foto"}</Boton><Boton icono={Pencil} onClick={()=>abrir({clase:"paciente",d:p,pid:p.id})}>Editar ficha</Boton></div></div>{hospitalAbierto&&<div className="ve-ingreso-activo"><span><Activity size={17}/> Hospitalización activa · {hospitalAbierto.jaula||"Jaula sin asignar"}</span><Boton onClick={()=>verIngreso(hospitalAbierto.id)}>Abrir hoja de hospitalización</Boton></div>}</div><dl className="ve-facts">{campos.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||"Sin registrar"}</dd></div>)}</dl></section></div>
 <section className="ve-panel ve-pad"><div className="ve-row"><h2>Historia clínica</h2><div className="ve-actions ve-actions-clinicas"><Boton principal icono={Plus} onClick={()=>formulario({tipo:"consulta"})}>Nueva consulta</Boton>{!hospitalAbierto&&<Boton icono={Activity} onClick={()=>formulario({tipo:"hospitalizacion"})}>Nuevo ingreso</Boton>}<Boton onClick={()=>formulario({tipo:"control"})}>Otra atención</Boton></div></div><div className="ve-last"><select className="ve-select" aria-label="Filtrar atenciones" value={filtro} onChange={e=>Filtro(e.target.value)}><option value="todos">Todas las atenciones</option>{Object.entries(etiquetas).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
 {lista.length?<ol className="ve-timeline">{lista.map(a=><li className="ve-entry" key={a.id}><span className="ve-marker"><FileText size={17}/></span><details><summary><span><span className="ve-meta">{fechaCorta(a.inicio)} · {hora(a.inicio)} · {etiquetas[a.tipo]}</span><strong>{a.titulo}</strong></span><ChevronRight size={15}/></summary><ValoresClinicos datos={a.detalle_clinico||{}} campos={camposDe(a.tipo)}/>{a.resumen&&<p className="ve-detailtext">{a.resumen}</p>}<p className="ve-meta">{a.profesional||"Profesional sin registrar"}</p><div className="ve-actions ve-spaced">{a.tipo==="hospitalizacion"&&<Boton principal icono={Activity} onClick={()=>verIngreso(a.id)}>Abrir hoja de hospitalización</Boton>}<Boton icono={Pencil} onClick={()=>formulario(a)}>Editar atención</Boton><Boton icono={Paperclip} onClick={()=>abrir({clase:"examen",d:{visita:a.id},pid:p.id,atenciones})}>Adjuntar examen</Boton></div></details></li>)}</ol>:<p className="ve-sub">{filtro==="todos"?"Aún no hay atenciones.":"No hay atenciones de ese tipo."}</p>}</section>
 <section className="ve-panel ve-pad"><div className="ve-row"><h2>Exámenes</h2>{atenciones.length>0&&<Boton icono={Paperclip} onClick={()=>abrir({clase:"examen",d:{visita:atenciones[0].id},pid:p.id,atenciones})}>Adjuntar</Boton>}</div>{anexos.length?anexos.map(x=><div className="ve-archivo" key={x.id}><div><strong>{x.nombre}</strong><p className="ve-meta">{atenciones.find(a=>a.id===x.atencion_id)?.titulo} · {Math.max(1,Math.round(x.bytes/1024))} KB</p></div><div className="ve-actions"><a href={repo.enlace(x,false)} target={android?"_self":"_blank"} rel="noopener noreferrer" className="ve-link">Ver</a><a href={repo.enlace(x,true)} download={android?undefined:x.nombre} className="ve-link">Descargar</a></div></div>):<p className="ve-sub">{atenciones.length?"Aún no se han adjuntado exámenes.":"Crea una atención para asociarle un examen."}</p>}</section></div>;
}
export default function App(){
 const [q,Q]=useState(""),[pag,Pag]=useState(0),[id,Id]=useState(""),[rev,Rev]=useState(0),[resultado,R]=useState({items:[],mas:false,carga:true}),[ficha,F]=useState(null),[errFicha,EF]=useState(""),[modal,M]=useState(null),[aviso,A]=useState("");
 const [ingresoId,VerIngreso]=useState("");
 function recargar(){Rev(n=>n+1);}
 useEffect(()=>{const fn=()=>recargar();window.addEventListener("focus",fn);return()=>window.removeEventListener("focus",fn);},[]);
 useEffect(()=>{const ac=new AbortController();let activo=true;R({items:[],mas:false,carga:true});
 const t=setTimeout(async()=>{try{const r=await repo.listar(q,pag,ac.signal);if(activo)R({...r,carga:false});}catch(e){if(activo)R({items:[],mas:false,carga:false,error:e.message});}},repo.demo?0:160);
 return()=>{activo=false;clearTimeout(t);ac.abort();};},[q,pag,rev]);
 useEffect(()=>{if(!id){F(null);EF("");return;}const ac=new AbortController();let activo=true;EF("");
 repo.expediente(id,ac.signal).then(r=>{if(activo){if(r.p)F(r);else{F(null);EF("No se encontró el paciente.");}}}).catch(e=>{if(activo){F(null);EF(e.message);}});
 return()=>{activo=false;ac.abort();};},[id,rev]);
 useEffect(()=>{
   function volverEnAndroid(e){
     const dialogo=document.querySelector("dialog[open]");
     if(dialogo){
       e.preventDefault();
       dialogo.dispatchEvent(new Event("cancel",{cancelable:true,bubbles:false}));
     }else if(ingresoId){
       e.preventDefault();VerIngreso("");
     }else if(id){
       e.preventDefault();seleccionar("");
     }
   }
   window.addEventListener("elpibe:volver",volverEnAndroid);
   return ()=>window.removeEventListener("elpibe:volver",volverEnAndroid);
 },[id,ingresoId]);
 function seleccionar(v){VerIngreso("");if(v!==id)F(null);EF("");Id(v);A("");}
 function guardar(pid,msg,ingreso){if(ingreso)VerIngreso(ingreso);M(null);Q("");Pag(0);if(id!==pid)F(null);Id(pid);A(msg);recargar();}
 return <div className="ve-app"><header className="ve-header"><div className="ve-bar"><div className="ve-brand"><img src={marca} alt="Clínica Veterinaria El Pibe"/><b>Área clínica</b></div><span className="ve-badge">{repo.demo?"Demostración":"Clínica El Pibe"}</span></div></header>
 <main className="ve-container"><div className="ve-row"><div><h1 className="ve-heading">Expedientes clínicos</h1><p className="ve-sub">{repo.demo?"Datos ficticios. Los cambios duran mientras esta vista está abierta.":"Directorio e historia clínica compartida."}</p></div><div className="ve-actions"><Boton icono={RefreshCw} aria-label="Actualizar expedientes" onClick={recargar}/><Boton principal icono={Plus} onClick={()=>M({clase:"paciente",d:{}})}>Nuevo paciente</Boton></div></div>{aviso&&<p className="ve-confirm" role="status">{aviso}</p>}
 <div className={"ve-main "+(id?"has-patient":"")}><section className="ve-panel ve-directory"><div className="ve-pad"><h2>Pacientes</h2><div className="ve-search"><Search size={17}/><input type="search" value={q} aria-label="Buscar por paciente, propietario o cédula" placeholder="Paciente, propietario o cédula" onChange={e=>{Q(e.target.value);Pag(0);seleccionar("");}}/></div><span role="status" className="ve-meta">{resultado.carga?"Buscando…":resultado.items.length+" en esta página"}</span></div>
 <div className="ve-patients">{resultado.items.map(p=><button className="ve-patient" key={p.id} aria-pressed={p.id===id} onClick={()=>seleccionar(p.id)}><AvatarPaciente pequeno paciente={p} src={repo.fotos.url(p.id,p.foto_id)}/><span className="ve-grow"><strong>{p.nombre}</strong><span className="ve-meta">{p.especie} · {p.propietario}</span></span><ChevronRight size={14}/></button>)}</div>{resultado.error?<div className="ve-empty" role="alert">{resultado.error}<Boton onClick={recargar}>Reintentar</Boton></div>:!resultado.carga&&!resultado.items.length&&<div className="ve-empty"><strong>{q?"Sin coincidencias":"Directorio vacío"}</strong><span>{q?"Prueba con otro nombre o cédula.":"Usa Nuevo paciente para abrir la primera ficha."}</span></div>}
 {(pag>0||resultado.mas)&&<div className="ve-actions ve-pad">{pag>0&&<Boton onClick={()=>Pag(n=>n-1)}>Anterior</Boton>}{resultado.mas&&<Boton onClick={()=>Pag(n=>n+1)}>Siguiente</Boton>}</div>}</section>
 {id&&ficha?.p?.id===id?<Historia key={id} ficha={ficha} abrir={M} ingresoId={ingresoId} verIngreso={VerIngreso} revision={rev} recargar={recargar} volver={()=>seleccionar("")}/>:<div className="ve-paper"><div className="ve-panel ve-empty"><FolderOpen size={26}/><h2>{errFicha||(!id?"Selecciona un paciente":"Cargando ficha…")}</h2>{!id&&<span>Su historia aparecerá aquí.</span>}{errFicha&&<><Boton onClick={recargar}>Reintentar</Boton><Boton onClick={()=>seleccionar("")}>Volver</Boton></>}</div></div>}</div></main>
 {modal?.clase==="foto"?<EditorFoto paciente={modal.d} fotoActual={modal.fotoActual} fotos={repo.fotos} cerrar={()=>M(null)} recargar={recargar} guardado={fotoId=>{
   const pid=modal.d.id;
   F(prev=>prev?.p.id===pid?{...prev,p:{...prev.p,foto_id:fotoId}}:prev);
   guardar(pid,"Foto de identificación guardada.");
 }}/>:modal&&<Formulario modelo={modal} cerrar={()=>M(null)} guardado={guardar} recargar={recargar}/>}</div>;
}
