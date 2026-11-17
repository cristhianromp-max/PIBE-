import {atenderFoto} from "./fotos.ts";
const BASE=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}"))[0] as string;
const HASH="__HUELLA_SHA256_DE_LA_ACTIVACION_PRIVADA__", FOLDER="1bGYeuysNuk6TggK64bYf_TTv4RILHESw";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"content-type,apikey,authorization","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const err=(msg:string,status:number)=>Response.json({error:msg},{status,headers:cors});
const ok=(o:unknown)=>Response.json(o,{headers:cors});
const sha=async(b:ArrayBuffer|string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",typeof b==="string"?new TextEncoder().encode(b):b)),v=>v.toString(16).padStart(2,"0")).join("");
const uuid=(id:string)=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id);
async function db(path:string,method="GET",data?:unknown,pref?:string){
 const r=await fetch(BASE+"/rest/v1/"+path,{method,headers:{"apikey":KEY,"Authorization":"Bearer "+KEY,"Content-Type":"application/json","Prefer":pref||"return=representation"},body:data===undefined?undefined:JSON.stringify(data)});
 const txt=await r.text();if(!r.ok)throw Error("DB");return txt?JSON.parse(txt):null;
}
async function puente(url:string,clave:string,data:Record<string,unknown>){
 const r=await fetch(url,{method:"POST",redirect:"follow",headers:{"Content-Type":"application/json"},body:JSON.stringify({...data,clave}),signal:AbortSignal.timeout(70000)});
 if(!r.ok)throw Error("Drive");const j=await r.json();if(!j.ok)throw Error("Drive");return j;
}
function firma(b:Uint8Array) {
 const s=(k:number,n:number)=>String.fromCharCode(...b.slice(k,k+n));
 if(s(0,5)==="%PDF-")return "application/pdf";
 if(b[0]===255&&b[1]===216&&b[2]===255)return "image/jpeg";
 if([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return "image/png";
 if(s(0,4)==="RIFF"&&s(8,4)==="WEBP")return "image/webp";
 return "";
}
function base64(b:Uint8Array){const p=[];for(let i=0;i<b.length;i+=24576)p.push(btoa(String.fromCharCode(...b.subarray(i,i+24576))));return p.join("");}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 const u=new URL(req.url),ruta=u.pathname.split("/").filter(Boolean).pop();
 try{
  if(ruta==="vincular"&&req.method==="POST"){
    const d=await req.json();if(typeof d.permiso!=="string"||await sha(d.permiso)!==HASH)return err("Autorización no válida.",403);
    if(typeof d.url!=="string"||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(d.url)||typeof d.clave!=="string"||d.clave.length<50||d.clave.length>180)return err("Implementación inválida.",400);
    const res=await puente(d.url,d.clave,{accion:"probar"});if(res.carpeta!==FOLDER)return err("Carpeta incorrecta.",409);
    await db("pibe_drive_config?on_conflict=id","POST",{id:true,puente:d.url,clave:d.clave,actualizado:new Date().toISOString()},"resolution=merge-duplicates,return=minimal");return ok({activo:true});
  }
  const [cfg]=await db("pibe_drive_config?id=eq.true&select=puente,clave&limit=1");
  if(ruta==="estado"&&req.method==="GET")return ok({activo:!!cfg});
  const esFoto=u.pathname.split("/").filter(Boolean).at(-2)==="foto";
  if(!cfg && esFoto)return err("La carpeta de Google Drive aún no está conectada.",503);
  if(!cfg)return err("La carpeta de Google Drive está creada. El propietario debe activar la conexión antes de subir exámenes.",503);
  if(esFoto)return await atenderFoto(req,ruta||"",cfg,{db,puente,sha,base64,cors});
  if(ruta==="subir"&&req.method==="POST"){
    const id=u.searchParams.get("id")||"",visita=u.searchParams.get("visita")||"";
    if(!uuid(id)||!uuid(visita))return err("Selecciona una visita.",400);
    const longitud=Number(req.headers.get("content-length")||"0");if(longitud>21080000)return err("Máximo 20 MiB.",413);
    const form=await req.formData(),f=form.get("archivo");if(!(f instanceof File)||f.size<1||f.size>20971520)return err("Archivo vacío o mayor a 20 MiB.",413);
    const bytes=await f.arrayBuffer(),b=new Uint8Array(bytes),mime=firma(b);
    if(!mime||mime!==f.type)return err("Selecciona un PDF, JPG, PNG o WebP válido.",415);
    const visitaValida=await db("pibe_atenciones?select=id&id=eq."+visita+"&limit=1");if(!visitaValida.length)return err("No se encontró la atención.",404);
    const huella=await sha(bytes),nombre=(f.name||"examen").replace(/[\x00-\x1f\x7f]/g," ").slice(0,200);
    await db("pibe_adjuntos?on_conflict=id","POST",{id,atencion_id:visita,nombre,mime,bytes:b.length,huella},"resolution=ignore-duplicates,return=minimal");
    const [row]=await db("pibe_adjuntos?id=eq."+id+"&select=atencion_id,huella,listo,nombre");
    if(!row||row.atencion_id!==visita||row.huella!==huella)return err("El identificador pertenece a un archivo diferente.",409);
    if(!row.listo){const f=await puente(cfg.puente,cfg.clave,{accion:"subir",id,mime,nombre:row.nombre,huella,datos:base64(b)});if(!f.archivo)throw Error("Drive");
      await db("pibe_adjuntos?id=eq."+id,"PATCH",{archivo_drive:f.archivo,listo:true},"return=minimal");}
    return ok({id});
  }
  if(ruta&&uuid(ruta)&&req.method==="GET"){
    const [f]=await db("pibe_adjuntos?id=eq."+ruta+"&listo=eq.true&select=archivo_drive,nombre,mime,bytes");
    if(!f)return err("Examen no encontrado.",404);
    const d=await puente(cfg.puente,cfg.clave,{accion:"leer",id:ruta,archivo:f.archivo_drive,mime:f.mime,nombre:f.nombre});
    const b=Uint8Array.from(atob(d.datos),x=>x.charCodeAt(0));if(b.length!==f.bytes)throw Error("Drive");
    const name=encodeURIComponent(f.nombre).replace(/['()*]/g,x=>"%"+x.charCodeAt(0).toString(16));
    return new Response(b,{headers:{...cors,"Content-Type":f.mime,"Content-Disposition":(u.searchParams.has("descargar")?"attachment":"inline")+"; filename*=UTF-8''"+name,"Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'"}});
  }
  return err("Operación no encontrada.",404);
 }catch{return err("No se pudo completar la operación con Drive. Puedes reintentar.",502);}
});
