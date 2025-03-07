import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdvancedEditorComponent } from './advanced-editor.component';

describe('AdvancedEditorComponent', () => {
  let component: AdvancedEditorComponent;
  let fixture: ComponentFixture<AdvancedEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdvancedEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdvancedEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
