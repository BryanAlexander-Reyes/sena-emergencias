import { computed, Injectable, signal } from '@angular/core';

import {
  findDemoProfile,
  VISITOR_PROFILE,
  VISITOR_PROFILE_ID,
  type DemoProfile,
  type DemoProfileId,
} from './demo-profiles';

export interface DemoSessionState {
  readonly profileId: DemoProfileId;
  readonly profile: DemoProfile;
  readonly isActive: boolean;
  readonly isAdministrative: boolean;
}

@Injectable({ providedIn: 'root' })
export class DemoSessionService {
  private readonly profileIdState = signal<DemoProfileId>(VISITOR_PROFILE_ID);

  readonly profileId = this.profileIdState.asReadonly();
  readonly profile = computed<DemoProfile>(() => findDemoProfile(this.profileId()) ?? VISITOR_PROFILE);
  readonly isActive = computed(() => this.profileId() !== VISITOR_PROFILE_ID);
  readonly isAdministrative = computed(() => this.profile().administrative);
  readonly state = computed<DemoSessionState>(() => ({
    profileId: this.profileId(),
    profile: this.profile(),
    isActive: this.isActive(),
    isAdministrative: this.isAdministrative(),
  }));

  selectProfile(profileId: DemoProfileId): boolean {
    if (findDemoProfile(profileId) === undefined || profileId === this.profileIdState()) {
      return false;
    }

    this.profileIdState.set(profileId);
    return true;
  }

  closeSession(): void {
    this.profileIdState.set(VISITOR_PROFILE_ID);
  }
}
