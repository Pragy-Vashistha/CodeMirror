import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-expression-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './expression-toolbar.component.html',
  styleUrl: './expression-toolbar.component.scss',
})
export class ExpressionToolbarComponent {
  @Output() insertText = new EventEmitter<string>();

  // List of operators and functions
  operators = ['+', '-', '*', '/'];
  functions = ['Sum()', 'Avg()', 'Scale()'];

  // Emit the selected operator or function to the editor
  addOperator(operator: string) {
    this.insertText.emit(operator);
  }

  addFunction(func: string) {
    this.insertText.emit(func);
  }
}
