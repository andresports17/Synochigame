import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DIFFICULTIES,
  DEFAULT_FORMATION,
  FORMATIONS,
  FORMATION_NAMES,
  HALF_MINUTE_OPTIONS,
  KICKOFF_SPOT,
  QUIZ,
  QUIZ_OPTIONS,
  ROLE_NAMES,
  ROLE_SUMMARY,
  SCENARIOS,
  TEAM_NAMES,
  clockText,
  createMatch,
  formationPieces,
  layoutPieces,
  legalFormationSquare,
  mirrorLayout,
  presetLayout,
  validateFormation,
  getPiece,
  isOffside,
  judge,
  offsideLine,
  questionArrow,
  shotOutcome,
  type Action,
  type Difficulty,
  type GameState,
  type Layout,
  type MatchSetup,
  type Role,
  type Scenario,
  type Side,
} from '../engine';
import { Board } from './Board';
import { MatchView, StatsTable, useLocalMatch, type Controller } from './MatchView';
import { MATCH_REWARDS, MEDALS_PER_SCENARIO, TOKENS_PER_SCENARIO, useProfile, type Api, type Profile, type ProfileMode } from './profile';
import { AWAY_KITS, BOARD_THEMES, HOME_KITS, type BoardTheme, type Kit } from './themes';

type Kits = { home: Kit; away: Kit };

type Screen =
  | { id: 'home' }
  | { id: 'setup'; local: boolean }
  | { id: 'match'; key: number; local: boolean; difficulty: Difficulty; home: string; away: string; halfMinutes: number; restarts: boolean }
  | { id: 'learn' }
  | { id: 'lesson'; scenarioId: string; key: number }
  | { id: 'quiz'; key: number }
  | { id: 'formations' }
  | { id: 'locker' }
  | { id: 'rules' }
  | { id: 'online' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ id: 'home' });
  const [profile, update, mode, api] = useProfile();
  const theme = BOARD_THEMES.find((t) => t.id === profile.boardTheme) ?? BOARD_THEMES[0];
  const kits: Kits = {
    home: HOME_KITS.find((k) => k.id === profile.homeKit) ?? HOME_KITS[0],
    away: AWAY_KITS.find((k) => k.id === profile.awayKit) ?? AWAY_KITS[0],
  };
  const go = (s: Screen) => {
    setScreen(s);
    window.scrollTo({ top: 0 });
  };
  const home = () => go({ id: 'home' });

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="wordmark" onClick={home} aria-label="SYNOCHÍ home">
          SYNOCH<span className="i-accent">Í</span>
        </button>
        <div className="wallet" aria-label="Your currencies" title={walletNote(mode)}>
          {mode === 'local' && <span className="muted">Saved on this device</span>}
          <span title="Tactic Tokens, earned in matches"><b className="mono">{profile.tokens}</b> Tactic Tokens</span>
          <span title="Gold Boots, one per goal scored"><b className="mono">{profile.boots ?? 0}</b> Gold Boots</span>
          <span title="Mission Medals, earned in lessons"><b className="mono">{profile.medals}</b> Medals</span>
        </div>
      </header>

      {screen.id === 'home' && <Home profile={profile} go={go} />}
      {screen.id === 'setup' && (
        <Setup
          local={screen.local}
          profile={profile}
          onBack={home}
          onStart={(difficulty, h, a, halfMinutes, restarts) => go({ id: 'match', key: Date.now(), local: screen.local, difficulty, home: h, away: a, halfMinutes, restarts })}
        />
      )}
      {screen.id === 'match' && (
        <LocalMatch
          key={screen.key}
          local={screen.local}
          difficulty={screen.difficulty}
          home={screen.home}
          away={screen.away}
          halfMinutes={screen.halfMinutes}
          restarts={screen.restarts}
          customLayout={profile.customLayout ?? null}
          theme={theme}
          kits={kits}
          onExit={home}
          onRematch={() => go({ ...screen, key: Date.now() })}
          api={api}
          onFinish={async (s, log, matchId) => {
            if (screen.local) return null;
            if (api && matchId) {
              const j = (await api.call('POST', `/api/cpu-matches/${matchId}/finish`, { actions: log })) as { earned?: Array<{ currency: string; amount: number; reason: string }> };
              return (j.earned ?? []).map((e) => `+${e.amount} ${CURRENCY_LABEL[e.currency] ?? e.currency} (${e.reason})`).join(' · ');
            }
            const gf = s.score.home;
            const ga = s.score.away;
            const res = gf > ga ? 'w' : gf === ga ? 'd' : 'l';
            const earned = MATCH_REWARDS.finish + (res === 'w' ? MATCH_REWARDS.win : res === 'd' ? MATCH_REWARDS.draw : 0);
            update((p) => ({
              ...p,
              tokens: p.tokens + earned,
              boots: (p.boots ?? 0) + gf * MATCH_REWARDS.bootsPerGoal,
              record: { ...p.record, [res]: p.record[res] + 1, gf: p.record.gf + gf, ga: p.record.ga + ga },
            }));
            return `+${earned} Tactic Tokens · +${gf} Gold Boots`;
          }}
        />
      )}
      {screen.id === 'learn' && (
        <Learn profile={profile} onBack={home} onPick={(id) => go({ id: 'lesson', scenarioId: id, key: Date.now() })} onQuiz={() => go({ id: 'quiz', key: Date.now() })} />
      )}
      {screen.id === 'lesson' && (
        <LessonRun
          key={screen.key}
          scenario={SCENARIOS.find((s) => s.id === screen.scenarioId)!}
          theme={theme}
          kits={kits}
          onExit={() => go({ id: 'learn' })}
          onRetry={() => go({ ...screen, key: Date.now() })}
          onNext={(id) => go({ id: 'lesson', scenarioId: id, key: Date.now() })}
          onSuccess={(id, log) => {
            if (api) return api.call('POST', `/api/lessons/${id}/complete`, { actions: log }).then(() => undefined);
            update((p) =>
              p.completed.includes(id) ? p : { ...p, completed: [...p.completed, id], medals: p.medals + MEDALS_PER_SCENARIO, tokens: p.tokens + TOKENS_PER_SCENARIO },
            );
            return Promise.resolve();
          }}
        />
      )}
      {screen.id === 'quiz' && (
        <RefsEye
          key={screen.key}
          theme={theme}
          kits={kits}
          passed={profile.completed.includes('refs-eye')}
          onBack={() => go({ id: 'learn' })}
          onRetry={() => go({ id: 'quiz', key: Date.now() })}
          onDone={async (answers, score) => {
            if (api) return ((await api.call('POST', '/api/quiz/submit', { answers })) as { passed: boolean }).passed;
            const passed = score >= REFS_PASS;
            if (passed) update((p) => (p.completed.includes('refs-eye') ? p : { ...p, completed: [...p.completed, 'refs-eye'], medals: p.medals + 3, tokens: p.tokens + 60 }));
            return passed;
          }}
        />
      )}
      {screen.id === 'formations' && <Formations profile={profile} update={update} onBack={home} theme={theme} kits={kits} />}
      {screen.id === 'locker' && <Locker profile={profile} update={update} onBack={home} api={api} />}
      {screen.id === 'rules' && <RulesPage onBack={home} />}
      {screen.id === 'online' && <Online profile={profile} onBack={home} theme={theme} kits={kits} />}

      <footer className="foot">
        SYNOCHÍ™ by David André · The World's Game On Board™ · Official rules (extraction draft, 3 Nov 2026). Points marked for confirmation are listed on the Rules page.
      </footer>
    </div>
  );
}

