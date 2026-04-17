import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

type NotificationType = 'success' | 'error' | 'warning';

@Injectable({
  providedIn: 'root',
})
export class Notifications {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string) {
    this.open(message, 'success');
  }

  error(message: string) {
    this.open(message, 'error');
  }

  warning(message: string) {
    this.open(message, 'warning');
  }

  private open(message: string, type: NotificationType) {
    this.snackBar.open(message, 'Cerrar', {
      duration: type === 'error' ? 5200 : 3600,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['app-snackbar', `app-snackbar-${type}`],
    });
  }
}
