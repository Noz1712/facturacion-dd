import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-profile-page',
  imports: [MatCardModule, MatIconModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfilePage {
  readonly user = inject(Auth).user;
}
