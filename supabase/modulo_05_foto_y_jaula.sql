begin;

create type public.pibe_jaula as enum ('Infeccioso','Post operatorio','Gatera','Hospitalización 1');
grant usage on type public.pibe_jaula to anon, authenticated, service_role;
alter table public.pibe_atenciones add column jaula public.pibe_jaula,
  add constraint pibe_jaula_solo_ingreso check (jaula is null or tipo='hospitalizacion');
grant insert(jaula), update(jaula) on public.pibe_atenciones to anon, authenticated;

-- Drive guarda las miniaturas. Una huella evita duplicar un mismo contenido para el paciente.
create table pibe_interno.fotos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pibe_pacientes(id),
  huella text not null check(huella ~ '^[0-9a-f]{64}$'),
  bytes integer not null check(bytes between 1 and 40960),
  archivo_drive text check (length(archivo_drive) between 1 and 250),
  unique(paciente_id,huella),
  unique(paciente_id,id)
);
create table pibe_interno.foto_actual (
  paciente_id uuid primary key,
  foto_id uuid not null,
  foreign key(paciente_id,foto_id) references pibe_interno.fotos(paciente_id,id)
);
alter table pibe_interno.fotos enable row level security;
alter table pibe_interno.foto_actual enable row level security;
revoke all on pibe_interno.fotos,pibe_interno.foto_actual from public,anon,authenticated;
grant usage on schema pibe_interno to service_role;
grant select,insert,update on pibe_interno.fotos,pibe_interno.foto_actual to service_role;
grant select on pibe_interno.foto_actual to anon,authenticated;
create policy identificacion_visible on pibe_interno.foto_actual for select to anon,authenticated using(true);
create policy fotos_servidor on pibe_interno.fotos for all to service_role using(true) with check(true);

create function public.pibe_foto_reservar(paciente uuid, anterior uuid, huella_imagen text, cantidad integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actual uuid; archivo pibe_interno.fotos%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('foto:'||paciente::text,0));
  if not exists(select 1 from public.pibe_pacientes where id=paciente) then return jsonb_build_object('estado','ausente'); end if;
  select foto_id into actual from pibe_interno.foto_actual where paciente_id=paciente;
  select * into archivo from pibe_interno.fotos where paciente_id=paciente and huella=huella_imagen;
  if archivo.id is not null and archivo.id=actual then return jsonb_build_object('estado','igual','id',actual); end if;
  if actual is distinct from anterior then return jsonb_build_object('estado','conflicto'); end if;
  if archivo.id is null then
    insert into pibe_interno.fotos(paciente_id,huella,bytes) values(paciente,huella_imagen,cantidad) returning * into archivo;
  end if;
  return jsonb_build_object('estado','reservada','id',archivo.id,'archivo_drive',archivo.archivo_drive);
end $$;

create function public.pibe_foto_confirmar(paciente uuid, anterior uuid, foto uuid, en_drive text)
returns text language plpgsql security invoker set search_path='' as $$
declare actual uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('foto:'||paciente::text,0));
  update pibe_interno.fotos set archivo_drive=en_drive
    where paciente_id=paciente and id=foto and nullif(en_drive,'') is not null and (archivo_drive is null or archivo_drive=en_drive);
  if not found then return 'ausente'; end if;
  select foto_id into actual from pibe_interno.foto_actual where paciente_id=paciente;
  if actual=foto then return 'ok'; end if;
  if actual is distinct from anterior then return 'conflicto'; end if;
  insert into pibe_interno.foto_actual(paciente_id,foto_id) values(paciente,foto)
    on conflict(paciente_id) do update set foto_id=excluded.foto_id;
  return 'ok';
end $$;

create function public.pibe_foto_archivo(paciente uuid, foto uuid)
returns table(archivo_drive text,bytes integer,huella text) language sql stable security invoker set search_path='' as $$
 select f.archivo_drive,f.bytes,f.huella from pibe_interno.fotos f
 join pibe_interno.foto_actual a on (a.paciente_id,a.foto_id)=(f.paciente_id,f.id)
 where f.paciente_id=paciente and f.id=foto
$$;
revoke all on function public.pibe_foto_reservar(uuid,uuid,text,integer),public.pibe_foto_confirmar(uuid,uuid,uuid,text),
 public.pibe_foto_archivo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pibe_foto_reservar(uuid,uuid,text,integer),public.pibe_foto_confirmar(uuid,uuid,uuid,text),
 public.pibe_foto_archivo(uuid,uuid) to service_role;

create function public.pibe_directorio_identificado(termino text default '', cantidad integer default 31,
 desplazamiento integer default 0, paciente uuid default null)
returns table(id uuid,codigo text,nombre text,especie text,raza text,sexo text,nacimiento date,edad_estimada text,
 propietario text,cedula text,telefono text,version integer,version_propietario integer,foto_id uuid)
