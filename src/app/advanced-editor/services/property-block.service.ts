import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { PropertyBlock } from '../models/property-block.model';
import { Property } from '../../property-dropdown/property-dropdown.component';
import { EditorService } from './editor.service';

@Injectable({
  providedIn: 'root'
})
export class PropertyBlockService {
  private isBrowser: boolean;
  private propertyBlocksSubject = new BehaviorSubject<PropertyBlock[]>([]);
  private selectedBlockElement: HTMLElement | null = null;
  
  public propertyBlocks$: Observable<PropertyBlock[]> = this.propertyBlocksSubject.asObservable();
  
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private editorService: EditorService
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }
  
  /**
   * Inserts a property block at the current cursor position
   */
  insertPropertyBlock(property: Property): void {
    if (!this.isBrowser) return;
    
    const editorElement = this.editorService.getEditorElement();
    if (!editorElement) return;
    
    // Create a property block object
    const propertyBlock: PropertyBlock = {
      id: uuidv4(),
      name: property.name,
      type: property.type,
      value: property.value
    };
    
    // Get the insertion range
    const range = this.editorService.getInsertionRange();
    if (!range) return;
    
    // Create the property block element
    const propertyBlockElement = this.createPropertyBlockElement(propertyBlock);
    
    // Insert the property block
    range.deleteContents();
    range.insertNode(propertyBlockElement);
    
    // Add a space after the property block
    const spaceNode = document.createTextNode(' ');
    range.setStartAfter(propertyBlockElement);
    range.insertNode(spaceNode);
    
    // Move the cursor after the space
    range.setStartAfter(spaceNode);
    range.collapse(true);
    
    // Update selection and focus
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    
    // Focus the editor
    this.editorService.focusEditor();
    
    // Update our property blocks array
    const currentBlocks = this.propertyBlocksSubject.getValue();
    this.propertyBlocksSubject.next([...currentBlocks, propertyBlock]);
    
    // Update the editor state
    this.editorService.updateEditorState();
  }
  
  /**
   * Creates a property block element with appropriate styling
   */
  private createPropertyBlockElement(propertyBlock: PropertyBlock): HTMLElement {
    const element = document.createElement('span');
    element.className = 'property-block';
    element.setAttribute('data-property-id', propertyBlock.id);
    element.setAttribute('data-property-type', propertyBlock.type);
    element.setAttribute('data-property-value', propertyBlock.value.toString());
    element.textContent = propertyBlock.name;
    element.contentEditable = 'false';
    
    // Apply styles
    this.applyPropertyBlockStyles(element);
    
    return element;
  }
  
  /**
   * Applies styles to a property block element
   */
  private applyPropertyBlockStyles(element: HTMLElement): void {
    // Simplified styles for property blocks
    const baseStyles = {
      'display': 'inline-block',
      'padding': '4px 10px',
      'margin': '0 4px',
      'border-radius': '6px',
      'background-color': '#e3f2fd',
      'border': '1px solid #90caf9',
      'color': '#0d47a1',
      'font-size': '14px',
      'cursor': 'pointer',
      'user-select': 'none',
      'white-space': 'nowrap'
    };
    
    // Apply base styles
    Object.entries(baseStyles).forEach(([property, value]) => {
      element.style[property as any] = value;
    });
  }
  
  /**
   * Deselects all property blocks
   */
  public deselectAllBlocks(): void {
    if (!this.isBrowser) return;
    
    document.querySelectorAll('.property-block').forEach(block => {
      (block as HTMLElement).classList.remove('selected');
      this.applyPropertyBlockStyles(block as HTMLElement);
    });
    
    this.selectedBlockElement = null;
  }
  
  /**
   * Handles selection of a property block
   */
  selectPropertyBlock(propertyBlock: HTMLElement): void {
    if (!this.isBrowser) return;
    
    // First deselect all blocks
    this.deselectAllBlocks();
    
    // Add selected class and styling
    propertyBlock.classList.add('selected');
    propertyBlock.style.backgroundColor = '#bbdefb';
    propertyBlock.style.borderColor = '#2196f3';
    
    // Store the selected block
    this.selectedBlockElement = propertyBlock;
    
    // Select the entire property block
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNode(propertyBlock);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  
  /**
   * Gets the currently selected property block
   */
  public getSelectedBlock(): HTMLElement | null {
    return this.selectedBlockElement;
  }
  
  /**
   * Handles hover effect on a property block
   */
  hoverPropertyBlock(propertyBlock: HTMLElement, isHovering: boolean): void {
    if (!this.isBrowser) return;
    
    if (isHovering && !propertyBlock.classList.contains('selected')) {
      propertyBlock.style.backgroundColor = '#bbdefb';
    } else if (!propertyBlock.classList.contains('selected')) {
      propertyBlock.style.backgroundColor = '#e3f2fd';
    }
  }
  
  /**
   * Removes a property block
   */
  removePropertyBlock(propertyBlock: HTMLElement): void {
    if (!this.isBrowser) return;
    
    // Get the property ID
    const propertyId = propertyBlock.getAttribute('data-property-id');
    
    // Remove the element
    propertyBlock.remove();
    
    // Update our property blocks array
    if (propertyId) {
      const currentBlocks = this.propertyBlocksSubject.getValue();
      const updatedBlocks = currentBlocks.filter(block => block.id !== propertyId);
      this.propertyBlocksSubject.next(updatedBlocks);
    }
    
    // Update the editor state
    this.editorService.updateEditorState();
  }
  
  /**
   * Finds a property block element from a node
   */
  findPropertyBlockElement(node: Node): HTMLElement | null {
    if (!this.isBrowser) return null;
    
    let current: Node | null = node;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      if ((current as HTMLElement).classList && 
          (current as HTMLElement).classList.contains('property-block')) {
        return current as HTMLElement;
      }
      current = current.parentNode;
    }
    
    return null;
  }
  
  /**
   * Clears all property blocks
   */
  clearPropertyBlocks(): void {
    this.propertyBlocksSubject.next([]);
  }

  /**
   * Creates a property block from a property
   */
  createPropertyBlock(property: Property): PropertyBlock {
    return {
      id: crypto.randomUUID(),
      name: property.name,
      type: property.type,
      value: property.value
    };
  }
} 