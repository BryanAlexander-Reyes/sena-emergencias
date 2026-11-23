import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { crearValidadorIdentidadSupabase } from './supabase-identity.mjs';

const USUARIO_ID = '33333333-3333-4333-8333-333333333333';
const JWT = 'jwt-sintetico-no-secreto';

function crearFabrica({ jwtValido = true, perfil, errorAuth = null, errorDb = null } = {}) {
  const consultas = [];
  const usuariosValidados = [];

  const clientFactory = (url, clave) => {
    if (clave === 'service-role') {
      return {
        from: (tabla) => ({
          select: (columnas) => ({
            eq: (campo, valor) => ({
              maybeSingle: async () => {
                consultas.push({ tabla, columnas, campo, valor });
                if (errorDb) return { data: null, error: errorDb };
                return { data: perfil === undefined ? null : { id: valor, ...perfil }, error: null };
              },
            }),
          }),
        }),
      };
    }

    return {
      auth: {
        getUser: async (token) => {
          usuariosValidados.push(token);
          if (errorAuth || !jwtValido) return { data: { user: null }, error: errorAuth ?? new Error('JWT invalido') };
          return { data: { user: { id: USUARIO_ID } }, error: null };
        },
      },
    };
  };

  return { clientFactory, consultas, usuariosValidados };
}

function crearValidador(fabrica) {
  return crearValidadorIdentidadSupabase({
    url: 'https://proyecto.supabase.co/',
    publishableKey: 'publishable-key',
    serviceRoleKey: 'service-role',
    clientFactory: fabrica,
  });
}

describe('receptor — identidad Supabase real', () => {
  it('normaliza la raíz tanto para Auth como para la consulta administrativa', () => {
    const urls = [];
    crearValidadorIdentidadSupabase({
      url: 'https://proyecto.supabase.co/rest/v1/',
      publishableKey: 'public-test', serviceRoleKey: 'server-test',
      clientFactory: (url) => { urls.push(url); return {}; },
    });
    assert.deepEqual(urls, ['https://proyecto.supabase.co', 'https://proyecto.supabase.co']);
  });
  it('valida el JWT contra Auth y toma rol/activo de public.usuarios', async () => {
    const fabrica = crearFabrica({ perfil: { rol: 'instructor', activo: true } });
    const identidad = await crearValidador(fabrica.clientFactory)(JWT);

    assert.deepEqual(identidad, { activo: true, rol: 'instructor', id: USUARIO_ID });
    assert.deepEqual(fabrica.usuariosValidados, [JWT]);
    assert.equal(fabrica.consultas.length, 1);
    assert.equal(fabrica.consultas[0].tabla, 'usuarios');
    assert.deepEqual(fabrica.consultas[0].columnas.split(',').map((valor) => valor.trim()), [
      'id',
      'rol',
      'activo',
    ]);
    assert.equal(fabrica.consultas[0].valor, USUARIO_ID);
  });

  it('marca cuentas inactivas y rechaza roles desconocidos o perfiles ausentes', async () => {
    const inactiva = crearFabrica({ perfil: { rol: 'administrador', activo: false } });
    assert.deepEqual(await crearValidador(inactiva.clientFactory)(JWT), {
      activo: false,
      rol: 'administrador',
      id: USUARIO_ID,
    });

    for (const perfil of [{ rol: 'robot', activo: true }, undefined]) {
      const fabrica = crearFabrica({ perfil });
      assert.equal(await crearValidador(fabrica.clientFactory)(JWT), null);
    }
  });

  it('falla cerrado ante JWT inválido, error de base de datos o sin configuración', async () => {
    const sinAuth = crearFabrica({ jwtValido: false, perfil: { rol: 'administrador', activo: true } });
    assert.equal(await crearValidador(sinAuth.clientFactory)(JWT), null);

    const conError = crearFabrica({ perfil: { rol: 'administrador', activo: true }, errorDb: new Error('DB') });
    assert.equal(await crearValidador(conError.clientFactory)(JWT), null);

    const conErrorAuth = crearFabrica({ perfil: { rol: 'administrador', activo: true }, errorAuth: new Error('AUTH') });
    assert.equal(await crearValidador(conErrorAuth.clientFactory)(JWT), null);

    const sinConfiguracion = crearValidadorIdentidadSupabase({ clientFactory: crearFabrica().clientFactory });
    assert.equal(await sinConfiguracion(JWT), null);
    assert.equal(await crearValidador(crearFabrica().clientFactory)(''), null);
  });

  it('nunca confía en un rol distinto del de public.usuarios', async () => {
    const fabrica = crearFabrica({ perfil: { rol: 'aprendiz', activo: true } });
    const identidad = await crearValidador(fabrica.clientFactory)(JWT);

    assert.equal(identidad.rol, 'aprendiz');
    assert.equal(identidad.activo, true);
  });
});
