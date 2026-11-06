import { useCallback, useEffect, useRef, useState } from 'react';
import type { Layout } from '../engine';

/**
 * Player profile.
 *
 * With the SYNOCHÍ server reachable, currencies, owned items, completed lessons
 * and the match record come from the server's ledger ("online" mode): the client
 * only displays them and claims rewards by sending verified logs. Without a server
 * (the standalone web demo) progress is kept on this device only ("local" mode).
 * Preferences (equipped theme and kits, default formation, custom set-up) always
 * stay on the device.
 */
export interface Profile {
  tokens: number; // Tactic Tokens: earned by playing matches
  medals: number; // Mission Medals: earned from lessons and the quiz
  boots: number; // Gold Boots: one per goal scored
  completed: string[]; // lesson ids, plus 'refs-eye'
  owned: string[]; // cosmetic ids
  boardTheme: string;
  homeKit: string;
  awayKit: string;
  formation: string;
  /** The player's own legal set-up (Q2), stored for Blue; mirrored when playing Red. */
  customLayout?: Layout | null;
  record: { w: number; d: number; l: number; gf: number; ga: number };
}

export type ProfileMode = 'checking' | 'online' | 'local';

const KEY = 'synochi.profile.v1';
const TOKEN_KEY = 'synochi.account.v1';

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

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

function load(): Profile {
  const raw = read(KEY);
  if (raw) {
    try {
      return { ...DEFAULT, ...JSON.parse(raw) };
    } catch {
      /* corrupt: start fresh */
    }
  }
  return { ...DEFAULT };
}

/** The server's view of an account (see server/accounts.ts). */
export interface ServerAccount {
  balances: { tokens: number; boots: number; medals: number; takeover: number };
  owned: string[];
  completed: string[];
  record: Profile['record'];
}

export interface Api {
  call: (method: string, path: string, body?: unknown) => Promise<{ account?: ServerAccount; [k: string]: unknown }>;
}

const merge = (p: Profile, a: ServerAccount): Profile => ({
  ...p,
  tokens: a.balances.tokens,
  boots: a.balances.boots,
  medals: a.balances.medals,
  owned: a.owned,
  completed: a.completed,
  record: a.record,
});

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(load);
  const [mode, setMode] = useState<ProfileMode>('checking');
  const token = useRef<string | null>(read(TOKEN_KEY));

  const update = useCallback((fn: (p: Profile) => Profile) => {
    setProfile((prev) => {
      const next = fn(prev);
      write(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const call: Api['call'] = useCallback(async (method, path, body) => {
    const r = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', ...(token.current ? { authorization: `Bearer ${token.current}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
    if (j.account) update((p) => merge(p, j.account));
    return j;
  }, [update]);

  // Find the server and sign in (a guest account is created on first visit).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = await fetch('/api/health');
        if (!h.ok) throw new Error('no server');
        if (!token.current) {
          const r = await fetch('/api/accounts', { method: 'POST' });
          const j = await r.json();
          token.current = j.token;
          write(TOKEN_KEY, j.token);
        }
        await call('GET', '/api/me');
        if (!cancelled) setMode('online');
      } catch {
        if (!cancelled) setMode('local');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [call]);

  const api: Api | null = mode === 'online' ? { call } : null;
  return [profile, update, mode, api] as const;
}

// Local-mode rewards, mirroring the server's (server/accounts.ts REWARDS).
export const MATCH_REWARDS = { finish: 40, win: 80, draw: 30, bootsPerGoal: 1 };
export const MEDALS_PER_SCENARIO = 1;
export const TOKENS_PER_SCENARIO = 20;
