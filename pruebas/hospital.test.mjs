import test from "node:test";
import assert from "node:assert/strict";
import {crearRepositorio,fechaLocal} from "../src/datos.mjs";
import {agendaDelDia,camposConsulta,extraerCampos,horasDelDia,instanteEcuador,moverDia} from "../src/registro.mjs";

const iso = instanteEcuador;
test("horarios fijos, intervalos, límites y medianoche de Ecuador",()=>{
  const dia="2026-11-16";
  const fija={pauta:"horarios",inicio:iso(dia+"T08:00"),minutos:[120,540,1260],fin:iso("2026-11-17T09:00")};
  assert.deepEqual(horasDelDia(fija,dia),[iso(dia+"T09:00"),iso(dia+"T21:00")]);
  assert.deepEqual(horasDelDia(fija,"2026-11-17"),[iso("2026-11-17T02:00"),iso("2026-11-17T09:00")]);
  const intervalo={pauta:"intervalo",intervalo_horas:6,inicio:iso(dia+"T20:00")};
  assert.deepEqual(horasDelDia(intervalo,"2026-11-17").map(t=>fechaLocal(t).slice(11)),["02:00","08:00","14:00","20:00"]);
  assert.equal(horasDelDia({...intervalo,suspendida_en:iso("2026-11-17T08:00")},"2026-11-17").length,1);
  assert.deepEqual(horasDelDia({pauta:"unica",inicio:iso("2026-11-17T00:00")},dia),[]);
  assert.equal(moverDia("2026-01-01",-1),"2025-12-31");
});
test("consulta sin valores predeterminados y con mediciones cero",()=>{
  assert.deepEqual(extraerCampos({clin_fc:"0",clin_anamnesis:" Se registró. ",clin_spo2:""},camposConsulta),{fc:0,anamnesis:"Se registró."});
  assert.throws(()=>extraerCampos({clin_spo2:"101"},camposConsulta));
});
test("alta, administración única, omisión, evolución, sustitución y cierre",async()=>{
  const repo=crearRepositorio({}), sala=repo.hospital;
  const ingreso=(await repo.ficha("prueba-1")).atenciones.find(e=>e.abierta);
  const dia=fechaLocal().slice(0,10), ayer=moverDia(dia,-1);
  const base={id:"pauta-prueba",medicina:"Prueba",dosis:"Cantidad documentada",via:"VO",pauta:"horarios",minutos:[720,780,840],inicio:iso(ayer+"T10:00"),responsable:"Internista de prueba"};
  await sala.prescribir(ingreso.id,base); await sala.prescribir(ingreso.id,base);
  let hoja=await sala.hoja(ingreso.id,ayer);
  assert.equal(hoja.ordenes.filter(o=>o.id===base.id).length,1);
  const fila=agendaDelDia(hoja,ayer).find(r=>r.orden.id===base.id);
  const datos={id:"registro-prueba",orden_id:base.id,programada:fila.programada,realizada:fila.programada,estado:"administrada",responsable:"Internista A",turno:"M",nota:""};
  await Promise.all([sala.registrarToma(ingreso.id,datos),sala.registrarToma(ingreso.id,datos)]);
  await assert.rejects(sala.registrarToma(ingreso.id,{...datos,id:"intento-B",responsable:"Internista B"}),{codigo:"40001"});
  await assert.rejects(sala.registrarToma(ingreso.id,{...datos,id:"omitida",programada:iso(ayer+"T13:00"),estado:"omitida",nota:""}));
  await sala.registrarToma(ingreso.id,{...datos,id:"omitida",programada:iso(ayer+"T13:00"),realizada:iso(ayer+"T13:05"),estado:"omitida",nota:"Motivo registrado"});
  await sala.agregarEvolucion(ingreso.id,{id:"ev-prueba",momento:iso(ayer+"T12:10"),turno:"M",responsable:"Internista A",nota:"Observación de prueba",monitoreo:{fluido:0,orina:"No"}});
  const mod={...base,id:"otra-pauta",reemplaza:base.id,inicio:iso(moverDia(dia,1)+"T08:00"),dosis:"Cantidad nueva"};
  await sala.prescribir(ingreso.id,mod);
  hoja=await sala.hoja(ingreso.id,ayer);
  const marcada=agendaDelDia(hoja,ayer).find(r=>r.toma?.id===datos.id);
  assert.equal(marcada.orden.dosis,"Cantidad documentada"); assert.equal(marcada.toma.responsable,"Internista A");
  assert.equal(hoja.notas.find(n=>n.id==="ev-prueba").monitoreo.fluido,0);
  await sala.suspender(ingreso.id,mod.id,"Internista B");
  await repo.guardarAtencion({...ingreso,fecha_local:fechaLocal(ingreso.inicio),abierta:false});
  assert.equal((await sala.hoja(ingreso.id,dia)).abierta,false);
  await assert.rejects(sala.prescribir(ingreso.id,{...base,id:"despues"}));
});
