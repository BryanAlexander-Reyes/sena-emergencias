# Supabase — Fase 5.2.2, Punto A.1 y ZONAS.4

Preparación local corregida de esquema, RLS, Custom Access Token Hook, pruebas y procedimientos.
Incluye además la migración local de configuración de zonas (ZONAS.4).
**Este directorio no aplica cambios a Supabase Cloud.** La ejecución remota requiere una autorización explícita nueva (Punto B / ZONAS.5).

## Alcance

Incluido:

- Migración versionada de `public.usuarios` con exactamente cuatro columnas.
- Políticas RLS y funciones auxiliares mínimas.
- Función preparada para el Custom Access Token Hook.
- Migración versionada de `public.zonas`, vista `public.zonas_publicas` y seed controlado (ZONAS.4).
- Pruebas SQL sin ejecutar.
- Procedimiento manual del Administrador inicial.
- Plantilla `.env.example` sin secretos.
- Resolución del conflicto previamente versionado en `.gitignore`.

Excluido:

- Frontend Ionic Angular.
- CRUD remoto.
- Instalación de dependencias.
- Edge Functions.
- Creación de usuarios reales.
- Cambios remotos de Auth.
- Commit y push.
- Activación de `ZONE_CONFIG_MODE = 'remote'`.

## Estado de las herramientas

`supabase`, `psql` y `docker` no están disponibles en el entorno local. Por eso:

- La sintaxis de los archivos SQL se revisó por lectura, no con un motor PostgreSQL.
- Las pruebas están **NO VERIFICADAS**.
- No se ejecutó ninguna migración contra el proyecto `sena-crowd-intelligence`.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `migrations/20261118000000_usuarios.sql` | Esquema, constraints, índice único, RLS, funciones auxiliares y hook. |
| `migrations/20261120000000_zonas.sql` | ZONAS.4: tabla de zonas, constraints, RLS, vista pública y seed idempotente. |
| `tests/usuarios_rls_test.sql` | Pruebas RLS, constraints, esquema exacto y privilegios. |
| `tests/zonas_rls_test.sql` | ZONAS.4: pruebas de roles, JWT obsoleto, constraints, grants y contrato de columnas. |
| `tests/custom_access_token_hook_test.sql` | Pruebas del hook: válido, corrección de rol, inexistente, inactivo y eventos mal formados. |
| `../.env.example` | Nombres de variables públicas y privadas, sin valores. |
| `../docs/fase-5.2.2-punto-a.1.md` | Informe de aceptación del Punto A.1. |
| `../docs/fase-5.2.2-punto-b.1.md` | Revisión estática, guía de SQL Editor y checklist del Punto B.1. |

## ZONAS.4 — configuración de zonas (preparación LOCAL)

Dependencia: `20261118000000_usuarios.sql`. La migración de zonas falla temprano si
`private.usuario_activo()` o `private.rol_actual()` no existen. No los modifica.

### Objetos que se crearán

| Objeto | Contenido |
| --- | --- |
| `public.zonas` | 17 columnas: identidad/configuración (9), geometría opcional (6) y `creado_en` / `actualizado_en`. Sin ocupación, sensores, MQTT, contraseñas ni notas. |
| `zonas_id_check`, `zonas_codigo_check`, `zonas_nombre_check`, `zonas_capacidad_check`, `zonas_icono_check`, `zonas_tipo_check` | Equivalencias SQL de `ZONE_ID_PATTERN`, longitudes, `capacidad > 0`, `ZONE_ICON_PATTERN` y `ZONE_TYPES`. |
| `zonas_map_complete_check`, `zonas_map_ranges_check` | Geometría toda presente o toda ausente; `x/y >= 0`, `ancho/alto > 0`. Coordenadas de etiqueta solo finitas por tipo `double precision`. |
| `zonas_single_segura_key` | Índice único parcial `where segura`: como máximo una zona segura. |
| `private.zonas_set_actualizado_en()` + trigger `zonas_touch_actualizado_en` | Actualiza `actualizado_en` en cada `UPDATE`. Función nueva, sin `SECURITY DEFINER`, con `search_path` fijo y sin `EXECUTE` público. |
| Políticas RLS | `zonas_select_admin_or_public`, `zonas_insert_admin`, `zonas_update_admin` y la restrictiva `zonas_active_only`. Sin policies de `DELETE`. |
| `public.zonas_publicas` | Vista `security_barrier = true`, propiedad de `postgres`, con exactamente 15 columnas. Sin `creado_en`, `actualizado_en` ni campos internos. |
| Seed | Cuatro IDs históricos con `on conflict (id) do nothing`. Geometría tomada de `src/app/features/mapa/map-layout.ts`. |

