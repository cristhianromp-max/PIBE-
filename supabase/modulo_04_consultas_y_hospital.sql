begin;

create schema if not exists pibe_interno;
revoke all on schema pibe_interno from public;
grant usage on schema pibe_interno to anon, authenticated;

-- Los campos clínicos ausentes significan que no se registraron.
create function pibe_interno.campos_validos(obj jsonb, textos text[], numeros text[], porcentajes text[])
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare campo record;
begin
  if jsonb_typeof(obj) is distinct from 'object' then return false; end if;
  for campo in select * from jsonb_each(obj) loop
    if campo.key = any(textos) then
      if jsonb_typeof(campo.value) <> 'string' or length(campo.value #>> '{}') > 12000 then return false; end if;
    elsif campo.key = any(numeros || porcentajes) then
      if jsonb_typeof(campo.value) <> 'number' then return false; end if;
      if (campo.value::text)::numeric < 0 then return false; end if;
      if campo.key = any(porcentajes) and (campo.value::text)::numeric > 100 then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end $$;

alter table public.pibe_atenciones add column detalle_clinico jsonb not null default '{}'::jsonb;
alter table public.pibe_atenciones add constraint pibe_formato_detalle check (
  case when tipo in ('consulta','control') then pibe_interno.campos_validos(detalle_clinico,
    array['anamnesis','examen','mucosas','diferenciales','presuntivo','definitivo','tratamiento'],
    array['temperatura','fc','fr','trc'],array['spo2'])
  when tipo='hospitalizacion' then pibe_interno.campos_validos(detalle_clinico,
    array['ubicacion','diagnostico','condicion','comportamiento'],array['dias'],array[]::text[])
  else detalle_clinico='{}'::jsonb end
);
grant insert(detalle_clinico), update(detalle_clinico) on public.pibe_atenciones to anon, authenticated;

create table pibe_interno.ordenes (
  id uuid primary key,
  ingreso_id uuid not null references public.pibe_atenciones(id),
  reemplaza uuid unique references pibe_interno.ordenes(id),
  medicina text not null check (length(trim(medicina)) between 1 and 180),
  dosis text not null check (length(trim(dosis)) between 1 and 120),
  via text not null check (length(trim(via)) between 1 and 100),
  pauta text not null check (pauta in ('intervalo','horarios','unica')),
  intervalo_horas integer,
  minutos integer[] not null default '{}',
  inicio timestamptz not null,
  fin timestamptz check (fin >= inicio),
  responsable text not null check (length(trim(responsable)) between 1 and 140),
  creada timestamptz not null default now(),
  suspendida_en timestamptz, retirada_por text,
  check (inicio=date_trunc('minute',inicio)),
  check ((pauta='intervalo' and intervalo_horas is not null and intervalo_horas between 1 and 8760 and cardinality(minutos)=0)
      or (pauta='horarios' and intervalo_horas is null and cardinality(minutos)>0 and 0 <= all(minutos) and 1440 > all(minutos))
      or (pauta='unica' and intervalo_horas is null and cardinality(minutos)=0)),
  check ((suspendida_en is null) = (retirada_por is null))
);
create index pibe_orden_ingreso_idx on pibe_interno.ordenes(ingreso_id,inicio);

create table pibe_interno.tomas (
  id uuid primary key,
  orden_id uuid not null references pibe_interno.ordenes(id),
  programada timestamptz not null,
  estado text not null check (estado in ('administrada','omitida')),
  realizada timestamptz not null,
  responsable text not null check (length(trim(responsable)) between 1 and 140),
  turno text not null check (turno in ('M','T','N')),
  nota text check (length(nota)<=12000),
  registrada timestamptz not null default now(),
  unique(orden_id,programada),
  check (estado <> 'omitida' or nullif(trim(nota),'') is not null)
);
create table pibe_interno.evoluciones (
  id uuid primary key,
  ingreso_id uuid not null references public.pibe_atenciones(id),
  momento timestamptz not null,
  turno text not null check (turno in ('M','T','N')),
  responsable text not null check (length(trim(responsable)) between 1 and 140),
  nota text check (length(nota)<=12000),
  monitoreo jsonb not null default '{}',
  registrada timestamptz not null default now(),
  check (nullif(trim(nota),'') is not null or monitoreo <> '{}'::jsonb),
  check (pibe_interno.campos_validos(monitoreo,
    array['comida','conciencia','vomitos','diarreas','orina','heces','solucion'],
    array['temperatura','fc','fr','fluido'],array['deshidratacion']))
);
create index pibe_evolucion_ingreso_idx on pibe_interno.evoluciones(ingreso_id,momento desc);

-- Tablas internas fuera del esquema de la API. Los accesos del equipo se hacen por las funciones públicas.
alter table pibe_interno.ordenes enable row level security;
alter table pibe_interno.tomas enable row level security;
alter table pibe_interno.evoluciones enable row level security;
revoke all on pibe_interno.ordenes,pibe_interno.tomas,pibe_interno.evoluciones from public,anon,authenticated;
grant select,insert on pibe_interno.ordenes,pibe_interno.tomas,pibe_interno.evoluciones to anon,authenticated;
grant update(suspendida_en,retirada_por) on pibe_interno.ordenes to anon,authenticated;
create policy lectura_orden on pibe_interno.ordenes for select to anon,authenticated using (true);
create policy alta_orden on pibe_interno.ordenes for insert to anon,authenticated with check (true);
create policy retiro_orden on pibe_interno.ordenes for update to anon,authenticated using (true) with check (true);
create policy lectura_toma on pibe_interno.tomas for select to anon,authenticated using (true);
create policy alta_toma on pibe_interno.tomas for insert to anon,authenticated with check (true);
create policy lectura_evolucion on pibe_interno.evoluciones for select to anon,authenticated using (true);
create policy alta_evolucion on pibe_interno.evoluciones for insert to anon,authenticated with check (true);

-- Una edición desde una versión previa del aplicativo conserva cualquier dato estructurado.
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
  activa boolean := clase='hospitalizacion' and coalesce((datos->>'abierta')::boolean,false);
begin
  if aid is null or pid is null or momento is null or motivo is null then
    raise exception 'Completa la fecha y el motivo de la atención.' using errcode='22023';
  end if;
  if esperado=0 then
    perform pg_advisory_xact_lock(hashtextextended(aid::text,0));
    if exists(select 1 from public.pibe_atenciones where id=aid and paciente_id=pid) then return aid; end if;
    insert into public.pibe_atenciones(id,paciente_id,tipo,inicio,titulo,resumen,profesional_historico,peso,abierta,detalle_clinico)
    values(aid,pid,clase,momento,motivo,nota,autor,peso_nuevo,activa,coalesce(datos->'detalle_clinico','{}'::jsonb));
  else
    update public.pibe_atenciones set tipo=clase,inicio=momento,titulo=motivo,resumen=nota,
      profesional_historico=autor,peso=peso_nuevo,abierta=activa,detalle_clinico=coalesce(datos->'detalle_clinico',detalle_clinico)
    where id=aid and paciente_id=pid and version=esperado;
    if not found then raise exception 'Otra persona modificó esta atención. Actualiza antes de guardar.' using errcode='40001'; end if;
  end if;
  return aid;
end $$;

create function pibe_interno.proteger_ingreso() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (case when old.tipo='control' then 'consulta' else old.tipo end) <>
     (case when new.tipo='control' then 'consulta' else new.tipo end) and
     (old.detalle_clinico<>'{}'::jsonb or exists(select 1 from pibe_interno.ordenes where ingreso_id=old.id)
      or exists(select 1 from pibe_interno.evoluciones where ingreso_id=old.id)) then
    raise exception 'Esta atención contiene datos clínicos. Crea otra atención para cambiar de tipo.' using errcode='22023';
  end if;
  if old.tipo='hospitalizacion' and new.inicio>old.inicio and
     (exists(select 1 from pibe_interno.ordenes where ingreso_id=old.id and inicio<new.inicio) or
      exists(select 1 from pibe_interno.evoluciones where ingreso_id=old.id and momento<new.inicio)) then
    raise exception 'El ingreso debe ser anterior a sus registros de hospitalización.' using errcode='22023';
  end if;
  if old.abierta and not new.abierta then
    update pibe_interno.ordenes set suspendida_en=clock_timestamp(), retirada_por=coalesce(new.profesional_historico,'Cierre del ingreso')
    where ingreso_id=old.id and suspendida_en is null;
  end if;
  return new;
end $$;
create trigger pibe_proteccion_hoja before update of tipo,inicio,abierta on public.pibe_atenciones
for each row execute function pibe_interno.proteger_ingreso();

create function public.pibe_eventos_clinicos(paciente uuid, antes_de timestamptz default null, antes_id uuid default null)
returns table(id uuid,paciente_id uuid,tipo text,inicio timestamptz,titulo text,resumen text,profesional text,abierta boolean,peso numeric,version integer,detalle_clinico jsonb)
language sql stable security invoker set search_path='' as $$
  select a.id,a.paciente_id,a.tipo,a.inicio,a.titulo,a.resumen,a.profesional_historico,a.abierta,a.peso,a.version,a.detalle_clinico
  from public.pibe_atenciones a
  where a.paciente_id=paciente and (antes_de is null or (a.inicio,a.id)<(antes_de,antes_id))
  order by a.inicio desc,a.id desc limit 100
$$;

create function pibe_interno.bloquear_ingreso(ingreso uuid) returns timestamptz
language plpgsql security invoker set search_path='' as $$
declare admision public.pibe_atenciones%rowtype;
begin
  select * into admision from public.pibe_atenciones where id=ingreso and tipo='hospitalizacion' for update;
  if not found or not admision.abierta then raise exception 'La hospitalización está cerrada o ya no existe.' using errcode='22023'; end if;
  return admision.inicio;
end $$;

create function public.pibe_prescribir(ingreso uuid, datos jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  nuevo uuid := (datos->>'id')::uuid;
  anterior uuid := nullif(datos->>'reemplaza','')::uuid;
  autor text := nullif(trim(datos->>'responsable'),'');
  primero timestamptz := (datos->>'inicio')::timestamptz;
  ultimo timestamptz := nullif(datos->>'fin','')::timestamptz;
  horas integer[];
  clase text := datos->>'pauta';
  ingreso_desde timestamptz := pibe_interno.bloquear_ingreso(ingreso);
  corte timestamptz := date_trunc('minute',clock_timestamp());
begin
  if exists(select 1 from pibe_interno.ordenes where id=nuevo and ingreso_id=ingreso) then return nuevo; end if;
  if autor is null or primero is null or primero<date_trunc('minute',ingreso_desde) or ultimo<primero then
    raise exception 'Revisa el responsable y las fechas de la prescripción con respecto al ingreso.' using errcode='22023';
  end if;
  if anterior is not null then
    if primero<corte then raise exception 'Indica desde qué hora se aplicará la nueva pauta, a partir de ahora.' using errcode='22023'; end if;
    if exists(select 1 from pibe_interno.tomas where orden_id=anterior and programada>=primero) then
      raise exception 'Ya hay una toma registrada en ese periodo. Inicia la nueva pauta después de esa toma.' using errcode='22023';
    end if;
    update pibe_interno.ordenes set suspendida_en=corte,retirada_por=autor where id=anterior and ingreso_id=ingreso and suspendida_en is null;
    if not found then raise exception 'La pauta ya cambió. Actualiza la hoja.' using errcode='40001'; end if;
  end if;
  select array(select distinct m::integer from jsonb_array_elements_text(coalesce(datos->'minutos','[]'::jsonb)) t(m) order by 1) into horas;
  insert into pibe_interno.ordenes(id,ingreso_id,reemplaza,medicina,dosis,via,pauta,intervalo_horas,minutos,inicio,fin,responsable)
  values(nuevo,ingreso,anterior,trim(datos->>'medicina'),trim(datos->>'dosis'),trim(datos->>'via'),clase,
    nullif(datos->>'intervalo_horas','')::integer,horas,primero,ultimo,autor);
  return nuevo;
end $$;

create function public.pibe_suspender_orden(ingreso uuid, orden uuid, responsable text) returns uuid
language plpgsql security invoker set search_path='' as $$
begin
  perform pibe_interno.bloquear_ingreso(ingreso);
  if nullif(trim(responsable),'') is null or length(trim(responsable))>140 then raise exception 'Indica quién suspende la pauta.' using errcode='22023'; end if;
  update pibe_interno.ordenes set suspendida_en=clock_timestamp(),retirada_por=trim(pibe_suspender_orden.responsable)
  where id=orden and ingreso_id=ingreso and suspendida_en is null;
  if not exists(select 1 from pibe_interno.ordenes where id=orden and ingreso_id=ingreso) then raise exception 'La prescripción no pertenece a este ingreso.' using errcode='22023'; end if;
  return orden;
end $$;

create function pibe_interno.hora_prevista(o pibe_interno.ordenes, instante timestamptz) returns boolean
language sql stable security invoker set search_path='' as $$
  select instante=date_trunc('minute',instante) and instante>=o.inicio
     and (o.fin is null or instante<=o.fin) and (o.suspendida_en is null or instante<o.suspendida_en)
     and case o.pauta when 'unica' then instante=o.inicio
       when 'intervalo' then mod(extract(epoch from (instante-o.inicio)),o.intervalo_horas*3600)=0
       else (extract(hour from instante at time zone 'America/Guayaquil')::int*60+
             extract(minute from instante at time zone 'America/Guayaquil')::int)=any(o.minutos) end
$$;

create function public.pibe_registrar_toma(ingreso uuid, datos jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  nuevo uuid := (datos->>'id')::uuid;
  oid uuid := (datos->>'orden_id')::uuid;
  prevista timestamptz := (datos->>'programada')::timestamptz;
  real timestamptz := (datos->>'realizada')::timestamptz;
  ingreso_desde timestamptz := pibe_interno.bloquear_ingreso(ingreso);
  orden pibe_interno.ordenes%rowtype;
begin
  select * into orden from pibe_interno.ordenes where id=oid and ingreso_id=ingreso;
  if not found then raise exception 'La prescripción no corresponde a este ingreso.' using errcode='22023'; end if;
  if exists(select 1 from pibe_interno.tomas where id=nuevo and orden_id=oid and programada=prevista) then return nuevo; end if;
  if exists(select 1 from pibe_interno.tomas where orden_id=oid and programada=prevista) then
    raise exception 'Esa dosis ya fue registrada. Actualiza para ver quién la registró.' using errcode='40001';
  end if;
  if pibe_interno.hora_prevista(orden,prevista) is not true or real is null or real>clock_timestamp()
     or real<date_trunc('minute',ingreso_desde) or (orden.suspendida_en is not null and real>=orden.suspendida_en)
     or (prevista at time zone 'America/Guayaquil')::date > (clock_timestamp() at time zone 'America/Guayaquil')::date then
    raise exception 'Revisa la hora real, la fecha seleccionada y la vigencia de la pauta.' using errcode='22023';
  end if;
  insert into pibe_interno.tomas(id,orden_id,programada,estado,realizada,responsable,turno,nota)
    values(nuevo,oid,prevista,datos->>'estado',real,trim(datos->>'responsable'),datos->>'turno',nullif(trim(datos->>'nota'),''));
  return nuevo;
end $$;

create function public.pibe_agregar_evolucion(ingreso uuid, datos jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  nuevo uuid := (datos->>'id')::uuid;
  instante timestamptz := (datos->>'momento')::timestamptz;
  ingreso_desde timestamptz := pibe_interno.bloquear_ingreso(ingreso);
begin
  if exists(select 1 from pibe_interno.evoluciones where id=nuevo and ingreso_id=ingreso) then return nuevo; end if;
  if instante is null or instante<date_trunc('minute',ingreso_desde) or instante>clock_timestamp() then
    raise exception 'La observación debe estar entre la fecha de ingreso y este momento.' using errcode='22023';
  end if;
  insert into pibe_interno.evoluciones(id,ingreso_id,momento,turno,responsable,nota,monitoreo)
    values(nuevo,ingreso,instante,datos->>'turno',trim(datos->>'responsable'),nullif(trim(datos->>'nota'),''),coalesce(datos->'monitoreo','{}'::jsonb));
  return nuevo;
end $$;

create function public.pibe_hoja_turno(ingreso uuid,dia date) returns jsonb
language sql stable security invoker set search_path='' as $$
  with limites as (select dia::timestamp at time zone 'America/Guayaquil' as desde,(dia+1)::timestamp at time zone 'America/Guayaquil' as hasta)
  select jsonb_build_object('abierta',a.abierta,
    'ordenes',coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object('unica_registrada',o.pauta='unica' and exists(select 1 from pibe_interno.tomas t where t.orden_id=o.id)) order by o.creada,o.id) from pibe_interno.ordenes o where o.ingreso_id=a.id),'[]'::jsonb),
    'tomas',coalesce((select jsonb_agg(to_jsonb(t) order by t.programada,t.id) from pibe_interno.tomas t join pibe_interno.ordenes o on o.id=t.orden_id
       where o.ingreso_id=a.id and t.programada>=l.desde and t.programada<l.hasta),'[]'::jsonb),
    'notas',coalesce((select jsonb_agg(to_jsonb(e) order by e.momento desc,e.registrada desc,e.id)
       from pibe_interno.evoluciones e where e.ingreso_id=a.id and e.momento>=l.desde and e.momento<l.hasta),'[]'::jsonb))
  from public.pibe_atenciones a cross join limites l where a.id=ingreso and a.tipo='hospitalizacion'
$$;

revoke all on all functions in schema pibe_interno from public;
grant execute on function pibe_interno.campos_validos(jsonb,text[],text[],text[]),pibe_interno.bloquear_ingreso(uuid),
  pibe_interno.hora_prevista(pibe_interno.ordenes,timestamptz) to anon,authenticated;
revoke all on function public.pibe_eventos_clinicos(uuid,timestamptz,uuid),public.pibe_hoja_turno(uuid,date),
  public.pibe_prescribir(uuid,jsonb),public.pibe_suspender_orden(uuid,uuid,text),public.pibe_registrar_toma(uuid,jsonb),
  public.pibe_agregar_evolucion(uuid,jsonb) from public;
grant execute on function public.pibe_eventos_clinicos(uuid,timestamptz,uuid),public.pibe_hoja_turno(uuid,date),
  public.pibe_prescribir(uuid,jsonb),public.pibe_suspender_orden(uuid,uuid,text),public.pibe_registrar_toma(uuid,jsonb),
  public.pibe_agregar_evolucion(uuid,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