const CURRENCY_LABEL: Record<string, string> = { tokens: 'Tactic Tokens', boots: 'Gold Boots', medals: 'Medals', takeover: 'Takeover Tokens' };

function walletNote(mode: ProfileMode) {
  return mode === 'online'
    ? 'Balances are kept on the SYNOCHÍ server and only change after the server has checked your result.'
    : mode === 'local'
      ? 'No SYNOCHÍ server here: progress is saved in this browser only.'
      : 'Connecting…';
}

// ------------------------------------------------------------------ home

function Home({ profile, go }: { profile: Profile; go: (s: Screen) => void }) {
  const done = SCENARIOS.filter((l) => profile.completed.includes(l.id)).length;
  const r = profile.record;
  const preview = useMemo(
    () =>
      createMatch({
        homeFormation: profile.formation === CUSTOM ? DEFAULT_FORMATION : profile.formation,
        homeLayout: profile.formation === CUSTOM && profile.customLayout ? profile.customLayout : undefined,
        awayFormation: '4-4-2',
        timed: false,
      }),
    [profile.formation, profile.customLayout],
  );
  return (
    <main className="home-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">By David André</p>
          <h1>
            The World's Game
            <br />
            On Board
          </h1>
          <p className="lede">
            Soccer-chess on a 24 × 16 pitch. Eleven role-based pieces a side, one piece a turn, two five-minute halves. Nothing is random: every
            shot scores, is blocked or is saved purely by where the pieces stand.
          </p>
          <div className="cta-row">
            <button type="button" className="btn primary big" onClick={() => go({ id: 'setup', local: false })}>Play vs CPU</button>
            {done < SCENARIOS.length && (
              <button type="button" className="btn ghost big" onClick={() => go({ id: 'learn' })}>
                {done === 0 ? `Learn in ${SCENARIOS.length} lessons` : `Continue lessons (${done}/${SCENARIOS.length})`}
              </button>
            )}
          </div>
          <p className="record mono">Record {r.w}W {r.d}D {r.l}L · Goals {r.gf}–{r.ga}</p>
        </div>
        <div className="hero-board" aria-hidden="true">
          <Board state={preview} theme={BOARD_THEMES[0]} kits={{ home: HOME_KITS[0], away: AWAY_KITS[0] }} />
        </div>
      </section>
      <nav className="menu" aria-label="Main menu">
        <MenuTile title="Play vs CPU" body="Beginner, Baller or Master. Earn Tactic Tokens." onClick={() => go({ id: 'setup', local: false })} />
        <MenuTile title="Local match" body="Two players, one device." onClick={() => go({ id: 'setup', local: true })} />
        <MenuTile title="Online" body="Invite a friend with a match code." onClick={() => go({ id: 'online' })} />
        <MenuTile title="Learn" body={`${SCENARIOS.length} lessons, one rule at a time.`} onClick={() => go({ id: 'learn' })} />
        <MenuTile title="Ref's Eye" body={`${QUIZ.length} calls: offside, interceptions, tackles, shots.`} onClick={() => go({ id: 'quiz', key: Date.now() })} />
        <MenuTile title="Formations" body={`${FORMATION_NAMES.length} presets. Set your default.`} onClick={() => go({ id: 'formations' })} />
        <MenuTile title="Locker" body="Board themes and kits. Cosmetic only." onClick={() => go({ id: 'locker' })} />
        <MenuTile title="Rules" body="The official rules, with open questions." onClick={() => go({ id: 'rules' })} />
      </nav>
    </main>
  );
}

function MenuTile({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" className="tile" onClick={onClick}>
      <strong>{title}</strong>
      <span>{body}</span>
    </button>
  );
}

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="backbar">
      <button type="button" className="btn ghost small" onClick={onBack}>← Back</button>
      <h2>{title}</h2>
    </div>
  );
}

// ------------------------------------------------------------------ setup

const CUSTOM = 'custom';

