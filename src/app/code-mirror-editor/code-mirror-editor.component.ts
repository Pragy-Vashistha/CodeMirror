import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

/**
 * Widget for rendering property blocks in the editor
 */
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

/**
 * Widget for rendering collapsible expression blocks
 */
class ExpressionBlockWidget extends WidgetType {
  private view: EditorView | null = null;
  private from: number;
  private to: number;

  constructor(
    readonly expression: string,
    readonly fromPos: number,
    readonly toPos: number
  ) {
    super();
    this.from = fromPos;
    this.to = toPos;
    this.expression = expression;
  }

  override eq(other: ExpressionBlockWidget) {
    return (
      other.expression === this.expression &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  toDOM(view: EditorView) {
    this.view = view;
    const wrap = document.createElement('span');
    wrap.className = 'cm-expression-block';
    wrap.textContent = this.expression;
    wrap.setAttribute('data-expression', this.expression);
    wrap.setAttribute('data-expression-block', 'true'); 
    wrap.setAttribute('draggable', 'true');
    
    // Add double-click handler for expansion
    wrap.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.expandBlock();
    });

    // Add drag handlers
    wrap.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.setData(
          'application/x-editor-expression',
          JSON.stringify({
            expression: this.expression,
            from: this.from,
            to: this.to,
            isExpression: true
          })
        );
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    return wrap;
  }

  override ignoreEvent(event: Event) {
    return event.type !== 'dblclick' && 
           event.type !== 'dragstart' && 
           event.type !== 'dragend';
  }

  /**
   * Expands the expression block by removing the decoration and inserting raw text
   */
  expandBlock() {
    if (this.view) {
      const transaction = this.view.state.update({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.expression // Insert raw expression without decoration
        },
        effects: [
          removeExpressionBlock.of({
            from: this.from,
            to: this.to,
          })
        ]
      });
      this.view.dispatch(transaction);
    }
  }

  // Add public getter
  public getView(): EditorView | null {
    return this.view;
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
  decoration: (match, view, pos) => {
    let found = false;
    view.state.field(expressionBlockField).between(
      pos, 
      pos, 
      () => { found = true; }
    );
    
    // Only create property block if not within expression block
    if (!found) {
      return Decoration.replace({
        widget: new PropertyBlockWidget(
          match[0],
          match.index,
          match.index + match[0].length
        ),
      });
    }
    return null;
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

// Add a new state effect for expression blocks
const addExpressionBlock = StateEffect.define<{
  from: number;
  to: number;
  expression: string;
}>();

// Create a state field for expression blocks
const expressionBlockField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    let updated = value.map(tr.changes);

    for (let e of tr.effects) {
      if (e.is(addExpressionBlock)) {
        const { from, to, expression } = e.value;
        if (from <= tr.newDoc.length && to <= tr.newDoc.length) {
          updated = updated.update({
            add: [
              Decoration.replace({
                widget: new ExpressionBlockWidget(expression, from, to),
                block: false,
              }).range(from, to),
            ],
          });
        }
      } else if (e.is(removeExpressionBlock)) {
        const { from, to } = e.value;
        updated = updated.update({
          filter: (fromDeco, toDeco, deco) => {
            return fromDeco < from || toDeco > to;
          },
        });
      }
    }
    return updated;
  },
  provide: (f) => EditorView.decorations.from(f),
});


// Add styling for expression blocks
const expressionBlockStyle = EditorView.baseTheme({
  '.cm-expression-block': {
    background: '#e8f5e9',
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid #81c784',
    color: '#2e7d32',
    cursor: 'pointer',
    display: 'inline-block',
    margin: '0 2px',
    fontWeight: 'bold',
  },
});

// Add proper typing for the customKeymap
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

const removeExpressionBlock = StateEffect.define<{ from: number; to: number }>();



@Component({
  selector: 'app-code-mirror-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ExpressionToolbarComponent,
    PropertyDropdownComponent,
  ],
  templateUrl: './code-mirror-editor.component.html',
  styleUrls: ['./code-mirror-editor.component.scss'],
})
export class CodeMirrorEditorComponent implements AfterViewInit, OnDestroy {
  // Add proper typing for class properties
  private editorInstance!: EditorView;
  private currentContextEvent: MouseEvent | null = null;
  private readonly subscriptions: Subscription[] = [];

  variables: string[] = [];
  simulationValues: Record<string, number> = {};
  simulationResult: number | null = null;
  syntaxErrorMessage: string | null = null;
  availableProperties: Property[] = [];

  @ViewChild('codeEditor', { static: true }) private readonly codeEditor!: ElementRef<HTMLDivElement>;
  @ViewChild('contextMenu') private readonly contextMenu!: ElementRef<HTMLDivElement>;

  constructor(@Inject(PLATFORM_ID) private readonly platformId: Object) {}

