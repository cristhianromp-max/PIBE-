import test from "node:test";
import assert from "node:assert/strict";
import {crearRepositorio,fechaLocal} from "../src/datos.mjs";
test("busca, crea, edita y detecta conflicto sin cuenta",async()=>{const r=crearRepositorio({});assert.equal((await r.listar("avila")).items.length,2);assert.equal((await r.listar("0000000101")).items.length,2);const p=(await r.ficha("prueba-1")).p;await r.guardarPaciente({...p,nombre:"Editada"});assert.equal((await r.ficha(p.id)).p.nombre,"Editada");await assert.rejects(r.guardarPaciente({...p,nombre:"Antiguo"}));const v=(await r.ficha(p.id)).atenciones[0];await r.guardarAtencion({...v,fecha_local:fechaLocal(v.inicio),titulo:"Revisada"});assert.equal((await r.ficha(p.id)).atenciones[0].titulo,"Revisada");});

