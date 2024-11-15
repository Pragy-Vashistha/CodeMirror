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
import { historyKeymap, history } from '@codemirror/commands';
import {
  syntaxHighlighting,
  bracketMatching,
  defaultHighlightStyle,
} from '@codemirror/language';
import { Subscription } from 'rxjs';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';

class PropertyBlockWidget extends WidgetType {
  constructor(
    readonly property: string,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  override eq(other: PropertyBlockWidget) {
    return (
      other.property === this.property &&
      other.from === this.from &&
      other.to === this.to
    );
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
        // Set custom MIME type for internal drag
        e.dataTransfer.setData(
          'application/x-editor-property',
          JSON.stringify({
            property: this.property,
            from: this.from,
            to: this.to,
          })
        );
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    return wrap;
  }

  override ignoreEvent(event: Event) {
    return event.type !== 'dragstart' && event.type !== 'dragend';
  }
}

// Enhanced addPropertyBlock effect with property data
const addPropertyBlock = StateEffect.define<{
  from: number;
  to: number;
  property: string;
}>();

const propertyBlockField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    // Safely map the decorations through the changes
    let updated = value.map(tr.changes);

    for (let e of tr.effects) {
      if (e.is(addPropertyBlock)) {
        const { from, to, property } = e.value;
        // Verify positions are within valid range
        if (from <= tr.newDoc.length && to <= tr.newDoc.length) {
          updated = updated.update({
            add: [
              Decoration.replace({
                widget: new PropertyBlockWidget(property, from, to),
                block: false,
              }).range(from, to),
            ],
          });
        }
      }
    }
    return updated;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const propertyMatcher = new MatchDecorator({
  regexp: /\b(temperature|pressure|speed|status)\b/g,
  decoration: (match) => {
    return Decoration.replace({
      widget: new PropertyBlockWidget(
        match[0],
        match.index,
        match.index + match[0].length
      ),
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
  '.cm-property-block': {
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
  // Additional keybindings can be added here
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
          // Basic editor setup
          EditorView.lineWrapping,
          syntaxHighlighting(defaultHighlightStyle),
          bracketMatching(),
          highlightActiveLineGutter(),
          lineNumbers(),
          highlightSpecialChars(),
          drawSelection(),
          dropCursor(),

          // Undo/Redo history
          history(),
          keymap.of([
            ...defaultKeymap,
            ...closeBracketsKeymap,
            indentWithTab,
            ...historyKeymap,
            ...customKeymap,
          ]),

          // Auto-completion and bracket matching
          closeBrackets(),

          // Property block handling
          propertyBlockField,
          propertyMatchPlugin,

          // Linter for syntax validation
          linter(this.syntaxValidator),

          // Drag and drop handling
          EditorView.domEventHandlers({
            dragover: (event: DragEvent) => {
              event.preventDefault();
              // Set dropEffect based on whether it's a move or copy
              if (
                event.dataTransfer?.types.includes(
                  'application/x-editor-property'
                )
              ) {
                event.dataTransfer.dropEffect = 'move';
              } else if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'copy';
              }
              return false;
            },
            drop: (event: DragEvent, view: EditorView) => {
              event.preventDefault();
              const internalData = event.dataTransfer?.getData(
                'application/x-editor-property'
              );
              const externalText = event.dataTransfer?.getData('text/plain');
              const pos = view.posAtCoords({
                x: event.clientX,
                y: event.clientY,
              });

              if (pos === null) return false;

              // Check surrounding characters for spaces
              const doc = view.state.doc;
              const needSpaceBefore =
                pos > 0 && doc.sliceString(pos - 1, pos) !== ' ';
              const needSpaceAfter =
                pos < doc.length && doc.sliceString(pos, pos + 1) !== ' ';

              if (internalData) {
                try {
                  const { property, from, to } = JSON.parse(internalData);
                  if (pos >= from && pos <= to) return false;

                  const spaceBefore = needSpaceBefore ? ' ' : '';
                  const spaceAfter = needSpaceAfter ? ' ' : '';
                  const textToInsert = `${spaceBefore}${property}${spaceAfter}`;

                  const transaction = view.state.update({
                    changes: [
                      { from, to, insert: '' }, // Remove original
                      { from: pos, insert: textToInsert }, // Insert at new position with spaces
                    ],
                    effects: [
                      addPropertyBlock.of({
                        from: pos + spaceBefore.length,
                        to: pos + spaceBefore.length + property.length,
                        property,
                      }),
                    ],
                  });
                  view.dispatch(transaction);
                } catch (error) {
                  console.error('Error parsing internal drag data:', error);
                }
              } else if (externalText) {
                const spaceBefore = needSpaceBefore ? ' ' : '';
                const spaceAfter = needSpaceAfter ? ' ' : '';
                const textToInsert = `${spaceBefore}${externalText}${spaceAfter}`;

                const transaction = view.state.update({
                  changes: { from: pos, insert: textToInsert },
                  effects: [
                    addPropertyBlock.of({
                      from: pos + spaceBefore.length,
                      to: pos + spaceBefore.length + externalText.length,
                      property: externalText,
                    }),
                  ],
                });
                view.dispatch(transaction);
              }

              return false;
            },
          }),

          // Styling for property blocks
          propertyBlockStyle,

          // Additional theming can be added here
        ],
      });

      this.editorInstance = new EditorView({
        state,
        parent: this.codeEditor.nativeElement,
      });
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

  syntaxValidator = (view: EditorView): Diagnostic[] => {
    const diagnostics: Diagnostic[] = [];
    const code = view.state.doc.toString();

    try {
      new Function(code);
      this.syntaxErrorMessage = null;
    } catch (error: any) {
      const message = error.message;
      const posMatch = message.match(/<anonymous>:(\d+):(\d+)/);
      let from = code.length;
      let to = code.length;
      if (posMatch) {
        const line = parseInt(posMatch[1], 10);
        const column = parseInt(posMatch[2], 10);
        const lineInfo = view.state.doc.line(line);
        from = lineInfo.from + column - 1;
        to = from;
      }
      diagnostics.push({
        from,
        to,
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

    // Prevent duplicate entries
    if (!this.availableProperties.some((prop) => prop.name === property.name)) {
      this.availableProperties.push(property);
    }

    // Focus the editor after property selection
    this.editorInstance?.focus();
  }

  getEditorContent(): string {
    return this.editorInstance ? this.editorInstance.state.doc.toString() : '';
  }

  insertTextAtCursor(text: string) {
    if (this.editorInstance) {
      const currentPos = this.editorInstance.state.selection.main.head;

      // Check if the text is a function (ends with '()')
      const isFunction = text.endsWith('()');
      const textToInsert = text.endsWith(' ') ? text : text + ' ';

      const transaction = this.editorInstance.state.update({
        changes: {
          from: currentPos,
          insert: textToInsert,
        },
        // If it's a function, place cursor inside parentheses, otherwise at the end
        selection: EditorSelection.cursor(
          isFunction
            ? currentPos + textToInsert.length - 2 // Position before the closing parenthesis
            : currentPos + textToInsert.length
        ),
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

  clearEditor() {
    if (this.editorInstance) {
      const transaction = this.editorInstance.state.update({
        changes: {
          from: 0,
          to: this.editorInstance.state.doc.length,
          insert: '',
        },
      });
      this.editorInstance.dispatch(transaction);
      this.editorInstance.focus();

      this.simulationResult = null;
      this.syntaxErrorMessage = null;
      this.availableProperties = [];
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }
}
