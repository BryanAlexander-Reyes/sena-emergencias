# SENA CROWD INTELLIGENCE

##  Presentación del proyecto

SENA CROWD INTELLIGENCE es un proyecto de formación e investigación IoT desarrollado en el contexto de Análisis y Desarrollo de Software (ADSO). Reúne una aplicación web, una aplicación Android y una integración con dos placas ESP32 para consultar información de zonas, visualizar eventos y gestionar alarmas de emergencia.

El problema que se busca abordar es la dificultad de reunir en un mismo lugar la información de ocupación, las lecturas de sensores y los avisos de emergencia. La propuesta permite explorar cómo compartir esa información entre distintos usuarios, sin confundir una lectura de un sensor con una emergencia confirmada.

**Objetivo principal:** desarrollar una aplicación web y móvil que centralice la consulta del monitoreo y la gestión autorizada de emergencias.

**Objetivos específicos:**

- Organizar la información por zonas y mostrarla mediante pantallas de resumen y un mapa.
- Diferenciar el acceso público de las acciones de administrador e instructor.
- Registrar y consultar alarmas, y presentar un aviso global cuando exista una emergencia activa.
- Recibir telemetría de ESP32 mediante MQTT, sin exponer las credenciales del broker en la aplicación.
- Integrar notificaciones push en Android y mantener una sola lógica Angular para web y móvil.
- Separar las simulaciones de formación de las lecturas reales y de los estados pendientes de confirmación.

> **Alcance actual:** es un proyecto en desarrollo y pruebas, no un sistema certificado de seguridad. La existencia del código no garantiza que los servicios externos estén desplegados ni que el hardware haya respondido. No debe utilizarse como único medio de aviso o evacuación.

##  Tecnologías utilizadas

| Tecnología | Uso dentro del proyecto |
| --- | --- |
| Angular 22 y TypeScript | Componentes, rutas, formularios, servicios y estado compartido mediante Signals. |
| Ionic 9 | Controles y navegación de la interfaz web y móvil. |
| HTML y CSS/SCSS | Estructura, estilos y adaptación de las pantallas. |
| Capacitor 8 | Integra el resultado de Angular en Android y permite acceder a plugins nativos. |
| Android, Java y Gradle | Proyecto nativo, integración Firebase, permisos y generación de APK. |
| Supabase | Autenticación, acceso a datos y funciones de servidor. |
| PostgreSQL | Tablas, restricciones, funciones SQL y políticas de acceso por fila (RLS). |
| Firebase Cloud Messaging (FCM) | Recepción de notificaciones push en Android. |
| Firebase App Check | Validación de la aplicación en el proceso de registro FCM; usa proveedor Debug o Play Integrity según la compilación. |
| Node.js | Receptor de telemetría y scripts de configuración y pruebas. |
| MQTT y EMQX Cloud | Transporte de mensajes entre las placas y el receptor, utilizando TLS. |
| ESP32 | Lectura de sensores y ejecución del comportamiento definido en los archivos de firmware. |
| Vitest, Playwright y ESLint | Pruebas unitarias, pruebas de navegación y revisión del código. |
| Vercel | Configuración de publicación de la web y redirección de rutas a `index.html`. |

Las versiones declaradas se pueden consultar en `package.json`. Las Edge Functions usan TypeScript en el entorno de Supabase.

##  Aplicación web

La navegación principal se organiza por pestañas. Las páginas se cargan mediante las rutas de Angular y utilizan servicios compartidos para evitar mantener un estado diferente en cada pantalla.

| Pantalla | Contenido presente en el código |
| --- | --- |
| Inicio | Resumen de zonas y ocupación, selección del evento y controles de alarma según permisos. |
| Zonas | Consulta del estado y capacidad de las zonas. La ocupación conserva una lógica de simulación. |
| Mapa | Representación de las zonas y su configuración espacial; no es un mapa GPS. |
| Alertas | Consulta y filtrado de alertas del estado de la aplicación. No todas equivalen a incidentes persistidos. |
| Más | Acceso a zona segura, estadísticas, sensores, monitoreo IoT, asistente, configuración y administración. |
| Monitoreo IoT | Estado del receptor, conexión de las placas, métricas y eventos recibidos por MQTT. |
| Sensores | Controles de simulación con tipos de dispositivos filtrados; no es la pantalla de lecturas MQTT reales. |
| Estadísticas y zona segura | Resúmenes derivados del estado compartido y del historial de simulación de la sesión. |
| Asistente | Respuestas locales por reglas sobre el estado de la aplicación. Aunque la interfaz lo denomina IA, no hay una integración con un modelo externo en este servicio. |
| Administración | Listado de usuarios, creación y cambio de estado de instructores, y gestión de configuración de zonas. Depende de Supabase y sus permisos. |

