import React from "react";
export function Boton({icono:G,children,principal=false,...props}) {
 return <button type="button" className={principal?"ve-button":"ve-ghost"} {...props}>{G&&<G size={16} aria-hidden="true"/>}{children}</button>;
}
export function Campo({etiqueta,nombre,valor,opciones,tipo="text",...resto}){
 return <label className="ve-field">{etiqueta}{opciones?<select name={nombre} defaultValue={valor??""} {...resto}>{opciones.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select>:tipo==="textarea"?<textarea name={nombre} defaultValue={valor??""} rows={3} {...resto}/>:<input name={nombre} defaultValue={valor??""} type={tipo} {...resto}/>}</label>;
}
