export interface PropertyBlock {
  id: string;
  name: string;
  type: string;
  value: any;
  position?: number; // Position in the editor
}

export interface EditorContent {
  text: string;
  propertyBlocks: PropertyBlock[];
} 