### Inicio de sesión y roles

El formulario solicita usuario y contraseña. `SupabaseAuthService` transforma el nombre de usuario en un correo interno para utilizar Supabase Auth y comprueba los claims del token. El rol no se obtiene únicamente de la selección visual del formulario.

| Rol | Acceso previsto |
| --- | --- |
| Aprendiz | Perfil público de consulta, sin controles para activar ni finalizar alarmas. No representa una cuenta de instructor o administrador. |
| Instructor | Consulta y control de alarmas con identidad validada; sin acceso a la administración de usuarios y zonas. |
| Administrador | Control de alarmas y acceso a administración, además de las acciones de simulación permitidas. |

La sesión se restaura al iniciar la aplicación y se degrada al perfil público al cerrarla. Algunos servicios conservan el prefijo `Demo` por la evolución del proyecto; ese nombre no significa que el inicio de sesión actual use credenciales simuladas. La autorización también debe comprobarse en el servidor y en las políticas de base de datos.

### Descarga de Android desde la web

La sección Más tiene un botón de descarga controlado por `APK_DOWNLOAD_URL`. Solo admite una URL HTTPS válida y se mantiene deshabilitado si no se ha publicado un archivo de distribución. La sección se oculta dentro de la aplicación nativa. Generar una APK local no publica automáticamente una descarga.

## Aplicación móvil Android

Android utiliza los mismos componentes, rutas y servicios de `src/app/` que la web. `npm run build` genera el directorio `www/`, y Capacitor copia su contenido al proyecto nativo. No existe una implementación Android separada del modal o de las reglas de alarmas.

`capacitor.config.ts` define `webDir: 'www'` y el identificador `com.sena.crowdintelligence`. La configuración revisada no contiene un servidor de Live Reload. Los cambios del código Angular requieren volver a compilar y sincronizar para incorporarlos a una APK.

La parte nativa añade:

- Permisos `INTERNET` y `POST_NOTIFICATIONS`; este último también se solicita en tiempo de ejecución cuando corresponde.
- El plugin de notificaciones push de Capacitor.
- Plugins locales de App Check y recuperación del desafío de registro FCM.
- Un servicio FCM que conserva los desafíos recibidos sin el bridge activo y reenvía las notificaciones de emergencia al plugin.
- Configuración de seguridad de red que bloquea tráfico claro y limita la confianza de desarrollo a destinos concretos ya definidos en el proyecto.

Las excepciones de red existentes pertenecen al entorno de desarrollo original: no son direcciones universales para instalar el proyecto. Para otro entorno deben revisarse de forma segura; no se debe desactivar TLS para resolver una conexión.

### Debug y Release

| Compilación | Uso y consideraciones |
| --- | --- |
| Debug | Pruebas locales; utiliza firma de depuración y proveedor Debug de App Check. No debe anunciarse como distribución oficial. |
| Release | Utiliza la configuración de firma existente y App Check con Play Integrity. Requiere validar firma, configuración Firebase y funcionamiento en el teléfono. |

El proyecto carga los datos de firma desde `keystore.properties` en el directorio personal del usuario que compila. La clave de firma y sus contraseñas no deben subirse al repositorio. Conservar el `applicationId` y el certificado es necesario para actualizar una instalación compatible.

##  Sistema de emergencias

Los cinco eventos configurados son **incendio, sismo, impacto, simulacro y emergencia**. Se conserva el tipo histórico `alarma_manual`; el campo `evento` permite distinguirlos.

### Registro y activación