La tabla base tiene RLS habilitado, pero **no** `FORCE ROW LEVEL SECURITY`: la vista
se ejecuta como su propietario `postgres` y por eso no está sujeta a RLS. El filtro
`activo AND publico` y el bloqueo de cuentas inactivas se replican dentro de la vista.
Cualquier acceso directo con `anon`/`authenticated` sí queda sujeto a RLS y a grants.

### Permisos por rol

| Actor | Tabla `public.zonas` | Vista `public.zonas_publicas` |
| --- | --- | --- |
| `anon` (Aprendiz / público) | Sin grants. No puede leer ni escribir. | `SELECT` de zonas `activo AND publico`. SIN escrituras. |
| `authenticated` instructor activo | `SELECT` solo de filas `activo AND publico` por RLS. Sin escrituras. | `SELECT` del mismo subconjunto. |
| `authenticated` administrador activo | `SELECT` de todas las filas; `INSERT` y `UPDATE` permitidos. Sin `DELETE`. | `SELECT` del subconjunto público; para ver todo usa la tabla base. |
| Cuenta inactiva con JWT vigente | Ninguno: la policy restrictiva `zonas_active_only` bloquea lectura y escritura. | Ninguno: `auth.uid()` no es null y `private.usuario_activo()` devuelve falso. |
| JWT con `app_metadata.app_role` obsoleto | No escalate: las policies consultan `private.rol_actual()` en PostgreSQL. | El rol del JWT no altera el filtro; solo cuenta el estado real de la cuenta. |
| `service_role` | No se usa en Angular. La migración no le concede nada explícitamente; sigue siendo una credencial exclusiva de servidor. | Ídem. |

Detalles de autorización:

- `zonas_select_admin_or_public`: `private.rol_actual() = 'administrador' OR (activo AND publico)`.
- `zonas_insert_admin`: `WITH CHECK (private.rol_actual() = 'administrador')`.
- `zonas_update_admin`: `USING` y `WITH CHECK` con `private.rol_actual() = 'administrador'`.
- `zonas_active_only`: `AS RESTRICTIVE FOR ALL`, `USING` y `WITH CHECK` con `private.usuario_activo()`.
- `revoke all` seguido de `grant select, insert, update` a `authenticated` en la tabla; `revoke all` y `grant select` a `anon` y `authenticated` en la vista.
- No existe `grant delete`, `grant truncate` ni policy de `DELETE`.

### Compatibilidad con TypeScript

| SQL (`zonas_publicas`) | Contrato TS | Observación |
| --- | --- | --- |
| `id` | `ZoneConfigRow.id` / `ZoneConfig.id` | `text`, patrón y longitud idénticos a `ZONE_ID_PATTERN`. |
| `codigo` | `ZoneConfigRow.codigo` | `text` 1..32, no vacío. |
| `nombre` | `ZoneConfigRow.nombre` | `text` 1..120, no vacío. |
| `capacidad` | `ZoneConfigRow.capacidad` | `integer > 0`, equivalente a entero finito positivo. |
| `icono` | `ZoneConfigRow.icono` | `text` 1..64 con `ZONE_ICON_PATTERN`. |
| `tipo` | `ZoneConfigRow.tipo` (`ZoneType`) | `CHECK` con los cuatro valores de `ZONE_TYPES`. |
| `segura` | `ZoneConfigRow.segura` | `boolean not null`. |
| `activo` | `ZoneConfigRow.activo` | `boolean not null`; la vista solo devuelve `true`. |
| `publico` | `ZoneConfigRow.publico` | `boolean not null`; la vista solo devuelve `true`. |
| `map_x`, `map_y`, `ancho`, `alto`, `etiqueta_x`, `etiqueta_y` | `ZoneConfigRow.*` opcionales | `double precision`, todos o ninguno; `toZoneConfig()` reconstruye `map` o `null`. |

