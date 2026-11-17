import {fotoGataDemo} from "./foto-demo.mjs";

export const jaulas = [
  "Hospital general",
  "Infectología",
  "UCI / Cuidados intensivos",
  "Post-quirúrgico",
  "Jaulas metálicas",
  "Jaulas de adopción"
];
export const limiteMiniatura = 40 * 1024;
export const ladoMiniatura = 320;
export function normalizarJaula(valor) {
  if (valor == null || valor==="") return null;
  if (!jaulas.includes(valor)) throw new Error("Selecciona una jaula o área válida.");
  return valor;
}

export async function comprimirIdentificacion(archivo) {
  if (!archivo?.size) throw new Error("Selecciona una foto.");
  const formatos={"image/jpeg":true,"image/png":true,"image/webp":true};
  const extension=/\.(jpe?g|png|webp)$/i.test(archivo.name||"");
  if (archivo.type ? !Object.hasOwn(formatos,archivo.type) : !extension) throw new Error("Elige una foto JPG, PNG o WebP.");
  const origen=URL.createObjectURL(archivo);
  try {
    const imagen=new Image();
    imagen.src=origen;
    try { await imagen.decode(); } catch { throw new Error("No se pudo abrir la imagen. Prueba con otra foto JPG, PNG o WebP."); }
    const mayor=Math.max(imagen.naturalWidth,imagen.naturalHeight);
    if (!mayor) throw new Error("La foto está vacía.");
    const lienzo=document.createElement("canvas"), ctx=lienzo.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la miniatura en este dispositivo.");
    for (const lado of [ladoMiniatura,256,192,128]) {
      const factor=Math.min(1,lado/mayor);
      lienzo.width=Math.max(1,Math.round(imagen.naturalWidth*factor));
      lienzo.height=Math.max(1,Math.round(imagen.naturalHeight*factor));
      ctx.fillStyle="#ffffff";
      ctx.fillRect(0,0,lienzo.width,lienzo.height);
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality="high";
      ctx.drawImage(imagen,0,0,lienzo.width,lienzo.height);
      for (const calidad of [.80,.63,.48]) {
        const mini=await new Promise(resolve=>lienzo.toBlob(resolve,"image/jpeg",calidad));
        if (mini?.type==="image/jpeg" && mini.size>0 && mini.size<=limiteMiniatura) return mini;
      }
    }
    throw new Error("No se pudo comprimir la imagen. Selecciona otra foto.");
  } finally { URL.revokeObjectURL(origen); }
}

export function crearFotos(config,pacientes) {
  const demo=!config.url||!config.clave;
  const imagenes=new Map();
  if (demo && pacientes.length) {
    pacientes[0].foto_id="nube-foto-demo";
    imagenes.set("nube-foto-demo",fotoGataDemo);
  }
  function endpoint(id) {
    return config.url+"/functions/v1/pibe-examenes/foto/"+encodeURIComponent(id);
  }
  function url(id,foto) {
    if (!foto) return "";
    if (demo) return imagenes.get(foto)||"";
    return endpoint(id)+"?v="+encodeURIComponent(foto);
  }
  async function guardar(id,anterior,miniatura) {
    if (miniatura?.type!=="image/jpeg" || !miniatura.size || miniatura.size>limiteMiniatura) throw new Error("Selecciona una miniatura válida.");
    if (demo) {
      const p=pacientes.find(x=>x.id===id);
      if (!p) throw new Error("No se encontró el paciente.");
      const bytes=await miniatura.arrayBuffer();
      const digest=await crypto.subtle.digest("SHA-256",bytes);
      const huella=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
      const nuevo=id+"-"+huella;
      if (p.foto_id===nuevo) return nuevo;
      if ((p.foto_id??null)!==(anterior??null)) throw Object.assign(new Error("La foto cambió. Actualiza antes de reemplazarla."),{codigo:"40001"});
      const viejo=imagenes.get(p.foto_id);
      if (viejo?.startsWith("blob:")) {URL.revokeObjectURL(viejo);imagenes.delete(p.foto_id);}
      imagenes.set(nuevo,URL.createObjectURL(miniatura));p.foto_id=nuevo;
      return nuevo;
    }
    const dest=endpoint(id)+(anterior?"?anterior="+encodeURIComponent(anterior):"");
    const r=await fetch(dest,{method:"POST",body:miniatura,cache:"no-store",credentials:"omit",headers:{"Content-Type":"image/jpeg"}});
    const j=await r.json().catch(()=>({}));
    if (!r.ok||!j.id) throw Object.assign(new Error(j.error||"No se pudo guardar la foto. Puedes volver a intentar."),{codigo:r.status===409?"40001":undefined});
    return j.id;
  }
  return {url,guardar};
}
