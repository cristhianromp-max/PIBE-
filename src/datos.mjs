import {crearFotos,normalizarJaula} from "./identificacion.mjs";
import {crearHospital} from "./hospital.mjs";
const etiquetas={consulta:"Consulta",control:"Control",hospitalizacion:"Hospitalización",preventivo:"Preventivo"};
const limpiar=(v)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
function fechaLocal(d=new Date()) {
  const partes=Object.fromEntries(new Intl.DateTimeFormat("es-EC",{timeZone:"America/Guayaquil",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(d)).map(p=>[p.type,p.value]));
  return partes.year+"-"+partes.month+"-"+partes.day+"T"+partes.hour+":"+partes.minute;
}
function edad(f,estimada){
 if(!f)return estimada||"Sin registrar";
 const [a,m,d]=f.split("-").map(Number),[b,n,e]=fechaLocal().slice(0,10).split("-").map(Number);
 const meses=(b-a)*12+n-m-(e<d?1:0);if(meses<0)return "Sin registrar";
 if(meses===0)return "Menos de un mes";if(meses<12)return meses+(meses===1?" mes":" meses");
 const anos=Math.floor(meses/12);return anos+(anos===1?" año":" años");
}
const fechaCorta=(v)=>new Intl.DateTimeFormat("es-EC",{timeZone:"America/Guayaquil",day:"2-digit",month:"short",year:"numeric"}).format(new Date(v));
const hora=(v)=>fechaLocal(v).slice(11);
const porFecha=(a,b)=>Date.parse(b.inicio)-Date.parse(a.inicio)||b.id.localeCompare(a.id);
function uuid(){
 if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=bytes[6]&15|64;bytes[8]=bytes[8]&63|128;
 const h=Array.from(bytes,v=>v.toString(16).padStart(2,"0")).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
}
function fallo(m,c){const e=new Error(m);e.codigo=c;return e;}
function crearRepositorio(config){
 const demo=!config.url||!config.clave;
 const pacientes=[["Nube","Felino","Común europeo","Hembra","2021-03-14","María Ávila","0000000101","HC-0104"],["Nube","Canino","Mestizo","Macho","2023-10-01","Andrés Luna","0000000102","HC-0108"],["Mora","Canino","Beagle","Hembra","2022-06-20","María Ávila","0000000101","HC-0111"],["Kiwi","Felino","Mestizo","Macho",null,"Sofía Ríos","0000000103","HC-0120"]].map(([nombre,especie,raza,sexo,nacimiento,propietario,cedula,codigo],i)=>({id:"prueba-"+(i+1),nombre,especie,raza,sexo,nacimiento,propietario,cedula,codigo,telefono:"",version:1,version_propietario:1,dueno:"dueno-"+cedula}));
 const eventos=[[0,"hospitalizacion","2026-11-16T08:30:00-05:00","Ingreso a observación","Ingresó para seguimiento de la ingesta. Sala felina, turno de la mañana.","Dra. Elena Vega",true,3.8],[0,"consulta","2026-11-14T16:15:00-05:00","Evaluación del apetito","La tutora refiere menor consumo de alimento. Se registraron antecedentes y examen físico.","Dr. Luis Prado",false,3.9],[0,"control","2026-09-11T10:00:00-05:00","Revisión de peso","Se comparó el peso con el registro anterior.","Dra. Elena Vega",false,4.1],[0,"preventivo","2026-06-02T09:15:00-05:00","Visita preventiva","Se revisó el carné y se documentó la atención preventiva.","Dr. Luis Prado",false,4.1],[1,"control","2026-11-15T14:15:00-05:00","Control ambulatorio","Revisión del estado general y seguimiento del peso.","Dra. Elena Vega",false,11.7],[1,"consulta","2026-07-12T10:20:00-05:00","Primera consulta","Apertura de la historia y examen físico.","Dr. Luis Prado",false,11.2],[2,"preventivo","2026-11-12T11:00:00-05:00","Revisión preventiva","Actualización del registro preventivo.","Dra. Elena Vega",false,13.2]].map(([p,tipo,inicio,titulo,resumen,profesional,abierta,peso],i)=>({id:"visita-"+i,paciente_id:"prueba-"+(p+1),tipo,inicio:new Date(inicio).toISOString(),titulo,resumen,profesional,abierta,peso,version:1}));
 async function rpc(nombre,datos,signal,rango){
   const r=await fetch(config.url+"/rest/v1/rpc/"+nombre,{method:"POST",cache:"no-store",credentials:"omit",signal,headers:{"Content-Type":"application/json",apikey:config.clave,...(rango?{Range:rango,"Range-Unit":"items"}:{})},body:JSON.stringify(datos)});
   if(!r.ok){const e=await r.json().catch(()=>({}));const legible=e.code==="40001"||e.code==="22023"?e.message:e.code==="23505"?"Ya existe una cédula idéntica o un ingreso activo para este paciente.":e.code==="23514"?"Revisa los valores del formulario.":"No se pudo completar la operación. Revisa la conexión e inténtalo de nuevo.";throw fallo(legible,e.code);}
   return r.json();
 }
 async function listar(q="",pagina=0,signal){
  if(!demo){const filas=await rpc("pibe_directorio_identificado",{termino:q,cantidad:31,desplazamiento:pagina*30},signal);return {items:filas.slice(0,30),mas:filas.length>30};}
  const valor=limpiar(q);
  const filas=pacientes.filter(p=>[p.nombre,p.propietario,p.cedula,p.codigo].some(s=>limpiar(s).includes(valor))).sort((a,b)=>a.nombre.localeCompare(b.nombre,"es")||a.id.localeCompare(b.id));
  return {items:filas.slice(pagina*30,pagina*30+30).map(p=>({...p})),mas:filas.length>pagina*30+30};
 }
 async function ficha(id,signal){
  if(demo){const p=pacientes.find(x=>x.id===id);return {p:p?{...p}:null,atenciones:eventos.filter(x=>x.paciente_id===id).sort(porFecha).map(a=>({...a}))};}
  const leerEventos=async()=>{const todos=[];let fecha=null,ultimo=null;for(;;){const filas=await rpc("pibe_eventos_identificados",{paciente:id,antes_de:fecha,antes_id:ultimo},signal);todos.push(...filas);if(filas.length<100)return todos;const fin=filas[filas.length-1];fecha=fin.inicio;ultimo=fin.id;}};
  const [lista,atenciones]=await Promise.all([rpc("pibe_directorio_identificado",{paciente:id,cantidad:1},signal),leerEventos()]);return {p:lista[0]||null,atenciones};
 }
 async function guardarPaciente(d){
  if(!demo)return rpc("pibe_guardar_paciente",{datos:d});
  const p=pacientes.find(x=>x.id===d.id),otro=pacientes.find(x=>d.cedula&&x.cedula===d.cedula&&x.id!==d.id);
  if(p&&!d.version)return p.id;
  if((d.version&&!p)||(p&&(p.version!==d.version||p.version_propietario!==d.version_propietario)))throw fallo("La ficha cambió. Actualiza antes de guardar.","40001");
  if(otro&&((p&&otro.dueno!==p.dueno)||(!p&&limpiar(otro.propietario)!==limpiar(d.propietario))))throw fallo("La cédula pertenece a otro propietario.","22023");
  const dueno=p?.dueno||otro?.dueno||d.id;
  let vo=p?.version_propietario||otro?.version_propietario||1;
  if(p&&["propietario","cedula","telefono"].some(k=>(p[k]||"")!==(d[k]||""))){vo++;pacientes.forEach(x=>{if(x.dueno===dueno)Object.assign(x,{propietario:d.propietario,cedula:d.cedula,telefono:d.telefono,version_propietario:vo});});}
  const registro={...d,foto_id:p?.foto_id??null,dueno,version:(p?.version||0)+1,version_propietario:vo,codigo:p?.codigo||"DEMO-"+(pacientes.length+1)};
  if(!p&&otro)Object.assign(registro,{propietario:otro.propietario,telefono:otro.telefono});
  if(p)Object.assign(p,registro);else pacientes.push(registro);return registro.id;
 }
 async function guardarAtencion(d){
  if(!demo)return rpc("pibe_guardar_atencion",{datos:d});
  const a=eventos.find(x=>x.id===d.id&&x.paciente_id===d.paciente_id);
  if(a&&!d.version)return a.id;
  if(d.version&&a?.version!==d.version)throw fallo("La atención cambió. Actualiza antes de guardar.","40001");
  if(d.abierta&&eventos.some(x=>x.id!==d.id&&x.paciente_id===d.paciente_id&&x.abierta))throw fallo("Ya hay una hospitalización activa.","23505");
  const jaula=d.tipo==="hospitalizacion"?normalizarJaula(Object.hasOwn(d,"jaula")?d.jaula:a?.jaula):null;
  hospital.validarEdicion(a,d);
  const nuevo={...d,jaula,inicio:new Date(d.fecha_local+":00-05:00").toISOString(),version:(a?.version||0)+1,peso:d.peso===""?null:Number(d.peso)};
  if(a)Object.assign(a,nuevo);else eventos.push(nuevo);return nuevo.id;
 }
 const adjuntos=[];
 async function expediente(id,signal){
   const obtener=async()=>{if(demo)return adjuntos.filter(a=>eventos.some(v=>v.id===a.atencion_id&&v.paciente_id===id));const lista=[];for(let i=0;;i+=100){const parte=await rpc("pibe_lista_examenes",{paciente:id},signal,i+"-"+(i+99));lista.push(...parte);if(parte.length<100)return lista;}};
   const [f,anexos]=await Promise.all([ficha(id,signal),obtener()]);return {...f,anexos};
 }
 async function preparar(archivo,categoria){
   const tipos={"pdf":"application/pdf","jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp"};
   const mime=archivo.type||tipos[archivo.name.split(".").pop().toLowerCase()];
   if(!Object.values(tipos).includes(mime))throw Error("Selecciona un PDF o una imagen JPG, PNG o WebP.");
   if(!archivo.type)archivo=new File([archivo],archivo.name,{type:mime,lastModified:archivo.lastModified});
   if(categoria==="foto"&&mime.startsWith("image/")){
     const url=URL.createObjectURL(archivo);
     try{const img=new Image();img.src=url;await img.decode();const escala=Math.min(1,1920/Math.max(img.naturalWidth,img.naturalHeight));
       const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.naturalWidth*escala));c.height=Math.max(1,Math.round(img.naturalHeight*escala));
       const ctx=c.getContext("2d");if(ctx){ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
       const b=await new Promise(resolve=>c.toBlob(resolve,"image/jpeg",.83));
       if(b&&b.size<archivo.size)archivo=new File([b],archivo.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg"});}
     }finally{URL.revokeObjectURL(url);}
   }
   if(archivo.size>20971520)throw Error("El archivo excede el límite de 20 MiB.");return archivo;
 }
 async function subir(id,visita,archivo,categoria){
   const url=config.url+"/functions/v1/pibe-examenes";
   if(!demo){const estado=await fetch(url+"/estado",{cache:"no-store"});if(!estado.ok)throw Error("No se pudo comprobar la conexión a Drive.");if(!(await estado.json()).activo)throw Error("La carpeta de Drive está preparada. El propietario debe activar la conexión para subir exámenes.");}
   const f=await preparar(archivo,categoria);
   if(demo){if(adjuntos.some(a=>a.id===id))return id;adjuntos.unshift({id,atencion_id:visita,nombre:f.name,mime:f.type,bytes:f.size,creado:new Date().toISOString(),url:URL.createObjectURL(f)});return id;}
   const body=new FormData();body.append("archivo",f,f.name);const res=await fetch(url+"/subir?id="+encodeURIComponent(id)+"&visita="+encodeURIComponent(visita),{method:"POST",body});
   const j=await res.json().catch(()=>({}));if(!res.ok)throw Error(j.error||"No se pudo guardar el examen.");return j.id;
 }
 function enlace(x,descargar){return demo?x.url:config.url+"/functions/v1/pibe-examenes/"+encodeURIComponent(x.id)+(descargar?"?descargar=1":"");}
 const fotos=crearFotos(config,pacientes);
 const hospital=crearHospital(rpc,demo,eventos,fechaLocal,pacientes);
 return {demo,listar,ficha,expediente,guardarPaciente,guardarAtencion,subir,enlace,hospital,fotos};
}

export {crearRepositorio,etiquetas,fechaCorta,fechaLocal,hora,edad,uuid};

