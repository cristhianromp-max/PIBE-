import React from "react";
import {Campo} from "./Campos.jsx";
import {camposConsulta, camposIngreso, constantes, tiposConsulta, valorClinico} from "./registro.mjs";

export function CampoClinico({campo,valor,prefijo}) {
  const nombre="clin_"+campo.clave;
  const etiqueta=campo.nombre+(campo.unidad?" ("+campo.unidad+")":"");
  if (campo.paso) return <Campo etiqueta={etiqueta} nombre={nombre} valor={valor} tipo="number" min="0" step={campo.paso} max={campo.max}/>;
  if (campo.opciones) return <Campo etiqueta={etiqueta} nombre={nombre} valor={valor} opciones={[["","Sin registrar"],...campo.opciones]}/>;
  if (campo.sugerencias) {
    const lista=prefijo+"-"+campo.clave;
    return <div><Campo etiqueta={etiqueta} nombre={nombre} valor={valor} list={lista} maxLength={12000}/><datalist id={lista}>{campo.sugerencias.map(v=><option key={v} value={v}/>)}</datalist></div>;
  }
  return <div className={campo.textoCorto?"":"ve-ancho"}><Campo etiqueta={etiqueta} nombre={nombre} valor={valor} tipo={campo.textoCorto?"text":"textarea"} maxLength={12000}/></div>;
}

export function GrupoClinico({titulo,campos,datos,prefijo}) {
  return <fieldset className="ve-grupo ve-ancho"><legend>{titulo}</legend><div className="ve-grilla">{campos.map(c=><CampoClinico key={c.clave} campo={c} valor={datos[c.clave]} prefijo={prefijo}/>)}</div></fieldset>;
}
export function CamposClinicos({tipo,datos={}}) {
  if (tipo==="hospitalizacion") return <GrupoClinico titulo="Ingreso hospitalario" campos={camposIngreso} datos={datos} prefijo="ingreso"/>;
  if (!tiposConsulta.includes(tipo)) return null;
  return <>
    <GrupoClinico titulo="Anamnesis y examen físico" campos={camposConsulta.slice(0,3)} datos={datos} prefijo="exploracion"/>
    <GrupoClinico titulo="Constantes fisiológicas" campos={constantes} datos={datos} prefijo="constantes"/>
    <GrupoClinico titulo="Diagnóstico y tratamiento" campos={camposConsulta.slice(3+constantes.length)} datos={datos} prefijo="diagnostico"/>
  </>;
}
export function ValoresClinicos({datos={},campos}) {
  const visibles=campos.filter(c=>datos[c.clave]!=null&&datos[c.clave]!=="");
  if (!visibles.length) return null;
  return <dl className="ve-valores">{visibles.map(c=><div key={c.clave}><dt>{c.nombre}</dt><dd>{valorClinico(c,datos[c.clave])}</dd></div>)}</dl>;
}