Orden y nombres coinciden con `ZONES_PUBLIC_COLUMNS` y con la consulta
`.select(...).eq('publico', true).eq('activo', true)` de `SupabaseZonesRepository`.
Los filtros del repositorio son redundantes con la vista a propósito: defensa en
profundidad, no una dependencia de la vista. `toZoneConfigList()` sigue validando
toda la respuesta; una fila inválida hace fallar el listado sin datos parciales.

`creado_en` y `actualizado_en` existen solo en la tabla base y no llegan al
repositorio. No se agregaron columnas de ocupación real ni credenciales MQTT.

### Validación local realizada

- Revisión estática de los archivos SQL contra `zone-config.types.ts`,
  `zone-config.validators.ts`, `supabase-zones.repository.ts`, `map-layout.ts` y
  `20261118000000_usuarios.sql`.
- Revisión de grants, RLS, ausencia de `DELETE`, filtros de la vista y uso
  exclusivo de `private.usuario_activo()` / `private.rol_actual()`.
- `psql`, Supabase CLI y Docker siguen sin estar disponibles: la sintaxis **no**
  se ejecutó contra un motor PostgreSQL.
- `supabase/tests/zonas_rls_test.sql` quedó preparado pero **NO VERIFICADO**.
- No se ejecutó ningún comando remoto ni se cambió `ZONE_CONFIG_MODE` (sigue
  `'demo'` en `src/main.ts`).

### Riesgos y decisiones pendientes

1. La vista no es `security_invoker`: depende de que siga siendo propiedad de
   `postgres` y de que sus filtros no se relajen. Es una decisión deliberada para
   que `anon` nunca reciba privilegios sobre la tabla base.
2. La distinción `anon` / `authenticated` usa `auth.uid() is null`. Es válida con
   el JWT anónimo actual (sin `sub`); si cambia el esquema de tokens hay que
   revisarla.
3. El seed guarda la geometría actual del plano. `ON CONFLICT DO NOTHING`
   conserva valores existentes: un cambio futuro de `map-layout.ts` requerirá una
   migración de actualización controlada, no un re-seed.
4. `char_length` cuenta caracteres Unicode; `String.length` de TypeScript cuenta
   unidades UTF-16. El desfase solo aparece con caracteres astrales y se acepta
   como riesgo bajo; se documenta en lugar de endurecer el CHECK.
5. Un JWT emitido antes de desactivar una cuenta sigue siendo válido hasta que
   expire, pero no obtiene datos: el helper consulta `public.usuarios` en cada
   petición. No se modifica Auth ni se revocan tokens.
6. No hay `DELETE` desde la aplicación por diseño. Si algún día se requiere, debe
   hacerse con autorización explícita y una migración/operación de servidor.
7. Los filtros `activo`/`publico` están tanto en la vista como en el repositorio;
   deben permanecer alineados si se cambia alguno.
8. Las pruebas SQL están sin ejecutar: el primer paso con entorno local debe ser
   ejecutarlas en una base desechable y corregir cualquier `FALLIDO`.

### Procedimiento propuesto para aplicación futura (NO ejecutado)

Requiere autorización explícita nueva. No imprimir secretos ni identificadores de
proyecto.

1. Confirmar el proyecto correcto (`sena-crowd-intelligence`) y que la migración
   de usuarios y el hook ya están aplicados.
2. Crear una base local desechable con ambas migraciones y ejecutar
   `supabase/tests/usuarios_rls_test.sql` y `supabase/tests/zonas_rls_test.sql`.
   La salida esperada es ausencia de `FALLIDO` y `ROLLBACK` final.
3. Revisar el diff de `supabase/migrations/20261120000000_zonas.sql`.
4. Solo con autorización: aplicar la migración con el mecanismo versionado
   (`supabase db push`) en el proyecto confirmado.
5. Validaciones de solo lectura propuestas:

```sql
-- Comprobaciones de revisión; NO ejecutar contra Cloud sin autorización.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'zonas_publicas'
order by ordinal_position;

select policyname, cmd, roles, permissive, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'zonas'
order by policyname;

select relrowsecurity, reloptions
from pg_class
where oid = 'public.zonas'::regclass;

select has_table_privilege('anon', 'public.zonas', 'SELECT') as anon_base,
       has_table_privilege('anon', 'public.zonas_publicas', 'SELECT') as anon_view,
       has_table_privilege('authenticated', 'public.zonas', 'DELETE') as auth_delete;

select id, codigo, nombre, capacidad, icono, tipo, segura, activo, publico
from public.zonas_publicas
order by id;
```

