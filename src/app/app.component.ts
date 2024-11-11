import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CodeMirrorEditorComponent } from './code-mirror-editor/code-mirror-editor.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CodeMirrorEditorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'CodeMirror';
}
