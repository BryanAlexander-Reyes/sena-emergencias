export type DemoProfileId = 'administrador' | 'instructor' | 'aprendiz';

export interface DemoProfile {
  readonly id: DemoProfileId;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly administrative: boolean;
}

export const DEFAULT_PROFILE_ID: DemoProfileId = 'aprendiz';

export const DEFAULT_PROFILE: DemoProfile = {
  id: 'aprendiz',
  label: 'Aprendiz de demostración',
  description: 'Exploración guiada del monitoreo y del mapa del prototipo.',
  icon: 'book-outline',
  administrative: false,
};

export const DEMO_PROFILES: readonly DemoProfile[] = [
  {
    id: 'administrador',
    label: 'Administrador de demostración',
    description: 'Supervisión general de zonas, alertas y estadísticas simuladas.',
    icon: 'shield-checkmark-outline',
    administrative: true,
  },
  {
    id: 'instructor',
    label: 'Instructor de demostración',
    description: 'Seguimiento de la ocupación, el mapa y las alertas de la sesión.',
    icon: 'school-outline',
    administrative: false,
  },
  DEFAULT_PROFILE,
];

const PROFILES_BY_ID: ReadonlyMap<DemoProfileId, DemoProfile> = new Map(
  DEMO_PROFILES.map((profile) => [profile.id, profile]),
);

export function findDemoProfile(id: DemoProfileId): DemoProfile | undefined {
  return PROFILES_BY_ID.get(id);
}
