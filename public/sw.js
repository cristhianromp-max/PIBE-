const cacheName="el-pibe-shell-4";
self.addEventListener("install",event=>{event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(["/","/icono.svg","/manifest.webmanifest"])));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("el-pibe-shell-")&&key!==cacheName).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
  const request=event.request, url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin||request.headers.has("Authorization"))return;
  const asset=url.pathname.startsWith("/assets/")&&!url.search;
  const portada=request.mode==="navigate"&&url.pathname==="/"&&!url.search;
  if(!asset&&!portada)return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    if(asset){const hit=await cache.match(request);if(hit)return hit;}
    try {
      const response=await fetch(request);
      if(response.ok)await cache.put(portada?"/":request,response.clone());
      return response;
    } catch(error) {
      const hit=await cache.match(portada?"/":request);
      if(hit)return hit;
      throw error;
    }
  })());
});

