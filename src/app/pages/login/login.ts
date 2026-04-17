import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-login',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly checkingSession = computed(() => this.auth.loading());

  async loginWithGoogle() {
    this.submitting.set(true);

    try {
      await this.auth.signInWithGoogle();
      await this.router.navigateByUrl('/app/dashboard');
    } catch {
      return;
    } finally {
      this.submitting.set(false);
    }
  }
}
