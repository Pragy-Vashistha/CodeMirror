import { Routes } from '@angular/router';
import { CodeMirrorEditorComponent } from './code-mirror-editor/code-mirror-editor.component';
import { AdvancedEditorComponent } from './advanced-editor/advanced-editor.component';

export const routes: Routes = [
  { path: '', component: CodeMirrorEditorComponent },
  { path: 'advanced-editor', component: AdvancedEditorComponent }
];