language sql stable security invoker set search_path='' as $$
 select d.id,d.codigo,d.nombre,d.especie,d.raza,d.sexo,d.nacimiento,d.edad_estimada,d.propietario,
        d.cedula,d.telefono,d.version,d.version_propietario,f.foto_id
 from public.pibe_directorio(termino,cantidad,desplazamiento,paciente) with ordinality d
 left join pibe_interno.foto_actual f on f.paciente_id=d.id order by d.ordinality
$$;

create function public.pibe_eventos_identificados(paciente uuid, antes_de timestamptz default null, antes_id uuid default null)
returns table(id uuid,paciente_id uuid,tipo text,inicio timestamptz,titulo text,resumen text,profesional text,abierta boolean,
 peso numeric,version integer,detalle_clinico jsonb,jaula public.pibe_jaula)
language sql stable security invoker set search_path='' as $$
 select e.*,a.jaula from public.pibe_eventos_clinicos(paciente,antes_de,antes_id) e
 join public.pibe_atenciones a on a.id=e.id order by e.inicio desc,e.id desc
$$;

create function public.pibe_hoja_identificada(ingreso uuid,dia date)
returns jsonb language sql stable security invoker set search_path='' as $$
 select public.pibe_hoja_turno(ingreso,dia) || jsonb_build_object('jaula',a.jaula,'foto_id',f.foto_id)
 from public.pibe_atenciones a left join pibe_interno.foto_actual f on f.paciente_id=a.paciente_id
 where a.id=ingreso and a.tipo='hospitalizacion'
$$;

create function public.pibe_asignar_jaula(ingreso uuid,nueva public.pibe_jaula,anterior public.pibe_jaula)
returns public.pibe_jaula language plpgsql security invoker set search_path='' as $$
declare actual public.pibe_jaula; activo boolean;
begin
 select jaula,abierta into actual,activo from public.pibe_atenciones where id=ingreso and tipo='hospitalizacion' for update;
 if not found or not activo then raise exception 'Este ingreso está cerrado o ya no existe.' using errcode='22023'; end if;
 if actual is not distinct from nueva then return actual; end if;
 if actual is distinct from anterior then raise exception 'Otro médico cambió la jaula. Revisa la ubicación actual antes de guardar.' using errcode='40001'; end if;
 update public.pibe_atenciones set jaula=nueva where id=ingreso;
 return nueva;
end $$;
revoke all on function public.pibe_directorio_identificado(text,integer,integer,uuid),
 public.pibe_eventos_identificados(uuid,timestamptz,uuid),public.pibe_hoja_identificada(uuid,date),
 public.pibe_asignar_jaula(uuid,public.pibe_jaula,public.pibe_jaula) from public;
grant execute on function public.pibe_directorio_identificado(text,integer,integer,uuid),
 public.pibe_eventos_identificados(uuid,timestamptz,uuid),public.pibe_hoja_identificada(uuid,date),
 public.pibe_asignar_jaula(uuid,public.pibe_jaula,public.pibe_jaula) to anon,authenticated;

create or replace function public.pibe_guardar_atencion(datos jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  aid uuid := (datos->>'id')::uuid;
  pid uuid := (datos->>'paciente_id')::uuid;
  esperado integer := coalesce((datos->>'version')::integer,0);
  clase text := datos->>'tipo';
  motivo text := nullif(trim(datos->>'titulo'),'');
  momento timestamptz := (datos->>'fecha_local')::timestamp at time zone 'America/Guayaquil';
  autor text := nullif(trim(datos->>'profesional'),'');
  nota text := nullif(trim(datos->>'resumen'),'');
  peso_nuevo numeric := nullif(datos->>'peso','')::numeric;
  jaula_nueva public.pibe_jaula := nullif(datos->>'jaula','')::public.pibe_jaula;
  activa boolean := clase='hospitalizacion' and coalesce((datos->>'abierta')::boolean,false);
begin
  if aid is null or pid is null or momento is null or motivo is null then
    raise exception 'Completa la fecha y el motivo de la atención.' using errcode='22023';
  end if;
  if esperado=0 then
    perform pg_advisory_xact_lock(hashtextextended(aid::text,0));
    if exists(select 1 from public.pibe_atenciones where id=aid and paciente_id=pid) then return aid; end if;
    insert into public.pibe_atenciones(id,paciente_id,tipo,inicio,titulo,resumen,profesional_historico,peso,abierta,detalle_clinico,jaula)
    values(aid,pid,clase,momento,motivo,nota,autor,peso_nuevo,activa,coalesce(datos->'detalle_clinico','{}'::jsonb),jaula_nueva);
  else
    update public.pibe_atenciones set tipo=clase,inicio=momento,titulo=motivo,resumen=nota,
      profesional_historico=autor,peso=peso_nuevo,abierta=activa,
      jaula=case when clase<>'hospitalizacion' then null when datos ? 'jaula' then jaula_nueva else jaula end,
      detalle_clinico=coalesce(datos->'detalle_clinico',detalle_clinico)
    where id=aid and paciente_id=pid and version=esperado;
    if not found then raise exception 'Otra persona modificó esta atención. Actualiza antes de guardar.' using errcode='40001'; end if;
  end if;
  return aid;
end $$;

notify pgrst, 'reload schema';
commit;