function Setup({ local, profile, onBack, onStart }: { local: boolean; profile: Profile; onBack: () => void; onStart: (d: Difficulty, h: string, a: string, halfMinutes: number, restarts: boolean) => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('baller');
  const [halfMinutes, setHalfMinutes] = useState(10);
  const [restarts, setRestarts] = useState(true);
  const [h, setH] = useState(profile.formation);
  const [a, setA] = useState('4-4-2');
  const hasCustom = !!profile.customLayout;
  return (
    <main className="page">
      <BackBar title={local ? 'Local match' : 'Play vs CPU'} onBack={onBack} />
      {!local && (
        <fieldset className="choices">
          <legend>Opponent</legend>
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
            <label key={d} className={`choice ${d === difficulty ? 'on' : ''}`}>
              <input type="radio" name="difficulty" id={`diff-${d}`} checked={d === difficulty} onChange={() => setDifficulty(d)} />
              <strong>{DIFFICULTIES[d].label}</strong>
              <span>{DIFFICULTIES[d].blurb} Possession limit: {stallLimitFor(local, d)} turns.</span>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="choices">
        <legend>Half length</legend>
        {HALF_MINUTE_OPTIONS.map((m) => (
          <label key={m} className={`choice ${m === halfMinutes ? 'on' : ''}`}>
            <input type="radio" name="half" id={`half-${m}`} checked={m === halfMinutes} onChange={() => setHalfMinutes(m)} />
            <strong>2 × {m} min</strong>
            <span>{m === 10 ? 'Standard.' : m === 5 ? 'Quick game.' : 'Long game.'} Real-time clock, no turn timer.</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="choices">
        <legend>Ball out of play</legend>
        {(
          [
            [true, 'Restarts on', 'The ball can go out: throw-ins, goal kicks and corners, as in the Laws of the Game.'],
            [false, 'Restarts off', 'The ball never leaves the pitch; wide shots go to the keeper.'],
          ] as [boolean, string, string][]
        ).map(([v, label, blurb]) => (
          <label key={label} className={`choice ${v === restarts ? 'on' : ''}`}>
            <input type="radio" name="restarts" id={`restarts-${v}`} checked={v === restarts} onChange={() => setRestarts(v)} />
            <strong>{label}</strong>
            <span>{blurb}</span>
          </label>
        ))}
      </fieldset>
      <div className="two-col">
        <FormationPicker label={`${TEAM_NAMES.home} formation${local ? '' : ' (you)'}`} value={h} onChange={setH} id="fh" custom={hasCustom} />
        <FormationPicker label={`${TEAM_NAMES.away} formation${local ? '' : ' (CPU)'}`} value={a} onChange={setA} id="fa" custom={hasCustom && local} />
      </div>
      <p className="note">
        {TEAM_NAMES.home} kick off and attack up the board. Formations can be changed at half-time. The 25-second turn timer applies to online play.
      </p>
      <button type="button" className="btn primary big" onClick={() => onStart(difficulty, h, a, halfMinutes, restarts)}>Kick off</button>
    </main>
  );
}

/** Q20: 2 turns for ranked play and the hardest CPU; 3 for regular online, local and easier CPU. */
function stallLimitFor(local: boolean, d: Difficulty) {
  return !local && d === 'master' ? 2 : 3;
}

function FormationPicker({ label, value, onChange, id, custom }: { label: string; value: string; onChange: (v: string) => void; id: string; custom?: boolean }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {FORMATION_NAMES.map((f) => (
          <option key={f} value={f}>{f} · {FORMATIONS[f].blurb}</option>
        ))}
        {custom && <option value={CUSTOM}>My set-up · your own placement</option>}
      </select>
    </label>
  );
}

// ------------------------------------------------------------------ match

type MatchProps = {
  local: boolean; difficulty: Difficulty; home: string; away: string; halfMinutes: number; restarts: boolean; customLayout: Layout | null; theme: BoardTheme; kits: Kits;
  api: Api | null; onExit: () => void; onRematch: () => void; onFinish: (s: GameState, log: Action[], matchId: string | null) => Promise<string | null>;
};

/** Builds the match setup: locally, or (online, vs CPU) issued by the server so the result can be verified. */
function LocalMatch(props: MatchProps) {
  const { local, difficulty, home, away, halfMinutes, restarts, customLayout, api } = props;
  const localSetup = useMemo<MatchSetup>(
    () => ({
      homeFormation: home === CUSTOM ? DEFAULT_FORMATION : home,
      awayFormation: away === CUSTOM ? DEFAULT_FORMATION : away,
      homeLayout: home === CUSTOM && customLayout ? customLayout : undefined,
      awayLayout: away === CUSTOM && customLayout ? mirrorLayout(customLayout) : undefined,
      halfMinutes,
      stallLimit: stallLimitFor(local, difficulty),
      restarts,
    }),
    [home, away, halfMinutes, customLayout, local, difficulty, restarts],
  );
  const [issued, setIssued] = useState<{ id: string | null; setup: MatchSetup } | null>(api && !local ? null : { id: null, setup: localSetup });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!api || local || issued) return;
    api
      .call('POST', '/api/cpu-matches', { difficulty, homeFormation: localSetup.homeFormation, awayFormation: localSetup.awayFormation, homeLayout: localSetup.homeLayout, halfMinutes, restarts })
      .then((j) => setIssued({ id: j.id as string, setup: j.setup as MatchSetup }))
      .catch((e) => setErr((e as Error).message));
  }, [api, local, issued, difficulty, localSetup, halfMinutes]);
  if (err) return <main className="page"><p className="error">Could not start the match: {err}</p></main>;
  if (!issued) return <main className="page"><p className="note">Starting the match…</p></main>;
  return <MatchRunner {...props} matchId={issued.id} setup={issued.setup} />;
}

function MatchRunner({
  local, difficulty, home, away, halfMinutes, customLayout, theme, kits, onExit, onRematch, onFinish, matchId, setup,
}: MatchProps & { matchId: string | null; setup: MatchSetup }) {
  const initial = useMemo(() => createMatch(setup), [setup]);
  const controllers: Record<Side, Controller> = { home: 'human', away: local ? 'human' : difficulty };
  const { state, dispatch, cpuThinking, paused, setPaused, log } = useLocalMatch(initial, controllers);
  const [earned, setEarned] = useState<string | null>(null);
  const [htHome, setHtHome] = useState(home);
  const [htAway, setHtAway] = useState(away);
  const reported = useRef(false);
  useEffect(() => {
    if (state.phase === 'finished' && !reported.current) {
      reported.current = true;
      onFinish(state, log(), matchId)
        .then((e) => setEarned(e))
        .catch((e) => setEarned(`Rewards not granted: ${(e as Error).message}`));
    }
  }, [state, onFinish, log, matchId]);
  void customLayout;

  const banner =
    state.phase === 'halftime' ? (
      <div className="result">
        <h3>Half-time <span className="mono">{state.score.home}–{state.score.away}</span></h3>
        <StatsTable state={state} />
        <FormationPicker label={`${TEAM_NAMES.home} formation`} value={htHome} onChange={setHtHome} id="ht-home" custom={home === CUSTOM} />
        {local && <FormationPicker label={`${TEAM_NAMES.away} formation`} value={htAway} onChange={setHtAway} id="ht-away" custom={away === CUSTOM} />}
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            dispatch({ type: 'resume', homeFormation: htHome === CUSTOM ? undefined : htHome, awayFormation: local && htAway !== CUSTOM ? htAway : undefined })
          }
        >
          Start second half
        </button>
      </div>
    ) : state.phase === 'finished' ? (
      <div className="result">
        <h3>
          {state.score.home > state.score.away ? `${TEAM_NAMES.home} win` : state.score.home < state.score.away ? `${TEAM_NAMES.away} win` : 'Draw'}{' '}
          <span className="mono">{state.score.home}–{state.score.away}</span>
        </h3>
        {earned && <p>{earned}</p>}
        <StatsTable state={state} />
        <div className="row">
          <button type="button" className="btn primary" onClick={onRematch}>Rematch</button>
          <button type="button" className="btn ghost" onClick={onExit}>Main menu</button>
        </div>
      </div>
    ) : null;

  return (
    <main className="page wide">
      <div className="backbar">
        <button type="button" className="btn ghost small" onClick={onExit}>← Leave match</button>
        <span className="muted">
          {local ? 'Local match' : `vs CPU · ${DIFFICULTIES[difficulty].label}`} · 2 × {halfMinutes} min · restarts {state.restartsEnabled ? 'on' : 'off'} · {state.layouts.home ? 'My set-up' : state.formations.home} v {state.layouts.away ? 'My set-up' : state.formations.away}
        </span>
      </div>
      <MatchView
        state={state}
        onAction={dispatch}
        humanSides={local ? ['home', 'away'] : ['home']}
        busy={cpuThinking || paused}
        theme={theme}
        kits={kits}
        banner={banner}
        controls={
          state.phase === 'playing' ? (
            <button type="button" className="btn ghost small" onClick={() => setPaused(!paused)}>{paused ? 'Resume clock' : 'Pause'}</button>
          ) : null
        }
      />
    </main>
  );
}

// ------------------------------------------------------------------ learn

function Learn({ profile, onBack, onPick, onQuiz }: { profile: Profile; onBack: () => void; onPick: (id: string) => void; onQuiz: () => void }) {
  const passed = profile.completed.includes('refs-eye');
  return (
    <main className="page">
      <BackBar title="Learn" onBack={onBack} />
      <div className="list">
        {SCENARIOS.map((s) => {
          const done = profile.completed.includes(s.id);
          return (
            <button type="button" key={s.id} className={`list-item ${done ? 'done' : ''}`} onClick={() => onPick(s.id)}>
              <span className="status" aria-label={done ? 'Completed' : 'Not completed'}>{done ? '✓' : ''}</span>
              <span className="li-body">
                <strong>{s.title}</strong>
                <span>{s.rule} · {s.objective}</span>
              </span>
            </button>
          );
        })}
        <button type="button" className={`list-item feature ${passed ? 'done' : ''}`} onClick={onQuiz}>
          <span className="status" aria-label={passed ? 'Passed' : 'Not passed'}>{passed ? '✓' : ''}</span>
          <span className="li-body">
            <strong>Ref's Eye: make the call</strong>
            <span>{QUIZ.length} situations. Score {REFS_PASS} or more to earn 3 Medals.</span>
          </span>
        </button>
      </div>
    </main>
  );
}

function LessonRun({
  scenario, theme, kits, onExit, onRetry, onNext, onSuccess,
}: {
  scenario: Scenario; theme: BoardTheme; kits: Kits; onExit: () => void; onRetry: () => void; onNext: (id: string) => void; onSuccess: (id: string, log: Action[]) => Promise<void>;
}) {
  const initial = useMemo(() => scenario.setup(), [scenario]);
  const [outcome, setOutcome] = useState<'success' | 'fail' | null>(null);
  const controllers: Record<Side, Controller> = { home: 'human', away: outcome ? 'human' : scenario.opponent };
  const { state, dispatch, cpuThinking, log } = useLocalMatch(initial, controllers, 'relaxed');
  const [rewardErr, setRewardErr] = useState<string | null>(null);
  const blueTurns = useRef(0);
  const prev = useRef({ n: state.turnNumber, side: state.turn });
  if (state.turnNumber !== prev.current.n) {
    if (prev.current.side === 'home') blueTurns.current++;
    prev.current = { n: state.turnNumber, side: state.turn };
  }
  const turnsLeft = Math.max(0, scenario.maxTurns - blueTurns.current);

  useEffect(() => {
    if (outcome) return;
    if (scenario.success(state)) {
      setOutcome('success');
      onSuccess(scenario.id, log()).catch((e) => setRewardErr((e as Error).message));
    } else if (scenario.fail?.(state) || blueTurns.current >= scenario.maxTurns) setOutcome('fail');
  }, [state, outcome, scenario, onSuccess, log]);

  const idx = SCENARIOS.findIndex((s) => s.id === scenario.id);
  const next = SCENARIOS[idx + 1];
  const banner = (
    <div className="lesson">
      <div className="lesson-head">
        <h3>{scenario.title}</h3>
        <span className="pill">{outcome ? (outcome === 'success' ? 'Complete' : 'Try again') : `${turnsLeft} turn${turnsLeft === 1 ? '' : 's'} left`}</span>
      </div>
      <div className="eyebrow">{scenario.rule}</div>
      <p>{scenario.brief}</p>
      <p className="objective"><b>Objective:</b> {scenario.objective}</p>
      <ul>
        {scenario.tips.map((t) => <li key={t}>{t}</li>)}
      </ul>
      {outcome && (
        <div className={`result ${outcome}`}>
          <h3>{outcome === 'success' ? 'Well played!' : 'Not this time'}</h3>
          {outcome === 'success' && <p>{rewardErr ? `Reward not granted: ${rewardErr}` : `+${MEDALS_PER_SCENARIO} Medal · +${TOKENS_PER_SCENARIO} Tactic Tokens (first clear only)`}</p>}
          <div className="row">
            {outcome === 'success' && next && <button type="button" className="btn primary" onClick={() => onNext(next.id)}>Next: {next.title}</button>}
            <button type="button" className={`btn ${outcome === 'fail' ? 'primary' : 'ghost'}`} onClick={onRetry}>Retry</button>
            <button type="button" className="btn ghost" onClick={onExit}>All lessons</button>
          </div>
        </div>
      )}
    </div>
  );
  return (
    <main className="page wide">
      <div className="backbar">
        <button type="button" className="btn ghost small" onClick={onExit}>← Lessons</button>
      </div>
      <MatchView
        state={state}
        onAction={(a: Action) => !outcome && dispatch(a)}
        humanSides={outcome ? [] : ['home']}
        busy={cpuThinking}
        theme={theme}
        kits={kits}
        banner={banner}
      />
    </main>
  );
}

// ------------------------------------------------------------------ Ref's Eye

const REFS_PASS = 11;

function RefsEye({ theme, kits, passed, onBack, onRetry, onDone }: { theme: BoardTheme; kits: Kits; passed: boolean; onBack: () => void; onRetry: () => void; onDone: (answers: string[], score: number) => Promise<boolean> }) {
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = QUIZ[i];
  const before = useMemo(() => q.setup(), [q]);
  const verdict = useMemo(() => judge(q), [q]);
  const arrow = useMemo(() => questionArrow(q), [q]);
  const actor = 'pieceId' in q.action ? getPiece(before, q.action.pieceId) : undefined;
  const correct = answer !== null && answer === verdict.call;

  const choose = (opt: string) => {
    if (answer) return;
    setAnswer(opt);
    setAnswers((a) => [...a, opt]);
    if (opt === verdict.call) setScore((n) => n + 1);
  };
  const next = () => {
    if (i + 1 < QUIZ.length) {
      setI(i + 1);
      setAnswer(null);
    } else {
      setDone(true);
      onDone(answers, score)
        .then(setResult)
        .catch(() => setResult(score >= REFS_PASS));
    }
  };

  if (done)
    return (
      <main className="page">
        <BackBar title="Ref's Eye" onBack={onBack} />
        <div className={`result ${score >= REFS_PASS ? 'success' : 'fail'}`}>
          <h3>{score} / {QUIZ.length} correct calls</h3>
          <p>{result === null ? 'Checking your calls…' : result ? (passed ? 'Passed again. Sharp eyes.' : 'Passed! +3 Medals, +60 Tactic Tokens') : `Score ${REFS_PASS} or more to pass.`}</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={onRetry}>Try again</button>
            <button type="button" className="btn ghost" onClick={onBack}>Back to lessons</button>
          </div>
        </div>
      </main>
    );

  const passQ = q.action.type === 'pass' && actor;
  const receiver = passQ && q.action.type === 'pass' ? before.pieces.find((p) => p.pos.c === (q.action as { to: { c: number } }).to.c && p.pos.r === (q.action as { to: { r: number } }).to.r) : undefined;
  const shot = q.action.type === 'shoot' && actor ? (() => { const r = shotOutcome(before, actor); return { from: actor.pos, path: r.path, outcome: r.outcome }; })() : null;
  const showTackleAfter = answer !== null && q.kind === 'tackle';

  return (
    <main className="page wide">
      <div className="backbar">
        <button type="button" className="btn ghost small" onClick={onBack}>← Lessons</button>
        <span className="muted mono">Call {i + 1} of {QUIZ.length} · {score} correct</span>
      </div>
      <div className="match-body">
        <div className="board-wrap">
          <Board
            state={showTackleAfter ? verdict.after : before}
            theme={theme}
            kits={kits}
            arrow={showTackleAfter ? null : arrow}
            offside={answer && passQ && actor ? (() => { const l = offsideLine(before, actor.side); return l === null ? null : { side: actor.side, line: l }; })() : null}
            flagged={answer && actor && receiver && isOffside(before, actor, receiver) ? [receiver.id] : []}
            shot={answer ? shot : null}
            selected={actor?.id}
          />
        </div>
        <aside className="panel">
          <div className="callout">
            <div className="eyebrow">{q.rule}</div>
            <strong>Make the call</strong>
            <p>{q.prompt}</p>
          </div>
          <div className="quiz-options" role="group" aria-label="Your call">
            {QUIZ_OPTIONS[q.kind].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`btn ${answer === null ? '' : opt === verdict.call ? 'right' : opt === answer ? 'wrong' : ''}`}
                disabled={answer !== null}
                onClick={() => choose(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
          {answer && (
            <div className={`result ${correct ? 'success' : 'fail'}`}>
              <h3>{correct ? 'Correct call' : `The call: ${verdict.call}`}</h3>
              <p className="explain">{q.explain}</p>
              <button type="button" className="btn primary" onClick={next}>{i + 1 < QUIZ.length ? 'Next call' : 'See your score'}</button>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ formations

function Formations({ profile, update, onBack, theme, kits }: { profile: Profile; update: (fn: (p: Profile) => Profile) => void; onBack: () => void; theme: BoardTheme; kits: Kits }) {
  const [f, setF] = useState(profile.formation === CUSTOM ? CUSTOM : profile.formation);
  const [layout, setLayout] = useState<Layout>(() => profile.customLayout ?? presetLayout('home', DEFAULT_FORMATION));
  const [sel, setSel] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const editing = f === CUSTOM;
  const pieces = editing ? layoutPieces('home', layout) : formationPieces('home', f);
  const state = { pieces, ball: { pos: KICKOFF_SPOT.home, carrier: null } };
  const errors = editing ? validateFormation('home', pieces) : [];
  const counts = pieces.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.role]: (acc[p.role] ?? 0) + 1 }), {});
  const targets =
    editing && sel !== null
      ? Array.from({ length: 24 * 16 }, (_, i) => ({ c: i % 16, r: Math.floor(i / 16) })).filter(
          (c) => legalFormationSquare('home', layout[sel].role, c) && !layout.some((l) => l.pos.c === c.c && l.pos.r === c.r),
        )
      : [];
  const onCell = (c: { c: number; r: number }) => {
    if (!editing) return;
    const at = layout.findIndex((l) => l.pos.c === c.c && l.pos.r === c.r);
    if (at >= 0) return setSel(at === sel ? null : at);
    if (sel !== null && targets.some((t) => t.c === c.c && t.r === c.r)) {
      setLayout(layout.map((l, i) => (i === sel ? { ...l, pos: c } : l)));
      setSel(null);
      setSaved(false);
    }
  };
  return (
    <main className="page">
      <BackBar title="Formations" onBack={onBack} />
      <div className="seg" role="tablist" aria-label="Formation">
        {FORMATION_NAMES.map((n) => (
          <button key={n} type="button" role="tab" aria-selected={n === f} className={n === f ? 'active' : ''} onClick={() => { setF(n); setSel(null); }}>{n}</button>
        ))}
        <button type="button" role="tab" aria-selected={editing} className={editing ? 'active' : ''} onClick={() => setF(CUSTOM)}>My set-up</button>
      </div>
      <div className="formation-view">
        <div className="mini-board">
          <Board state={state} theme={theme} kits={kits} selected={editing && sel !== null ? pieces[sel].id : null} overlays={targets.map((cell) => ({ cell, kind: 'move' as const }))} onCell={editing ? onCell : undefined} />
        </div>
        <div className="stack">
          {editing ? (
            <>
              <p>Place your own pieces anywhere legal in your half: tap a piece, then a white dot. The keeper stays in its six-yard box, nobody else may stand in either six-yard box, and the centre circle stays clear.</p>
              <label className="field" htmlFor="base">
                <span>Start from a preset</span>
                <select id="base" value="" onChange={(e) => { if (e.target.value) { setLayout(presetLayout('home', e.target.value)); setSel(null); setSaved(false); } }}>
                  <option value="">Choose…</option>
                  {FORMATION_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              {errors.length > 0 && <p className="error">{errors[0]}</p>}
              <div className="row">
                <button type="button" className="btn primary" disabled={errors.length > 0} onClick={() => { update((p) => ({ ...p, customLayout: layout })); setSaved(true); }}>
                  {saved ? 'Saved' : 'Save my set-up'}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={!profile.customLayout || profile.formation === CUSTOM}
                  onClick={() => update((p) => ({ ...p, formation: CUSTOM }))}
                >
                  {profile.formation === CUSTOM ? 'Your default' : 'Use as my default'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>{FORMATIONS[f].blurb}</p>
              <button type="button" className="btn primary" disabled={profile.formation === f} onClick={() => update((p) => ({ ...p, formation: f }))}>
                {profile.formation === f ? 'Your default formation' : `Set ${f} as default`}
              </button>
            </>
          )}
          <p className="mono">{Object.entries(counts).map(([r, n]) => `${n}× ${ROLE_NAMES[r as Role]}`).join(' · ')}</p>
          <RoleList />
        </div>
      </div>
    </main>
  );
}

function RoleList() {
  return (
    <dl className="role-list">
      {(Object.keys(ROLE_NAMES) as Role[]).map((r) => (
        <div key={r}>
          <dt><span className="mono">{r}</span> {ROLE_NAMES[r]}</dt>
          <dd>{ROLE_SUMMARY[r]}</dd>
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ locker

function Locker({ profile, update, onBack, api }: { profile: Profile; update: (fn: (p: Profile) => Profile) => void; onBack: () => void; api: Api | null }) {
  const [err, setErr] = useState<string | null>(null);
  const buy = (id: string, price: number, field: 'boardTheme' | 'homeKit' | 'awayKit') => {
    setErr(null);
    if (!api) return update((p) => ({ ...p, tokens: p.tokens - price, owned: [...p.owned, id], [field]: id }));
    api
      .call('POST', '/api/shop/buy', { itemId: id })
      .then(() => update((p) => ({ ...p, [field]: id })))
      .catch((e) => setErr((e as Error).message));
  };
  const sections = [
    { title: 'Board themes', items: BOARD_THEMES, field: 'boardTheme' as const, swatch: (i: (typeof BOARD_THEMES)[number]) => `linear-gradient(135deg, ${i.grassA} 0 50%, ${i.frame} 50%)` },
    { title: `${TEAM_NAMES.home} kits`, items: HOME_KITS, field: 'homeKit' as const, swatch: (i: Kit) => i.fill },
    { title: `${TEAM_NAMES.away} kits`, items: AWAY_KITS, field: 'awayKit' as const, swatch: (i: Kit) => i.fill },
  ];
  return (
    <main className="page">
      <BackBar title="Locker" onBack={onBack} />
      <p className="note">Everything here is cosmetic. Nothing you unlock changes how pieces play.</p>
      {err && <p className="error">{err}</p>}
      {sections.map((sec) => (
        <section key={sec.title} className="stack">
          <h3 className="eyebrow">{sec.title}</h3>
          <div className="shop">
            {sec.items.map((item) => {
              const owned = profile.owned.includes(item.id);
              const equipped = profile[sec.field] === item.id;
              return (
                <div key={item.id} className={`shop-item ${equipped ? 'equipped' : ''}`}>
                  <span className="swatch-lg" style={{ background: (sec.swatch as (i: typeof item) => string)(item) }} />
                  <strong>{item.name}</strong>
                  {equipped ? (
                    <span className="pill">Equipped</span>
                  ) : owned ? (
                    <button type="button" className="btn ghost small" onClick={() => update((p) => ({ ...p, [sec.field]: item.id }))}>Equip</button>
                  ) : (
                    <button
                      type="button"
                      className="btn primary small"
                      disabled={profile.tokens < item.price}
                      onClick={() => buy(item.id, item.price, sec.field)}
                    >
                      {item.price} tokens
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}

// ------------------------------------------------------------------ rules

function RulesPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="page prose">
      <BackBar title="Official rules" onBack={onBack} />
      <p className="note">David André's rules (extraction draft, 3 November 2026), with his decisions of 6 November 2026. Section numbers match the rules document.</p>
      <h3>1 · Board</h3>
      <p>
        24 rows × 16 columns (A–P), row 1 at the top. Blue attacks up toward row 1; Red attacks down toward row 24. The goal mouth spans F–K, and only shots that
        reach the goal line in G–J are on target. Each end has an 18-yard box (columns D–M, four rows deep) and, inside it, a six-yard box (columns F–K, three rows
        deep) that only the Box Keeper may enter.
      </p>
      <h3>2 · Teams and formations</h3>
      <p>
        Eleven pieces: exactly one Box Keeper and at least one Frontliner. Pick a preset or place your own pieces anywhere legal: your own half, the keeper in its
        six-yard box, nobody else in either six-yard box, and nobody from the defending side in the centre circle. The kickoff starts at the centre, on the halfway line.
      </p>
      <h3>3 · Movement</h3>
      <p>Pieces move in straight lines, orthogonal or diagonal, up to a limit set by role and direction. They cannot jump over or land on another piece, and nobody is ever removed from the board. The Box Keeper moves up to 2 squares anywhere inside its own 18-yard box.</p>
      <RoleList />
      <h3>4 · Turns</h3>
      <ul>
        <li>A turn is one piece: usually a move, then a pass or shot by the same piece if allowed.</li>
        <li>After moving, any piece may pass in its own half. Only a Connector may move and then pass anywhere. Only attacking pieces (Frontliner, Flanker, Sparker) may move and then shoot, inside the shooting zone.</li>
        <li>A carrier may also pass or shoot without moving. Moving onto a loose ball collects it.</li>
        <li>A pass or shot ends the turn. A tackle gives the winning team a fresh turn. You can end your turn at any time.</li>
        <li>Possession limit: if your team keeps the ball on the same square for 3 turns in a row (2 in ranked play and against the Master CPU), the ball must move next turn, by a dribble, pass or shot. If it does not, it goes to the nearest opponent.</li>
      </ul>
      <h3>5 · Passing</h3>
      <ul>
        <li>Straight or diagonal to a teammate, any distance.</li>
        <li>An opponent on the first square of the pass takes it. An opponent two squares away on the line intercepts it unless a teammate further down the line shields it. Opponents three or more away are ignored.</li>
        <li>Contested reception: a defender right behind the receiver, in line with the pass, wins it; so does a double-team that leaves the receiver no free, unpressured square.</li>
        <li>One-two: pass to a compatible partner, who stays put; then run (forward, backward or sideways, within normal movement) to any square in line with the partner and get the ball back. A defender on the return line intercepts it; one next to the run square can still tackle.</li>
      </ul>
      <h3>6 · Offside</h3>
      <p>As in real football: when the pass is played, a receiver is offside if it is in the opponent's half, ahead of the ball, and beyond the second-last defender (the keeper counts as one of the last two). Level is onside, and a pass from a teammate further forward is never offside. Offside is checked before anything else, and the ball goes to the defender nearest the offender.</p>
      <h3>7 · Tackling</h3>
      <ul>
        <li>Reactive: a carrier that moves next to an Anchor, Central Pillar or Defensive Flanker loses the ball.</li>
        <li>Active: a defender that moves next to the carrier wins it if its role allows: Central Pillar diagonally, or in its own half when the carrier has no clear pass; Defensive Flanker from the flank columns; Anchor in its own half or in a double-team; Connector directly in front of the carrier (in the carrier's direction of attack) in its own half, or in a double-team; Frontliner, Flanker and Sparker only in a double-team. Any two pieces trap a carrier with no safe pass and no escape.</li>
      </ul>
      <h3>8 · Shooting</h3>
      <ul>
        <li>Only from the shooting zone (shaded when you select your ball carrier).</li>
        <li>From columns G–J the shot goes straight; from outside, diagonally toward goal.</li>
        <li>The first piece on the path stops it: the keeper saves, anyone else blocks. The keeper also saves a shot passing within one square of it; anything further away goes past. A clear path ending in G–J is a goal; otherwise it is wide and the keeper restarts.</li>
        <li>Blocked shots rebound one square back (straight shots) or two squares diagonally back (diagonal shots). A loose rebound stays on its square until a piece moves onto it.</li>
      </ul>
      <h3>Ball out of play (Laws 9, 15–17)</h3>
      <ul>
        <li>A ball carrier may clear the ball off the pitch along a straight or diagonal line (the Clear button). Wide shots and rebounds can also go out.</li>
        <li><b>Throw-in</b> (over a touchline): to the other team, from where it went out. The taker must pass, up to 4 squares. Opponents keep a 1-square gap.</li>
        <li><b>Corner kick</b> (a team puts it over its own goal line): to the other team, from the corner square. Opponents keep a 2-square gap.</li>
        <li><b>Goal kick</b> (over the opponent's goal line, including a wide shot): the keeper passes from its six-yard box. Opponents leave the 18-yard box.</li>
        <li>No offside from any restart, no tackles while the ball is out of play, and a restart not taken gives the ball to the other team. Restarts can be switched off in match setup.</li>
      </ul>
      <h3>9 · Kickoff and clock</h3>
      <p>The kickoff Frontliner must pass first, and the clock starts with that pass. Two 10-minute halves (5 or 15 against the CPU). Online, each turn has a 25-second timer: run out and you forfeit the turn. Formations can change at half-time; the other team kicks off the second half.</p>
      <h3>Still to confirm</h3>
      <ul>
        <li>Pass shielding: the receiver itself does not count as the shielding teammate (question 3 was not answered).</li>
        <li>18-yard box size: columns D–M, four rows deep (scaled from a real pitch).</li>
        <li>Possession limit: what counts as "the ball moved", and the penalty for not moving it.</li>
      </ul>
    </main>
  );
}

// ------------------------------------------------------------------ online

interface OnlineSession {
  code: string;
  token: string;
  side: Side;
}

function Online({ profile, onBack, theme, kits }: { profile: Profile; onBack: () => void; theme: BoardTheme; kits: Kits }) {
  const [server, setServer] = useState<'checking' | 'up' | 'down'>('checking');
  const [session, setSession] = useState<OnlineSession | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setServer(j?.ok ? 'up' : 'down'))
      .catch(() => setServer('down'));
  }, []);

  useEffect(() => {
    if (!session) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/matches/${session.code}`);
        const j = await r.json();
        if (!stop && j.state) setState(j.state);
      } catch {
        /* keep polling */
      }
      if (!stop) setTimeout(tick, 1000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [session]);

  const call = async (url: string, body: unknown) => {
    setErr(null);
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? 'Request failed');
    return j;
  };

  if (server !== 'up')
    return (
      <main className="page">
        <BackBar title="Online" onBack={onBack} />
        <p className="note">
          {server === 'checking'
            ? 'Connecting to the match server…'
            : 'Online play needs the SYNOCHÍ match server, which this page cannot reach. Run the full project (npm run build, then npm run server) to play online with invite codes.'}
        </p>
      </main>
    );

  if (!session)
    return (
      <main className="page">
        <BackBar title="Online" onBack={onBack} />
        <div className="two-col">
          <section className="stack card">
            <h3>Create a match</h3>
            <p>You play {TEAM_NAMES.home} in your default formation ({profile.formation}). Share the code with a friend.</p>
            <button type="button" className="btn primary" onClick={() => call('/api/matches', { formation: profile.formation }).then(setSession).catch((e) => setErr(e.message))}>Create match</button>
          </section>
          <section className="stack card">
            <h3>Join with a code</h3>
            <label className="field" htmlFor="join-code">
              <span>Match code</span>
              <input id="join-code" value={joinCode} maxLength={6} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. K7Q2XM" />
            </label>
            <button type="button" className="btn primary" disabled={joinCode.length < 4} onClick={() => call(`/api/matches/${joinCode}/join`, { formation: profile.formation }).then(setSession).catch((e) => setErr(e.message))}>Join match</button>
          </section>
        </div>
        {err && <p className="error">{err}</p>}
      </main>
    );

  const send = (a: Action) =>
    call(`/api/matches/${session.code}/actions`, { token: session.token, action: a })
      .then((j) => setState(j.state))
      .catch((e) => setErr(e.message));

  return (
    <main className="page wide">
      <div className="backbar">
        <button type="button" className="btn ghost small" onClick={() => { setSession(null); setState(null); }}>← Leave</button>
        <span className="muted">Code <b className="mono">{session.code}</b> · you are {TEAM_NAMES[session.side]}</span>
      </div>
      {!state ? (
        <p className="note">Waiting for an opponent to join with code <b className="mono">{session.code}</b>…</p>
      ) : (
        <MatchView
          state={state}
          humanSides={[session.side]}
          theme={theme}
          kits={kits}
          statusNote={state.phase === 'playing' && state.turn !== session.side ? `Waiting for your opponent… (${clockText(state.clock.turnMs)} left on their turn)` : undefined}
          banner={
            state.phase === 'halftime' ? (
              <div className="result">
                <h3>Half-time</h3>
                <StatsTable state={state} />
                <button type="button" className="btn primary" onClick={() => send({ type: 'resume' })}>Start second half</button>
              </div>
            ) : state.phase === 'finished' ? (
              <div className="result"><h3>Full-time <span className="mono">{state.score.home}–{state.score.away}</span></h3><StatsTable state={state} /></div>
            ) : null
          }
          onAction={send}
        />
      )}
      {err && <p className="error">{err}</p>}
    </main>
  );
}
