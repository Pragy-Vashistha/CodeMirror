import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PropertyDropdownComponent } from './property-dropdown.component';

describe('PropertyDropdownComponent', () => {
  let component: PropertyDropdownComponent;
  let fixture: ComponentFixture<PropertyDropdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PropertyDropdownComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PropertyDropdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
