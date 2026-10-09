import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CALIBRATION_COMPARISONS, selectNextPair } from '../../../domain/active-learning';
import { formatSalaryShort } from '../../../domain/league-import';
import { Player, PlayerId } from '../../../domain/types';
import { LeagueService } from '../../core/league.service';
import { StoreService } from '../../core/store.service';
import { ValuationService } from '../../core/valuation.service';
import { signed } from '../../shared/format';
import { PlayerAvatar } from '../../shared/player-avatar';
import { PositionBadge } from '../../shared/position-badge';
import { PlayerInfoService } from '../../core/player-info.service';
import { HelpTip } from '../../shared/help-tip';
import { PlayerDetails } from '../../shared/player-details';
import { PlayerSnapshot } from '../../shared/player-snapshot';
import { teamColor } from '../../shared/team-colors';

/** Drag distance (px) that counts as flinging a card, i.e. picking that player. */
const FLING_DISTANCE = 80;
/** Movement (px) after which a press counts as a drag rather than a tap. */
const TAP_SLOP = 10;
/** How long the pick animation plays before the next pair flies in. */
const LEAVE_MS = 280;
const DAILY_GOAL = 10;
/** Show an insight about the user's tastes every this many answers. */
const INSIGHT_EVERY = 15;
const TOAST_MS = 3000;
/** Minimum answers between payoff toasts, so they stay special. */
const TOAST_COOLDOWN = 5;
/** Answers within this many ms of each other keep the streak alive. */
const STREAK_WINDOW_MS = 10_000;
const STREAK_MILESTONE = 10;
const ANSWERS_PER_LEVEL = 20;
const LEVEL_TITLES = ['Rookie', 'Scout', 'Analyst', 'Sharp', 'GM', 'Shark'];
/** Winner stays: a player who wins this many in a row retires so matchups don't get stuck. */
const MAX_REIGN = 5;
const CONFETTI_COLORS = ['#34d399', '#fbbf24', '#38bdf8', '#f472b6', '#a78bfa'];

interface Toast {
  text: string;
  link: string | null;
  big?: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rotate: number;
  color: string;
  size: number;
}

type CardState = 'idle' | 'dragging' | 'armed' | 'chosen' | 'dropped' | 'tie';

@Component({
  selector: 'app-compare-page',
  imports: [HelpTip, PlayerAvatar, PlayerDetails, PlayerSnapshot, PositionBadge, RouterLink],
  templateUrl: './compare-page.html',
  host: { '(window:keydown)': 'onKey($event)', class: 'block' },
})
export class ComparePage {
  private readonly store = inject(StoreService);
  protected readonly valuation = inject(ValuationService);
  private readonly arena = viewChild<ElementRef<HTMLElement>>('arena');

  protected readonly pair = signal<[Player, Player] | null>(null);
  /** Increments per pair so the fly-in animation replays even if a player repeats. */
  protected readonly round = signal(0);
  /** What's animating out after an answer. */
  protected readonly leaving = signal<0 | 1 | 'tie' | null>(null);
  protected readonly toast = signal<Toast | null>(null);
  protected readonly particles = signal<Particle[]>([]);
  protected readonly streak = signal(0);
  protected readonly streakBump = signal(0);
  /** Winner stays: the reigning player, which slot they hold, and how many in a row they've won. */
  protected readonly champion = signal<{ id: PlayerId; side: 0 | 1; wins: number } | null>(null);
  protected readonly winnerStays = computed(() => this.store.options().winnerStays);
  protected readonly playerInfo = inject(PlayerInfoService);
  private readonly league = inject(LeagueService);
  protected readonly ppr = computed(() => this.store.settings().ppr);
  /** Player whose stats/news sheet is open. */
  protected readonly detailsPlayer = signal<Player | null>(null);
  private retired: { name: string; wins: number } | null = null;

