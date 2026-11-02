import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DIFFICULTIES,
  FORMATIONS,
  FORMATION_NAMES,
  ROLE_NAMES,
  ROLE_STATS,
  RULES,
  SCENARIOS,
  TEAM_NAMES,
  createMatch,
  formationPieces,
  type Action,
  type Difficulty,
  type GameState,
  type Role,
  type Scenario,
  type Side,
} from '../engine';
import { Board } from './Board';
import { MatchView, useLocalMatch, type Controller } from './MatchView';
import { MATCH_REWARDS, MEDALS_PER_SCENARIO, TOKENS_PER_SCENARIO, useProfile, type Profile } from './profile';
import { AWAY_KITS, BOARD_THEMES, HOME_KITS } from './themes';

type Screen =
  | { id: 'home' }
  | { id: 'setup'; local: boolean }
  | { id: 'match'; key: number; local: boolean; difficulty: Difficulty; home: string; away: string }
  | { id: 'learn' }
  | { id: 'scenario'; scenarioId: string; key: number }
  | { id: 'formations' }
  | { id: 'locker' }
  | { id: 'rules' }
  | { id: 'online' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ id: 'home' });
  const [profile, update] = useProfile();
  const theme = BOARD_THEMES.find((t) => t.id === profile.boardTheme) ?? BOARD_THEMES[0];
  const kits = {
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
          <span title="Tactic Tokens, earned in matches">
            <b className="mono">{profile.tokens}</b> Tactic Tokens
          </span>
          <span title="Mission Medals, earned in lessons and drills">
            <b className="mono">{profile.medals}</b> Medals
          </span>
        </div>
      </header>

      {screen.id === 'home' && <Home profile={profile} go={go} />}
      {screen.id === 'setup' && (
        <Setup
          local={screen.local}
          profile={profile}
          onBack={home}
          onStart={(difficulty, h, a) => go({ id: 'match', key: Date.now(), local: screen.local, difficulty, home: h, away: a })}
        />
      )}
      {screen.id === 'match' && (
        <LocalMatch
          key={screen.key}
          local={screen.local}
          difficulty={screen.difficulty}
          home={screen.home}
          away={screen.away}
          theme={theme}
          kits={kits}
          onExit={home}
          onRematch={() => go({ ...screen, key: Date.now() })}
          onFinish={(s) => {
            if (screen.local) return;
            const gf = s.score.home;
            const ga = s.score.away;
            const res = gf > ga ? 'w' : gf === ga ? 'd' : 'l';
            const earned = (res === 'w' ? MATCH_REWARDS.win : res === 'd' ? MATCH_REWARDS.draw : MATCH_REWARDS.loss) + gf * MATCH_REWARDS.perGoal;
            update((p) => ({
              ...p,
              tokens: p.tokens + earned,
              record: { ...p.record, [res]: p.record[res] + 1, gf: p.record.gf + gf, ga: p.record.ga + ga },
            }));
            return earned;
          }}
        />
      )}
      {screen.id === 'learn' && <Learn profile={profile} onBack={home} onPick={(id) => go({ id: 'scenario', scenarioId: id, key: Date.now() })} />}
      {screen.id === 'scenario' && (
        <ScenarioRun
          key={screen.key}
          scenario={SCENARIOS.find((s) => s.id === screen.scenarioId)!}
          theme={theme}
          kits={kits}
          onExit={() => go({ id: 'learn' })}
          onRetry={() => go({ ...screen, key: Date.now() })}
          onNext={(id) => go({ id: 'scenario', scenarioId: id, key: Date.now() })}
          onSuccess={(id) =>
            update((p) =>
              p.completed.includes(id)
                ? p
                : { ...p, completed: [...p.completed, id], medals: p.medals + MEDALS_PER_SCENARIO, tokens: p.tokens + TOKENS_PER_SCENARIO },
            )
          }
        />
      )}
      {screen.id === 'formations' && <Formations profile={profile} update={update} onBack={home} theme={theme} kits={kits} />}
      {screen.id === 'locker' && <Locker profile={profile} update={update} onBack={home} />}
      {screen.id === 'rules' && <RulesPage onBack={home} />}
      {screen.id === 'online' && <Online profile={profile} onBack={home} theme={theme} kits={kits} />}

      <footer className="foot">
        SYNOCHÍ™ by David André · The World's Game On Board™ · v0.1 web build. Rules are provisional until the official rulebook is plugged in.
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ home

function Home({ profile, go }: { profile: Profile; go: (s: Screen) => void }) {
  const lessons = SCENARIOS.filter((s) => s.kind === 'lesson');
  const done = lessons.filter((l) => profile.completed.includes(l.id)).length;
  const r = profile.record;
  const preview = useMemo(() => createMatch({ homeFormation: profile.formation, awayFormation: '4-4-2' }), [profile.formation]);
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
            Football as pure strategy. Twenty-two pieces, a 16 × 24 pitch and three actions a turn. Nothing is left to chance:
            every pass, tackle and shot resolves the same way every time, so the better plan wins.
          </p>
          <div className="cta-row">
            <button type="button" className="btn primary big" onClick={() => go({ id: 'setup', local: false })}>
              Play vs CPU
            </button>
            {done < lessons.length && (
              <button type="button" className="btn ghost big" onClick={() => go({ id: 'learn' })}>
                {done === 0 ? 'Learn in 7 lessons' : `Continue lessons (${done}/${lessons.length})`}
              </button>
            )}
          </div>
          <p className="record mono">
            Record {r.w}W {r.d}D {r.l}L · Goals {r.gf}–{r.ga}
          </p>
        </div>
        <div className="hero-board" aria-hidden="true">
          <Board state={preview} theme={BOARD_THEMES[0]} kits={{ home: HOME_KITS[0], away: AWAY_KITS[0] }} />
        </div>
      </section>

      <nav className="menu" aria-label="Main menu">
        <MenuTile title="Play vs CPU" body="Rookie, Pro or Legend. Earn Tactic Tokens." onClick={() => go({ id: 'setup', local: false })} />
        <MenuTile title="Local match" body="Two players, one device. Pass and play." onClick={() => go({ id: 'setup', local: true })} />
        <MenuTile title="Online" body="Invite a friend with a match code." onClick={() => go({ id: 'online' })} />
        <MenuTile title="Learn & practise" body={`${lessons.length} lessons and ${SCENARIOS.length - lessons.length} drills. Earn Medals.`} onClick={() => go({ id: 'learn' })} />
        <MenuTile title="Formations" body={`${FORMATION_NAMES.length} shapes. Set your default.`} onClick={() => go({ id: 'formations' })} />
        <MenuTile title="Locker" body="Board themes and kits. Cosmetic only." onClick={() => go({ id: 'locker' })} />
        <MenuTile title="Rules" body="Every rule and role stat in one place." onClick={() => go({ id: 'rules' })} />
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
      <button type="button" className="btn ghost small" onClick={onBack}>
        ← Back
      </button>
      <h2>{title}</h2>
    </div>
  );
}

