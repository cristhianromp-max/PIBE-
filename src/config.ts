import originalVector from "./marca.svg";
const archivos=import.meta.glob("./logo-original.{jpg,jpeg,png,webp}",{eager:true,import:"default"});
export const marca=Object.values(archivos)[0]||originalVector;
const demo=import.meta.env.VITE_SOLO_DEMO==="1";
export const config={url:demo?"":(import.meta.env.VITE_SUPABASE_URL||"https://dxunidqyomvcedwlpiuq.supabase.co"),clave:demo?"":(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_798VdxGZ_Vj64mzv6grJ1g_18J-P08O")};