  // Drag state for the card under the finger.
  protected readonly dragSide = signal<0 | 1 | null>(null);
  protected readonly drag = signal({ x: 0, y: 0 });
  private dragStart: { x: number; y: number } | null = null;
  private moved = false;

  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private lastToastAt = -Infinity;
  private lastAnswerAt = 0;
  private particleId = 0;
  private readonly announced = new Set<PlayerId>();
  protected readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  protected readonly count = computed(() => this.store.comparisons().length);
  protected readonly calibrationTotal = CALIBRATION_COMPARISONS;
  protected readonly calibrating = computed(() => this.count() < CALIBRATION_COMPARISONS);
  protected readonly toUnlock = computed(() => CALIBRATION_COMPARISONS - this.count());
  protected readonly dailyGoal = DAILY_GOAL;
  protected readonly maxReign = MAX_REIGN;
  protected readonly today = computed(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.store.comparisons().filter((c) => c.ts >= start.getTime()).length;
  });
  protected readonly level = computed(() => {
    const n = this.count();
    const level = Math.floor(n / ANSWERS_PER_LEVEL) + 1;
    return {
      level,
      title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1],
      progress: (n % ANSWERS_PER_LEVEL) / ANSWERS_PER_LEVEL,
      toNext: ANSWERS_PER_LEVEL - (n % ANSWERS_PER_LEVEL),
    };
  });

  constructor() {
    effect(() => {
      if (!this.pair() && this.valuation.players().length > 0) untracked(() => this.next());
    });
    // Fetch injuries, stats and news for whoever is on screen.
    effect(() => {
      const pair = this.pair();
      if (pair) untracked(() => this.playerInfo.ensure(pair));
    });
  }

  protected pick(side: 0 | 1): void {
    const pair = this.pair();
    if (!pair || this.leaving() !== null) return;
    const [winner, loser] = side === 0 ? pair : [pair[1], pair[0]];
    this.burst(side);
    this.crown(winner, side);
    this.answer(side, () =>
      this.store.recordComparison(winner.id, loser.id, {
        baselines: [winner.market.baseline, loser.market.baseline],
      }),
    );
  }

  /** Winner stays: the pick keeps their slot, unless they've won enough in a row to retire. */
  private crown(winner: Player, side: 0 | 1): void {
    if (!this.winnerStays()) {
      this.champion.set(null);
      return;
    }
    const current = this.champion();
    const wins = current?.id === winner.id ? current.wins + 1 : 1;
    if (wins >= MAX_REIGN) {
      this.retired = { name: winner.name, wins };
      this.champion.set(null);
    } else {
      this.champion.set({ id: winner.id, side, wins });
    }
  }

  protected toggleWinnerStays(on: boolean): void {
    this.store.setOption('winnerStays', on);
    if (!on) this.champion.set(null);
  }

  /** With winner stays, each player keeps their DOM node so only the challenger animates in. */
  protected cardKey(player: Player, index: number): string {
    return this.winnerStays() ? `${player.id}-${index}` : `${this.round()}-${player.id}`;
  }

  protected skip(): void {
    const pair = this.pair();
    if (!pair || this.leaving() !== null) return;
    this.champion.set(null);
    this.answer('tie', () =>
      this.store.recordComparison(pair[0].id, pair[1].id, {
        tie: true,
        baselines: [pair[0].market.baseline, pair[1].market.baseline],
      }),
    );
  }

  /** Plays the pick animation, records the answer, then brings in the next pair and any payoff. */
  private answer(side: 0 | 1 | 'tie', record: () => void): void {
    navigator.vibrate?.(side === 'tie' ? 5 : 12);
    const targetsBefore = this.topTargetIds();
    const levelBefore = this.level().level;
    this.bumpStreak();
    const commit = () => {
      record();
      this.leaving.set(null);
      this.dragSide.set(null);
      this.next();
      this.celebrate(targetsBefore, levelBefore);
    };
    this.leaving.set(side);
    if (this.reducedMotion) commit();
    else setTimeout(commit, LEAVE_MS);
  }

  private bumpStreak(): void {
    const now = Date.now();
    this.streak.update((s) => (now - this.lastAnswerAt <= STREAK_WINDOW_MS ? s + 1 : 1));
    this.lastAnswerAt = now;
    this.streakBump.update((b) => b + 1);
  }

  protected undo(): void {
    if (this.leaving() !== null) return;
    const last = this.store.undoLastComparison();
    const byId = this.valuation.playersById();
    const a = last && byId.get(last.winner);
    const b = last && byId.get(last.loser);
    if (a && b) {
      this.champion.set(null);
      this.pair.set([a, b]);
      this.round.update((r) => r + 1);
    }
  }

  private next(): void {
    const champion = this.champion();
    const pair = selectNextPair(
      this.valuation.players(),
      this.valuation.model(),
      this.store.rosterIds(),
      this.store.comparisons(),
      Math.random,
      { keep: champion?.id },
    );
    if (champion && pair?.[0].id === champion.id) {
      // The champion holds their slot; the challenger takes the other one.
      this.pair.set(champion.side === 0 ? pair : [pair[1], pair[0]]);
    } else {
      this.champion.set(null);
      this.pair.set(pair);
    }
    this.round.update((r) => r + 1);
  }

  private topTargetIds(): Set<PlayerId> {
    return new Set(
      this.valuation
        .gaps()
        .targets.slice(0, 10)
        .map((t) => t.player.id),
    );
  }

  /** Rewards, most exciting first: level-ups, unlocks, streak milestones, new targets, insights. */
  private celebrate(targetsBefore: Set<PlayerId>, levelBefore: number): void {
    const n = this.count();
    const level = this.level();
    if (this.retired) {
      this.showToast({
        text: `🏆 ${this.retired.name} won ${this.retired.wins} in a row`,
        link: null,
        big: true,
      });
      this.retired = null;
      this.burst(null, 40);
      return;
    }
    if (level.level > levelBefore) {
      this.showToast({ text: `Level up! ${level.title} · Lv ${level.level}`, link: null, big: true });
      this.burst(null, 40);
      return;
    }
    if (n === CALIBRATION_COMPARISONS) {
      this.showToast({ text: 'Trade ideas unlocked', link: '/trades', big: true });
      this.burst(null, 30);
      return;
    }
    if (this.streak() > 0 && this.streak() % STREAK_MILESTONE === 0) {
      this.showToast({ text: `🔥 ${this.streak()} in a row!`, link: null, big: true });
      this.burst(null, 30);
      return;
    }
    if (n < CALIBRATION_COMPARISONS || n - this.lastToastAt < TOAST_COOLDOWN) return;

    // Only announce a player who jumped into the top 3 targets from outside the top 10.
    const newTarget = this.valuation
      .gaps()
      .targets.slice(0, 3)
      .find((t) => !targetsBefore.has(t.player.id) && !this.announced.has(t.player.id));
    if (newTarget) {
      this.announced.add(newTarget.player.id);
      this.showToast({ text: `New trade target: ${newTarget.player.name}`, link: '/targets' });
      return;
    }
    if (n % INSIGHT_EVERY === 0) {
      const top = [...this.valuation.higherThanConsensus(), ...this.valuation.lowerThanConsensus()]
        .sort((a, b) => Math.abs(b.personal.gap) - Math.abs(a.personal.gap))
        .at(0);
      if (top) {
        this.showToast({
          text: `You're ${signed(top.personal.gap)} vs consensus on ${top.player.name}`,
          link: '/profile',
        });
      }
    }
  }

  private showToast(toast: Toast): void {
    this.lastToastAt = this.count();
    clearTimeout(this.toastTimer);
    this.toast.set(toast);
    this.toastTimer = setTimeout(() => this.toast.set(null), TOAST_MS);
  }

  /** Confetti from the chosen card (or the middle of the arena for big moments). */
  private burst(side: 0 | 1 | null, count = 18): void {
    const arena = this.arena()?.nativeElement;
    if (this.reducedMotion || !arena) return;
    const box = arena.getBoundingClientRect();
    const card = side === null ? null : arena.querySelectorAll('[data-card]')[side];
    const origin = card?.getBoundingClientRect() ?? box;
    const x = origin.left - box.left + origin.width / 2;
    const y = origin.top - box.top + origin.height / 2;
    const spread = side === null ? 220 : 150;
    const fresh = Array.from({ length: count }, (): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const distance = spread * (0.4 + Math.random() * 0.6);
      return {
        id: this.particleId++,
        x,
        y,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance - 40,
        rotate: Math.random() * 540 - 270,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 6 + Math.random() * 6,
      };
    });
    this.particles.update((ps) => [...ps, ...fresh]);
    const ids = new Set(fresh.map((p) => p.id));
    setTimeout(() => this.particles.update((ps) => ps.filter((p) => !ids.has(p.id))), 900);
  }

  protected openDetails(player: Player): void {
    this.detailsPlayer.set(player);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
    if (this.detailsPlayer()) return; // the details sheet handles its own keys
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') this.pick(0);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') this.pick(1);
    else if (event.key === ' ' || event.key === 's') this.skip();
    else if (event.key === 'u') this.undo();
    else return;
    event.preventDefault();
  }

  // --- Drag / fling -------------------------------------------------------------------------

  protected onCardPointerDown(event: PointerEvent, side: 0 | 1): void {
    if (this.leaving() !== null) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.dragStart = { x: event.clientX, y: event.clientY };
    this.moved = false;
    this.dragSide.set(side);
    this.drag.set({ x: 0, y: 0 });
  }

  protected onCardPointerMove(event: PointerEvent): void {
    if (!this.dragStart) return;
    const x = event.clientX - this.dragStart.x;
    const y = event.clientY - this.dragStart.y;
    if (Math.hypot(x, y) > TAP_SLOP) this.moved = true;
    this.drag.set({ x, y });
  }

  protected onCardPointerUp(side: 0 | 1): void {
    if (!this.dragStart) return;
    const { x, y } = this.drag();
    const moved = this.moved;
    this.dragStart = null;
    if (!moved || Math.hypot(x, y) >= FLING_DISTANCE) {
      // A tap or a fling both pick this player.
      this.pick(side);
    } else {
      this.dragSide.set(null);
      this.drag.set({ x: 0, y: 0 });
    }
  }

  protected onCardPointerCancel(): void {
    this.dragStart = null;
    this.dragSide.set(null);
    this.drag.set({ x: 0, y: 0 });
  }

  protected cardState(side: 0 | 1): CardState {
    const leaving = this.leaving();
    if (leaving === 'tie') return 'tie';
    if (leaving === side) return 'chosen';
    if (leaving !== null) return 'dropped';
    if (this.dragSide() === side) {
      const { x, y } = this.drag();
      return Math.hypot(x, y) >= FLING_DISTANCE ? 'armed' : 'dragging';
    }
    return 'idle';
  }

  protected cardTransform(side: 0 | 1): string | null {
    if (this.reducedMotion) return null;
    const dir = side === 0 ? -1 : 1;
    switch (this.cardState(side)) {
      case 'dragging':
      case 'armed': {
        const { x, y } = this.drag();
        return `translate(${x}px, ${y}px) rotate(${x * 0.06}deg) scale(1.02)`;
      }
      case 'chosen':
        return 'scale(1.06)';
      case 'dropped':
        return `translateX(${dir * 130}%) rotate(${dir * 14}deg) scale(0.9)`;
      case 'tie':
        return 'scale(0.9)';
      default:
        return null;
    }
  }

  /** The player's salary in the linked league, abbreviated ("$11.3M"), if it has salaries. */
  protected salary(player: Player): string | null {
    const salary = this.league.info(player)?.contract?.salary;
    return salary == null ? null : formatSalaryShort(salary);
  }

  protected wholeYears(age: number): number {
    return Math.floor(age);
  }

  protected cardBackground(player: Player): string {
    const color = teamColor(player.team);
    return `radial-gradient(120% 80% at 50% 0%, ${color}88, transparent 60%), linear-gradient(to top, #18181b, #1f1f23)`;
  }
}
