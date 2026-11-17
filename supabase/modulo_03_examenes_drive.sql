begin;
create table public.pibe_adjuntos (
 id uuid primary key,
 atencion_id uuid not null references public.pibe_atenciones(id) on delete restrict,
 nombre text not null check(length(nombre) between 1 and 200),
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png','image/webp')),
 bytes integer not null check(bytes between 1 and 20971520),
 creado timestamptz not null default now(), listo boolean not null default false,
 huella text not null, archivo_drive text
);
create index pibe_adjuntos_visita_idx on public.pibe_adjuntos(atencion_id,creado desc);
alter table public.pibe_adjuntos enable row level security;
revoke all on public.pibe_adjuntos from public,anon,authenticated;
grant select(id,atencion_id,nombre,mime,bytes,creado,listo) on public.pibe_adjuntos to anon,authenticated;
create policy examenes_confirmados on public.pibe_adjuntos for select to anon,authenticated using(listo);
grant select,insert,update on public.pibe_adjuntos to service_role;
create table public.pibe_drive_config (id boolean primary key default true check(id), puente text not null, clave text not null, actualizado timestamptz not null default now());
alter table public.pibe_drive_config enable row level security;
revoke all on public.pibe_drive_config from public,anon,authenticated;
grant select,insert,update on public.pibe_drive_config to service_role;
create function public.pibe_lista_examenes(paciente uuid) returns table(id uuid,atencion_id uuid,nombre text,mime text,bytes integer,creado timestamptz)
language sql stable security invoker set search_path='' as $q$
select x.id,x.atencion_id,x.nombre,x.mime,x.bytes,x.creado from public.pibe_adjuntos x join public.pibe_atenciones a on a.id=x.atencion_id where a.paciente_id=paciente and x.listo order by x.creado desc,x.id desc;
$q$;
revoke all on function public.pibe_lista_examenes(uuid) from public;
grant execute on function public.pibe_lista_examenes(uuid) to anon,authenticated;
commit;

