import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpressionToolbarComponent } from './expression-toolbar.component';

describe('ExpressionToolbarComponent', () => {
  let component: ExpressionToolbarComponent;
  let fixture: ComponentFixture<ExpressionToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpressionToolbarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExpressionToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