1. El administrador o instructor autenticado selecciona el evento.
2. La aplicación comprueba la sesión y consulta las alarmas activas.
3. Para la ruta con evento, el gateway envía la solicitud con JWT a `POST /api/alarm/command` del receptor.
4. El backend valida la identidad y utiliza la RPC `crear_incidente_con_notificacion` para registrar el incidente y su aviso pendiente en una transacción.
5. Después intenta publicar el comando MQTT, si la publicación está habilitada y configurada.

Las claves de idempotencia permiten reintentar sin crear incidentes duplicados. El SQL incluye controles de duplicados y una restricción para evitar varias alarmas manuales activas. La ruta histórica sin evento conserva la llamada a `activar-alarma-manual`.

La ruta de origen hardware sigue separada: recibir un evento de sensor no registra automáticamente un incidente oficial ni cierra una alarma.

### Consulta y modal global

`ManualAlarmService` consulta `consultar-alarma-activa`. `ManualAlarmSyncService` conserva el estado compartido y vuelve a consultar cada diez segundos mientras el documento está visible, al recuperar conectividad y al volver al primer plano. Esto es consulta periódica, no una suscripción Supabase Realtime.

`AppComponent` monta el modal global y solicita recuperación al cambiar la identidad autenticada. También permite que una sincronización posterior recupere el estado tras un error inicial. El modal muestra el mensaje del evento, severidad y fecha. Los aprendices pueden visualizarlo, pero no reciben el control de finalización.

### Finalización y estados pendientes

El botón de finalización se ofrece a administrador e instructor con permisos válidos. Después de la confirmación, el cliente invoca `finalizar-alarma-manual`, valida la respuesta y solicita el apagado por el gateway MQTT. Finalmente vuelve a consultar el estado.

Finalizar el registro en Supabase y apagar físicamente el dispositivo son operaciones distintas. Si el transporte falla después de guardar, la aplicación conserva un estado pendiente. Un comando publicado **no confirma que el buzzer haya sonado o se haya apagado**, porque el contrato actual no entrega ese estado físico.

> En la última comprobación previa a esta documentación, las rutas Cloud de consulta y finalización devolvieron 404. El código local existe para finalizar, pero `consultar-alarma-activa` se consume desde el cliente y no tiene carpeta de implementación en `supabase/functions/`. Hay que resolver estos servicios antes de afirmar que el flujo completo funciona. No se debe activar una alarma física sin una finalización operativa.

## Internet de las cosas (IoT)

Los archivos `esp32/ESP1.txt` y `esp32/ESP2.txt` contienen el código de referencia de las placas. Los contratos TypeScript describen sus mensajes; su presencia no sustituye una prueba con el circuito real.

| Placa | Sensores y datos descritos en el código |
| --- | --- |
| ESP32 1 | Temperatura y humedad mediante DHT, movimiento mediante MPU, distancia ultrasónica y entrada touch. Publica métricas y eventos de los cinco tipos. |
| ESP32 2 | Temperatura mediante DHT11, entradas infrarrojas de entrada/salida y contadores de detecciones. Incluye comportamiento de alarma y pantalla OLED. No publica humedad en su contrato MQTT. |

```text
ESP32 1 / ESP32 2 → MQTT con TLS → EMQX Cloud
                                      ↓
                                receptor Node.js
                                      ↓ HTTPS / SSE
                            aplicación web y Android
```

El receptor mantiene el último estado en memoria, valida los mensajes y lo comparte con la aplicación por SSE, una conexión que permite enviar actualizaciones del servidor al cliente. No persiste esta telemetría en Supabase.

Topics de lectura utilizados:

```text
sena/casanare/metricas
sena/casanare/placa1/eventos/+
sena/casanare/placa2/eventos/incendio
sena/casanare/placa1/estado/conexion
sena/casanare/placa2/estado/conexion
```

El topic de comandos es `sena/casanare/placa2/comandos/alarma`. La publicación utiliza credenciales separadas y solo se inicia con `--comandos`. Las credenciales de suscripción deben tener permisos de lectura limitados en EMQX.

