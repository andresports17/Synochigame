/**
 * Server-side accounts and currency ledger.
 *
 * Earned currencies (Tactic Tokens, Gold Boots, Mission Medals) used to live in
 * the player's browser, where they could be edited. Here every change is an
 * append-only ledger entry written by the server after it has verified what was
 * earned, and balances are the sum of the entries.
 *
 * Storage is a JSON file (or memory, for tests). It is written through on every
 * change, which suits a single small server. For launch, move the same three
 * tables (accounts, entries, records) to Postgres.
 */
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type Currency = 'tokens' | 'boots' | 'medals' | 'takeover';
export const CURRENCIES: Currency[] = ['tokens', 'boots', 'medals', 'takeover'];

export interface Account {
  id: string;
  /** SHA-256 of the bearer token; the token itself is never stored. */
  tokenHash: string;
  createdAt: number;
  owned: string[];
  completed: string[];
  record: { w: number; d: number; l: number; gf: number; ga: number };
  /** Current run of consecutive wins against the CPU. */
  winStreak: number;
  /** UTC date (YYYY-MM-DD) of the last first-win-of-the-day bonus. */
  lastDailyWin: string | null;
}

export interface Entry {
  id: string;
  accountId: string;
  currency: Currency;
  amount: number;
  reason: string;
  /** What the entry is for (a match id, lesson id, item id); makes awards idempotent. */
  ref: string;
  at: number;
}

interface Data {
  accounts: Record<string, Account>;
  entries: Entry[];
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export class Ledger {
  private data: Data = { accounts: {}, entries: [] };

  /** `file` = path of the JSON store; omit for an in-memory ledger. */
  constructor(private file?: string) {
    if (file && existsSync(file)) this.data = JSON.parse(readFileSync(file, 'utf8'));
  }

  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file); // atomic replace
  }

  createAccount(): { account: Account; token: string } {
    const token = randomBytes(24).toString('hex');
    const account: Account = {
      id: randomUUID(),
      tokenHash: hash(token),
      createdAt: Date.now(),
      owned: ['classic', 'royal', 'crimson'],
      completed: [],
      record: { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
      winStreak: 0,
      lastDailyWin: null,
    };
    this.data.accounts[account.id] = account;
    this.save();
    return { account, token };
  }

  /** The account a bearer token belongs to, or undefined. */
  authenticate(token: string | undefined): Account | undefined {
    if (!token) return undefined;
    const h = hash(token);
    return Object.values(this.data.accounts).find((a) => a.tokenHash === h);
  }

  balances(accountId: string): Record<Currency, number> {
    const out = { tokens: 0, boots: 0, medals: 0, takeover: 0 };
    for (const e of this.data.entries) if (e.accountId === accountId) out[e.currency] += e.amount;
    return out;
  }

  history(accountId: string, limit = 50): Entry[] {
    return this.data.entries.filter((e) => e.accountId === accountId).slice(-limit).reverse();
  }

  /** True if an entry with this reference already exists (so each match or lesson pays once). */
  hasRef(accountId: string, ref: string): boolean {
    return this.data.entries.some((e) => e.accountId === accountId && e.ref === ref);
  }

  /** Append entries and any account changes together, then persist once. */
  commit(accountId: string, entries: Array<Omit<Entry, 'id' | 'accountId' | 'at'>>, change?: (a: Account) => void) {
    const a = this.data.accounts[accountId];
    if (!a) throw new Error('Unknown account');
    const at = Date.now();
    for (const e of entries) if (e.amount !== 0) this.data.entries.push({ ...e, id: randomUUID(), accountId, at });
    change?.(a);
    this.save();
  }

  account(accountId: string): Account | undefined {
    return this.data.accounts[accountId];
  }
}
