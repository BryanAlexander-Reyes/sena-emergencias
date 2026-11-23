-- ZONAS.5.19 — registro LOCAL de la corrección de public.zonas_publicas.
--
-- Esta corrección YA FUE APLICADA MANUALMENTE en Supabase Cloud (ZONAS.5.13)
-- y validada con HTTP 200 en ZONAS.5.14 y visualmente en ZONAS.5.18.
-- El archivo solo documenta ese estado; NO debe ejecutarse contra Cloud.
--
-- NO ejecutar `supabase db push`, `migration up` ni `migration repair` hasta
-- reconciliar el historial de migraciones. Las versiones 20261118000000 y
-- 20261120000000 figuran sin registro remoto, por lo que un push intentaría
-- reaplicarlas. La reconciliación requiere autorización explícita nueva.
--
-- Idempotente: CREATE OR REPLACE VIEW conserva owner, comment y grants.
-- No contiene INSERT, UPDATE, DELETE, DROP ni cambios en funciones o políticas
-- RLS. No concede EXECUTE a anon sobre private.usuario_activo().

create or replace view public.zonas_publicas with (security_barrier = true) as
select
  z.id,
  z.codigo,
  z.nombre,
  z.capacidad,
  z.icono,
  z.tipo,
  z.segura,
  z.activo,
  z.publico,
  z.map_x,
  z.map_y,
  z.ancho,
  z.alto,
  z.etiqueta_x,
  z.etiqueta_y
from public.zonas z
where z.activo
  and z.publico
  and (
    -- Público / aprendiz sin sesión: ve las zonas activas y públicas.
    -- Instructor y administrador activos: también las ven.
    -- Cuenta inactiva con JWT antiguo: auth.uid() no es null y no existe fila
    -- activa en public.usuarios, por lo que queda excluida.
    auth.uid() is null
    or exists (
      select 1
      from public.usuarios u
      where u.id = auth.uid()
        and u.activo
    )
  );

comment on view public.zonas_publicas is
  'Columnas exactas consumidas por SupabaseZonesRepository. Sin notas ni campos administrativos.';

revoke all on public.zonas_publicas from public, anon, authenticated;
grant select on public.zonas_publicas to anon, authenticated;

alter view public.zonas_publicas set (security_barrier = true);