| Endpoint del receptor | Función |
| --- | --- |
| `GET /health` | Estado del proceso, conexión MQTT y publicador. |
| `GET /api/telemetry/snapshot` | Último estado disponible. |
| `GET /api/telemetry/stream` | Actualizaciones SSE. |
| `POST /api/alarm/command` | Solicitudes de comandos con validación de identidad y autorización. |

### Datos reales y simulación

- **Monitoreo IoT** usa `TelemetryService` y las métricas recibidas por el receptor. La ausencia de datos no se reemplaza con números inventados.
- **Sensores**, el historial y parte de los resúmenes de ocupación conservan servicios de simulación para formación. Filtrar tarjetas por tipos de hardware no convierte sus valores en telemetría real.
- La configuración de zonas se consulta en modo `remote` desde `src/main.ts`, pero eso no convierte la ocupación simulada en un conteo físico.
- `npm run receiver:demo` usa datos de prueba identificados como demo y no conecta al broker.
- Un evento con `estado:false` indica fin de detección; no significa cierre oficial de la emergencia.

En la última observación registrada se confirmó conexión del receptor con EMQX, pero no se recibió telemetría de ninguna placa. Sigue pendiente contrastar los valores y las acciones con los ESP32 encendidos.

##  Base de datos y servicios

Supabase separa la autenticación, los datos de la aplicación y las operaciones que requieren privilegios de servidor.

| Objeto o servicio | Uso y alcance |
| --- | --- |
| Supabase Auth | Identidades y sesiones de administrador e instructor; las contraseñas no se guardan en la tabla pública de usuarios. |
| `public.usuarios` | Perfil con `id`, `nombre`, `rol` y `activo`. Las migraciones preparan políticas de lectura y bloquean escrituras directas del cliente. |
| `public.zonas` / `public.zonas_publicas` | Configuración de zonas y vista de consulta pública filtrada. No representan una tabla de lecturas IoT. |
| `eventos_alarma_manual` | Contrato usado por los servicios de alarmas. El SQL manual añade `evento` y `origen` sobre una tabla preexistente; no prepara por sí solo todo el esquema desde cero. |
| `notificaciones_emergencia_outbox` | Cola de avisos pendientes vinculados al incidente. |
| `notificaciones_emergencia_envios` | Control de entregas utilizado por el procesamiento de notificaciones. |
| Funciones SQL de outbox | Reclamo, renovación y finalización del trabajo para coordinar los envíos. |
| Custom Access Token Hook | Función preparada para incorporar el rol validado al token. Su instalación en Cloud debe confirmarse. |

Las políticas RLS limitan el acceso a cada fila según el usuario. Los archivos SQL incluyen funciones auxiliares de usuario activo y rol, restricciones e índices. Tener esos archivos en Git no significa que ya estén aplicados en el proyecto remoto.

En `supabase/functions/` hay implementaciones de `crear-instructor`, `listar-usuarios-admin`, `gestionar-estado-instructor`, `activar-alarma-manual`, `finalizar-alarma-manual`, `registrar-dispositivo-fcm` y `procesar-notificaciones-emergencia`.

El registro FCM implementa un intercambio de desafío y confirmación, con integración App Check. El procesador utiliza la cola de avisos y Firebase para intentar su entrega. Su funcionamiento depende del despliegue, los secretos de servidor, el esquema requerido y la ejecución del procesador; crear una fila pendiente no envía por sí solo una notificación.

**No se ejecutan automáticamente los SQL manuales ni se despliegan funciones al iniciar Angular.** Su revisión y aplicación remota requieren autorización y un entorno correctamente preparado. Algunos documentos de subcarpetas describen fases anteriores y pueden no reflejar todos los cambios actuales.

##  Instalación y ejecución

Los comandos siguientes corresponden a los scripts y configuraciones presentes. Esta revisión documental no reinstaló dependencias ni ejecutó una instalación desde cero.

### 1. Requisitos y descarga

- Git y npm.
- Node.js compatible con Angular 22. Para el receptor, la documentación del proyecto indica Node **24.19 o superior**, por la importación directa del núcleo TypeScript.
- Para Android: Android Studio, SDK configurado y JDK compatible; el proyecto nativo utiliza Java 21 y SDK de compilación 36, con mínimo Android API 24.
- Proyectos propios de Supabase y Firebase, además de acceso a EMQX si se utilizará hardware.

