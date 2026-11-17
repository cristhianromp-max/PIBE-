const CARPETA = "1bGYeuysNuk6TggK64bYf_TTv4RILHESw";
const DOCUMENTO = "1Dk8A719xRUS-yVs6dFF6MezFIHPfMRp7xuD2GxHljss";
const PUERTA = "https://dxunidqyomvcedwlpiuq.supabase.co/functions/v1/pibe-examenes";
function conectarElPibe() {
  const carpeta = DriveApp.getFolderById(CARPETA);
  const contenido = DocumentApp.openById(DOCUMENTO).getBody().getText();
  const coincidencia = contenido.match(/AUTORIZACION-PIBE=([a-f0-9]{64})/);
  if (!coincidencia) throw new Error("No se encontró la autorización privada.");
  const url = ScriptApp.getService().getUrl();
  if (!url || !url.endsWith("/exec")) throw new Error("Implementa primero como aplicación web.");
  const props = PropertiesService.getScriptProperties();
  let clave = props.getProperty("puente");
  if (!clave) { clave = Utilities.getUuid() + Utilities.getUuid(); props.setProperty("puente",clave); }
  const r = UrlFetchApp.fetch(PUERTA+"/vincular",{method:"post",contentType:"application/json",payload:JSON.stringify({permiso:coincidencia[1],url:url,clave:clave}),muteHttpExceptions:true});
  if (r.getResponseCode()!==200) throw new Error("No se pudo activar. Revisa que la implementación permita acceso a Cualquier usuario y ejecuta nuevamente.");
  props.setProperty("vinculado","1");
  console.log("Conexión verificada con " + carpeta.getName());
}
function doPost(e) {
  const json = v=>ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);
  try {
    const d=JSON.parse(e.postData.contents);
    const clave=PropertiesService.getScriptProperties().getProperty("puente");
    if(!clave || typeof d.clave!=="string" || d.clave!==clave) return json({ok:false,error:"Acceso denegado"});
    const folder=DriveApp.getFolderById(CARPETA);
    if(d.accion==="probar")return json({ok:true,carpeta:folder.getId()});
    const mime={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
    if(!/^[a-f0-9-]{36}$/.test(d.id)||!Object.prototype.hasOwnProperty.call(mime,d.mime))return json({ok:false,error:"Datos inválidos"});
    const base=String(d.nombre||"Examen").replace(/\.[^.]+$/,"").replace(/[\\/\x00-\x1F]/g," ").slice(0,125)||"Examen";
    const nombre=base+" - "+d.id+"."+mime[d.mime];
    if(d.accion==="subir"){
      if(!/^[a-f0-9]{64}$/.test(d.huella)||!d.datos||d.datos.length>27962032)return json({ok:false,error:"Tamaño o huella incorrecta"});
      const bytes=Utilities.base64Decode(d.datos);
      const h=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(x=>("0"+((x+256)%256).toString(16)).slice(-2)).join("");
      if(h!==d.huella||bytes.length>20971520)return json({ok:false,error:"La carga está incompleta"});
      const lock=LockService.getScriptLock();lock.waitLock(25000);
      try{
        const prev=folder.getFilesByName(nombre);
        if(prev.hasNext()){const f=prev.next();const meta=JSON.parse(f.getDescription()||"{}");if(meta.sha256!==h)return json({ok:false,error:"Ya existe un archivo distinto"});return json({ok:true,archivo:f.getId()});}
        const f=folder.createFile(Utilities.newBlob(bytes,d.mime,nombre));
        try{f.setDescription(JSON.stringify({nombre:d.nombre,sha256:h}));}catch(err){f.setTrashed(true);throw err;}
        return json({ok:true,archivo:f.getId()});
      }finally{lock.releaseLock();}
    }
    if(d.accion==="leer"){
      const f=DriveApp.getFileById(d.archivo);let ok=false,pars=f.getParents();
      while(pars.hasNext())if(pars.next().getId()===CARPETA)ok=true;
      if(!ok||f.isTrashed()||f.getName()!==nombre)return json({ok:false,error:"Archivo no disponible"});
      return json({ok:true,datos:Utilities.base64Encode(f.getBlob().getBytes())});
    }
    return json({ok:false,error:"Operación desconocida"});
  }catch(err){return json({ok:false,error:"Google Drive no pudo completar la operación"});}
}
function doGet() {
  try {
    if(PropertiesService.getScriptProperties().getProperty("vinculado")!=="1")conectarElPibe();
    return HtmlService.createHtmlOutput("Google Drive conectado con la Clínica Veterinaria El Pibe.");
  }catch(err){
    return HtmlService.createHtmlOutput("No se pudo verificar la conexión. Abre la URL publicada que termina en /exec con la implementación configurada para Cualquier usuario.");
  }
}

