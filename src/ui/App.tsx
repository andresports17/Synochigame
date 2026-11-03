import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DIFFICULTIES,
  FORMATIONS,
  FORMATION_NAMES,
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
  getPiece,
  isOffside,
  judge,
  offsideLine,
  questionArrow,
  shotOutcome,
  type Action,
  type Difficulty,
  type GameState,
  type Role,
  type Scenario,
  type Side,
} from '../engine';
import { Board } from './Board';
import { MatchView, StatsTable, useLocalMatch, type ClockMode, type Controller } from './MatchView';
import { MATCH_REWARDS, MEDALS_PER_SCENARIO, TOKENS_PER_SCENARIO, useProfile, type Profile } from './profile';
import { AWAY_KITS, BOARD_THEMES, HOME_KITS, type BoardTheme, type Kit } from './themes';

type Kits = { home: Kit; away: Kit };

type Screen =
  | { id: 'home' }
  | { id: 'setup'; local: boolean }
  | { id: 'match'; key: number; local: boolean; difficulty: Difficulty; home: string; away: string; clock: ClockMode }
  | { id: 'learn' }
  | { id: 'lesson'; scenarioId: string; key: number }
  | { id: 'quiz'; key: number }
  | { id: 'formations' }
  | { id: 'locker' }
  | { id: 'rules' }
  | { id: 'online' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ id: 'home' });
  const [profile, update] = useProfile();
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
        <div className="wallet" aria-label="Your currencies">
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
          onStart={(difficulty, h, a, clock) => go({ id: 'match', key: Date.now(), local: screen.local, difficulty, home: h, away: a, clock })}
        />
      )}
      {screen.id === 'match' && (
        <LocalMatch
          key={screen.key}
          local={screen.local}
          difficulty={screen.difficulty}
          home={screen.home}
          away={screen.away}
          clock={screen.clock}
          theme={theme}
          kits={kits}
          onExit={home}
          onRematch={() => go({ ...screen, key: Date.now() })}
          onFinish={(s) => {
            if (screen.local) return;
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
            return earned;
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
          onSuccess={(id) =>
            update((p) =>
              p.completed.includes(id) ? p : { ...p, completed: [...p.completed, id], medals: p.medals + MEDALS_PER_SCENARIO, tokens: p.tokens + TOKENS_PER_SCENARIO },
            )
          }
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
          onPass={() => update((p) => (p.completed.includes('refs-eye') ? p : { ...p, completed: [...p.completed, 'refs-eye'], medals: p.medals + 3, tokens: p.tokens + 60 }))}
        />
      )}
      {screen.id === 'formations' && <Formations profile={profile} update={update} onBack={home} theme={theme} kits={kits} />}
      {screen.id === 'locker' && <Locker profile={profile} update={update} onBack={home} />}
      {screen.id === 'rules' && <RulesPage onBack={home} />}
      {screen.id === 'online' && <Online profile={profile} onBack={home} theme={theme} kits={kits} />}

      <footer className="foot">
        SYNOCHÍ™ by David André · The World's Game On Board™ · Official rules (extraction draft, 3 Nov 2026). Points marked for confirmation are listed on the Rules page.
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ home

function Home({ profile, go }: { profile: Profile; go: (s: Screen) => void }) {
  const done = SCENARIOS.filter((l) => profile.completed.includes(l.id)).length;
  const r = profile.record;
  const preview = useMemo(() => createMatch({ homeFormation: profile.formation, awayFormation: '4-4-2', timed: false }), [profile.formation]);
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

function Setup({ local, profile, onBack, onStart }: { local: boolean; profile: Profile; onBack: () => void; onStart: (d: Difficulty, h: string, a: string, clock: ClockMode) => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('baller');
  const [clock, setClock] = useState<ClockMode>('realtime');
  const [h, setH] = useState(profile.formation);
  const [a, setA] = useState('4-4-2');
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
              <span>{DIFFICULTIES[d].blurb}</span>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="choices">
        <legend>Clock</legend>
        {(
          [
            ['realtime', 'Official clock', 'Two 5-minute halves in real time, 25 seconds per turn. Run out and you forfeit the turn.'],
            ['relaxed', 'Relaxed', 'No turn timer. Each turn uses 6 seconds of the match clock, so you can think.'],
          ] as [ClockMode, string, string][]
        ).map(([m, label, blurb]) => (
          <label key={m} className={`choice ${m === clock ? 'on' : ''}`}>
            <input type="radio" name="clock" id={`clock-${m}`} checked={m === clock} onChange={() => setClock(m)} />
            <strong>{label}</strong>
            <span>{blurb}</span>
          </label>
        ))}
      </fieldset>
      <div className="two-col">
        <FormationPicker label={`${TEAM_NAMES.home} formation${local ? '' : ' (you)'}`} value={h} onChange={setH} id="fh" />
        <FormationPicker label={`${TEAM_NAMES.away} formation${local ? '' : ' (CPU)'}`} value={a} onChange={setA} id="fa" />
      </div>
      <p className="note">{TEAM_NAMES.home} kick off and attack up the board. Formations can be changed at half-time.</p>
      <button type="button" className="btn primary big" onClick={() => onStart(difficulty, h, a, clock)}>Kick off</button>
    </main>
  );
}

function FormationPicker({ label, value, onChange, id }: { label: string; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {FORMATION_NAMES.map((f) => (
          <option key={f} value={f}>{f} · {FORMATIONS[f].blurb}</option>
        ))}
      </select>
    </label>
  );
}

// ------------------------------------------------------------------ match

function LocalMatch({
  local, difficulty, home, away, clock, theme, kits, onExit, onRematch, onFinish,
}: {
  local: boolean; difficulty: Difficulty; home: string; away: string; clock: ClockMode; theme: BoardTheme; kits: Kits;
  onExit: () => void; onRematch: () => void; onFinish: (s: GameState) => number | void;
}) {
  const initial = useMemo(() => createMatch({ homeFormation: home, awayFormation: away }), [home, away]);
  const controllers: Record<Side, Controller> = { home: 'human', away: local ? 'human' : difficulty };
  const { state, dispatch, cpuThinking, paused, setPaused } = useLocalMatch(initial, controllers, clock);
  const [earned, setEarned] = useState<number | null>(null);
  const [htHome, setHtHome] = useState(home);
  const [htAway, setHtAway] = useState(away);
  const reported = useRef(false);
  useEffect(() => {
    if (state.phase === 'finished' && !reported.current) {
      reported.current = true;
      const e = onFinish(state);
      if (typeof e === 'number') setEarned(e);
    }
  }, [state, onFinish]);

  const banner =
    state.phase === 'halftime' ? (
      <div className="result">
        <h3>Half-time <span className="mono">{state.score.home}–{state.score.away}</span></h3>
        <StatsTable state={state} />
        <FormationPicker label={`${TEAM_NAMES.home} formation`} value={htHome} onChange={setHtHome} id="ht-home" />
        {local && <FormationPicker label={`${TEAM_NAMES.away} formation`} value={htAway} onChange={setHtAway} id="ht-away" />}
        <button type="button" className="btn primary" onClick={() => dispatch({ type: 'resume', homeFormation: htHome, awayFormation: local ? htAway : undefined })}>
          Start second half
        </button>
      </div>
    ) : state.phase === 'finished' ? (
      <div className="result">
        <h3>
          {state.score.home > state.score.away ? `${TEAM_NAMES.home} win` : state.score.home < state.score.away ? `${TEAM_NAMES.away} win` : 'Draw'}{' '}
          <span className="mono">{state.score.home}–{state.score.away}</span>
        </h3>
        {earned !== null && <p>+{earned} Tactic Tokens · +{state.score.home} Gold Boots</p>}
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
          {local ? 'Local match' : `vs CPU · ${DIFFICULTIES[difficulty].label}`} · {clock === 'realtime' ? 'Official clock' : 'Relaxed'} · {state.formations.home} v {state.formations.away}
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
        clockMode={clock}
        controls={
          state.phase === 'playing' && clock === 'realtime' ? (
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
  scenario: Scenario; theme: BoardTheme; kits: Kits; onExit: () => void; onRetry: () => void; onNext: (id: string) => void; onSuccess: (id: string) => void;
}) {
  const initial = useMemo(() => scenario.setup(), [scenario]);
  const [outcome, setOutcome] = useState<'success' | 'fail' | null>(null);
  const controllers: Record<Side, Controller> = { home: 'human', away: outcome ? 'human' : scenario.opponent };
  const { state, dispatch, cpuThinking } = useLocalMatch(initial, controllers, 'relaxed');
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
      onSuccess(scenario.id);
    } else if (scenario.fail?.(state) || blueTurns.current >= scenario.maxTurns) setOutcome('fail');
  }, [state, outcome, scenario, onSuccess]);

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
          {outcome === 'success' && <p>+{MEDALS_PER_SCENARIO} Medal · +{TOKENS_PER_SCENARIO} Tactic Tokens (first clear only)</p>}
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
        clockMode="relaxed"
      />
    </main>
  );
}

// ------------------------------------------------------------------ Ref's Eye

const REFS_PASS = 11;

function RefsEye({ theme, kits, passed, onBack, onRetry, onPass }: { theme: BoardTheme; kits: Kits; passed: boolean; onBack: () => void; onRetry: () => void; onPass: () => void }) {
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
    if (opt === verdict.call) setScore((n) => n + 1);
  };
  const next = () => {
    if (i + 1 < QUIZ.length) {
      setI(i + 1);
      setAnswer(null);
    } else {
      setDone(true);
      if (score >= REFS_PASS) onPass();
    }
  };

  if (done)
    return (
      <main className="page">
        <BackBar title="Ref's Eye" onBack={onBack} />
        <div className={`result ${score >= REFS_PASS ? 'success' : 'fail'}`}>
          <h3>{score} / {QUIZ.length} correct calls</h3>
          <p>{score >= REFS_PASS ? (passed ? 'Passed again. Sharp eyes.' : 'Passed! +3 Medals, +60 Tactic Tokens') : `Score ${REFS_PASS} or more to pass.`}</p>
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
  const [f, setF] = useState(profile.formation);
  const state = useMemo(() => ({ pieces: formationPieces('home', f), ball: { pos: KICKOFF_SPOT.home, carrier: null } }), [f]);
  const counts = FORMATIONS[f].slots.reduce<Record<string, number>>((acc, [r]) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});
  return (
    <main className="page">
      <BackBar title="Formations" onBack={onBack} />
      <div className="seg" role="tablist" aria-label="Formation">
        {FORMATION_NAMES.map((n) => (
          <button key={n} type="button" role="tab" aria-selected={n === f} className={n === f ? 'active' : ''} onClick={() => setF(n)}>{n}</button>
        ))}
      </div>
      <div className="formation-view">
        <div className="mini-board"><Board state={state} theme={theme} kits={kits} /></div>
        <div className="stack">
          <p>{FORMATIONS[f].blurb}</p>
          <p className="mono">{Object.entries(counts).map(([r, n]) => `${n}× ${ROLE_NAMES[r as Role]}`).join(' · ')}</p>
          <button type="button" className="btn primary" disabled={profile.formation === f} onClick={() => update((p) => ({ ...p, formation: f }))}>
            {profile.formation === f ? 'Your default formation' : `Set ${f} as default`}
          </button>
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

function Locker({ profile, update, onBack }: { profile: Profile; update: (fn: (p: Profile) => Profile) => void; onBack: () => void }) {
  const sections = [
    { title: 'Board themes', items: BOARD_THEMES, field: 'boardTheme' as const, swatch: (i: (typeof BOARD_THEMES)[number]) => `linear-gradient(135deg, ${i.grassA} 0 50%, ${i.frame} 50%)` },
    { title: `${TEAM_NAMES.home} kits`, items: HOME_KITS, field: 'homeKit' as const, swatch: (i: Kit) => i.fill },
    { title: `${TEAM_NAMES.away} kits`, items: AWAY_KITS, field: 'awayKit' as const, swatch: (i: Kit) => i.fill },
  ];
  return (
    <main className="page">
      <BackBar title="Locker" onBack={onBack} />
      <p className="note">Everything here is cosmetic. Nothing you unlock changes how pieces play.</p>
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
                      onClick={() => update((p) => ({ ...p, tokens: p.tokens - item.price, owned: [...p.owned, item.id], [sec.field]: item.id }))}
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
      <p className="note">From David André's rules (extraction draft, 3 November 2026). Section numbers match that document.</p>
      <h3>1 · Board</h3>
      <p>24 rows × 16 columns (A–P). Blue attacks up toward row 1; Red attacks down toward row 24. The goal mouth spans F–K, and only shots that reach the goal line in G–J are on target. Each end has a six-yard box (columns F–K, three rows deep) that only the Box Keeper may enter.</p>
      <h3>2 · Teams and formations</h3>
      <p>Eleven pieces: exactly one Box Keeper and at least one Frontliner. Everyone starts in their own half; the keeper inside its six-yard box; nobody else in either six-yard box, and the defending side out of the centre circle.</p>
      <h3>3 · Movement</h3>
      <p>Pieces move in straight lines, orthogonal or diagonal, up to a limit set by role and direction. They cannot jump over or land on another piece, and nobody is ever removed from the board.</p>
      <RoleList />
      <h3>4 · Turns</h3>
      <ul>
        <li>A turn is one piece: usually a move, then a pass or shot by the same piece if allowed.</li>
        <li>After moving, a ball carrier may pass if it ends in its own half or the shooting zone, and shoot if it ends in the shooting zone. A Connector may pass after moving from anywhere. A Sparker may not move and then shoot.</li>
        <li>A carrier may also pass or shoot without moving. Moving onto a loose ball collects it.</li>
        <li>A pass or shot ends the turn. A tackle gives the winning team a fresh turn.</li>
      </ul>
      <h3>5 · Passing</h3>
      <ul>
        <li>Straight or diagonal to a teammate, any distance.</li>
        <li>An opponent on the first square of the pass takes it. An opponent two squares away on the line intercepts it unless a teammate further down the line shields it. Opponents three or more away are ignored.</li>
        <li>Contested reception: a defender right behind the receiver, in line with the pass, wins it; so does a double-team that leaves the receiver no free, unpressured square.</li>
        <li>One-two: with a compatible partner, the passer runs automatically onto the receiver's row and gets the ball back.</li>
      </ul>
      <h3>6 · Offside</h3>
      <p>When the pass is played, a receiver is offside if it is in the opponent's half, ahead of the ball, and beyond the last outfield defender. Level is onside. The Box Keeper does not count. The ball goes to the defender nearest the offender.</p>
      <h3>7 · Tackling</h3>
      <ul>
        <li>Reactive: a carrier that moves next to an Anchor, Central Pillar or Defensive Flanker loses the ball.</li>
        <li>Active: a defender that moves next to the carrier wins it if its role allows: Central Pillar diagonally, or in its own half when the carrier has no clear pass; Defensive Flanker from the flank columns; Anchor in its own half or in a double-team; Connector directly in front in its own half, or in a double-team; Frontliner, Flanker and Sparker only in a double-team. Any two pieces trap a carrier with no safe pass and no escape.</li>
      </ul>
      <h3>8 · Shooting</h3>
      <ul>
        <li>Only from the shooting zone (shaded when you select your ball carrier).</li>
        <li>From columns G–J the shot goes straight; from outside, diagonally toward goal.</li>
        <li>The first piece on the path stops it: the keeper saves, anyone else blocks. A keeper within one square of the path also saves. A clear path ending in G–J is a goal; otherwise it is wide and the keeper restarts.</li>
        <li>Blocked shots rebound one square back (straight shots) or two squares diagonally back (diagonal shots).</li>
      </ul>
      <h3>9 · Kickoff and clock</h3>
      <p>The kickoff Frontliner must pass first. Two five-minute halves in real time, starting from the opening pass, and 25 seconds per turn. Run out of time and you forfeit the turn. Formations can change at half-time; the other team kicks off the second half.</p>
      <h3>Awaiting David's confirmation</h3>
      <ul>
        <li>Row numbering: here row 1 is the top of the board (Red's goal line).</li>
        <li>Kickoff squares: H13 for Blue and I12 for Red.</li>
        <li>Pass shielding: the receiver itself does not count as the shielding teammate.</li>
        <li>One-two run square: the legal square on the receiver's row nearest the passer's column; the return pass is cut out by a defender on the lane or next to the run square.</li>
        <li>Connector front tackle: the square directly ahead of the carrier, for both teams.</li>
        <li>Loose rebounds go to the nearest piece, defenders first on a tie. The turn timer does not run during a kickoff.</li>
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