```bash
git clone https://github.com/BryanAlexander-Reyes/sena-emergencias.git
cd sena-emergencias
npm ci
```

### 2. Configuración pública

Copiar `.env.example` a `.env` y reemplazar los marcadores localmente. En PowerShell:

```powershell
Copy-Item .env.example .env
```

Variables para la aplicación:

| Variable | Uso |
| --- | --- |
| `SUPABASE_URL` | URL HTTPS de un proyecto Supabase. |
| `SUPABASE_PUBLISHABLE_KEY` | Clave publicable del proyecto, con formato `sb_publishable_...`. |
| `TELEMETRY_BASE_URL` | URL del receptor accesible desde el cliente. Para Android y web publicada, utilizar HTTPS. |
| `APK_DOWNLOAD_URL` | Opcional: URL HTTPS de una APK de distribución publicada. Vacía mantiene la descarga deshabilitada. |

Ejemplo de direcciones, sin credenciales:

```dotenv
SUPABASE_URL=https://REEMPLAZAR.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR
TELEMETRY_BASE_URL=https://receptor.ejemplo.com
APK_DOWNLOAD_URL=
```

Los scripts `env:supabase`, `env:telemetry` y `env:apk` generan los archivos de configuración. `npm start` y `npm run build` ya los ejecutan. Desarrollo y producción reemplazan las mismas configuraciones públicas; `environment.prod.ts` cambia además la bandera de producción.

El build exige configuración Supabase válida y rechaza marcadores o claves no publicables. La clave publicable puede estar en el cliente: la protección de datos depende de RLS y de las validaciones del servidor. Sin configuración válida no debe interpretarse la interfaz disponible como conexión remota operativa.

**Nunca incluir `service_role`, contraseñas MQTT ni credenciales Firebase privadas en Angular, la APK o las variables del despliegue web.** Esas variables pertenecen exclusivamente al receptor o a las funciones de servidor. Si se usa el `.env` local compartido para el receptor, no copiarlo a un despliegue frontend ni versionarlo.

### 3. Iniciar la web

```bash
npm start
```

Abrir la dirección que indique Angular, normalmente `http://localhost:4200`. Es preferible este script a ejecutar `ng serve` directamente, porque regenera las configuraciones.

### 4. Iniciar el receptor

Configurar en el entorno **del receptor** `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER` y `MQTT_PASSWORD`. `MQTT_CA_FILE` permite indicar una CA para el broker. No reutilizar una cuenta de publicación para las suscripciones de lectura.

```bash
npm run receiver
```

Para probar únicamente la interfaz con fixtures:

```bash
npm run receiver:demo
```

`TELEMETRY_HOST` limita la interfaz de escucha; por defecto es loopback. `TELEMETRY_PORT` utiliza 3000 por defecto y `TELEMETRY_ALLOWED_ORIGIN` controla CORS. En un despliegue real deben ajustarse los orígenes y la exposición del puerto.

HTTPS admite `TELEMETRY_TLS_CERT` y `TELEMETRY_TLS_KEY`, o bien `TELEMETRY_TLS_PFX` y `TELEMETRY_TLS_PASSPHRASE`. Certificados privados y contraseñas permanecen fuera del repositorio. Los certificados autofirmados requieren confianza explícita en cada dispositivo; no se deben instalar certificados raíz sin autorización.

Para habilitar comandos se necesitan además las credenciales de publicación `MQTT_COMMAND_USER` y `MQTT_COMMAND_PASSWORD`, autorización ACL en EMQX y la credencial de servidor `SUPABASE_SERVICE_ROLE_KEY`. La opción es `node receiver/server.mjs --comandos`; **no usarla como paso inicial ni probar activaciones físicas hasta validar la finalización**.

En un teléfono, `localhost` apunta al propio teléfono, no al computador. Configurar `TELEMETRY_BASE_URL` con un destino HTTPS realmente accesible y regenerar el build. La web publicada y el receptor son servicios separados; publicar la web en Vercel no publica el receptor Node.

### 5. Preparar Android y generar APK

