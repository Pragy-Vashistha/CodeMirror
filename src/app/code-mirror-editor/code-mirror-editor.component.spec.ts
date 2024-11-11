import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CodeMirrorEditorComponent } from './code-mirror-editor.component';

describe('CodeMirrorEditorComponent', () => {
  let component: CodeMirrorEditorComponent;
  let fixture: ComponentFixture<CodeMirrorEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CodeMirrorEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CodeMirrorEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