6. Verificar que la aplicación sigue en modo `demo` y que no aparece `service_role`
   en el frontend. El cambio a `remote` es una fase posterior e independiente.
7. **Detenerse** tras la preparación y revisión; esperar autorización explícita
   antes de cualquier cambio en Supabase Cloud.

## Mecanismo de login

Supabase Auth no acepta `username` en `signInWithPassword`; solo `email` o `phone`.
La interfaz seguirá mostrando **usuario y contraseña**. Internamente, en una fase posterior, se derivará:

```text
identificador = lower(nombre)
email interno = identificador + "@sena.local.invalid"
```

No se almacena una columna adicional con ese identificador: la unicidad se obtiene con un índice sobre `lower(nombre)` y el correo se deriva en memoria cuando se crea la identidad en Auth.

Evidencia documental/técnica consultada:

- `signInWithPassword` acepta `email` o `phone` (`supabase-js`).
- GoTrue valida correos con longitud máxima 255, `checkmail.ValidateFormat` y los convierte a minúsculas.
- El validador de `checkmail` acepta dominios con etiquetas alfanuméricas separadas por puntos; `.invalid` cumple el formato y está reservado por RFC 2606, por lo que no entrega correo real.
- `auth.admin.createUser` permite `email_confirm: true`; GoTrue confirma al usuario en base de datos sin enviar correo.
- `DisableSignup` bloquea el registro público, pero no la creación administrativa.

Consecuencias:

- No se habilitará registro público.
- La recuperación por correo no es funcional con `@sena.local.invalid`; el propietario deberá gestionar cambios de contraseña de forma administrativa hasta definir otro mecanismo.
- El correo derivado aparecerá como claim `email` del JWT. No es un secreto, pero tampoco debe mostrarse como dato principal de login.
- El comportamiento real contra Supabase Cloud queda pendiente del Punto B.

## Esquema

