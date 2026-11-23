# Fase 5.4.D.5.B — Preparación Cloud (NO EJECUTADO)

Este documento deja preparada la prueba real controlada de desactivación y reactivación de Instructores.
**Ningún comando de aquí fue ejecutado.** Requiere autorización explícita nueva antes de cualquier cambio remoto.

## 1. Contrato Angular ↔ Edge Function

Angular (`SupabaseInstructorAccountRepository.setActive`) envía:

```http
POST /functions/v1/gestionar-estado-instructor
Authorization: Bearer <JWT de la sesión autenticada existente>
Content-Type: application/json

{ "id": "<UUID del Instructor>", "activo": false }
```

- `activo: false` desactiva; `activo: true` reactiva.
- `functions.invoke()` adjunta la sesión actual. Angular no guarda ni envía credenciales privadas.
- La función valida el JWT contra Supabase Auth, lee el perfil real del solicitante y exige `administrador` activo.
- El objetivo debe existir y tener `rol = instructor`. Un Administrador nunca es objetivo.
- Respuesta correcta (200):

```json
{ "id": "<UUID>", "nombre": "<nombre>", "rol": "instructor", "activo": false }
```

- El repositorio exige exactamente esos cuatro campos, el mismo `id` solicitado y el `activo` pedido.
- Errores esperados: `400`, `401`, `403`, `404`, `409`, `500`. La UI muestra solo mensajes fijos y permite reintento.

## 2. CORS

La función lee `CORS_ALLOWED_ORIGINS` como lista de orígenes exactos separados por comas. Para probar desde Ionic en local debe incluir:

```text
CORS_ALLOWED_ORIGINS=http://localhost:8100
```

Si además se prueba desde el origen web real, agrégalo de forma explícita, por ejemplo:

```text
CORS_ALLOWED_ORIGINS=http://localhost:8100,https://<APP_ORIGIN>
```

- No usar `*`.
- No incluir rutas, consultas ni barras finales distintas del origen exacto.
- Cabeceras permitidas: `authorization, apikey, content-type, x-client-info`.
- Un `Origin` presente y no permitido se rechaza con `403` antes de verificar JWT o tocar datos.

## 3. SQL de SOLO LECTURA — verificar permiso UPDATE

Ejecutar manualmente en el SQL Editor de Supabase **antes de desplegar**:

```sql
select
  has_table_privilege('service_role', 'public.usuarios', 'UPDATE') as service_role_puede_actualizar_usuarios;
```

- `true`: la credencial administrativa de servidor puede ejecutar el `UPDATE` condicional.
- `false`: **NO desplegar todavía**. Debe autorizarse explícitamente la concesión del permiso; este proyecto no ejecuta `GRANT`.

La consulta no modifica datos, roles, RLS ni políticas.

## 4. Comando de despliegue preparado (NO EJECUTADO)

```bash
supabase functions deploy gestionar-estado-instructor --project-ref <PROJECT_REF>
```

- Despliega únicamente `gestionar-estado-instructor`.
- No despliega `crear-instructor` ni `listar-usuarios-admin`.
- No se conoce el `PROJECT_REF` real: usar el valor correcto solo cuando se autorice el despliegue.
- Las credenciales privadas deben existir solo en la configuración de la función (`SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SECRET_KEYS`). No imprimirlas ni pegarlas en el repositorio.

## 5. Procedimiento de prueba manual controlada (PENDIENTE DE AUTORIZACIÓN)

1. Verificar el CORS indicado arriba y la consulta SQL de permiso `UPDATE`.
2. Desplegar únicamente `gestionar-estado-instructor` con el comando preparado.
3. Iniciar sesión en `http://localhost:8100` con una cuenta **Administrador de prueba** activa.
4. Abrir Administración y confirmar que el listado muestra cuentas reales.
5. Crear o elegir un **Instructor de prueba** activo. No usar cuentas reales.
6. Pulsar **Desactivar** en ese Instructor:
   - debe aparecer la confirmación explícita;
   - al cancelar, no debe cambiar nada;
   - al confirmar, debe mostrarse “Desactivando…” y el estado no debe cambiar hasta la respuesta del servidor.
7. Verificar que el listado recargado muestra `activo = false` y que las métricas de inactivos aumentaron.
8. Pulsar **Reactivar** sobre el mismo Instructor, confirmar y verificar que el listado recargado muestra `activo = true`.
9. Con una sesión separada del Instructor de prueba, intentar una operación protegida mientras está inactivo:
   - el acceso a Administración y cualquier acción de gestión debe ser rechazada;
   - la autoridad es el perfil leído en servidor, no el rol guardado en el cliente.
10. Repetir una acción ya aplicada para comprobar el mensaje seguro de conflicto y el reintento.
11. No cerrar ni forzar la expiración de JWT de usuarios reales: la prueba se limita a la cuenta de prueba.

## 6. Riesgos pendientes

- **Los JWT existentes pueden seguir vigentes.** Cambiar `public.usuarios.activo` no revoca inmediatamente todas las sesiones ya emitidas.
- Un Instructor desactivado puede conservar un token vigente hasta su caducidad; el Custom Access Token Hook bloquea el refresco y las operaciones sensibles deben volver a verificar `activo` en servidor.
- Un Administrador desactivado queda rechazado por esta función en cada petición aunque su JWT siga vivo.
- No se ejecutó `GRANT`, SQL de escritura, despliegue, cambio de RLS/hooks/migraciones ni prueba real sobre Supabase Cloud.

## 7. Estado

Preparación local únicamente. Se requiere autorización explícita antes de ejecutar cualquier cambio remoto.
