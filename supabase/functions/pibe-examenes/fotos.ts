const NOMBRE = "Identificacion.jpg";
const MAX_BYTES = 40 * 1024;
const MAX_LADO = 320;
type Conexion = {puente: string; clave: string};
type Datos = Record<string, unknown>;
type Servicios = {
  db: (ruta: string, metodo: string, datos: Datos) => Promise<any>;
  puente: (url: string, clave: string, datos: Datos) => Promise<any>;
  sha: (bytes: ArrayBuffer | string) => Promise<string>;
  base64: (bytes: Uint8Array) => string;
  cors: Record<string,string>;
};

export function dimensionesJpeg(b: Uint8Array) {
  if (b.length<16 || b[0]!==255 || b[1]!==216 || b[b.length-2]!==255 || b[b.length-1]!==217) return null;
  let i=2;
  while (i+4<b.length && b[i]===255) {
    while (b[i]===255) i++;
    const tipo=b[i++], longitud=b[i]*256+b[i+1];
    if (tipo===218 || tipo===217 || longitud<2 || i+longitud>b.length) return null;
    if (tipo===192 || tipo===193 || tipo===194) {
      if (longitud<8) return null;
      return {alto:b[i+3]*256+b[i+4], ancho:b[i+5]*256+b[i+6]};
    }
    i+=longitud;
  }
  return null;
}
async function leerMiniatura(req: Request) {
  if (!req.body || Number(req.headers.get("content-length"))>MAX_BYTES) return null;
  const lector=req.body.getReader(), buffer=new Uint8Array(MAX_BYTES);
  let posicion=0;
  try {
    while (true) {
      const parte=await lector.read();
      if (parte.done) break;
      if (posicion+parte.value.length>MAX_BYTES) { await lector.cancel(); return null; }
      buffer.set(parte.value,posicion);
      posicion+=parte.value.length;
    }
  } finally { lector.releaseLock(); }
  return buffer.slice(0,posicion);
}
export async function atenderFoto(req: Request, paciente: string, cfg: Conexion, s: Servicios) {
  const url=new URL(req.url);
  const responder=(datos: unknown, status=200)=>Response.json(datos,{status,headers:s.cors});
  const error=(mensaje: string,status: number)=>responder({error:mensaje},status);
  const esId=(v: string|null)=>!!v && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
  const conflicto=()=>error("La foto cambió en otro dispositivo. Actualiza la ficha antes de reemplazarla.",409);
  if (!esId(paciente)) return error("Paciente no válido.",400);
  if (req.method==="POST") {
    const anterior=url.searchParams.get("anterior");
    if (anterior!==null && !esId(anterior)) return error("Referencia de foto no válida.",400);
    if (req.headers.get("content-type")?.split(";")[0]!=="image/jpeg") return error("La miniatura debe estar en formato JPEG.",415);
    const b=await leerMiniatura(req);
    if (!b?.length) return error("La miniatura debe ocupar entre 1 byte y 40 KiB.",413);
    const medidas=dimensionesJpeg(b);
    if (!medidas || medidas.alto<1 || medidas.ancho<1 || Math.max(medidas.alto,medidas.ancho)>MAX_LADO)
      return error("La miniatura debe ser un JPEG de hasta 320 píxeles por lado.",415);
    const huella=await s.sha(b.buffer);
    const reserva=await s.db("rpc/pibe_foto_reservar","POST",{paciente,anterior,huella_imagen:huella,cantidad:b.length});
    if (reserva.estado==="ausente") return error("No se encontró el paciente.",404);
    if (reserva.estado==="conflicto") return conflicto();
    if (reserva.estado==="igual") return responder({id:reserva.id});
    if (reserva.estado!=="reservada"||!esId(reserva.id)) throw Error("Reserva de foto no válida");
    let archivo=reserva.archivo_drive;
    if (!archivo) {
      const carga=await s.puente(cfg.puente,cfg.clave,{accion:"subir",id:reserva.id,mime:"image/jpeg",nombre:NOMBRE,huella,datos:s.base64(b)});
      archivo=carga.archivo;
    }
    if (!archivo) throw Error("Drive no confirmó la miniatura");
    const estado=await s.db("rpc/pibe_foto_confirmar","POST",{paciente,anterior,foto:reserva.id,en_drive:archivo});
    if (estado==="conflicto") return conflicto();
    if (estado!=="ok") throw Error("No se pudo asociar la miniatura");
    return responder({id:reserva.id});
  }
  if (req.method==="GET") {
    const foto=url.searchParams.get("v");
    if (!esId(foto)) return error("Referencia de foto no válida.",400);
    const [f]=await s.db("rpc/pibe_foto_archivo","POST",{paciente,foto});
    if (!f) return error("Foto no disponible.",404);
    const lectura=await s.puente(cfg.puente,cfg.clave,{accion:"leer",id:foto,mime:"image/jpeg",nombre:NOMBRE,archivo:f.archivo_drive});
    const b=Uint8Array.from(atob(lectura.datos),c=>c.charCodeAt(0));
    if (b.length!==f.bytes || await s.sha(b.buffer)!==f.huella) throw Error("Miniatura incompleta");
    return new Response(b,{headers:{...s.cors,"Content-Type":"image/jpeg","Content-Disposition":'inline; filename="identificacion.jpg"',"Cache-Control":"private, max-age=900","Content-Security-Policy":"default-src 'none'"}});
  }
  return error("Método no permitido.",405);
}