`public.usuarios` — exactamente cuatro columnas:

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id` | `uuid` | PK, FK a `auth.users(id)`, `on delete cascade`. |
| `nombre` | `text` | `not null`; 3..32 caracteres; `^[A-Za-z0-9._-]+$`. |
| `rol` | `text` | `not null`; `CHECK (rol in ('administrador', 'instructor'))`. |
| `activo` | `boolean` | `not null default true`. |

Además:

- Índice único `usuarios_nombre_lower_key` sobre `lower(nombre)`: nombres únicos sin distinguir mayúsculas, sin columna extra.
- No se crea un enum: los roles se restringen con `CHECK`.
- No existen columnas `username_key`, `created_at`, `updated_at`, `password`, `password_hash` ni `encrypted_password`.
- No se agregó un trigger: la tabla no admite escrituras del cliente.
- No se crea una segunda tabla.

## RLS

RLS habilitado en `public.usuarios`.

| Actor | SELECT | Escrituras |
| --- | --- | --- |
| `anon` | Ninguno. Sin grants ni policies. | Ninguno. |
| `authenticated` activo (`instructor`) | Solo su propia fila activa. | Ninguna. |
| `authenticated` activo (`administrador`) | Solo filas activas: la suya y las de instructores. | Ninguna directa. |
| Cuenta inactiva | Ninguno, aunque el JWT contenga roles. | Ninguna. |
| `supabase_auth_admin` | Todas las filas, solo para ejecutar el hook. | Ninguna. |

Detalles:

- Política permisiva `usuarios_select_own_or_admin`: `activo AND (id = auth.uid() OR private.rol_actual() = 'administrador')`. El requisito `activo` impide que el administrador consulte registros inactivos.
- Política restrictiva `usuarios_active_only`: `FOR SELECT`, `USING (private.usuario_activo())`. Bloquea el acceso de cuentas inactivas. Las escrituras están bloqueadas por los privilegios de PostgreSQL y por la ausencia de policies de escritura, no por esta política.
- Política `usuarios_auth_admin_read`: permite `SELECT` al rol interno `supabase_auth_admin` únicamente para el hook.
- Sin políticas de `INSERT`, `UPDATE` ni `DELETE`.
- `authenticated` solo tiene `SELECT`; `anon` no tiene privilegios de tabla.

### Revisión de `SECURITY DEFINER`

Solo las funciones auxiliares de RLS usan `SECURITY DEFINER`:

| Función | Uso | Exposición |
| --- | --- | --- |
| `private.usuario_activo(uuid)` | Verifica existencia y `activo` para un UUID. | Sin `EXECUTE` para `public`, `anon`, `authenticated` ni `supabase_auth_admin`. Solo la puede invocar su propietario. |
| `private.usuario_activo()` | Envoltorio con `auth.uid()` para la política restrictiva. | `EXECUTE` solo para `authenticated`. |
| `private.rol_actual()` | Devuelve el rol solo si la cuenta está activa. | `EXECUTE` solo para `authenticated`. |

Todas son `STABLE`, usan `SET search_path = ''` y califican todos los objetos por esquema. No escriben, no devuelven datos de otros usuarios y leen `public.usuarios` como propietario para evitar recursión RLS. No permiten escalamiento: un usuario autenticado solo puede comprobar su propio estado y rol.

Además de `EXECUTE`, `authenticated` necesita `USAGE` sobre el esquema `private`: las policies invocan `private.usuario_activo()` y `private.rol_actual()` directamente, y PostgreSQL exige `USAGE` para resolver funciones calificadas por esquema. No se concede `CREATE`, por lo que no puede crear objetos allí.

El hook **no** es `SECURITY DEFINER`: se ejecuta como invoker (`supabase_auth_admin`). Sus permisos mínimos son `USAGE` en `private`, `EXECUTE` sobre la función, `SELECT` sobre `public.usuarios` y la política RLS `usuarios_auth_admin_read`. No se revoca `USAGE` sobre `public`; Supabase lo concede por defecto a los roles, de modo que `supabase_auth_admin` puede resolver `public.usuarios`. El esquema `private` no se expone en la Data API de Supabase; `anon` no tiene `USAGE` ni `EXECUTE`.

Las futuras operaciones administrativas (crear/desactivar instructores) deberán hacerse desde una función de servidor que vuelva a verificar `activo` en PostgreSQL.

## Custom Access Token Hook

Función: `private.custom_access_token_hook(jsonb)`.

Comportamiento:

1. Valida que el evento sea un objeto, que `user_id` sea un UUID válido y que `claims` sea un objeto.
2. Busca el usuario en `public.usuarios` por `id`.
3. Rechaza con `403` si el usuario no existe o `activo = false`.
4. Conserva el objeto `claims` original; solo asegura `app_metadata` como objeto y añade/reemplaza `app_metadata.app_role` con el rol leído de PostgreSQL.
5. Devuelve el evento modificado. No elimina `iss`, `aud`, `exp`, `iat`, `sub`, `role`, `aal`, `session_id`, `email`, `phone`, `is_anonymous`, etc.
6. No coloca contraseñas, hashes ni secretos en el JWT.

Formato de respuesta: en éxito devuelve el evento completo con `claims` modificado; en rechazo devuelve únicamente `{"error":{"http_code":403,"message":"..."}}`, sin `claims`. Esto coincide con el formato exigido por Supabase Auth.

El hook **no revoca JWT ya emitidos**. Mitigaciones previstas:

- Configurar expiración corta del JWT (por ejemplo 1 hora o menos, según política del proyecto).
- Verificar `activo` en PostgreSQL en operaciones sensibles.
- No confiar en `app_role` del JWT para autorización definitiva.

### Habilitación en Dashboard (solo Punto B)

1. Ir a **Authentication → Hooks**.
2. Seleccionar **Custom Access Token**.
3. Elegir tipo **Postgres Function**.
4. Configurar la URI:

```text
pg-functions://postgres/private/custom_access_token_hook
```

5. Verificar que `supabase_auth_admin` tenga `EXECUTE` sobre la función y `USAGE` sobre `private` (ya incluido en la migración).
6. No pegar secretos en el Dashboard ni en este repositorio.

Configuración local equivalente, para un futuro `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/private/custom_access_token_hook"
```

## Administrador inicial

Procedimiento manual, exclusivo del propietario del proyecto. **No ejecutar en el Punto A.1.**

1. Elegir un nombre de usuario real que cumpla 3..32 y `^[A-Za-z0-9._-]+$`. No usar credenciales de demostración.
2. Derivar el identificador `lower(nombre)` y el correo interno `identificador@sena.local.invalid`.
3. En **Authentication → Users**, crear el usuario con ese correo interno y una contraseña elegida privadamente por el propietario. Usar confirmación administrativa (`email_confirm: true` / opción equivalente del Dashboard) para evitar envío de correo.
4. Copiar el UUID del usuario desde el Dashboard.
5. En SQL Editor, crear solo el registro (sin contraseña):

```sql
insert into public.usuarios (id, nombre, rol, activo)
values ('<UUID_DEL_USUARIO>', '<NombreReal>', 'administrador', true);
```

6. Verificar que el registro público esté deshabilitado.
7. Habilitar el hook y comprobar que un inicio de sesión válido incluye `app_metadata.app_role = 'administrador'`.

Nunca:

- Insertar directamente en `auth.users` desde SQL.
- Guardar la contraseña en el repositorio, en un informe o en el chat.
- Usar la clave `service_role` en el frontend.
- Crear automáticamente el Administrador en una migración.

## Pruebas

Archivos:

- `tests/usuarios_rls_test.sql`
- `tests/custom_access_token_hook_test.sql`

Estado real: **NO VERIFICADAS**. No se ejecutaron porque no hay `psql`, CLI de Supabase ni Docker.

Las comprobaciones de existencia de claves JSON usan `jsonb_exists` y `jsonb_exists_all` en lugar de los operadores `?`/`?&`, para evitar el conflicto conocido del SQL Editor de Supabase con `?`.

Cuando exista entorno local, ejecutar solo contra una base desechable y dentro de transacción revertible. Las pruebas usan UUID sintéticos y hacen `ROLLBACK`; no deben ejecutarse contra producción.

Cobertura de RLS: anon, instructor, administrador, cuenta inactiva, duplicados exactos y con distinta capitalización, roles inválidos, validación de nombre, esquema de cuatro columnas, RLS activo, privilegios de tabla/funciones y configuración de `SECURITY DEFINER`.

Cobertura del hook: conservación de claims, corrección del rol desde PostgreSQL, usuario inexistente, usuario inactivo y eventos mal formados.

## Variables de entorno

Ver `../.env.example` (plantilla referenciada, actualmente ausente en el repositorio).

- Públicas: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY` y el diccionario `SUPABASE_PUBLISHABLE_KEYS`. Solo valores públicos; nunca en `src/environments/` secretos privados.
- Privadas: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEYS`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`. Nunca en `src/environments/`, Angular, logs ni informes.

