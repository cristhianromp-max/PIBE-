import test from "node:test";
import assert from "node:assert/strict";
import {crearRepositorio,fechaLocal} from "../src/datos.mjs";
import {jaulas,normalizarJaula,comprimirIdentificacion,crearFotos,limiteMiniatura} from "../src/identificacion.mjs";
import {fotoGataDemo} from "../src/foto-demo.mjs";

const jpeg=new Blob([Buffer.from(fotoGataDemo.split(",")[1],"base64")],{type:"image/jpeg"});
const hoy=()=>fechaLocal().slice(0,10);

test("las jaulas pertenecen al ingreso y un traslado simultáneo no sobrescribe la asignación",async()=>{
  assert.deepEqual(jaulas,["Infeccioso","Post operatorio","Gatera","Hospitalización 1"]);
  assert.equal(normalizarJaula(""),null);
  assert.throws(()=>normalizarJaula("Otro"));
  const repo=crearRepositorio({}), paciente="prueba-1";
  const adm=(await repo.ficha(paciente)).atenciones.find(e=>e.abierta);
  let actual=adm.jaula;
  for(const jaula of [...jaulas,null]){
    await repo.hospital.asignarJaula(adm.id,jaula,actual);
    assert.equal((await repo.hospital.hoja(adm.id,hoy())).jaula,jaula);
    actual=jaula;
  }
  await repo.hospital.asignarJaula(adm.id,"Post operatorio",null);
  await assert.rejects(repo.hospital.asignarJaula(adm.id,"Gatera",null),{codigo:"40001"});
  const nueva=(await repo.ficha(paciente)).atenciones.find(e=>e.abierta);
  const {jaula,...antigua}=nueva;
  await repo.guardarAtencion({...antigua,fecha_local:fechaLocal(nueva.inicio),abierta:false});
  assert.equal((await repo.hospital.hoja(adm.id,hoy())).jaula,"Post operatorio");
  await assert.rejects(repo.hospital.asignarJaula(adm.id,"Gatera","Post operatorio"),/cerrada/);
  const id=await repo.guardarAtencion({id:"segundo",titulo:"Nuevo ingreso",tipo:"hospitalizacion",fecha_local:fechaLocal(),paciente_id:paciente,abierta:true,version:0});
  assert.equal((await repo.hospital.hoja(id,hoy())).jaula,null);
});

test("la misma miniatura se comparte entre directorio, ficha y hoja sin duplicarse en otra visita",async()=>{
  const repo=crearRepositorio({}), paciente="prueba-1";
  const {p,atenciones}=await repo.ficha(paciente);
  assert.ok(repo.fotos.url(p.id,p.foto_id).startsWith("data:image/jpeg"));
  const id=await repo.fotos.guardar(p.id,p.foto_id,jpeg);
  assert.equal(await repo.fotos.guardar(p.id,p.foto_id,jpeg),id);
  assert.equal((await repo.listar("María Ávila")).items.find(x=>x.id===paciente).foto_id,id);
  assert.equal((await repo.hospital.hoja(atenciones.find(e=>e.abierta).id,hoy())).foto_id,id);
  await assert.rejects(repo.fotos.guardar(p.id,p.foto_id,new Blob(["otra miniatura"],{type:"image/jpeg"})),{codigo:"40001"});
  await repo.guardarPaciente(p);
  assert.equal((await repo.ficha(p.id)).p.foto_id,id);
  assert.equal(repo.fotos.url("prueba-2",(await repo.ficha("prueba-2")).p.foto_id),"");
  await assert.rejects(repo.fotos.guardar(p.id,id,new Blob(["pdf"],{type:"application/pdf"})));
  await assert.rejects(repo.fotos.guardar(p.id,id,new Blob([new Uint8Array(limiteMiniatura+1)],{type:"image/jpeg"})));
});

test("la carga de producción transmite el JPEG y conserva un conflicto reportado por el servidor",async t=>{
  const fotos=crearFotos({url:"https://ejemplo.test",clave:"publicable"},[]);
  let peticion;
  t.mock.method(globalThis,"fetch",async(url,op)=>{peticion={url,op};return Response.json({id:"nueva"});});
  assert.equal(await fotos.guardar("paciente","vieja",jpeg),"nueva");
  assert.equal(peticion.op.body,jpeg);
  assert.equal(peticion.op.headers["Content-Type"],"image/jpeg");
  assert.equal(peticion.url,"https://ejemplo.test/functions/v1/pibe-examenes/foto/paciente?anterior=vieja");
  assert.match(fotos.url("paciente","nueva"),/foto\/paciente\?v=nueva$/);
  globalThis.fetch.mock.mockImplementation(async()=>Response.json({error:"La foto cambió."},{status:409}));
  await assert.rejects(fotos.guardar("paciente","vieja",jpeg),{codigo:"40001"});
  await assert.rejects(comprimirIdentificacion(new File(["pdf"],"estudio.pdf",{type:"application/pdf"})),/JPG/);
});
