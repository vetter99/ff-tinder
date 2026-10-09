import { Component, input, signal } from '@angular/core';

/** A small "?" button that reveals an explanation inline. */
@Component({
  selector: 'app-help-tip',
  template: `
    <button
      type="button"
      class="inline-flex size-5 items-center justify-center rounded-full border border-zinc-700 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-emerald-400"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="id"
      [attr.aria-label]="'What is ' + label() + '?'"
      (click)="open.set(!open())"
    >
      ?
    </button>
    @if (open()) {
      <div [id]="id" class="mt-2 basis-full rounded-md bg-zinc-900 px-3 py-2 text-xs leading-relaxed text-zinc-300">
        <ng-content />
      </div>
    }
  `,
  host: { class: 'contents' },
})
export class HelpTip {
  private static nextId = 0;
  readonly label = input.required<string>();
  protected readonly open = signal(false);
  protected readonly id = `help-tip-${HelpTip.nextId++}`;
}
