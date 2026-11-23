import type { AfterViewChecked, ElementRef } from '@angular/core';
import { Component, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, helpCircleOutline, sendOutline, sparklesOutline, timeOutline } from 'ionicons/icons';

import { DemoAssistantService } from '../../../core/services/demo-assistant.service';
import { SecondaryPageComponent } from '../../../shared/secondary-page/secondary-page.component';

@Component({
  selector: 'app-asistente',
  templateUrl: './asistente.page.html',
  styleUrls: ['./asistente.page.scss'],
  imports: [IonIcon, FormsModule, SecondaryPageComponent],
})
export class AsistentePage implements AfterViewChecked {
  @ViewChild('chatLog') private chatLog?: ElementRef<HTMLDivElement>;

  private readonly assistant = inject(DemoAssistantService);
  private lastMessageCount = 0;

  readonly messages = this.assistant.messages;
  readonly quickQuestions = this.assistant.quickQuestions;
  readonly draft = signal('');
  readonly maxLength = 240;

  constructor() {
    addIcons({
      chatbubblesOutline,
      helpCircleOutline,
      sendOutline,
      sparklesOutline,
      timeOutline,
    });
  }

  ngAfterViewChecked(): void {
    const count = this.messages().length;
    if (count !== this.lastMessageCount) {
      this.lastMessageCount = count;
      this.scrollToBottom();
    }
  }

  onDraftChange(value: string): void {
    this.draft.set(value.slice(0, this.maxLength));
  }

  canSend(): boolean {
    return this.draft().trim().length > 0;
  }

  send(): void {
    const text = this.draft().trim();
    if (!text) return;
    this.assistant.sendUserMessage(text);
    this.draft.set('');
  }

  askQuick(question: string): void {
    this.assistant.askQuickQuestion(question);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  private scrollToBottom(): void {
    const el = this.chatLog?.nativeElement;
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
    } catch {
      // noop
    }
  }
}
