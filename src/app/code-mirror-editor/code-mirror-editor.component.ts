import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  Inject,
  PLATFORM_ID,
  HostListener,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { EditorState, EditorSelection } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import {
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
  KeyBinding,
} from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ExpressionToolbarComponent } from '../expression-toolbar/expression-toolbar.component';
import { linter, Diagnostic } from '@codemirror/lint';
import { bracketMatching } from '@codemirror/language';

const customKeymap: KeyBinding[] = [
  {
    key: 'Mod-c',
    run: (view: EditorView) => {
      const selectedText = view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to
      );
      navigator.clipboard.writeText(selectedText);
      return true;
    },
  },
  {
    key: 'Mod-x',
    run: (view: EditorView) => {
      const { state } = view;
      const selectedText = state.sliceDoc(
        state.selection.main.from,
        state.selection.main.to
      );
      navigator.clipboard.writeText(selectedText);
      const transaction = state.update({
        changes: {
          from: state.selection.main.from,
          to: state.selection.main.to,
          insert: '',
        },
      });
      view.dispatch(transaction);
      return true;
    },
  },
  {
    key: 'Mod-v',
    run: (view: EditorView) => {
      navigator.clipboard.readText().then((clipboardText) => {
        const transaction = view.state.update({
          changes: {
            from: view.state.selection.main.from,
            to: view.state.selection.main.to,
            insert: clipboardText,
          },
        });
        view.dispatch(transaction);
      });
      return true;
    },
  },
  {
    key: 'Shift-ArrowRight',
    run: (view: EditorView) => {
      const { state } = view;
      const selection = state.selection.main.extend(
        state.selection.main.to + 1
      );
      const transaction = state.update({
        selection: EditorSelection.single(selection.from, selection.to),
      });
      view.dispatch(transaction);
      return true;
    },
  },
];

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
  @ViewChild('contextMenu')
  contextMenu!: ElementRef<HTMLDivElement>;

  private editorInstance!: EditorView;
  private currentContextEvent: MouseEvent | null = null;

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
          keymap.of([...defaultKeymap, ...customKeymap]),
          bracketMatching(),
          linter((view) => this.syntaxValidator(view.state)),
          EditorView.domEventHandlers({
            dragstart: (event, view) => {
              const selection = view.state.selection.main;
              if (!selection.empty) {
                event.dataTransfer?.setData(
                  'text/plain',
                  view.state.sliceDoc(selection.from, selection.to)
                );
                view.dom.draggable = true;
              }
            },
            drop: (event, view) => {
              event.preventDefault();
              const dropText = event.dataTransfer?.getData('text/plain');
              if (dropText) {
                const { state } = view;
                const pos = view.posAtCoords({
                  x: event.clientX,
                  y: event.clientY,
                });
                if (pos != null) {
                  const transaction = state.update({
                    changes: { from: pos, to: pos, insert: dropText },
                  });
                  view.dispatch(transaction);
                }
              }
            },
          }),
        ],
      });

      this.editorInstance = new EditorView({
        state,
        parent: this.codeEditor.nativeElement,
      });

      this.editorInstance.dom.addEventListener(
        'contextmenu',
        this.onContextMenu.bind(this)
      );
    }
  }

  @HostListener('document:click')
  closeContextMenu() {
    if (this.contextMenu?.nativeElement) {
      this.contextMenu.nativeElement.style.display = 'none';
    }
  }

  onContextMenu(event: MouseEvent) {
    event.preventDefault();
    this.currentContextEvent = event;

    if (this.contextMenu?.nativeElement) {
      const contextMenu = this.contextMenu.nativeElement;
      contextMenu.style.display = 'block';
      contextMenu.style.left = `${event.pageX}px`;
      contextMenu.style.top = `${event.pageY}px`;
    }
  }

  cutText() {
    if (this.editorInstance) {
      const { state } = this.editorInstance;
      const selection = state.selection.main;
      if (!selection.empty) {
        const selectedText = state.sliceDoc(selection.from, selection.to);
        navigator.clipboard.writeText(selectedText);
        const transaction = state.update({
          changes: { from: selection.from, to: selection.to, insert: '' },
        });
        this.editorInstance.dispatch(transaction);
      }
    }
    this.closeContextMenu();
  }

  copyText() {
    if (this.editorInstance) {
      const { state } = this.editorInstance;
      const selection = state.selection.main;
      if (!selection.empty) {
        const selectedText = state.sliceDoc(selection.from, selection.to);
        navigator.clipboard.writeText(selectedText);
      }
    }
    this.closeContextMenu();
  }

  async pasteText() {
    if (this.editorInstance) {
      const clipboardText = await navigator.clipboard.readText();
      const { state } = this.editorInstance;
      const selection = state.selection.main;
      const transaction = state.update({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: clipboardText,
        },
      });
      this.editorInstance.dispatch(transaction);
    }
    this.closeContextMenu();
  }

  deleteText() {
    if (this.editorInstance) {
      const { state } = this.editorInstance;
      const selection = state.selection.main;
      if (!selection.empty) {
        const transaction = state.update({
          changes: { from: selection.from, to: selection.to, insert: '' },
        });
        this.editorInstance.dispatch(transaction);
      }
    }
    this.closeContextMenu();
  }

  syntaxValidator = (state: EditorState): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const code = state.doc.toString();

    try {
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