`crear-instructor` resuelve la clave pública de verificación en este orden: `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY` y, como último recurso, `SUPABASE_PUBLISHABLE_KEYS`. El formato plural es un diccionario JSON documentado por Supabase; se usa la entrada `default` o, en su ausencia, una única candidata `sb_publishable_...`. Con varias candidatas sin `default`, o con JSON inválido, la función falla de forma segura sin iniciar. Esta resolución pública nunca lee credenciales privadas.

La credencial privada se resuelve aparte: se prefiere una `SUPABASE_SERVICE_ROLE_KEY` legacy válida (JWT con `role: service_role`); si no es válida, se usa `SUPABASE_SECRET_KEYS` como diccionario JSON con entrada `default` o una única candidata `sb_secret_...`. Se rechazan claves públicas, arrays, JSON inválido, candidatas ambiguas y entradas inesperadas. No se imprimen valores ni fragmentos.

La unicidad de correo la garantiza Supabase Auth mediante `email_exists` en `auth.admin.createUser`; el nombre se protege con el índice `lower(nombre)` y su error `23505`. Por eso se eliminó el escaneo paginado previo de usuarios Auth.

### Política CORS de `crear-instructor`

- `CORS_ALLOWED_ORIGINS` se normaliza descartando entradas vacías, comodines `*` y valores que no sean un origen absoluto sin ruta, consulta ni fragmento. Una configuración vacía o inválida deja la lista vacía.
- La comparación es exacta. Nunca se responde `Access-Control-Allow-Origin: *`.
- Un `OPTIONS` de origen no permitido responde `403` sin invocar Auth ni la base de datos; uno permitido responde `204` con `authorization` y `content-type`.
- Un `POST` con `Origin` presente y no permitido responde `403 ORIGIN_NOT_ALLOWED` **antes** de verificar JWT, consultar `public.usuarios` o crear usuarios.
- Un `POST` **sin** header `Origin` no recibe cabeceras CORS, pero continúa el flujo normal y sigue exigiendo JWT válido y Administrador activo. CORS es una restricción de navegador, no un mecanismo de autenticación; algunos clientes WebView/nativos no envían `Origin` y no por eso pueden eludir la autorización. Tampoco se asume que `localhost` represente todos los entornos Ionic.
- CORS nunca sustituye a `verify_jwt`, a `auth.getUser(token)` ni a la consulta del rol en servidor.

