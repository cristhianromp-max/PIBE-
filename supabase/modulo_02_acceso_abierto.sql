begin;
alter table public.pibe_pacientes add column version integer not null default 1, add column actualizado timestamptz not null default now();
alter table public.pibe_propietarios add column version integer not null default 1, add column actualizado timestamptz not null default now();
alter table public.pibe_atenciones add column version integer not null default 1, add column actualizado timestamptz not null default now();
create function public.pibe_marcar_cambio() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.version:=old.version+1;new.actualizado:=clock_timestamp();return new;end $$;
revoke all on function public.pibe_marcar_cambio() from public,anon,authenticated;
create trigger pibe_cambio_paciente before update on public.pibe_pacientes for each row execute function public.pibe_marcar_cambio();
create trigger pibe_cambio_propietario before update on public.pibe_propietarios for each row execute function public.pibe_marcar_cambio();
create trigger pibe_cambio_atencion before update on public.pibe_atenciones for each row execute function public.pibe_marcar_cambio();
create sequence public.pibe_numero_expediente;
grant usage on sequence public.pibe_numero_expediente to anon,authenticated;
grant select on public.pibe_pacientes,public.pibe_propietarios,public.pibe_atenciones to anon,authenticated;
grant insert(id,nombre,cedula,telefono),update(nombre,cedula,telefono) on public.pibe_propietarios to anon,authenticated;
grant insert(id,codigo,propietario_id,nombre,especie,sexo,raza,nacimiento,edad_estimada),update(nombre,especie,sexo,raza,nacimiento,edad_estimada) on public.pibe_pacientes to anon,authenticated;
grant insert(id,paciente_id,tipo,inicio,titulo,resumen,profesional_historico,abierta,peso),update(tipo,inicio,titulo,resumen,profesional_historico,abierta,peso) on public.pibe_atenciones to anon,authenticated;
drop policy lectura_propietarios on public.pibe_propietarios;
drop policy lectura_pacientes on public.pibe_pacientes;
drop policy lectura_atenciones on public.pibe_atenciones;
do $pol$
declare t text;
begin
 foreach t in array array['pibe_propietarios','pibe_pacientes','pibe_atenciones'] loop
  execute format('create policy acceso_lectura on public.%I for select to anon,authenticated using(true)',t);
  execute format('create policy acceso_alta on public.%I for insert to anon,authenticated with check(true)',t);
  execute format('create policy acceso_edicion on public.%I for update to anon,authenticated using(true) with check(true)',t);
 end loop;