// ------------------------------------------------------------------ match setup

function Setup({ local, profile, onBack, onStart }: { local: boolean; profile: Profile; onBack: () => void; onStart: (d: Difficulty, h: string, a: string) => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('pro');
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
      <div className="two-col">
        <FormationPicker label={`${TEAM_NAMES.home} formation${local ? '' : ' (you)'}`} value={h} onChange={setH} id="fh" />
        <FormationPicker label={`${TEAM_NAMES.away} formation${local ? '' : ' (CPU)'}`} value={a} onChange={setA} id="fa" />
      </div>
      <p className="note">
        A match is two halves of {RULES.turnsPerHalf / 2} turns per side. {TEAM_NAMES.home} kick off and attack downward.
      </p>
      <button type="button" className="btn primary big" onClick={() => onStart(difficulty, h, a)}>
        Kick off
      </button>
    </main>
  );
}

function FormationPicker({ label, value, onChange, id }: { label: string; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {FORMATION_NAMES.map((f) => (
          <option key={f}>{f}</option>
        ))}
      </select>
    </label>
  );
}

// ------------------------------------------------------------------ local match

function LocalMatch({
  local,
  difficulty,
  home,
  away,
  theme,
  kits,
  onExit,
  onRematch,
  onFinish,
}: {
  local: boolean;
  difficulty: Difficulty;
  home: string;
  away: string;
  theme: (typeof BOARD_THEMES)[number];
  kits: { home: (typeof HOME_KITS)[number]; away: (typeof AWAY_KITS)[number] };
  onExit: () => void;
  onRematch: () => void;
  onFinish: (s: GameState) => number | void;
}) {
  const initial = useMemo(() => createMatch({ homeFormation: home, awayFormation: away }), [home, away]);
  const controllers: Record<Side, Controller> = { home: 'human', away: local ? 'human' : difficulty };
  const { state, act, cpuThinking } = useLocalMatch(initial, controllers);
  const [earned, setEarned] = useState<number | null>(null);
  const reported = useRef(false);
  useEffect(() => {
    if (state.phase === 'finished' && !reported.current) {
      reported.current = true;
      const e = onFinish(state);
      if (typeof e === 'number') setEarned(e);
    }
  }, [state, onFinish]);

  const result =
    state.phase === 'finished' ? (
      <div className="result">
        <h3>
          {state.score.home > state.score.away
            ? `${TEAM_NAMES.home} win`
            : state.score.home < state.score.away
              ? `${TEAM_NAMES.away} win`
              : 'Draw'}{' '}
          <span className="mono">
            {state.score.home}–{state.score.away}
          </span>
        </h3>
        {earned !== null && <p>+{earned} Tactic Tokens</p>}
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
          {local ? 'Local match' : `vs CPU · ${DIFFICULTIES[difficulty].label}`} · {home} v {away}
        </span>
      </div>
      <MatchView
        state={state}
        onAction={act}
        humanSides={local ? ['home', 'away'] : ['home']}
        busy={cpuThinking}
        theme={theme}
        kits={kits}
        banner={result}
      />
    </main>
  );
}

