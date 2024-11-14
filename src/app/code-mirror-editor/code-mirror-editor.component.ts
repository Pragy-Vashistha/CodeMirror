import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ExpressionToolbarComponent } from '../expression-toolbar/expression-toolbar.component';
import { linter, Diagnostic } from '@codemirror/lint';
import {
  PropertyDropdownComponent,
  Property,
} from '../property-dropdown/property-dropdown.component';
import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy,
  Inject,
  PLATFORM_ID,
  HostListener,
} from '@angular/core';
import {
  EditorState,
  StateField,
  StateEffect,
  RangeSetBuilder,
  Extension,
  EditorSelection,
} from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import {
  EditorView,
  keymap,
  ViewPlugin,
  DecorationSet,
  Decoration,
  WidgetType,
  MatchDecorator,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  KeyBinding,
} from '@codemirror/view';
import {
  defaultKeymap,
  indentWithTab,
  insertBlankLine,
} from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  syntaxHighlighting,
  bracketMatching,
  defaultHighlightStyle,
} from '@codemirror/language';
import { Subscription } from 'rxjs';

class PropertyBlockWidget extends WidgetType {
  constructor(readonly property: string) {
    super();
  }

  override eq(other: PropertyBlockWidget) {
    return other.property === this.property;
  }

  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-property-block';
    wrap.textContent = this.property;
    wrap.setAttribute('draggable', 'true');

    // Add drag handlers
    wrap.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', this.property);
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    return wrap;
  }

  override ignoreEvent(event: Event) {
    return event.type !== 'dragstart' && event.type !== 'dragend';
  }
}

const addPropertyBlock = StateEffect.define<{ from: number; to: number }>();

