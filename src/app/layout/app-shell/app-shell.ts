import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';

import { GeneratedInvoices } from '../../core/services/generated-invoices';
import { Auth } from '../../core/services/auth';
import { Invoices } from '../../core/services/invoices';

@Component({
  selector: 'app-app-shell',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly auth = inject(Auth);
  private readonly invoices = inject(Invoices);
  private readonly generatedInvoices = inject(GeneratedInvoices);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly invoiceCount = computed(() => this.invoices.items().length);
  readonly movementCount = computed(
    () => this.generatedInvoices.items().filter((item) => item.status === 'Pendiente').length,
  );
  readonly menuItems = [
    { label: 'Dashboard', icon: 'dashboard', route: '/app/dashboard' },
    { label: 'Cliente', icon: 'groups', route: '/app/cliente' },
    { label: 'Recurrencias', icon: 'event_repeat', route: '/app/recurrencias' },
    { label: 'Movimiento', icon: 'receipt_long', route: '/app/movimiento' },
    { label: 'Perfil', icon: 'account_circle', route: '/app/perfil' },
  ];

  constructor() {
    const currentUser = this.user();
    if (currentUser) {
      this.invoices.watchByUser(currentUser.uid);
      this.generatedInvoices.watchByUser(currentUser.uid);
    }
  }

  async logout() {
    this.invoices.stopWatching();
    this.generatedInvoices.stopWatching();
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
