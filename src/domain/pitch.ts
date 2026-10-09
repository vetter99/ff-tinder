import { Player } from './types';

export interface PitchOffer {
  send: readonly Player[];
  receive: readonly Player[];
  /** Each side's total salary, abbreviated ("$10.9M"), in leagues that use salaries. */
  sendSalary?: string | null;
  receiveSalary?: string | null;
}

/**
 * A ready-to-send message offering several trades to another manager, who doesn't need the app to
 * read it. Offers are listed in the order given (best first).
 */
export function buildPitch(myTeam: string, theirTeam: string, offers: readonly PitchOffer[]): string {
  if (offers.length === 0) return '';
  const names = (ps: readonly Player[]) => ps.map((p) => p.name).join(' + ');
  const lines = offers.map((o, i) => {
    const salaries = o.sendSalary && o.receiveSalary ? ` (${o.sendSalary} for ${o.receiveSalary})` : '';
    return `${i + 1}. My ${names(o.send)} for your ${names(o.receive)}${salaries}`;
  });
  const intro =
    offers.length === 1
      ? `Hey ${theirTeam}, would you do this trade?`
      : `Hey ${theirTeam}, would you do any of these trades?`;
  return [intro, '', ...lines, '', `Open to other ideas too. – ${myTeam}`].join('\n');
}
