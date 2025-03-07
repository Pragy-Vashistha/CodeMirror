import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Editor, NgxEditorModule } from 'ngx-editor';
import { PropertyDropdownComponent, Property } from '../property-dropdown/property-dropdown.component';
import { ExpressionToolbarComponent } from '../expression-toolbar/expression-toolbar.component';
import { EditorService, EditorState } from './services/editor.service';
import { PropertyBlockService } from './services/property-block.service';
import { EventHandlerService } from './services/event-handler.service';
import { ExpressionBlockService } from './services/expression-block.service';
import { EditorContent, PropertyBlock } from './models/property-block.model';
import { ExpressionBlock } from './models/expression-block.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-advanced-editor',
  standalone: true,
  imports: [
    CommonModule, 
    NgxEditorModule, 
    ReactiveFormsModule, 
    PropertyDropdownComponent,
    ExpressionToolbarComponent
  ],
  templateUrl: './advanced-editor.component.html',
  styleUrl: './advanced-editor.component.scss'
})
export class AdvancedEditorComponent implements OnInit, OnDestroy {
  editor: Editor | null = null;
  editorContent: EditorContent = {
    text: '',
    propertyBlocks: []
  };
  
  editorState: EditorState = {
    characterCount: 0,
    wordCount: 0,
    lastUpdated: new Date(),
    selectedText: '',
    cursorPosition: { line: 1, column: 1 }
  };
  
  @ViewChild('editorWrapper') editorWrapper!: ElementRef;
  
  form = new FormGroup({
    editorContent: new FormControl('')
  });
  
  isBrowser: boolean;
  private subscriptions: Subscription[] = [];
  
  expressionBlocks: ExpressionBlock[] = [];
  
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private editorService: EditorService,
    private propertyBlockService: PropertyBlockService,
    private expressionBlockService: ExpressionBlockService,
    private eventHandlerService: EventHandlerService
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }
  
  ngOnInit(): void {
    // Initialize the editor in browser environment
    if (this.isBrowser) {
      this.editor = new Editor({
        content: '',
        history: true,
        keyboardShortcuts: true
      });
      
      // Subscribe to editor state changes
      this.subscriptions.push(
        this.editorService.editorState$.subscribe(state => {
          this.editorState = state;
        })
      );
      
      // Subscribe to property blocks changes
      this.subscriptions.push(
        this.propertyBlockService.propertyBlocks$.subscribe(blocks => {
          this.editorContent.propertyBlocks = blocks;
        })
      );
      
      // Subscribe to expression blocks changes
      this.subscriptions.push(
        this.expressionBlockService.expressionBlocks$.subscribe(blocks => {
          this.expressionBlocks = blocks;
        })
      );
      
      // Initialize the editor after view init
      setTimeout(() => {
        this.initializeEditor();
      }, 0);
    }
  }
  
  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    // Destroy the editor if it exists
    if (this.isBrowser && this.editor) {
      this.editor.destroy();
    }
  }
  
  /**
   * Initializes the custom editor
   */
  private initializeEditor(): void {
    if (!this.isBrowser || !this.editorWrapper) return;
    
    const editorWrapperElement = this.editorWrapper.nativeElement;
    
    // Create the editor
    this.editorService.createEditor(editorWrapperElement);
    
    // Set up event listeners
    const editorElement = this.editorService.getEditorElement();
    if (editorElement) {
      this.eventHandlerService.setupEventListeners(editorElement);
    }
  }
  
  /**
   * Handles text insertion from the expression toolbar
   */
  onInsertText(text: string): void {
    if (this.isBrowser) {
      // Check if the text is a function (ends with parentheses)
      if (text.endsWith('()')) {
        this.expressionBlockService.insertExpressionBlock(text);
      } else {
        this.editorService.insertText(text);
      }
    }
  }
  
  /**
   * Handles property selection from the dropdown
   */
  onPropertySelected(property: any): void {
    const propertyBlock = this.propertyBlockService.createPropertyBlock(property);
    
    // Check if we have a selected expression block
    const selectedExpressionBlock = this.expressionBlockService.getSelectedBlock();
    
    if (selectedExpressionBlock) {
      // Add property to expression block
      this.expressionBlockService.addPropertyToExpression(selectedExpressionBlock, propertyBlock);
    } else {
      // Insert as normal property block
      this.propertyBlockService.insertPropertyBlock(propertyBlock);
    }
    
    // Focus back on editor
    this.editorService.focusEditor();
  }
  
  /**
   * Finds the parent expression block element if it exists
   */
  private findParentExpressionBlock(node: Node): HTMLElement | null {
    let current: Node | null = node;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      if ((current as HTMLElement).classList.contains('expression-block')) {
        return current as HTMLElement;
      }
      current = current.parentNode;
    }
    return null;
  }
  
  /**
   * Handles property drag events
   */
  onPropertyDragged(property: Property): void {
    if (this.isBrowser) {
      console.log('Property dragged:', property);
    }
  }
  
  /**
   * Clears the editor content
   */
  clearEditor(): void {
    if (this.isBrowser) {
      this.editorService.clearEditor();
      this.propertyBlockService.clearPropertyBlocks();
    }
  }
}
