import React,{useState,useRef,useEffect} from "react";
import {Camera,ImagePlus,PawPrint,X} from "lucide-react";
import {Boton,Campo} from "./Campos.jsx";
import {comprimirIdentificacion,jaulas} from "./identificacion.mjs";

export function AvatarPaciente({paciente,src,pequeno=false}) {
  const [fallida,Fallida]=useState(null);
  return <span className={"ve-avatar-paciente "+(pequeno?"ve-avatar-mini ":"")+(paciente.especie==="Canino"?"ve-avatar-canino":"")}>
    {src&&fallida!==src?<img src={src} alt={pequeno?"":"Foto de "+paciente.nombre} loading={pequeno?"lazy":"eager"} decoding="async" onError={()=>Fallida(src)}/>:<PawPrint size={pequeno?20:29} aria-hidden="true"/>}
  </span>;
}
export function CampoJaula({valor}) {
  return <Campo etiqueta="Jaula" nombre="jaula" valor={valor||""} opciones={[["","Sin asignar"],...jaulas.map(j=>[j,j])]}/>;
}
export function EditorFoto({paciente,fotoActual,fotos,cerrar,guardado,recargar}) {
  const dialog=useRef(null),seleccion=useRef(0),subiendo=useRef(false);
  const [mini,Mini]=useState(null),[preview,Preview]=useState(""),[estado,Estado]=useState(""),[error,ErrorFoto]=useState(""),[conflicto,Conflicto]=useState(false);
  useEffect(()=>{
    const el=dialog.current; if(!el.open)el.showModal();
    return ()=>{seleccion.current++;if(el.open)el.close();};
  },[]);
  useEffect(()=>{
    if (!mini){Preview("");return;}
    const u=URL.createObjectURL(mini);Preview(u);
    return ()=>URL.revokeObjectURL(u);
  },[mini]);
  async function elegir(e) {
    const f=e.target.files?.[0];
    if (!f || subiendo.current) return;
    e.target.value="";
    const turno=++seleccion.current;
    ErrorFoto("");Mini(null);Estado("preparando");
    try {const b=await comprimirIdentificacion(f);if(turno===seleccion.current)Mini(b);}
    catch(err){if(turno===seleccion.current)ErrorFoto(err.message||"No se pudo preparar la foto.");}
    finally{if(turno===seleccion.current)Estado("");}
  }
  async function enviar(e) {
    e.preventDefault();if(!mini||estado==="preparando"||subiendo.current||conflicto)return;
    subiendo.current=true;Estado("guardando");ErrorFoto("");
    try {const id=await fotos.guardar(paciente.id,fotoActual,mini);guardado(id);}
    catch(err){ErrorFoto(err.message);if(err.codigo==="40001")Conflicto(true);}
    finally{subiendo.current=false;Estado("");}
  }
  const src=preview||fotos.url(paciente.id,fotoActual);
  return <dialog ref={dialog} className="ve-dialog ve-dialog-foto" aria-labelledby="titulo-foto" onCancel={e=>{if(e.target!==e.currentTarget)return;e.preventDefault();if(!subiendo.current)cerrar();}}>
    <form onSubmit={enviar}><header className="ve-row"><div><p className="ve-meta">{paciente.nombre} · {paciente.codigo}</p><h2 id="titulo-foto">Foto de identificación</h2></div><Boton icono={X} aria-label="Cerrar" disabled={estado==="guardando"} onClick={cerrar}/></header>
      <div className="ve-foto-previsualizacion">{src?<img src={src} alt={"Vista previa de "+paciente.nombre}/>:<PawPrint aria-hidden="true" size={52}/>}</div>
      <div className="ve-foto-entradas">
        <label className="ve-elegir-foto"><ImagePlus size={17}/> Elegir foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={elegir} disabled={estado==="guardando"||conflicto}/></label>
        <label className="ve-elegir-foto ve-camara"><Camera size={17}/> Tomar foto<input type="file" accept="image/*" capture="environment" onChange={elegir} disabled={estado==="guardando"||conflicto}/></label>
      </div>
      <p className="ve-meta ve-foto-dato" role="status">{estado==="preparando"?"Comprimiendo foto…":mini?"Miniatura preparada · "+(mini.size/1024).toLocaleString("es-EC",{maximumFractionDigits:1})+" KiB":"JPG, PNG o WebP. La miniatura ocupa hasta 40 KiB."}</p>
      {error&&<p className="ve-message" role="alert">{error}</p>}
      <footer className="ve-actions ve-last"><Boton disabled={estado==="guardando"} onClick={cerrar}>Cancelar</Boton>{conflicto?<Boton principal onClick={()=>{cerrar();recargar();}}>Actualizar ficha</Boton>:<button type="submit" className="ve-button" disabled={!mini||!!estado}>{estado==="guardando"?"Guardando…":"Guardar foto"}</button>}</footer>
    </form>
  </dialog>;
}
export function JaulaIngreso({ingreso,actual,abierta,asignar,alCambiar,actualizar}) {
  const [editor,Editor]=useState(null),[espera,Espera]=useState(false),[error,ErrorJaula]=useState("");
  const bloqueo=useRef(false);
  function abrir(){ErrorJaula("");Editor({anterior:actual??null});}
  async function enviar(e) {
    e.preventDefault();if(bloqueo.current||!editor)return;
    const nueva=new FormData(e.currentTarget).get("jaula")||null;
    bloqueo.current=true;Espera(true);ErrorJaula("");
    try {await asignar(ingreso,nueva,editor.anterior);Editor(null);alCambiar(nueva);}
    catch(err){ErrorJaula(err.message);if(err.codigo==="40001"){Editor(null);actualizar();}}
    finally{bloqueo.current=false;Espera(false);}
  }
  return <div className="ve-jaula">
    <div className="ve-row"><div><span className="ve-meta">Jaula del paciente</span><strong>{actual||"Sin asignar"}</strong></div>
    {abierta&&!editor&&<Boton onClick={abrir}>{actual?"Cambiar jaula":"Asignar jaula"}</Boton>}</div>
    {abierta&&editor&&<form onSubmit={enviar} className="ve-jaula-form"><CampoJaula valor={editor.anterior}/><Boton disabled={espera} onClick={()=>{Editor(null);ErrorJaula("");}}>Cancelar</Boton><button className="ve-button" disabled={espera}>{espera?"Guardando…":"Guardar jaula"}</button></form>}
    {error&&<p role="alert" className="ve-message">{error}</p>}
  </div>;
}
