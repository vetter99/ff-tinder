import { Component, input } from '@angular/core';
import type { IconNode } from 'lucide';

/**
 * A Lucide icon (https://lucide.dev), drawn from its SVG data. Import the icon you need from
 * 'lucide' and pass it in, e.g. `<app-icon [icon]="Search" />`. Decorative: label the control.
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.fill]="filled() ? 'currentColor' : 'none'"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @for (node of icon(); track $index) {
        @let a = attrs(node);
        @switch (node[0]) {
          @case ('path') {
            <svg:path [attr.d]="a['d']" />
          }
          @case ('circle') {
            <svg:circle [attr.cx]="a['cx']" [attr.cy]="a['cy']" [attr.r]="a['r']" />
          }
          @case ('rect') {
            <svg:rect
              [attr.x]="a['x']"
              [attr.y]="a['y']"
              [attr.width]="a['width']"
              [attr.height]="a['height']"
              [attr.rx]="a['rx']"
              [attr.ry]="a['ry']"
            />
          }
          @case ('line') {
            <svg:line [attr.x1]="a['x1']" [attr.y1]="a['y1']" [attr.x2]="a['x2']" [attr.y2]="a['y2']" />
          }
          @case ('polyline') {
            <svg:polyline [attr.points]="a['points']" />
          }
          @case ('polygon') {
            <svg:polygon [attr.points]="a['points']" />
          }
          @case ('ellipse') {
            <svg:ellipse [attr.cx]="a['cx']" [attr.cy]="a['cy']" [attr.rx]="a['rx']" [attr.ry]="a['ry']" />
          }
        }
      }
    </svg>
  `,
  host: { class: 'inline-flex shrink-0' },
})
export class Icon {
  readonly icon = input.required<IconNode>();
  readonly size = input(16);
  readonly strokeWidth = input(2);
  /** Fill the shape too (e.g. a solid star). */
  readonly filled = input(false);

  protected attrs(node: IconNode[number]): Record<string, string | number | undefined> {
    return node[1] as Record<string, string | number | undefined>;
  }
}
