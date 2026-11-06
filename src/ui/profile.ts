import { useCallback, useState } from 'react';

/**
 * Local player profile. In this build it lives in the browser only.
 * For launch, earned currencies must move to the server-side ledger
 * (players can edit browser storage), as set out in the development proposal.
 */
export interface Profile {
  tokens: number; // Tactic Tokens — earned by playing matches
  medals: number; // Mission Medals — earned from lessons and drills
  boots: number; // Gold Boots — one per goal scored
  completed: string[]; // scenario ids
  owned: string[]; // cosmetic ids
  boardTheme: string;
  homeKit: string;
  awayKit: string;
  formation: string;
  record: { w: number; d: number; l: number; gf: number; ga: number };
}

const KEY = 'synochi.profile.v1';

const DEFAULT: Profile = {
  tokens: 0,
  medals: 0,
  boots: 0,
  completed: [],
  owned: ['classic', 'royal', 'crimson'],
  boardTheme: 'classic',
  homeKit: 'royal',
  awayKit: 'crimson',
  formation: '4-3-3',
  record: { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
};

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable: play with a fresh profile */
  }
  return { ...DEFAULT };
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(load);
  const update = useCallback((fn: (p: Profile) => Profile) => {
    setProfile((prev) => {
      const next = fn(prev);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [profile, update] as const;
}

// Values from the prototype's economy (Development Brief): 40 for finishing, +80 win, +30 draw; one Gold Boot per goal.
export const MATCH_REWARDS = { finish: 40, win: 80, draw: 30, bootsPerGoal: 1 };
export const MEDALS_PER_SCENARIO = 1;
export const TOKENS_PER_SCENARIO = 20;
