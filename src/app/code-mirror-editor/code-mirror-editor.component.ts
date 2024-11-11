import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import {
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
} from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ExpressionToolbarComponent } from '../expression-toolbar/expression-toolbar.component';

@Component({
  selector: 'app-code-mirror-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ExpressionToolbarComponent,
  ],
  templateUrl: './code-mirror-editor.component.html',
  styleUrls: ['./code-mirror-editor.component.scss'],
})
export class CodeMirrorEditorComponent implements AfterViewInit {
  @ViewChild('codeEditor', { static: true })
  codeEditor!: ElementRef<HTMLDivElement>;
  private editorInstance!: EditorView;

  variables: string[] = []; // Store variable names
  simulationValues: { [key: string]: number } = {}; // Store input values
  simulationResult: number | null = null; // Result

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngAfterViewInit() {
    // Check if we are in the browser before initializing CodeMirror
    if (isPlatformBrowser(this.platformId)) {
      const state = EditorState.create({
        doc: '',
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          drawSelection(),
          dropCursor(),
          EditorView.lineWrapping,
          javascript(),
          keymap.of(defaultKeymap),
        ],
      });

      this.editorInstance = new EditorView({
        state,
        parent: this.codeEditor.nativeElement,
      });
    }
  }

  getEditorContent(): string {
    return this.editorInstance ? this.editorInstance.state.doc.toString() : '';
  }

  insertTextAtCursor(text: string) {
    if (this.editorInstance) {
      const transaction = this.editorInstance.state.update({
        changes: {
          from: this.editorInstance.state.selection.main.head,
          insert: text,
        },
      });
      this.editorInstance.dispatch(transaction);
    }
  }

  simulateExpression() {
    // Get the current expression from the editor
    const expression = this.getEditorContent();

    // Replace variable names in the expression with actual values from `simulationValues`
    let evaluatedExpression = expression;
    for (const variable in this.simulationValues) {
      const value = this.simulationValues[variable];
      // Replace all occurrences of the variable with its value in the expression
      // Note: Use regex to replace only full variable names, avoiding substring replacement
      const regex = new RegExp(`\\b${variable}\\b`, 'g');
      evaluatedExpression = evaluatedExpression.replace(
        regex,
        value.toString()
      );
    }

    try {
      // Use `Function` to evaluate the expression
      // Wrap the evaluatedExpression to ensure it is a mathematical expression
      this.simulationResult = new Function(
        `return (${evaluatedExpression});`
      )();
    } catch (error) {
      console.error('Error evaluating expression:', error);
      this.simulationResult = null; // Reset result on error
    }
  }
}