  /**
   * Creates a collapsible expression block from selected text
   */
  createExpressionBlock(): void {
    if (this.editorInstance) {
      const { state } = this.editorInstance;
      const selection = state.selection.main;
      
      if (!selection.empty) {
        const selectedText = state.sliceDoc(selection.from, selection.to);
        
        try {
          // Test if it's a valid expression
          new Function(`return (${selectedText});`);
          
          const transaction = state.update({
            changes: { from: selection.from, to: selection.to, insert: selectedText }, // Keep the text
            effects: [
              addExpressionBlock.of({
                from: selection.from,
                to: selection.from + selectedText.length, // Use the new position
                expression: selectedText,
              }),
            ],
          });
          
          this.editorInstance.dispatch(transaction);
        } catch (error) {
          this.syntaxErrorMessage = "Cannot create block: Invalid expression";
        }
      }
    }
    this.closeContextMenu();
  }

  /**
   * Initializes the CodeMirror editor with all necessary extensions
   */
  ngAfterViewInit(): void {
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

          // Expression block handling
          expressionBlockField,
          expressionBlockStyle,

          // Property block handling
          propertyBlockField,
          propertyMatchPlugin,

          // Linter for syntax validation
          linter(this.syntaxValidator),

          // Drag and drop handling
          EditorView.domEventHandlers({
            dragover: (event: DragEvent) => {
              event.preventDefault();
              if (event.dataTransfer) {
                const hasProperty = event.dataTransfer.types.includes('application/x-editor-property');
                const hasExpression = event.dataTransfer.types.includes('application/x-editor-expression');
                event.dataTransfer.dropEffect = (hasProperty || hasExpression) ? 'move' : 'copy';
              }
              return false;
            },
            drop: (event: DragEvent, view: EditorView) => {
              event.preventDefault();
              const propertyData = event.dataTransfer?.getData('application/x-editor-property');
              const expressionData = event.dataTransfer?.getData('application/x-editor-expression');
              const externalText = event.dataTransfer?.getData('text/plain');
              
              const pos = view.posAtCoords({
                x: event.clientX,
                y: event.clientY,
              });
            
              if (pos === null) return false;
            
              const doc = view.state.doc;
              const needSpaceBefore = pos > 0 && doc.sliceString(pos - 1, pos) !== ' ';
              const needSpaceAfter = pos < doc.length && doc.sliceString(pos, pos + 1) !== ' ';
            
              if (expressionData) {
                try {
                  const { expression, from, to } = JSON.parse(expressionData);
                  if (pos >= from && pos <= to) return false;
            
                  const spaceBefore = needSpaceBefore ? ' ' : '';
                  const spaceAfter = needSpaceAfter ? ' ' : '';
            
                  // Insert the expression with spaces if needed
                  const insertFrom = pos + spaceBefore.length;
                  const insertTo = insertFrom + expression.length;
            
                  const transaction = view.state.update({
                    changes: [
                      { from, to, insert: '' }, // Remove original
                      { from: pos, insert: spaceBefore + expression + spaceAfter }
                    ],
                    effects: [
                      addExpressionBlock.of({
                        from: insertFrom,
                        to: insertTo,
                        expression
                      })
                    ]
                  });
                  view.dispatch(transaction);
                } catch (error) {
                  console.error('Error parsing expression drag data:', error);
                }
              } else if (propertyData) {
                try {
                  const { property, from, to } = JSON.parse(propertyData);
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
                  console.error('Error parsing property drag data:', error);
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

  /**
   * Validates syntax and returns diagnostics for the linter
   */
  private syntaxValidator = (view: EditorView): Diagnostic[] => {
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

  /**
   * Handles property selection from dropdown
   */
  onPropertySelected(property: Property): void {
    const propertyBlock = `${property.name}`;
    this.insertTextAtCursor(propertyBlock);

    // Prevent duplicate entries
    if (!this.availableProperties.some((prop) => prop.name === property.name)) {
      this.availableProperties.push(property);
    }

    // Focus the editor after property selection
    this.editorInstance?.focus();
  }

  /**
   * Returns current editor content
   */
  getEditorContent(): string {
    return this.editorInstance ? this.editorInstance.state.doc.toString() : '';
  }

  /**
   * Inserts text at current cursor position
   */
  insertTextAtCursor(text: string): void {
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

  /**
   * Cleans up subscriptions on component destruction
   */
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.editorInstance?.destroy();
  }

  /**
   * Simulates the expression in the editor
   */
  simulateExpression() {
    let expression = this.getEditorContent();
    
    // Replace all expression blocks with their actual expressions
    const blockRegex = /\[(.*?)\]/g;
    expression = expression.replace(blockRegex, (_, expr) => expr);

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

  expandExpressionBlock(): void {
    if (this.editorInstance && this.currentContextEvent) {
      const pos = this.editorInstance.posAtCoords({
        x: this.currentContextEvent.clientX,
        y: this.currentContextEvent.clientY,
      });
  
      if (pos !== null) {
        // Find expression block at position
        this.editorInstance.state.field(expressionBlockField).between(pos, pos, (from, to, value) => {
          const widget = value.spec.widget as ExpressionBlockWidget;
          if (widget && widget.expandBlock) {
            widget.expandBlock();
          }
        });
      }
    }
    this.closeContextMenu();
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

  
}
