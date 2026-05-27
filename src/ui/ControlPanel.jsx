import React from 'react'
import useBenchStore, {
  ANIM_STATES, ANIM_SEQUENCE, OBJECT_TYPES, KR210_MAX_REACH, KR210_MIN_REACH,
} from '../store/useBenchStore.js'
import './ControlPanel.css'

const PHASE_LABELS = {
  [ANIM_STATES.APPROACH_START]: 'APPROACH',
  [ANIM_STATES.DESCEND_START]:  'DESCEND',
  [ANIM_STATES.GRAB]:           'GRAB',
  [ANIM_STATES.ASCEND]:         'LIFT',
  [ANIM_STATES.TRANSPORT]:      'CARRY',
  [ANIM_STATES.DESCEND_END]:    'PLACE',
  [ANIM_STATES.RELEASE]:        'RELEASE',
  [ANIM_STATES.ASCEND_END]:     'RETRACT',
}

const LOG_COLORS = { ok: '#10b981', error: '#ef4444', info: '#7b8693', warn: '#f59e0b' }

// ── Robot type icons (SVG-style text) ─────────────────────────────────────
const ROBOT_ICONS = {
  kuka:   <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <rect x="11" y="4" width="6" height="4" rx="1" fill="#ff6000"/>
    <rect x="13" y="8" width="2" height="10" fill="#ff6000"/>
    <line x1="14" y1="8" x2="8" y2="14" stroke="#ff6000" strokeWidth="2" strokeLinecap="round"/>
    <line x1="8" y1="14" x2="6" y2="19" stroke="#ff6000" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="14" cy="22" r="3" fill="none" stroke="#ff6000" strokeWidth="1.5"/>
    <circle cx="14" cy="22" r="1" fill="#ff6000"/>
  </svg>,
  gantry: <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <rect x="4" y="6" width="20" height="3" rx="1" fill="#ff6000"/>
    <rect x="5" y="9" width="2" height="14" fill="#ff6000"/>
    <rect x="21" y="9" width="2" height="14" fill="#ff6000"/>
    <rect x="12" y="9" width="4" height="8" rx="1" fill="#ff6000"/>
    <rect x="13" y="17" width="2" height="5" fill="#ff6000"/>
  </svg>,
}