end $pol$;
grant execute on function public.pibe_buscar_pacientes(text,integer,integer),public.pibe_historia(uuid,timestamptz,uuid) to anon,authenticated;
create function public.pibe_directorio(termino text default '',cantidad integer default 31,desplazamiento integer default 0, paciente uuid default null)
returns table(id uuid,codigo text,nombre text,especie text,raza text,sexo text,nacimiento date,edad_estimada text,propietario text,cedula text,telefono text,version integer,version_propietario integer)
language sql stable security invoker set search_path='' as $q$
with buscado as (select '%'||replace(replace(replace(translate(lower(trim(coalesce(termino,''))),'áéíóúüñ','aeiouun'),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' patron)
select p.id,p.codigo,p.nombre,p.especie,p.raza,p.sexo,p.nacimiento,p.edad_estimada,o.nombre,o.cedula,o.telefono,p.version,o.version
from public.pibe_pacientes p join public.pibe_propietarios o on o.id=p.propietario_id cross join buscado b
where (paciente is null or p.id=paciente) and (p.nombre_busqueda like b.patron or o.nombre_busqueda like b.patron or o.cedula like b.patron or lower(p.codigo) like b.patron)
order by p.nombre_busqueda,p.id limit least(greatest(coalesce(cantidad,31),1),100) offset greatest(coalesce(desplazamiento,0),0);
$q$;
create function public.pibe_eventos(paciente uuid,antes_de timestamptz default null,antes_id uuid default null)
returns table(id uuid,paciente_id uuid,tipo text,inicio timestamptz,titulo text,resumen text,profesional text,abierta boolean,peso numeric,version integer)
language sql stable security invoker set search_path='' as $q$
select a.id,a.paciente_id,a.tipo,a.inicio,a.titulo,a.resumen,a.profesional_historico,a.abierta,a.peso,a.version from public.pibe_atenciones a
where a.paciente_id=paciente and (antes_de is null or (a.inicio,a.id)<(antes_de,antes_id)) order by a.inicio desc,a.id desc limit 100;
$q$;
create function public.pibe_guardar_paciente(datos jsonb) returns uuid language plpgsql security invoker set search_path='' as $q$
declare
 pid uuid:=(datos->>'id')::uuid; esperado integer:=coalesce((datos->>'version')::integer,0);
 dueno text:=trim(datos->>'propietario'); doc text:=nullif(trim(datos->>'cedula'),''); tel text:=nullif(trim(datos->>'telefono'),'');
 oid uuid; previo public.pibe_pacientes%rowtype; tutor public.pibe_propietarios%rowtype;
begin
 if pid is null or nullif(trim(datos->>'nombre'),'') is null or nullif(trim(datos->>'especie'),'') is null or nullif(dueno,'') is null then raise exception 'Completa paciente, especie y propietario.' using errcode='22023';end if;
 if esperado=0 then
  -- Bloqueo por identificador de envío para que el doble toque no cree dos fichas.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pid::text,0));
  if exists(select 1 from public.pibe_pacientes p where p.id=pid) then return pid;end if;
  if doc is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('doc:'||doc,1));
    select * into tutor from public.pibe_propietarios o where o.cedula=doc for update;
    if found then
      if lower(tutor.nombre)<>lower(dueno) then raise exception 'La cédula ya pertenece a otro nombre. Revisa el propietario.' using errcode='22023';end if;
      oid:=tutor.id;
    end if;
  end if;
  if oid is null then
    insert into public.pibe_propietarios(nombre,cedula,telefono) values(dueno,doc,tel) returning id into oid;
  end if;
  insert into public.pibe_pacientes(id,codigo,propietario_id,nombre,especie,raza,sexo,nacimiento,edad_estimada)
  values(pid,'HC-'||to_char(nextval('public.pibe_numero_expediente'),'FM00000000'),oid,trim(datos->>'nombre'),trim(datos->>'especie'),nullif(trim(datos->>'raza'),''),nullif(trim(datos->>'sexo'),''),nullif(datos->>'nacimiento','')::date,nullif(trim(datos->>'edad_estimada'),''));
 else
  select * into previo from public.pibe_pacientes p where p.id=pid for update;
  if not found or previo.version<>esperado then raise exception 'Otra persona modificó esta ficha. Cierra el formulario y vuelve a abrir los datos actualizados.' using errcode='40001';end if;
  select * into tutor from public.pibe_propietarios o where o.id=previo.propietario_id for update;
  if tutor.version is distinct from (datos->>'version_propietario')::integer then raise exception 'El propietario cambió en otro dispositivo. Actualiza la ficha.' using errcode='40001';end if;
  if (tutor.nombre,tutor.cedula,tutor.telefono) is distinct from (dueno,doc,tel) then
   update public.pibe_propietarios set nombre=dueno,cedula=doc,telefono=tel where id=tutor.id;
  end if;
  update public.pibe_pacientes set nombre=trim(datos->>'nombre'),especie=trim(datos->>'especie'),raza=nullif(trim(datos->>'raza'),''),sexo=nullif(trim(datos->>'sexo'),''),nacimiento=nullif(datos->>'nacimiento','')::date,edad_estimada=nullif(trim(datos->>'edad_estimada'),'') where id=pid;
 end if;return pid;
end $q$;
create function public.pibe_guardar_atencion(datos jsonb) returns uuid language plpgsql security invoker set search_path='' as $q$
declare aid uuid:=(datos->>'id')::uuid; pid uuid:=(datos->>'paciente_id')::uuid; v integer:=coalesce((datos->>'version')::integer,0);
 clase text:=datos->>'tipo'; titulo_nuevo text:=nullif(trim(datos->>'titulo'),'');
 momento timestamptz:=(datos->>'fecha_local')::timestamp at time zone 'America/Guayaquil';
 profesional text:=nullif(trim(datos->>'profesional'),''); detalle text:=nullif(trim(datos->>'resumen'),'');
 medida numeric:=nullif(datos->>'peso','')::numeric; activa boolean:=clase='hospitalizacion' and coalesce((datos->>'abierta')::boolean,false);
begin
 if aid is null or pid is null or momento is null or titulo_nuevo is null then raise exception 'Completa la fecha y el motivo de la atención.' using errcode='22023';end if;
 if v=0 then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(aid::text,0));
   if exists(select 1 from public.pibe_atenciones where id=aid and paciente_id=pid) then return aid;end if;
   insert into public.pibe_atenciones(id,paciente_id,tipo,inicio,titulo,resumen,profesional_historico,peso,abierta)
   values(aid,pid,clase,momento,titulo_nuevo,detalle,profesional,medida,activa);
 else
   update public.pibe_atenciones set tipo=clase,inicio=momento,titulo=titulo_nuevo,resumen=detalle,profesional_historico=profesional,peso=medida,abierta=activa where id=aid and paciente_id=pid and version=v;
   if not found then raise exception 'Otra persona modificó esta atención. Actualiza antes de guardar.' using errcode='40001';end if;
 end if;return aid;
end $q$;
revoke all on function public.pibe_directorio(text,integer,integer,uuid),public.pibe_eventos(uuid,timestamptz,uuid),public.pibe_guardar_paciente(jsonb),public.pibe_guardar_atencion(jsonb) from public;
grant execute on function public.pibe_directorio(text,integer,integer,uuid),public.pibe_eventos(uuid,timestamptz,uuid),public.pibe_guardar_paciente(jsonb),public.pibe_guardar_atencion(jsonb) to anon,authenticated;

commit;