// ------------------------------------------------------------------ learn

function Learn({ profile, onBack, onPick }: { profile: Profile; onBack: () => void; onPick: (id: string) => void }) {
  const groups: [string, Scenario[]][] = [
    ['Lessons', SCENARIOS.filter((s) => s.kind === 'lesson')],
    ['Practice drills', SCENARIOS.filter((s) => s.kind === 'drill')],
  ];
  return (
    <main className="page">
      <BackBar title="Learn & practise" onBack={onBack} />
      {groups.map(([title, list]) => (
        <section key={title} className="stack">
          <h3 className="eyebrow">{title}</h3>
          <div className="list">
            {list.map((s) => {
              const done = profile.completed.includes(s.id);
              return (
                <button type="button" key={s.id} className={`list-item ${done ? 'done' : ''}`} onClick={() => onPick(s.id)}>
                  <span className="status" aria-label={done ? 'Completed' : 'Not completed'}>{done ? '✓' : ''}</span>
                  <span className="li-body">
                    <strong>{s.title}</strong>
                    <span>{s.objective}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}

function ScenarioRun({
  scenario,
  theme,
  kits,
  onExit,
  onRetry,
  onNext,
  onSuccess,
}: {
  scenario: Scenario;
  theme: (typeof BOARD_THEMES)[number];
  kits: { home: (typeof HOME_KITS)[number]; away: (typeof AWAY_KITS)[number] };
  onExit: () => void;
  onRetry: () => void;
  onNext: (id: string) => void;
  onSuccess: (id: string) => void;
}) {
  const initial = useMemo(() => scenario.setup(), [scenario]);
  const [outcome, setOutcome] = useState<'success' | 'fail' | null>(null);
  const controllers: Record<Side, Controller> = { home: 'human', away: outcome ? 'human' : scenario.opponent };
  const { state, act, cpuThinking } = useLocalMatch(initial, controllers);

  const homeTurnsDone = initial.turn === 'home' ? Math.ceil(state.turnsPlayed / 2) : Math.floor(state.turnsPlayed / 2);
  const turnsLeft = Math.max(0, scenario.maxTurns - homeTurnsDone);

  useEffect(() => {
    if (outcome) return;
    if (scenario.success(state)) {
      setOutcome('success');
      onSuccess(scenario.id);
    } else if (scenario.fail?.(state)) setOutcome('fail');
    else if (homeTurnsDone >= scenario.maxTurns) {
      if (scenario.winOnTimeout) {
        setOutcome('success');
        onSuccess(scenario.id);
      } else setOutcome('fail');
    }
  }, [state, outcome, scenario, homeTurnsDone, onSuccess]);

  const idx = SCENARIOS.findIndex((s) => s.id === scenario.id);
  const next = SCENARIOS[idx + 1];

  const banner = (
    <div className="lesson">
      <div className="lesson-head">
        <h3>{scenario.title}</h3>
        <span className="pill">{outcome ? (outcome === 'success' ? 'Complete' : 'Try again') : `${turnsLeft} turn${turnsLeft === 1 ? '' : 's'} left`}</span>
      </div>
      <p>{scenario.brief}</p>
      <p className="objective">
        <b>Objective:</b> {scenario.objective}
      </p>
      <ul>
        {scenario.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {outcome && (
        <div className={`result ${outcome}`}>
          <h3>{outcome === 'success' ? 'Well played!' : 'Not this time'}</h3>
          {outcome === 'success' && <p>+{MEDALS_PER_SCENARIO} Medal · +{TOKENS_PER_SCENARIO} Tactic Tokens (first clear only)</p>}
          <div className="row">
            {outcome === 'success' && next && (
              <button type="button" className="btn primary" onClick={() => onNext(next.id)}>Next: {next.title}</button>
            )}
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
        onAction={(a: Action) => !outcome && act(a)}
        humanSides={outcome ? [] : ['home']}
        busy={cpuThinking}
        theme={theme}
        kits={kits}
        banner={banner}
      />
    </main>
  );
}

// ------------------------------------------------------------------ formations

function Formations({
  profile,
  update,
  onBack,
  theme,
  kits,
}: {
  profile: Profile;
  update: (fn: (p: Profile) => Profile) => void;
  onBack: () => void;
  theme: (typeof BOARD_THEMES)[number];
  kits: { home: (typeof HOME_KITS)[number]; away: (typeof AWAY_KITS)[number] };
}) {
  const [f, setF] = useState(profile.formation);
  const state = useMemo<GameState>(() => {
    const s = createMatch({ homeFormation: f, awayFormation: f });
    return { ...s, pieces: formationPieces('home', f), ball: { pos: { c: 7, r: 11 }, carrier: null } };
  }, [f]);
  const counts = FORMATIONS[f].reduce<Record<string, number>>((acc, [r]) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});
  return (
    <main className="page">
      <BackBar title="Formations" onBack={onBack} />
      <div className="seg" role="tablist" aria-label="Formation">
        {FORMATION_NAMES.map((n) => (
          <button key={n} type="button" role="tab" aria-selected={n === f} className={n === f ? 'active' : ''} onClick={() => setF(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="formation-view">
        <div className="mini-board">
          <Board state={state} theme={theme} kits={kits} />
        </div>
        <div className="stack">
          <p className="mono">
            {Object.entries(counts)
              .map(([r, n]) => `${n}× ${r}`)
              .join(' · ')}
          </p>
          <button
            type="button"
            className="btn primary"
            disabled={profile.formation === f}
            onClick={() => update((p) => ({ ...p, formation: f }))}
          >
            {profile.formation === f ? 'Your default formation' : `Set ${f} as default`}
          </button>
          <RoleTable />
        </div>
      </div>
    </main>
  );
}

function RoleTable() {
  return (
    <div className="table-wrap">
      <table className="roles">
        <thead>
          <tr>
            <th>Role</th>
            <th>Move</th>
            <th>Pass</th>
            <th>Shot</th>
            <th>Tackle</th>
            <th>Control</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(ROLE_STATS) as Role[]).map((r) => (
            <tr key={r}>
              <th>
                <span className="mono">{r}</span> {ROLE_NAMES[r]}
              </th>
              <td>{ROLE_STATS[r].move}</td>
              <td>{ROLE_STATS[r].pass}</td>
              <td>{ROLE_STATS[r].shot}</td>
              <td>{ROLE_STATS[r].tackle}</td>
              <td>{ROLE_STATS[r].control}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ locker

function Locker({ profile, update, onBack }: { profile: Profile; update: (fn: (p: Profile) => Profile) => void; onBack: () => void }) {
  const sections = [
    { title: 'Board themes', items: BOARD_THEMES, field: 'boardTheme' as const, swatch: (i: (typeof BOARD_THEMES)[number]) => `linear-gradient(135deg, ${i.grassA} 0 50%, ${i.frame} 50%)` },
    { title: `${TEAM_NAMES.home} kits`, items: HOME_KITS, field: 'homeKit' as const, swatch: (i: (typeof HOME_KITS)[number]) => i.fill },
    { title: `${TEAM_NAMES.away} kits`, items: AWAY_KITS, field: 'awayKit' as const, swatch: (i: (typeof AWAY_KITS)[number]) => i.fill },
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
              const afford = profile.tokens >= item.price;
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
                      disabled={!afford}
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
      <section className="stack founders">
        <h3 className="eyebrow">Founder's Edition</h3>
        <p>
          A one-off pack for early supporters: exclusive Gold Edition board, founder crest and all launch kits. Purchases open with the App
          Store and Google Play release (in-app billing) and the web store (Stripe). No purchase is possible in this build.
        </p>
      </section>
    </main>
  );
}

// ------------------------------------------------------------------ rules

function RulesPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="page prose">
      <BackBar title="How to play" onBack={onBack} />
      <p className="note">
        Provisional rule set for this build. Every number below comes from the engine's single rules file, so the official SYNOCHÍ rulebook can replace
        them without touching the rest of the game.
      </p>
      <h3>The board and the teams</h3>
      <p>
        The pitch is {RULES.cols} columns (A–P) by {RULES.rows} rows. Each side fields eleven pieces in a chosen formation. {TEAM_NAMES.home} defend
        row 1 and attack row {RULES.rows}; {TEAM_NAMES.away} the reverse. The goal mouth is columns G–J.
      </p>
      <h3>Turns</h3>
      <p>
        Each turn you get {RULES.actionsPerTurn} actions. A match is two halves of {RULES.turnsPerHalf / 2} turns per side. Losing the ball (an
        interception, a blocked or saved shot) ends your turn immediately.
      </p>
      <h3>Actions</h3>
      <ul>
        <li><b>Move</b> (1 action): step like a chess king, up to the piece's Move value, around other pieces. Each piece moves once per turn. The ball carrier dribbles {RULES.dribblePenalty} cell less. Reaching a loose ball collects it.</li>
        <li><b>Pass</b> (1 action): up to the carrier's Pass range. Passes of {RULES.groundPassMax} cells or fewer go along the ground and are intercepted by the first opponent on the line. Longer passes are lofted: they fly over pieces, but an opponent next to the landing cell wins the ball if their Tackle beats the receiver's Control (an empty cell counts as Control {RULES.spaceControl}).</li>
        <li><b>Shoot</b> (1 action): aim at a goal-mouth cell within {RULES.maxShotDistance}. Any outfield opponent on the line blocks the shot. Shot power is the shooter's Shot, minus 1 for each {RULES.shotFalloff} cells beyond the first. The keeper covers targets within {RULES.keeperReach} cells, with Save reduced by 1 for each cell beyond the first (+1 if standing on the line of the shot). Power must beat Save to score.</li>
        <li><b>Tackle</b> (1 action): a piece next to the ball carrier compares Tackle + 1 per teammate next to the carrier against the carrier's Control + 1 per teammate beside them. Higher wins; ties go to the carrier. Each piece can tackle once per turn.</li>
        <li><b>One-two</b> ({RULES.oneTwoCost} actions): pass to a teammate within {RULES.groundPassMax}, run, and receive the return pass. Both passes can be intercepted.</li>
      </ul>
      <h3>Goalkeepers</h3>
      <p>Keepers must stay inside their own penalty area (columns D–M, {RULES.boxDepth} rows deep).</p>
      <h3>Goals and restarts</h3>
      <p>After a goal both teams reset to their formations and the side that conceded kicks off. The second half is kicked off by the team that did not start the first.</p>
      <h3>No luck</h3>
      <p>There are no dice and no hidden information. The preview always shows exactly what an action will do, so every result comes down to your plan.</p>
      <h3>Roles</h3>
      <RoleTable />
    </main>
  );
}

// ------------------------------------------------------------------ online

interface OnlineSession {
  code: string;
  token: string;
  side: Side;
}

function Online({ profile, onBack, theme, kits }: { profile: Profile; onBack: () => void; theme: (typeof BOARD_THEMES)[number]; kits: { home: (typeof HOME_KITS)[number]; away: (typeof AWAY_KITS)[number] } }) {
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
            : 'Online play needs the SYNOCHÍ match server, which is not reachable from this page. Run the full project (npm run build, then npm run server) to play online with invite codes.'}
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
            <button type="button" className="btn primary" onClick={() => call('/api/matches', { formation: profile.formation }).then(setSession).catch((e) => setErr(e.message))}>
              Create match
            </button>
          </section>
          <section className="stack card">
            <h3>Join with a code</h3>
            <label className="field" htmlFor="join-code">
              <span>Match code</span>
              <input id="join-code" value={joinCode} maxLength={6} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. K7Q2XM" />
            </label>
            <button type="button" className="btn primary" disabled={joinCode.length < 4} onClick={() => call(`/api/matches/${joinCode}/join`, { formation: profile.formation }).then(setSession).catch((e) => setErr(e.message))}>
              Join match
            </button>
          </section>
        </div>
        {err && <p className="error">{err}</p>}
      </main>
    );

  return (
    <main className="page wide">
      <div className="backbar">
        <button type="button" className="btn ghost small" onClick={() => { setSession(null); setState(null); }}>← Leave</button>
        <span className="muted">
          Code <b className="mono">{session.code}</b> · you are {TEAM_NAMES[session.side]}
        </span>
      </div>
      {!state ? (
        <p className="note">Waiting for an opponent to join with code <b className="mono">{session.code}</b>…</p>
      ) : (
        <MatchView
          state={state}
          humanSides={[session.side]}
          theme={theme}
          kits={kits}
          statusNote={state.turn !== session.side && state.phase === 'playing' ? 'Waiting for your opponent…' : undefined}
          onAction={(a) => {
            call(`/api/matches/${session.code}/actions`, { token: session.token, action: a })
              .then((j) => setState(j.state))
              .catch((e) => setErr(e.message));
          }}
        />
      )}
      {err && <p className="error">{err}</p>}
    </main>
  );
}