`.gitignore` incluye `.env`, `.env.*` y `!.env.example`. No se sobrescribió ningún `.env` existente.

## Conflicto resuelto en `.gitignore`

La versión previamente versionada contenía marcadores de conflicto de Git. Se conservaron las reglas válidas de ambos lados y se eliminaron únicamente los marcadores. Se mantuvieron, entre otras, reglas de Visual Studio y de editores (`*.suo`, `[Dd]ebug/`, `.vscode/*`, `!.vscode/settings.json`, `.history/*`, `!.vscode/*.code-snippets`, `.history/`, `*.vsix`, `*.cab`).

Verificación con `git check-ignore`:

- `.env.local` y `.env.production`: ignorados.
- `.env.example`: permitido por la excepción `!.env.example`.

No se imprimieron valores secretos.

## Punto B — instrucciones propuestas (NO ejecutadas)

Tras nueva autorización explícita:

1. Confirmar el proyecto correcto `sena-crowd-intelligence` sin imprimir secretos.
2. Aplicar `supabase/migrations/20261118000000_usuarios.sql`.
3. Deshabilitar registro público en Auth.
4. Crear el Administrador inicial con el procedimiento manual descrito.
5. Habilitar el Custom Access Token Hook con la URI indicada.
6. Ejecutar primero las pruebas en base local/desechable y luego validaciones remotas autorizadas.
7. Revisar privilegios, claims, RLS, cuentas inactivas y exactitud del esquema.
8. Solo después conectar el frontend en una fase distinta, sin secretos privados.

**Detenerse aquí hasta aprobación del Punto B.**

## Despliegue exclusivo de `crear-instructor` (procedimiento propuesto, NO ejecutado)

Requiere autorización explícita nueva. El único proyecto Cloud del proyecto es `sena-crowd-intelligence`; las comprobaciones deben confirmar el proyecto seleccionado sin imprimir identificadores, correos, JWT ni claves.

1. Confirmar el proyecto activo en la CLI/Dashboard por su nombre, sin mostrar detalles sensibles. Si la selección es ambigua, detenerse.
2. Comprobar que `supabase` (CLI) y `deno` están disponibles y son compatibles con el runtime de Edge Functions; no instalar herramientas automáticamente.
3. Verificar que la función compila en local con las comprobaciones disponibles y que `index.ts` usa `Deno.serve` y `Deno.env` sin dependencias de Node.
4. Confirmar con una solicitud de solo lectura que `verify_jwt` acepta el JWT de la sesión real del Administrador; no deshabilitar esa verificación.
5. Identificar solo los nombres requeridos: `SUPABASE_URL`, clave pública (`SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEYS`), `SUPABASE_SERVICE_ROLE_KEY` y `CORS_ALLOWED_ORIGINS`. Las credenciales privadas permanecen en el entorno de la función; nunca en Angular ni en el repositorio.
6. Configurar `CORS_ALLOWED_ORIGINS` con los orígenes reales de Ionic, uno por uno y de forma exacta, según el canal (web local, WebView/dispositivo, dominio HTTPS real). No inventar el origen de producción ni asumir que `localhost` cubre todos los entornos.
7. Verificar que `SUPABASE_SERVICE_ROLE_KEY` no se expone en el frontend ni se escribe en `src/environments/`.
8. Desplegar únicamente `supabase/functions/crear-instructor`. No ejecutar la migración, no modificar RLS ni hooks y no crear funciones adicionales en esta fase.
9. Probar primero autenticación y autorización con solicitudes que **no creen usuarios**: JWT ausente/inválido, origen no permitido, perfil inactivo y preflight CORS.
10. Solo con autorización separada, realizar una creación controlada de Instructor y comprobar la compensación ante fallos.

Si falta cualquier dato para determinar un comando seguro, quedar como requisito pendiente en lugar de adivinarlo.
