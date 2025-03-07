import { PropertyBlock } from './property-block.model';

export interface ExpressionBlock {
  id: string;
  content: string;
  properties: PropertyBlock[];
  isValid: boolean;
  isFunction: boolean;
  functionName?: string;
}

export interface ExpressionState {
  isEmpty: boolean;
  isValid: boolean;
  propertyCount: number;
  hasFunction: boolean;
} 