La carpeta `android/` ya existe: no es necesario ejecutar `cap add android`. Configurar Android Studio y el SDK. Para FCM, proporcionar el `google-services.json` del proyecto Firebase correspondiente al identificador de la aplicación y configurar App Check. La configuración pública de Firebase no sustituye las credenciales privadas del servidor de envío.

```bash
npm run build
npx cap sync android
npx cap open android
```

En PowerShell, desde la raíz, para una APK de pruebas:

```powershell
Set-Location android
.\gradlew.bat :app:assembleDebug
Set-Location ..
```

Para Release, con el almacén de firma existente correctamente configurado:

```powershell
Set-Location android
.\gradlew.bat :app:assembleRelease
Set-Location ..
```

En Linux/macOS, el equivalente dentro de `android/` es `./gradlew :app:assembleRelease`.

Rutas habituales de salida:

- Debug: `android/app/build/outputs/apk/debug/app-debug.apk`.
- Release: `android/app/build/outputs/apk/release/app-release.apk`.

**Una APK existente puede estar desactualizada.** Comprobar el éxito de Gradle, verificar su firma con `apksigner verify --print-certs <ruta-a-la-apk>` desde las herramientas del SDK y comparar el contenido de `assets/public/` dentro de la APK con `www/`. Después de cambios Angular se debe repetir build, sincronización y compilación.

Live Reload no está configurado en el archivo actual. Puede estudiarse como opción exclusiva de desarrollo, con una dirección accesible desde el teléfono y TLS correcto; una Release debe seguir cargando sus archivos empaquetados, no un servidor local de desarrollo.

### 6. Publicación web

En Vercel, configurar las variables públicas necesarias, usar `npm run build` y publicar `www/`. `vercel.json` dirige las rutas de la aplicación a `index.html`. La configuración del receptor debe permitir el origen HTTPS publicado. No se verificó un despliegue web durante esta documentación.

### Comandos de comprobación disponibles

```bash
npm run test:config
npm run test:unit
npm run test:receiver
npm run test:e2e
npm run lint
```

Son comandos disponibles, no una afirmación de que toda la batería esté aprobada. Las pruebas automatizadas pueden cubrir contratos y permisos, pero no confirman por sí solas recepción FCM, lecturas de sensores ni respuesta física de una alarma.

## 📂 Estructura de carpetas

```text
sena-emergencias/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── auth/          # Autenticación, sesión y permisos
│   │   │   ├── data/          # Contratos, repositorios y validaciones
│   │   │   ├── plugins/       # Puente Angular con plugins locales
│   │   │   └── services/      # Alarmas, telemetría y simulación
│   │   ├── features/          # Páginas web y móviles
│   │   ├── shared/            # Componentes comunes y modal global
│   │   └── tabs/              # Navegación principal
│   └── environments/         # Configuración pública y generadores de salida
├── android/                  # Proyecto nativo, Java, manifiesto y Gradle
├── esp32/                    # Código de referencia ESP1.txt y ESP2.txt
├── receiver/                 # Receptor MQTT, SSE y gateway de comandos
├── scripts/                  # Generación y validación de configuraciones
├── supabase/
│   ├── functions/            # Edge Functions de administración, alarmas y FCM
│   ├── migrations/           # Migraciones SQL versionadas
│   ├── manual/               # SQL de incidentes y cola de notificaciones
│   └── tests/                # Comprobaciones SQL de políticas y funciones
├── e2e/                      # Pruebas de navegación con Playwright
├── capacitor.config.ts       # Enlace entre el build web y Android
└── angular.json              # Configuraciones de desarrollo, build y pruebas
```

`www/` es una salida generada, no otra fuente de código que se deba editar manualmente.

## 📋 Estado actual del proyecto

En esta tabla, **implementado** significa que existe código local; **en pruebas** indica que falta validar la integración o el dispositivo; **pendiente** identifica dependencias todavía no resueltas. No son garantías de operación en producción.

