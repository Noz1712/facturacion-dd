import { Routes } from '@angular/router';

import { guestGuard, authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/app-shell/app-shell').then((m) => m.AppShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'cliente',
        loadComponent: () =>
          import('./pages/clients/clients').then((m) => m.ClientsPage),
      },
      {
        path: 'recurrencias',
        loadComponent: () =>
          import('./pages/invoices/invoices').then((m) => m.InvoicesPage),
      },
      {
        path: 'movimiento',
        loadComponent: () =>
          import('./pages/movements/movements').then((m) => m.MovementsPage),
      },
      {
        path: 'factura',
        pathMatch: 'full',
        redirectTo: 'recurrencias',
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./pages/profile/profile').then((m) => m.ProfilePage),
      },
      {
        path: 'cuentas',
        loadComponent: () =>
          import('./pages/accounts/accounts').then((m) => m.AccountsPage),
      },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'app',
  },
  {
    path: '**',
    redirectTo: 'app',
  },
];