// ── Phase timeline ────────────────────────────────────────────────────────
function PhasePipeline({ robots }) {
  const running = robots.find(r => r.isRunning)
  const animState    = running?.animState    ?? ANIM_STATES.IDLE
  const animProgress = running?.animProgress ?? 0
  const currentIdx   = running ? ANIM_SEQUENCE.indexOf(animState) : -1

  return (
    <div className="phase-pipeline">
      <div className="phase-track">
        {ANIM_SEQUENCE.map((state, i) => (
          <React.Fragment key={state}>
            <div className={`phase-dot ${i < currentIdx ? 'done' : i === currentIdx ? 'active' : ''}`} />
            {i < ANIM_SEQUENCE.length - 1 && (
              <div className={`phase-conn ${i < currentIdx ? 'done' : i === currentIdx ? 'half' : ''}`} />
            )}
          </React.Fragment>
        ))}
      </div>
      {running ? (
        <>
          <div className="phase-active-row">
            <span className="phase-name">{PHASE_LABELS[animState] ?? '–'}</span>
            <span className="phase-pct">{Math.round(animProgress * 100)}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${animProgress * 100}%` }} />
          </div>
        </>
      ) : (
        <div className="phase-idle">Idle — ready to run</div>
      )}
    </div>
  )
}

// ── Per-robot card ────────────────────────────────────────────────────────
function RobotCard({ robot, index, isAnyRunning }) {
  const selectedId   = useBenchStore((s) => s.selectedId)
  const setMode      = useBenchStore((s) => s.setMode)
  const activeModeId = useBenchStore((s) => s.activeModeRobotId)

  const selectRobot  = useBenchStore((s) => s.selectRobot)
  const removeRobot  = useBenchStore((s) => s.removeRobot)
  const setSetMode   = useBenchStore((s) => s.setSetMode)

  const isSelected  = selectedId === robot.id
  const isRunning   = robot.isRunning
  const canInteract = !isAnyRunning

  const dPick = robot.type === 'kuka'
    ? Math.hypot(robot.pickPoint.x - robot.pos.x, robot.pickPoint.z - robot.pos.z) : 0
  const dDrop = robot.type === 'kuka'
    ? Math.hypot(robot.dropPoint.x - robot.pos.x, robot.dropPoint.z - robot.pos.z) : 0
  const pickOK = robot.type !== 'kuka' || (dPick >= KR210_MIN_REACH && dPick <= KR210_MAX_REACH)
  const dropOK = robot.type !== 'kuka' || (dDrop >= KR210_MIN_REACH && dDrop <= KR210_MAX_REACH)

  const modeLabel = (mode) => {
    if (!isSelected || setMode !== mode || activeModeId !== robot.id) return null
    return <span className="mode-active">●</span>
  }

  return (
    <div
      className={`robot-card ${isSelected ? 'selected' : ''} ${isRunning ? 'running' : ''}`}
      onClick={() => canInteract && selectRobot(robot.id)}
    >
      <div className="rc-header">
        <div className="rc-title">
          <span className="rc-num">R{index + 1}</span>
          <span className="rc-type">{robot.type === 'kuka' ? 'KR210 R2700-2' : 'KR210 Gantry'}</span>
        </div>
        <div className="rc-right">
          <span className={`rc-status ${isRunning ? 'run' : robot.loaded ? 'ok' : 'load'}`}>
            {isRunning ? 'RUNNING' : robot.loaded ? 'READY' : 'LOADING'}
          </span>
          {!isAnyRunning && (
            <button className="rc-del" onClick={(e) => { e.stopPropagation(); removeRobot(robot.id) }} title="Remove robot">×</button>
          )}
        </div>
      </div>

      {isSelected && !isRunning && (
        <div className="rc-tasks">
          <div className="task-row">
            <span className="task-label">
              PICK {!pickOK && <span className="reach-warn">⚠</span>}
            </span>
            <span className="task-coords">({robot.pickPoint.x.toFixed(1)}, {robot.pickPoint.z.toFixed(1)})</span>
            <button
              className={`task-btn ${setMode === 'pick' && activeModeId === robot.id ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setSetMode('pick', robot.id) }}
            >
              SET {modeLabel('pick')}
            </button>
          </div>
          <div className="task-row">
            <span className="task-label">
              DROP {!dropOK && <span className="reach-warn">⚠</span>}
            </span>
            <span className="task-coords">({robot.dropPoint.x.toFixed(1)}, {robot.dropPoint.z.toFixed(1)})</span>
            <button
              className={`task-btn ${setMode === 'drop' && activeModeId === robot.id ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setSetMode('drop', robot.id) }}
            >
              SET {modeLabel('drop')}
            </button>
          </div>
          <div className="task-row">
            <span className="task-label">BASE</span>
            <span className="task-coords">({robot.pos.x.toFixed(1)}, {robot.pos.z.toFixed(1)})</span>
            <button
              className={`task-btn ${setMode === 'move' && activeModeId === robot.id ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setSetMode('move', robot.id) }}
            >
              DRAG {modeLabel('move')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────
export default function ControlPanel() {
  const robots      = useBenchStore((s) => s.robots)
  const objectType  = useBenchStore((s) => s.objectType)
  const logs        = useBenchStore((s) => s.logs)

  const setObjectType = useBenchStore((s) => s.setObjectType)
  const addRobot      = useBenchStore((s) => s.addRobot)
  const startAll      = useBenchStore((s) => s.startAll)
  const stopAll       = useBenchStore((s) => s.stopAll)

  // Derive from robots array (reactive)
  const isAnyRunning = robots.some(r => r.isRunning)
  const allLoaded    = robots.every(r => r.loaded)
  const anyLoaded    = robots.some(r => r.loaded)
  const canRun       = !isAnyRunning && anyLoaded

  // The selected robot type is the type of the first robot (determines what "+ADD" creates)
  const selectedId   = useBenchStore((s) => s.selectedId)
  const setRobotType = useBenchStore((s) => s.updateRobot)
  const currentType  = robots.find(r => r.id === selectedId)?.type ?? 'kuka'

  // For "robot type" selection: it selects what new robots will be added,
  // and also shows which type is "active". We track this as local state since
  // it doesn't need to persist globally.
  const [newRobotType, setNewRobotType] = React.useState(currentType)

  const pillState = !anyLoaded ? 'loading' : isAnyRunning ? 'running' : 'ready'
  const pillLabel = !anyLoaded ? 'LOADING' : isAnyRunning ? 'RUNNING' : 'READY'

  return (
    <aside className="control-panel">

      {/* ── Header ── */}
      <div className="panel-header">
        <div className="logo-mark">
          <span className="logo-k">K</span>
          <span className="logo-uka">UKA</span>
        </div>
        <div className={`status-pill ${pillState}`}>
          <span className="pill-dot" />
          {pillLabel}
        </div>
      </div>

      {/* ── Robot type ── */}
      <section className="panel-section">
        <div className="section-title">ROBOT TYPE</div>
        <div className="type-list">
          {[
            { id: 'kuka',   label: 'KR210 R2700-2',  sub: 'Static · 6-Axis · 2300 mm reach' },
            { id: 'gantry', label: 'KR210 Gantry',    sub: 'Overhead · XZ rail mount' },
          ].map(({ id, label, sub }) => (
            <button
              key={id}
              className={`type-card ${newRobotType === id ? 'active' : ''}`}
              onClick={() => setNewRobotType(id)}
              disabled={isAnyRunning}
            >
              <div className="type-icon">{ROBOT_ICONS[id]}</div>
              <div className="type-text">
                <div className="type-label">{label}</div>
                <div className="type-sub">{sub}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Object type ── */}
      <section className="panel-section">
        <div className="section-title">OBJECT TO PICK</div>
        <div className="object-tabs">
          {OBJECT_TYPES.map(({ id, label, icon }) => (
            <button
              key={id}
              className={`obj-tab ${objectType === id ? 'active' : ''}`}
              onClick={() => !isAnyRunning && setObjectType(id)}
              disabled={isAnyRunning}
            >
              <span className="obj-icon">{icon}</span>
              <span className="obj-label">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Robots list ── */}
      <section className="panel-section robots-section">
        <div className="robots-header">
          <div className="section-title" style={{ marginBottom: 0 }}>ROBOTS ({robots.length})</div>
          <button
            className="add-robot-btn"
            onClick={() => !isAnyRunning && addRobot(newRobotType)}
            disabled={isAnyRunning}
            title={`Add ${newRobotType === 'gantry' ? 'gantry' : 'KR210'} robot`}
          >
            + ADD
          </button>
        </div>
        <div className="robot-list">
          {robots.map((r, i) => (
            <RobotCard key={r.id} robot={r} index={i} isAnyRunning={isAnyRunning} />
          ))}
        </div>
      </section>

      {/* ── Phase ── */}
      <section className="panel-section">
        <div className="section-title">TASK PHASE</div>
        <PhasePipeline robots={robots} />
      </section>

      {/* ── Run / Stop ── */}
      <section className="panel-section run-section">
        {!isAnyRunning ? (
          <button className="run-btn" onClick={startAll} disabled={!canRun}>
            <span className="run-icon">▶</span>
            <span>RUN ALL ROBOTS</span>
          </button>
        ) : (
          <button className="stop-btn" onClick={stopAll}>
            <span className="run-icon">■</span>
            <span>STOP &amp; RESET</span>
          </button>
        )}
      </section>

      {/* ── Log ── */}
      <section className="panel-section log-section">
        <div className="section-title">CONSOLE LOG</div>
        <div className="log-list">
          {[...logs].reverse().map((entry, i) => (
            <div key={i} className="log-entry">
              <span className="log-lvl" style={{ color: LOG_COLORS[entry.level] ?? '#7b8693' }}>
                {entry.level === 'ok' ? '✓' : entry.level === 'error' ? '✗' : entry.level === 'warn' ? '!' : '›'}
              </span>
              <span className="log-msg">{entry.msg}</span>
            </div>
          ))}
        </div>
      </section>

    </aside>
  )
}