| Funcionalidad | Estado | Observaciones |
| --- | --- | --- |
| Pantallas y navegación compartida | Implementado | Web y Android parten de `src/app/`. |
| Autenticación y permisos por rol | En pruebas | Servicios reales y comprobaciones locales; dependen de Auth, perfiles y claims configurados. |
| Administración de usuarios y zonas | En pruebas | Interfaz y repositorios presentes; requiere funciones, esquema y RLS en Cloud. |
| Ocupación, historial y sensores simulados | Implementado | Funciones de formación; no equivalen a lecturas físicas. |
| Modal global de cinco eventos | En pruebas | Montaje y recuperación corregidos; falta confirmar la visualización en Release con alarmas reales. |
| Recuperación de alarmas activas | Pendiente | Última sonda previa: `consultar-alarma-activa` devolvió 404; no hay implementación local de esa función en la carpeta de Edge Functions. |
| Registro atómico de incidente y aviso | Pendiente | RPC SQL preparada; instalación remota no confirmada. |
| Finalización autorizada | Pendiente | Código y pruebas locales; última sonda de la función devolvió 404. |
| Receptor HTTPS y enlace EMQX | En pruebas | Conexión comprobada en una ejecución anterior, no una garantía de disponibilidad continua. |
| Telemetría de ESP32 1 y ESP32 2 | En pruebas | Contratos y visualización presentes; última observación sin mensajes de las placas. |
| Publicación de comandos físicos | Pendiente | Requiere credenciales, ACL, backend y finalización operativa; no se confirmó respuesta física. |
| Registro y entrega FCM | Pendiente | Código nativo y servidor presentes; las últimas sondas de registro/procesador devolvieron 404. Falta prueba en primer y segundo plano. |
| APK Release con los últimos cambios | Pendiente | Hay una Release anterior firmada; la última compilación no terminó dentro del plazo. No se confirmó una APK nueva con las correcciones más recientes. |
| Equivalencia del bundle empaquetado | Pendiente | Misma fuente y configuraciones públicas; falta comparar íntegramente el bundle actual con el contenido de una Release nueva. |
| Descarga pública de APK | Pendiente | Botón preparado y deshabilitado sin URL publicada. |

Como antecedente de la ejecución anterior, pasaron 31 pruebas seleccionadas de recuperación, modal, servicio de alarmas y permisos. No se ejecutaron nuevamente para escribir este documento ni se afirma que toda la suite esté aprobada. Los scripts SQL también necesitan validación en una base preparada antes de su aplicación autorizada.

## 🌱 Dificultades y aprendizajes

Este proyecto me permite practicar la separación entre interfaz, reglas y servicios externos. Compartir Angular entre web y Android reduce duplicaciones, pero no elimina diferencias como los permisos, la confianza de certificados o el ciclo de vida de una aplicación móvil.

Otro aprendizaje importante es distinguir los estados: registrar una alarma, publicar un comando y recibir una respuesta física no son el mismo resultado. Lo mismo ocurre con FCM: obtener un token no significa que el dispositivo ya esté registrado ni que vaya a recibir un aviso. Por eso el proyecto conserva errores y estados pendientes en lugar de mostrar un éxito sin confirmación.

También queda claro que las pruebas con datos simulados ayudan a revisar la interfaz, pero deben complementarse con servicios desplegados y dispositivos físicos. La documentación debe reflejar esa diferencia.

## Próximas mejoras

- Resolver la consulta de alarmas activas y validar los despliegues autorizados de finalización y FCM.
- Validar las migraciones, el SQL manual y las políticas en un entorno de pruebas antes de aplicarlos en Cloud.
- Completar el recorrido de emergencia en teléfonos reales, con administrador, instructor y aprendiz.
- Comprobar recepción FCM en primer plano, segundo plano y arranque desde una notificación.
- Contrastar las métricas de ambas placas y definir una confirmación física de comandos antes de afirmar que una acción se ejecutó.
- Mantener más clara la separación visual entre ocupación simulada y telemetría real.
- Generar una Release actualizada, verificar su firma y comparar los archivos empaquetados con el build Angular.
- Publicar una APK de distribución solo después de estas verificaciones y configurar entonces su enlace de descarga.

---

**Seguridad:** no compartir archivos `.env`, almacenes de firma, claves privadas, tokens ni credenciales de broker o servidor. Antes de publicar el repositorio, revisar también los archivos de firmware y los cambios pendientes para detectar valores incrustados; este README no certifica que todo el repositorio esté libre de secretos.
