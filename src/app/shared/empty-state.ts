import { Component } from '@angular/core';

/** The one style for "nothing here yet" messages. */
@Component({
  selector: 'app-empty-state',
  template: `<ng-content />`,
  host: {
    class: 'block rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500',
  },
})
export class EmptyState {}
