import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { EditorService } from './editor.service';
import { PropertyBlockService } from './property-block.service';
import { ExpressionBlockService } from './expression-block.service';

@Injectable({
  providedIn: 'root'
})
export class EventHandlerService {
  private isBrowser: boolean;
  
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private editorService: EditorService,
    private propertyBlockService: PropertyBlockService,
    private expressionBlockService: ExpressionBlockService
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }
  
  /**
   * Sets up all event listeners for the editor
   */
  setupEventListeners(editorElement: HTMLElement): void {
    if (!this.isBrowser) return;
    
    // Add event listeners for handling property blocks
    editorElement.addEventListener('keydown', this.handleKeyDown.bind(this));
    editorElement.addEventListener('click', this.handleClick.bind(this));
    editorElement.addEventListener('input', this.handleInput.bind(this));
    editorElement.addEventListener('mouseup', this.handleMouseUp.bind(this));
    editorElement.addEventListener('keyup', this.handleKeyUp.bind(this));
    editorElement.addEventListener('mouseover', this.handleMouseOver.bind(this));
    editorElement.addEventListener('mouseout', this.handleMouseOut.bind(this));
    editorElement.addEventListener('blur', this.handleBlur.bind(this));
  }
  
  /**
   * Handles keydown events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isBrowser) return;
    
    // Handle backspace and delete keys
    if (event.key === 'Backspace' || event.key === 'Delete') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        
        // Check if a property block is selected
        const selectedNode = selection.anchorNode;
        if (selectedNode) {
          const propertyBlock = this.propertyBlockService.findPropertyBlockElement(selectedNode);
          if (propertyBlock) {
            // Remove the property block
            this.propertyBlockService.removePropertyBlock(propertyBlock);
            event.preventDefault();
          }
        }
      }
    }
  }
  
  /**
   * Handles click events
   */
  private handleClick(event: MouseEvent): void {
    if (!this.isBrowser) return;
    
    const target = event.target as HTMLElement;
    
    // Handle property block clicks
    const propertyBlock = this.propertyBlockService.findPropertyBlockElement(target);
    if (propertyBlock) {
      this.propertyBlockService.selectPropertyBlock(propertyBlock);
      event.preventDefault();
      this.editorService.updateEditorState();
      return;
    }
    
    // Handle expression block clicks
    const expressionBlock = target.closest('.expression-block');
    if (expressionBlock) {
      this.expressionBlockService.deselectAllBlocks();
      this.propertyBlockService.deselectAllBlocks();
      return;
    }
    
    // Handle clicks directly on the editor (not on any blocks)
    if (target.classList.contains('custom-editor') || target.classList.contains('editor-wrapper')) {
      this.expressionBlockService.deselectAllBlocks();
      this.propertyBlockService.deselectAllBlocks();
    }
  }
  
  /**
   * Handles input events
   */
  private handleInput(event: Event): void {
    if (!this.isBrowser) return;
    
    // Update the editor state when content changes
    this.editorService.updateEditorState();
  }
  
  /**
   * Handles mouseup events
   */
  private handleMouseUp(event: MouseEvent): void {
    if (!this.isBrowser) return;
    
    // Save the cursor position
    this.editorService.saveCurrentRange();
    
    // Update the editor state when selection changes
    this.editorService.updateEditorState();
  }
  
  /**
   * Handles keyup events
   */
  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.isBrowser) return;
    
    // Save the cursor position
    this.editorService.saveCurrentRange();
    
    // Update the editor state when cursor position changes
    this.editorService.updateEditorState();
  }
  
  /**
   * Handles mouseover events
   */
  private handleMouseOver(event: MouseEvent): void {
    if (!this.isBrowser) return;
    
    const target = event.target as HTMLElement;
    const propertyBlock = this.propertyBlockService.findPropertyBlockElement(target);
    
    if (propertyBlock) {
      this.propertyBlockService.hoverPropertyBlock(propertyBlock, true);
    }
  }
  
  /**
   * Handles mouseout events
   */
  private handleMouseOut(event: MouseEvent): void {
    if (!this.isBrowser) return;
    
    const target = event.target as HTMLElement;
    const propertyBlock = this.propertyBlockService.findPropertyBlockElement(target);
    
    if (propertyBlock) {
      this.propertyBlockService.hoverPropertyBlock(propertyBlock, false);
    }
  }
  
  /**
   * Handles blur events to save the last known cursor position
   */
  private handleBlur(event: FocusEvent): void {
    if (!this.isBrowser) return;
    this.editorService.saveCurrentRange();
  }
  
  /**
   * Removes all event listeners
   */
  removeEventListeners(editorElement: HTMLElement): void {
    if (!this.isBrowser) return;
    
    editorElement.removeEventListener('keydown', this.handleKeyDown.bind(this));
    editorElement.removeEventListener('click', this.handleClick.bind(this));
    editorElement.removeEventListener('input', this.handleInput.bind(this));
    editorElement.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    editorElement.removeEventListener('keyup', this.handleKeyUp.bind(this));
    editorElement.removeEventListener('mouseover', this.handleMouseOver.bind(this));
    editorElement.removeEventListener('mouseout', this.handleMouseOut.bind(this));
    editorElement.removeEventListener('blur', this.handleBlur.bind(this));
  }
} 