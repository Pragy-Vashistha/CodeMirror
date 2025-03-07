import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';

export interface EditorState {
  characterCount: number;
  wordCount: number;
  lastUpdated: Date;
  selectedText: string;
  cursorPosition: { line: number; column: number };
}

@Injectable({
  providedIn: 'root'
})
export class EditorService {
  private editorElement: HTMLElement | null = null;
  private editorContainerElement: HTMLElement | null = null;
  private isBrowser: boolean;
  private lastKnownRange: Range | null = null;
  
  private editorStateSubject = new BehaviorSubject<EditorState>({
    characterCount: 0,
    wordCount: 0,
    lastUpdated: new Date(),
    selectedText: '',
    cursorPosition: { line: 1, column: 1 }
  });
  
  public editorState$: Observable<EditorState> = this.editorStateSubject.asObservable();
  
  constructor(
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }
  
  /**
   * Creates a custom editor and attaches it to the specified container
   */
  createEditor(container: HTMLElement): void {
    if (!this.isBrowser) return;
    
    // Create a custom editor container
    this.editorContainerElement = document.createElement('div');
    this.editorContainerElement.id = 'custom-editor-container';
    this.editorContainerElement.className = 'custom-editor-container';
    this.editorContainerElement.style.height = '600px';
    
    // Create the editor element
    this.editorElement = document.createElement('div');
    this.editorElement.id = 'custom-editor';
    this.editorElement.className = 'custom-editor';
    this.editorElement.contentEditable = 'true';
    this.editorElement.setAttribute('placeholder', 'Start typing or add properties...');
    this.editorElement.style.height = '100%';
    this.editorElement.style.minHeight = '550px';
    
    // Add the editor to the container
    this.editorContainerElement.appendChild(this.editorElement);
    
    // Clear the container and add our custom editor
    container.innerHTML = '';
    container.style.height = '600px';
    container.appendChild(this.editorContainerElement);
    
    return;
  }
  
  /**
   * Gets the editor element
   */
  getEditorElement(): HTMLElement | null {
    return this.editorElement;
  }
  
  /**
   * Updates the editor state based on the current content
   */
  updateEditorState(): void {
    if (!this.isBrowser || !this.editorElement) return;
    
    // Get the editor content
    const content = this.editorElement.innerText || '';
    
    // Update the editor state
    const newState: EditorState = {
      characterCount: content.length,
      wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
      lastUpdated: new Date(),
      selectedText: window.getSelection()?.toString() || '',
      cursorPosition: { line: 1, column: 1 } // Simplified for now
    };
    
    this.editorStateSubject.next(newState);
  }
  
  /**
   * Clears the editor content
   */
  clearEditor(): void {
    if (!this.isBrowser || !this.editorElement) return;
    
    this.editorElement.innerHTML = '';
    this.updateEditorState();
  }
  
  /**
   * Gets the current text content of the editor
   */
  getContent(): string {
    if (!this.isBrowser || !this.editorElement) return '';
    
    return this.editorElement.innerText || '';
  }
  
  /**
   * Destroys the editor
   */
  destroyEditor(): void {
    this.editorElement = null;
    this.editorContainerElement = null;
  }
  
  /**
   * Stores the current selection range
   */
  saveCurrentRange(): void {
    if (!this.isBrowser) return;
    
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      this.lastKnownRange = selection.getRangeAt(0).cloneRange();
    }
  }

  /**
   * Gets the last known range or creates one at the end of the editor
   */
  getInsertionRange(): Range | null {
    if (!this.isBrowser || !this.editorElement) return null;

    // If we have a current selection in the editor, use that
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (this.editorElement.contains(range.commonAncestorContainer)) {
        return range;
      }
    }

    // If we have a last known range, use that
    if (this.lastKnownRange && this.editorElement.contains(this.lastKnownRange.commonAncestorContainer)) {
      return this.lastKnownRange.cloneRange();
    }

    // Otherwise, create a range at the end of the editor
    const range = document.createRange();
    range.selectNodeContents(this.editorElement);
    range.collapse(false);
    return range;
  }

  /**
   * Focuses the editor and restores the last known range
   */
  focusEditor(): void {
    if (!this.isBrowser || !this.editorElement) return;

    this.editorElement.focus();
    
    if (this.lastKnownRange) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(this.lastKnownRange.cloneRange());
      }
    }
  }

  /**
   * Inserts text at the current cursor position
   */
  insertText(text: string): void {
    if (!this.isBrowser || !this.editorElement) return;

    // Get the insertion range
    const range = this.getInsertionRange();
    if (!range) return;

    // Insert the text
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move cursor after the inserted text
    range.setStartAfter(textNode);
    range.collapse(true);

    // Update selection
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Focus the editor
    this.focusEditor();

    // Update editor state
    this.updateEditorState();
  }
} 