const propertyBlockField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    value = value.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(addPropertyBlock)) {
        value = value.update({
          add: [
            Decoration.replace({
              widget: new PropertyBlockWidget(
                tr.state.sliceDoc(e.value.from, e.value.to)
              ),
              block: false,
            }).range(e.value.from, e.value.to),
          ],
        });
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const propertyMatcher = new MatchDecorator({
  regexp: /\b(temperature|pressure|speed|status)\b/g,
  decoration: (match) => {
    return Decoration.replace({
      widget: new PropertyBlockWidget(match[0]),
    });
  },
});

const propertyMatchPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = propertyMatcher.createDeco(view);
    }
    update(update: any) {
      this.decorations = propertyMatcher.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

const propertyBlockStyle = EditorView.baseTheme({
  '&.cm-focused .property-block': {
    background: '#e3f2fd',
    padding: '2px 4px',
    borderRadius: '3px',
    border: '1px solid #90caf9',
    color: '#1976d2',
    cursor: 'move',
    display: 'inline-block',
    margin: '0 2px',
  },
});
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
    PropertyDropdownComponent,
  ],
  templateUrl: './code-mirror-editor.component.html',
  styleUrls: ['./code-mirror-editor.component.scss'],
})
export class CodeMirrorEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('codeEditor', { static: true })
  codeEditor!: ElementRef<HTMLDivElement>;
  @ViewChild('contextMenu')
  contextMenu!: ElementRef<HTMLDivElement>;
  private subscriptions: Subscription[] = [];

  private editorInstance!: EditorView;
  private currentContextEvent: MouseEvent | null = null;

  variables: string[] = [];
  simulationValues: { [key: string]: number } = {};
  simulationResult: number | null = null;
  syntaxErrorMessage: string | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  availableProperties: Property[] = [];
  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      const state = EditorState.create({
        doc: '',
        extensions: [
          //Basic editor setup
          EditorView.lineWrapping,
          syntaxHighlighting(defaultHighlightStyle),
          bracketMatching(),

          //Auto-completion and bracket matching
          closeBrackets(),
          keymap.of([...defaultKeymap, ...closeBracketsKeymap, indentWithTab]),

          //Property block handling
          propertyBlockField,
          propertyMatchPlugin,

          //Drag and drop handling
          EditorView.domEventHandlers({
            dragover: (event: DragEvent) => {
              event.preventDefault();
              return false;
            },
            drop: (event: DragEvent, view: EditorView) => {
              event.preventDefault();
              const text = event.dataTransfer?.getData('text/plain');
              if (text) {
                const pos = view.posAtCoords({
                  x: event.clientX,
                  y: event.clientY,
                });
                if (pos !== null) {
                  const transaction = view.state.update({
                    changes: { from: pos, to: pos, insert: text },
                    effects: [
                      addPropertyBlock.of({ from: pos, to: pos + text.length }),
                    ],
                  });
                  view.dispatch(transaction);
                }
              }
              return false;
            },
          }),

          EditorView.theme({
            '.cm-property-block': {
              background: '#e3f2fd',
              padding: '2px 4px',
              borderRadius: '3px',
              border: '1px solid #90caf9',
              color: '#1976d2',
              cursor: 'move',
              display: 'inline-block',
              margin: '0 2px',
              userSelect: 'none',
            },
          }),
        ],
      });

      this.editorInstance = new EditorView({
        state,
        parent: this.codeEditor.nativeElement,
      });
    }
  }

  // ngAfterViewInit() {
  //   if (isPlatformBrowser(this.platformId)) {
  //     const state = EditorState.create({
  //       doc: '',
  //       extensions: [
  //         lineNumbers(),
  //         highlightActiveLineGutter(),
  //         highlightSpecialChars(),
  //         drawSelection(),
  //         dropCursor(),
  //         EditorView.lineWrapping,
  //         javascript(),
  //         keymap.of([...defaultKeymap, ...customKeymap]),
  //         bracketMatching(),
  //         linter((view) => this.syntaxValidator(view.state)),
  //         propertyBlockStyle,
  //         EditorView.domEventHandlers({
  //           dragstart: (event: DragEvent, view: EditorView) => {
  //             // Safely check if target is an HTMLElement and has the property-block class
  //             const target = event.target as HTMLElement;
  //             if (
  //               target &&
  //               target.classList &&
  //               target.classList.contains('property-block')
  //             ) {
  //               if (event.dataTransfer) {
  //                 event.dataTransfer.setData(
  //                   'text/plain',
  //                   target.textContent || ''
  //                 );
  //                 return true;
  //               }
  //             }
  //             return false;
  //           },
  //           drop: (event: DragEvent, view: EditorView) => {
  //             event.preventDefault();
  //             const text = event.dataTransfer?.getData('text/plain');
  //             if (text) {
  //               const pos = view.posAtCoords({
  //                 x: event.clientX,
  //                 y: event.clientY,
  //               });
  //               if (pos !== null) {
  //                 const transaction = view.state.update({
  //                   changes: { from: pos, to: pos, insert: text },
  //                 });
  //                 view.dispatch(transaction);
  //               }
  //             }
  //             return true;
  //           },
  //           dragover: (event: DragEvent) => {
  //             event.preventDefault();
  //             return false;
  //           },
  //         }),
  //         propertyBlockField,
  //         propertyBlockStyle,
  //       ],
  //     });

  //     this.editorInstance = new EditorView({
  //       state,
  //       parent: this.codeEditor.nativeElement,
  //     });

  //     this.editorInstance.dom.addEventListener(
  //       'contextmenu',
  //       this.onContextMenu.bind(this)
  //     );
  //   }
  // }

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

  onPropertySelected(property: Property) {
    const propertyBlock = `${property.name}`;
    this.insertTextAtCursor(propertyBlock);
    this.availableProperties.push(property);
    //Focus the editor after property selection
    this.editorInstance?.focus();
  }

  getEditorContent(): string {
    return this.editorInstance ? this.editorInstance.state.doc.toString() : '';
  }

  insertTextAtCursor(text: string) {
    if (this.editorInstance) {
      //Add a space after the text if it doesn't end with a space
      const textToInsert = text.endsWith(' ') ? text : text + ' ';

      const currentPos = this.editorInstance.state.selection.main.head;
      const transaction = this.editorInstance.state.update({
        changes: {
          from: currentPos,
          insert: textToInsert,
        },
        selection: EditorSelection.cursor(currentPos + textToInsert.length),
      });

      this.editorInstance.dispatch(transaction);
      this.editorInstance.focus();
    }
  }

  simulateExpression() {
    const expression = this.getEditorContent();

    const context: { [key: string]: number } = {};
    this.availableProperties.forEach((prop) => {
      context[prop.name] = prop.value;
    });

    try {
      this.simulationResult = Function(
        ...Object.keys(context),
        `return (${expression});`
      )(...Object.values(context));
      this.syntaxErrorMessage = null;
    } catch (error: any) {
      console.error('Error evaluating expression:', error);
      this.syntaxErrorMessage = `Evaluation Error: ${error.message}`;
      this.simulationResult = null;
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }
}
