import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ExpressionBlock, ExpressionState } from '../models/expression-block.model';
import { PropertyBlock } from '../models/property-block.model';
import { EditorService } from './editor.service';

@Injectable({
  providedIn: 'root'
})
export class ExpressionBlockService {
  private isBrowser: boolean;
  private expressionBlocksSubject = new BehaviorSubject<ExpressionBlock[]>([]);
  private selectedBlockElement: HTMLElement | null = null;
  
  public expressionBlocks$ = this.expressionBlocksSubject.asObservable();
  
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private editorService: EditorService
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }
  
  /**
   * Creates a new expression block
   */
  createExpressionBlock(initialContent: string = ''): ExpressionBlock {
    return {
      id: uuidv4(),
      content: initialContent,
      properties: [],
      isValid: false,
      isFunction: this.isFunction(initialContent),
      functionName: this.extractFunctionName(initialContent)
    };
  }
  
  /**
   * Inserts an expression block at the current cursor position
   */
  insertExpressionBlock(content: string = ''): void {
    if (!this.isBrowser) return;
    
    const editorElement = this.editorService.getEditorElement();
    if (!editorElement) return;
    
    // Create the expression block
    const expressionBlock = this.createExpressionBlock(content);
    
    // Create and insert the element
    const element = this.createExpressionBlockElement(expressionBlock);
    
    // Get insertion range
    const range = this.editorService.getInsertionRange();
    if (!range) return;
    
    // Insert the block
    range.deleteContents();
    range.insertNode(element);
    
    // Add a space after
    const spaceNode = document.createTextNode(' ');
    range.setStartAfter(element);
    range.insertNode(spaceNode);
    
    // Move cursor after the space
    range.setStartAfter(spaceNode);
    range.collapse(true);
    
    // Update selection
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    
    // Focus editor
    this.editorService.focusEditor();
    
    // Update blocks array
    const currentBlocks = this.expressionBlocksSubject.getValue();
    this.expressionBlocksSubject.next([...currentBlocks, expressionBlock]);
  }
  
  /**
   * Creates the DOM element for an expression block
   */
  private createExpressionBlockElement(block: ExpressionBlock): HTMLElement {
    const element = document.createElement('span');
    element.className = 'expression-block';
    element.setAttribute('data-expression-id', block.id);
    element.contentEditable = 'false';
    
    // Create function name part if it's a function
    if (block.isFunction && block.functionName) {
      const funcName = document.createElement('span');
      funcName.className = 'function-name';
      funcName.textContent = block.functionName;
      element.appendChild(funcName);
      
      const openParen = document.createElement('span');
      openParen.className = 'parenthesis';
      openParen.textContent = '(';
      element.appendChild(openParen);
    }
    
    // Create content container
    const contentContainer = document.createElement('span');
    contentContainer.className = 'expression-content';
    contentContainer.contentEditable = 'false';
    element.appendChild(contentContainer);
    
    // Add closing parenthesis for functions
    if (block.isFunction) {
      const closeParen = document.createElement('span');
      closeParen.className = 'parenthesis';
      closeParen.textContent = ')';
      element.appendChild(closeParen);
    }
    
    // Apply styles
    this.applyExpressionBlockStyles(element, this.getExpressionState(block));
    
    // Add click handler for selection
    element.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.selectExpressionBlock(element);
    });
    
    return element;
  }
  
  /**
   * Applies styles to an expression block based on its state
   */
  private applyExpressionBlockStyles(element: HTMLElement, state: ExpressionState): void {
    const baseStyles = {
      'display': 'inline-flex',
      'align-items': 'center',
      'padding': '4px 8px',
      'margin': '0 4px',
      'border-radius': '4px',
      'font-family': 'monospace',
      'font-size': '14px',
      'cursor': 'pointer',
      'user-select': 'none',
      'white-space': 'nowrap'
    };
    
    // Apply state-specific styles
    if (state.isEmpty) {
      Object.assign(baseStyles, {
        'background-color': '#f5f5f5',
        'border': '1px dashed #ccc',
        'color': '#999'
      });
    } else if (state.isValid) {
      Object.assign(baseStyles, {
        'background-color': '#e8f5e9',
        'border': '1px solid #81c784',
        'color': '#2e7d32'
      });
    } else {
      Object.assign(baseStyles, {
        'background-color': '#fff3e0',
        'border': '1px solid #ffb74d',
        'color': '#ef6c00'
      });
    }
    
    // Apply styles
    Object.entries(baseStyles).forEach(([property, value]) => {
      element.style[property as any] = value;
    });
  }
  
  /**
   * Gets the current state of an expression block
   */
  private getExpressionState(block: ExpressionBlock): ExpressionState {
    return {
      isEmpty: block.properties.length === 0,
      isValid: block.properties.length > 0,
      propertyCount: block.properties.length,
      hasFunction: block.isFunction
    };
  }
  
  /**
   * Deselects all expression blocks
   */
  public deselectAllBlocks(): void {
    if (!this.isBrowser) return;
    
    document.querySelectorAll('.expression-block').forEach(block => {
      (block as HTMLElement).classList.remove('selected');
      this.applyExpressionBlockStyles(block as HTMLElement, 
        this.getExpressionState(this.findBlockById(block.getAttribute('data-expression-id'))));
    });
    
    this.selectedBlockElement = null;
  }
  
  /**
   * Selects an expression block
   */
  private selectExpressionBlock(element: HTMLElement): void {
    // First deselect all blocks
    this.deselectAllBlocks();
    
    // Add selected class
    element.classList.add('selected');
    
    // Update styles for selected state
    element.style.backgroundColor = '#bbdefb';
    element.style.borderColor = '#2196f3';
    
    // Store the selected block
    this.selectedBlockElement = element;
  }
  
  /**
   * Finds a block by its ID
   */
  private findBlockById(id: string | null): ExpressionBlock {
    if (!id) return this.createExpressionBlock();
    return this.expressionBlocksSubject.getValue().find(b => b.id === id) || this.createExpressionBlock();
  }
  
  /**
   * Gets the currently selected expression block
   */
  public getSelectedBlock(): HTMLElement | null {
    return this.selectedBlockElement;
  }
  
  /**
   * Rebuilds the content of an expression block
   */
  private rebuildExpressionContent(contentContainer: HTMLElement, block: ExpressionBlock): void {
    // Clear existing content
    contentContainer.innerHTML = '';
    
    // Rebuild with remaining properties
    block.properties.forEach((prop, index) => {
      if (index > 0) {
        const delimiter = document.createElement('span');
        delimiter.className = 'delimiter';
        delimiter.textContent = ', ';
        contentContainer.appendChild(delimiter);
      }
      
      const propertyElement = document.createElement('span');
      propertyElement.className = 'property-reference';
      propertyElement.textContent = prop.name;
      propertyElement.setAttribute('data-property-id', prop.id);
      
      // Add delete button
      const deleteButton = document.createElement('span');
      deleteButton.className = 'property-delete';
      deleteButton.innerHTML = '×';
      deleteButton.title = 'Remove property';
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removePropertyFromExpression(
          contentContainer.parentElement as HTMLElement,
          prop.id
        );
      });
      
      propertyElement.appendChild(deleteButton);
      contentContainer.appendChild(propertyElement);
    });
  }

  /**
   * Removes a property from an expression block
   */
  removePropertyFromExpression(expressionElement: HTMLElement, propertyId: string): void {
    const expressionId = expressionElement.getAttribute('data-expression-id');
    if (!expressionId) return;
    
    const currentBlocks = this.expressionBlocksSubject.getValue();
    const block = currentBlocks.find(b => b.id === expressionId);
    if (!block) return;
    
    // Remove the property
    block.properties = block.properties.filter(p => p.id !== propertyId);
    
    // Update the content container
    const contentContainer = expressionElement.querySelector('.expression-content');
    if (contentContainer) {
      this.rebuildExpressionContent(contentContainer as HTMLElement, block);
    }
    
    // Update block state
    this.updateExpressionBlockState(expressionElement, block);
    
    // Reselect the block
    this.selectExpressionBlock(expressionElement);
  }

  /**
   * Adds a property block to an expression block
   */
  addPropertyToExpression(expressionElement: HTMLElement, property: PropertyBlock): void {
    const expressionId = expressionElement.getAttribute('data-expression-id');
    if (!expressionId) return;
    
    const currentBlocks = this.expressionBlocksSubject.getValue();
    const block = currentBlocks.find(b => b.id === expressionId);
    if (!block) return;
    
    // Add property to the block
    block.properties = [...block.properties, property];
    
    // Update the content container
    const contentContainer = expressionElement.querySelector('.expression-content');
    if (contentContainer) {
      this.rebuildExpressionContent(contentContainer as HTMLElement, block);
    }
    
    // Update block state
    this.updateExpressionBlockState(expressionElement, block);
    
    // Reselect the block
    this.selectExpressionBlock(expressionElement);
  }
  
  /**
   * Updates the state and styling of an expression block
   */
  private updateExpressionBlockState(element: HTMLElement, block: ExpressionBlock): void {
    const state = this.getExpressionState(block);
    this.applyExpressionBlockStyles(element, state);
    
    // Update blocks array
    const currentBlocks = this.expressionBlocksSubject.getValue();
    const updatedBlocks = currentBlocks.map(b => 
      b.id === block.id ? { ...block, isValid: state.isValid } : b
    );
    this.expressionBlocksSubject.next(updatedBlocks);
  }
  
  /**
   * Checks if content represents a function
   */
  private isFunction(content: string): boolean {
    return /^[A-Za-z]+\s*\(\s*\)$/.test(content.trim());
  }
  
  /**
   * Extracts function name from content
   */
  private extractFunctionName(content: string): string | undefined {
    const match = content.match(/^([A-Za-z]+)\s*\(/);
    return match ? match[1] : undefined;
  }
} 