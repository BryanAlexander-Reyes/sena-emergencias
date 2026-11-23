import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import type { ZoneConfigStatus } from '../../core/services/zone-config-state.service';

import { ZoneConfigStatusComponent } from './zone-config-status.component';

interface SetupOptions {
  readonly remote?: boolean;
  readonly status?: ZoneConfigStatus;
  readonly message?: string | null;
}

interface Setup {
  readonly fixture: ComponentFixture<ZoneConfigStatusComponent>;
  readonly component: ZoneConfigStatusComponent;
  readonly element: HTMLElement;
}

function configure(options: SetupOptions = {}): Setup {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ZoneConfigStatusComponent] });

  const fixture = TestBed.createComponent(ZoneConfigStatusComponent);

  fixture.componentRef.setInput('remote', options.remote ?? true);
  fixture.componentRef.setInput('status', options.status ?? 'ready');
  fixture.componentRef.setInput('message', options.message ?? null);
  fixture.detectChanges();

  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('ZoneConfigStatusComponent', () => {
  it('no muestra ningún aviso en modo DEMO, cualquiera sea el estado interno', () => {
    for (const status of ['idle', 'loading', 'empty', 'error'] as const) {
      const { element, fixture } = configure({ remote: false, status });

      expect(element.querySelector('.zone-status')).toBeNull();
      fixture.destroy();
    }
  });

  it('no muestra nada cuando la configuración remota está lista', () => {
    const { element } = configure({ status: 'ready' });

    expect(element.querySelector('.zone-status')).toBeNull();
    expect(element.textContent?.trim()).toBe('');
  });

  it.each(['idle', 'loading'] as const)('muestra carga para %s sin botón de reintento', (status) => {
    const { element } = configure({ status });

    expect(element.textContent).toContain('Cargando zonas');
    expect(element.querySelector('.zone-status')?.getAttribute('role')).toBe('status');
    expect(element.querySelector('.zone-status__retry')).toBeNull();
  });

  it('muestra el estado vacío sin botón de reintento', () => {
    const { element } = configure({ status: 'empty' });

    expect(element.textContent).toContain('Sin zonas disponibles');
    expect(element.textContent).toContain('zonas activas y públicas');
    expect(element.querySelector('.zone-status__retry')).toBeNull();
  });

  it('muestra el error con mensaje seguro y botón de reintento', () => {
    const { element } = configure({
      status: 'error',
      message: 'No tienes permiso para consultar la configuración de zonas.',
    });

    expect(element.textContent).toContain('Error al cargar zonas');
    expect(element.textContent).toContain('No tienes permiso para consultar la configuración de zonas.');
    expect(element.querySelector('.zone-status')?.getAttribute('role')).toBe('alert');
    expect(element.querySelector('.zone-status__retry')).toBeTruthy();
  });

  it('usa un mensaje genérico si no se publica uno', () => {
    const { element } = configure({ status: 'error', message: null });

    expect(element.textContent).toContain('No fue posible cargar la configuración de zonas.');
  });

  it('emite reintento una sola vez al pulsar el botón', () => {
    const { component, element } = configure({ status: 'error', message: 'Error de prueba' });
    const retry = vi.fn();

    component.retry.subscribe(retry);
    (element.querySelector('.zone-status__retry') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('oculta el aviso cuando la recuperación termina', () => {
    const { fixture, element } = configure({ status: 'loading' });

    expect(element.querySelector('.zone-status')).toBeTruthy();

    fixture.componentRef.setInput('status', 'ready');
    fixture.detectChanges();

    expect(element.querySelector('.zone-status')).toBeNull();
  });
});
