const base = Deno.env.get("SUPABASE_URL")!;
const archivo = "Clinica-El-Pibe-1.0.0.apk";
const ruta = "/storage/v1/object/public/pibe-aplicacion/android/350e2cdab956c47b8708/";
const descarga = base + ruta + archivo + "?download=" + archivo;

Deno.serve((solicitud: Request) => {
  if (solicitud.method !== "GET" && solicitud.method !== "HEAD") {
    return new Response(null, {status: 405, headers: {Allow: "GET, HEAD"}});
  }
  return new Response(null, {
    status: 302,
    headers: {Location: descarga, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
  });
});
