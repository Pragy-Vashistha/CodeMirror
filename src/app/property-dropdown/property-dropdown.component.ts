import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Property {
  name: string;
  type: string;
  value: number;
}

@Component({
  selector: 'app-property-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './property-dropdown.component.html',
  styleUrls: ['./property-dropdown.component.scss'],
})
export class PropertyDropdownComponent {
  @Output() propertySelected = new EventEmitter<Property>();

  isOpen = false;

  properties: Property[] = [
    { name: 'temperature', type: 'number', value: 25.5 },
    { name: 'pressure', type: 'number', value: 100 },
    { name: 'speed', type: 'number', value: 60 },
    { name: 'status', type: 'string', value: 1 },
  ];

  toggleDropdown() {
    this.isOpen = !this.isOpen;
  }

  selectProperty(property: Property) {
    this.propertySelected.emit(property);
    this.isOpen = false;
  }

  @Output() propertyDragged = new EventEmitter<Property>();

  // ... existing propertie

  onDragStart(event: DragEvent, property: Property) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', property.name);
      this.propertyDragged.emit(property);
    }
  }
}
