import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  bookOutline,
  checkmarkCircleOutline,
  informationCircleOutline,
  keyOutline,
  personOutline,
  schoolOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

import { DEMO_PROFILES, findDemoProfile, type DemoProfileId } from '../../core/auth/demo-profiles';
import { DemoSessionService } from '../../core/auth/demo-session.service';
import { FeatureIntroComponent } from '../../shared/feature-intro/feature-intro.component';

@Component({
  selector: 'app-acceso',
  templateUrl: 'acceso.page.html',
  styleUrls: ['acceso.page.scss'],
  imports: [IonButton, IonContent, IonIcon, RouterLink, FeatureIntroComponent],
})
export class AccesoPage {
  readonly session = inject(DemoSessionService);
  readonly profiles = DEMO_PROFILES;
  readonly confirmationLabel = signal<string | null>(null);

  constructor() {
    addIcons({
      arrowBackOutline,
      bookOutline,
      checkmarkCircleOutline,
      informationCircleOutline,
      keyOutline,
      personOutline,
      schoolOutline,
      shieldCheckmarkOutline,
    });
  }

  selectProfile(profileId: DemoProfileId): void {
    this.session.selectProfile(profileId);
    this.confirmationLabel.set(findDemoProfile(profileId)?.label ?? null);
  }
}
