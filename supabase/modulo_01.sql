begin;
-- Primera fase: directorio y lectura del expediente para personal autorizado.
create table public.pibe_perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 140),
  rol text not null check (rol in ('internista','veterinario','auxiliar','administrador')),
  activo boolean not null default true
);
create table public.pibe_propietarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 140),
  cedula text unique check (cedula is null or (cedula=trim(cedula) and length(cedula) between 3 and 32)),
  telefono text,
  nombre_busqueda text generated always as (translate(lower(nombre),'áéíóúüñ','aeiouun')) stored
);
create table public.pibe_pacientes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (length(trim(codigo)) between 1 and 40),
  propietario_id uuid not null references public.pibe_propietarios(id),
  nombre text not null check (length(trim(nombre)) between 1 and 100),
  especie text not null, raza text, sexo text,
  nacimiento date, edad_estimada text,
  nombre_busqueda text generated always as (translate(lower(nombre),'áéíóúüñ','aeiouun')) stored
);
create table public.pibe_atenciones (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pibe_pacientes(id),
  tipo text not null check (tipo in ('consulta','control','hospitalizacion','preventivo')),
  inicio timestamptz not null,
  titulo text not null check (length(trim(titulo)) between 1 and 200),
  resumen text,
  responsable_id uuid references public.pibe_perfiles(id) on delete restrict,
  profesional_historico text,
  abierta boolean not null default false check (not abierta or tipo='hospitalizacion'),
  peso numeric(7,3) check(peso>0)
);
create index pibe_pacientes_propietario_idx on public.pibe_pacientes(propietario_id);
create index pibe_atenciones_crono_idx on public.pibe_atenciones(paciente_id,inicio desc,id desc);
create index pibe_atenciones_responsable_idx on public.pibe_atenciones(responsable_id);
create unique index pibe_ingreso_activo_idx on public.pibe_atenciones(paciente_id) where abierta;
create extension if not exists pg_trgm with schema extensions;
create index pibe_propietarios_nombre_idx on public.pibe_propietarios using gin (nombre_busqueda extensions.gin_trgm_ops);
create index pibe_pacientes_nombre_idx on public.pibe_pacientes using gin (nombre_busqueda extensions.gin_trgm_ops);
create index pibe_cedula_parcial_idx on public.pibe_propietarios using gin (cedula extensions.gin_trgm_ops);
alter table public.pibe_perfiles enable row level security;
alter table public.pibe_propietarios enable row level security;
alter table public.pibe_pacientes enable row level security;
alter table public.pibe_atenciones enable row level security;
revoke all on public.pibe_perfiles,public.pibe_propietarios,public.pibe_pacientes,public.pibe_atenciones from public,anon,authenticated;
grant select on public.pibe_perfiles,public.pibe_propietarios,public.pibe_pacientes,public.pibe_atenciones to authenticated;
create policy perfil_propio on public.pibe_perfiles for select to authenticated using(id=(select auth.uid()) and activo);
create policy lectura_propietarios on public.pibe_propietarios for select to authenticated using(exists(select 1 from public.pibe_perfiles me where me.id=(select auth.uid()) and me.activo));
create policy lectura_pacientes on public.pibe_pacientes for select to authenticated using(exists(select 1 from public.pibe_perfiles me where me.id=(select auth.uid()) and me.activo));
create policy lectura_atenciones on public.pibe_atenciones for select to authenticated using(exists(select 1 from public.pibe_perfiles me where me.id=(select auth.uid()) and me.activo));
-- Nombre del profesional conservado al registrar la atención, incluso si después cambia el perfil.
create function public.pibe_fijar_autor() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.responsable_id is not null then
    select p.nombre into new.profesional_historico from public.pibe_perfiles p where p.id=new.responsable_id;
    if new.profesional_historico is null then raise exception 'No se encuentra el profesional responsable'; end if;
  end if;
  return new;
end $$;
revoke all on function public.pibe_fijar_autor() from public,anon,authenticated;
create trigger pibe_sellar_autor before insert or update of responsable_id on public.pibe_atenciones for each row execute function public.pibe_fijar_autor();
create function public.pibe_buscar_pacientes(termino text default '',cantidad integer default 31, desplazamiento integer default 0)
returns table(id uuid,codigo text,nombre text,especie text,raza text,sexo text,nacimiento date,edad_estimada text,propietario text,cedula text)
language sql stable security invoker set search_path='' as $$
with buscado as (
  select '%'||replace(replace(replace(translate(lower(trim(coalesce(termino,''))),'áéíóúüñ','aeiouun'),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' as patron
)
select p.id,p.codigo,p.nombre,p.especie,p.raza,p.sexo,p.nacimiento,p.edad_estimada,o.nombre,o.cedula
from public.pibe_pacientes p join public.pibe_propietarios o on o.id=p.propietario_id cross join buscado b
where p.nombre_busqueda like b.patron or o.nombre_busqueda like b.patron or lower(o.cedula) like b.patron or lower(p.codigo) like b.patron
order by p.nombre_busqueda,p.id limit least(greatest(coalesce(cantidad,31),1),100) offset greatest(coalesce(desplazamiento,0),0);
$$;
create function public.pibe_historia(paciente uuid,antes_de timestamptz default null,antes_id uuid default null)
returns table(id uuid,paciente_id uuid,tipo text,inicio timestamptz,titulo text,resumen text,profesional text,abierta boolean,peso numeric)
language sql stable security invoker set search_path='' as $$
select a.id,a.paciente_id,a.tipo,a.inicio,a.titulo,a.resumen,a.profesional_historico,a.abierta,a.peso
from public.pibe_atenciones a where a.paciente_id=paciente and
  (antes_de is null or (a.inicio,a.id)<(antes_de,antes_id))
order by a.inicio desc,a.id desc limit 100;
$$;
revoke all on function public.pibe_buscar_pacientes(text,integer,integer),public.pibe_historia(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.pibe_buscar_pacientes(text,integer,integer),public.pibe_historia(uuid,timestamptz,uuid) to authenticated;
commit;

