import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Auth } from '../../core/services/auth';
import { Clients } from '../../core/services/clients';
import { Client } from '../../core/models/client.model';

@Component({
  selector: 'app-clients-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  templateUrl: './clients.html',
  styleUrl: './clients.scss',
})
export class ClientsPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly clientsService = inject(Clients);

  readonly clients = this.clientsService.items;
  readonly loading = this.clientsService.loading;
  readonly editingClientId = signal<string | null>(null);
  readonly isEditing = computed(() => this.editingClientId() !== null);

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required]],
    ruc: [''],
    phone: ['', [Validators.required]],
    address: ['', [Validators.required]],
    manager: ['', [Validators.required]],
    billingEmails: ['', [Validators.required]],
  });

  constructor() {
    const user = this.auth.user();
    if (user) {
      this.clientsService.watchByUser(user.uid);
    }
  }

  async saveClient() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const user = this.auth.user();
    if (!user) {
      return;
    }

    const formValue = this.form.getRawValue();
    const trimmedRuc = formValue.ruc.trim();
    const payload = {
      name: formValue.name.trim(),
      phone: formValue.phone.trim(),
      address: formValue.address.trim(),
      manager: formValue.manager.trim(),
      billingEmails: this.parseEmails(formValue.billingEmails),
    };

    if (this.editingClientId()) {
      await this.clientsService.update(this.editingClientId()!, {
        ...payload,
        ruc: trimmedRuc || null,
      });
    } else {
      await this.clientsService.create(
        trimmedRuc
          ? {
              userId: user.uid,
              ...payload,
              ruc: trimmedRuc,
            }
          : {
              userId: user.uid,
              ...payload,
            },
      );
    }

    this.resetForm();
  }

  editClient(client: Client) {
    this.editingClientId.set(client.id);
    this.form.reset({
      name: client.name,
      ruc: client.ruc ?? '',
      phone: client.phone,
      address: client.address,
      manager: client.manager,
      billingEmails: client.billingEmails.join(', '),
    });
  }

  async deleteClient(clientId: string) {
    await this.clientsService.remove(clientId);

    if (this.editingClientId() === clientId) {
      this.resetForm();
    }
  }

  cancelEdit() {
    this.resetForm();
  }

  private resetForm() {
    this.editingClientId.set(null);
    this.form.reset({
      name: '',
      ruc: '',
      phone: '',
      address: '',
      manager: '',
      billingEmails: '',
    });
  }

  private parseEmails(value: string) {
    return value
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);
  }
}
