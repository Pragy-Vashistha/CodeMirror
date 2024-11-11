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
import { linter, Diagnostic } from '@codemirror/lint';
import { bracketMatching } from '@codemirror/language';

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

  variables: string[] = [];
  simulationValues: { [key: string]: number } = {};
  simulationResult: number | null = null;
  syntaxErrorMessage: string | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngAfterViewInit() {
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
          bracketMatching(),
          linter((view) => this.syntaxValidator(view.state)), // Syntax validation
        ],
      });

      this.editorInstance = new EditorView({
        state,
        parent: this.codeEditor.nativeElement,
      });
    }
  }

  syntaxValidator = (state: EditorState): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const code = state.doc.toString();

    try {
      // Attempt to parse as a function to detect syntax errors
      new Function(code);
      this.syntaxErrorMessage = null;
    } catch (error: any) {
      const message = error.message;
      const pos = code.length;
      diagnostics.push({
        from: pos,
        to: pos,
        severity: 'error',
        message: message,
      });
      this.syntaxErrorMessage = `Syntax Error: ${message}`;
    }
    return diagnostics;
  };

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
    const expression = this.getEditorContent();
    let evaluatedExpression = expression;
    for (const variable in this.simulationValues) {
      const value = this.simulationValues[variable];
      const regex = new RegExp(`\\b${variable}\\b`, 'g');
      evaluatedExpression = evaluatedExpression.replace(
        regex,
        value.toString()
      );
    }

    try {
      this.simulationResult = new Function(
        `return (${evaluatedExpression});`
      )();
      this.syntaxErrorMessage = null; // Clear error message on successful evaluation
    } catch (error: any) {
      console.error('Error evaluating expression:', error);
      this.syntaxErrorMessage = `Evaluation Error: ${error.message}`; // Update error message on evaluation error
      this.simulationResult = null;
    }
  }
}
