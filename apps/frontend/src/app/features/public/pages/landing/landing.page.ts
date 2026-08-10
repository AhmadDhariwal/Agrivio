import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'agrivio-landing-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.page.html',
  styleUrl: './landing.page.scss',
})
export class LandingPage {}
