import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export const JOINT_NAMES = ['joint_1','joint_2','joint_3','joint_4','joint_5','joint_6']

export const JOINT_LIMITS = {
  joint_1: [-3.2289, 3.2289],
  joint_2: [-2.4435, -0.0873],
  joint_3: [-2.0944,  2.9322],
  joint_4: [-6.1087,  6.1087],
  joint_5: [-2.1817,  2.1817],
  joint_6: [-6.1087,  6.1087],
}

export const KR60_JOINT_LIMITS = {
  joint_1: [-3.2289, 3.2289],
  joint_2: [-2.4435, -0.45],
  joint_3: [-2.0944,  2.9322],
  joint_4: [-6.1087,  6.1087],
  joint_5: [-2.1817,  2.1817],
  joint_6: [-6.1087,  6.1087],
}

export const BENCH_GRAB_Y   = 0.28
export const CARRY_Y        = 1.20
export const KR210_MAX_REACH = 2.30
export const KR210_MIN_REACH = 0.50

export const HOME_ANGLES = {
  joint_1: 0, joint_2: -0.45, joint_3: 1.30,
  joint_4: 0, joint_5:  0.75, joint_6: 0,
}
export const KR60_HOME_ANGLES = { ...HOME_ANGLES }
export const GANTRY_HOME     = { x: 0, z: 0 }

export const ANIM_STATES = {
  IDLE:           'idle',
  APPROACH_START: 'approach_start',
  DESCEND_START:  'descend_start',
  GRAB:           'grab',
  ASCEND:         'ascend',
  TRANSPORT:      'transport',
  DESCEND_END:    'descend_end',
  RELEASE:        'release',
  ASCEND_END:     'ascend_end',
}

const ANIM_DURATIONS = {
  [ANIM_STATES.APPROACH_START]: 2.2,
  [ANIM_STATES.DESCEND_START]:  1.0,
  [ANIM_STATES.GRAB]:           0.5,
  [ANIM_STATES.ASCEND]:         1.0,
  [ANIM_STATES.TRANSPORT]:      2.4,
  [ANIM_STATES.DESCEND_END]:    1.0,
  [ANIM_STATES.RELEASE]:        0.5,
  [ANIM_STATES.ASCEND_END]:     1.0,
}

export const ANIM_SEQUENCE = [
  ANIM_STATES.APPROACH_START, ANIM_STATES.DESCEND_START, ANIM_STATES.GRAB,
  ANIM_STATES.ASCEND, ANIM_STATES.TRANSPORT, ANIM_STATES.DESCEND_END,
  ANIM_STATES.RELEASE, ANIM_STATES.ASCEND_END,
]

export function getAnimDuration(s) { return ANIM_DURATIONS[s] ?? 1.0 }

export const OBJECT_TYPES = [
  { id: 'box',   label: 'Box',   icon: '▣' },
  { id: 'bench', label: 'Bench', icon: '⊟' },
]

let _uid = 0
export function makeRobotState(type = 'kuka', pos = { x: 0, z: 0 }) {
  const id   = `r${++_uid}`
  const pick = { x: pos.x + 1.5, z: pos.z + 0.5 }
  const drop = { x: pos.x - 1.5, z: pos.z - 0.5 }
  return {
    id, type, pos,
    pickPoint:    pick,
    dropPoint:    drop,
    animState:    ANIM_STATES.IDLE,
    animProgress: 0,
    isRunning:    false,
    isCarrying:   false,
    benchPos:     { ...pick },
    ref:          null,
    loaded:       false,
    jointAngles:  { ...HOME_ANGLES },
    gantryPos:    { ...GANTRY_HOME },
  }
}

const _r0 = makeRobotState('kuka', { x: 0, z: 0 })

const useBenchStore = create(
  subscribeWithSelector((set, get) => ({
    robots:            [_r0],
    selectedId:        _r0.id,
    objectType:        'box',
    darkMode:          false,
    setMode:           'none',        // 'none' | 'move' | 'pick' | 'drop'
    activeModeRobotId: null,

    logs: [
      { level: 'info', msg: 'KUKA Multi-Robot ready' },
      { level: 'info', msg: 'Select robot · assign tasks · press RUN ALL' },
    ],

    // ── Robot management ──────────────────────────────────────────────────
    addRobot: (type = 'kuka') => set((s) => {
      const count = s.robots.length
      const pos   = { x: count * 4.0, z: 0 }
      const r     = makeRobotState(type, pos)
      return { robots: [...s.robots, r], selectedId: r.id }
    }),

    removeRobot: (id) => set((s) => {
      const robots     = s.robots.filter(r => r.id !== id)
      const selectedId = s.selectedId === id ? (robots[0]?.id ?? null) : s.selectedId
      return { robots, selectedId }
    }),

    selectRobot: (id) => set({ selectedId: id }),

    updateRobot: (id, patch) => set((s) => ({
      robots: s.robots.map(r => r.id === id ? { ...r, ...patch } : r),
    })),

    setRobotRef:    (id, ref) => get().updateRobot(id, { ref }),
    setRobotLoaded: (id, v)   => get().updateRobot(id, { loaded: v }),
    setRobotPos:    (id, x, z) => get().updateRobot(id, { pos: { x, z } }),

    setPickPoint: (id, x, z) => set((s) => ({
      robots: s.robots.map(r => r.id === id ? {
        ...r,
        pickPoint: { x, z },
        benchPos: r.animState === ANIM_STATES.IDLE ? { x, z } : r.benchPos,
      } : r),
    })),
    setDropPoint: (id, x, z) => get().updateRobot(id, { dropPoint: { x, z } }),

    setObjectType: (t) => set({ objectType: t }),
    setSetMode:    (m, rid = null) => set({ setMode: m, activeModeRobotId: rid }),
    setDarkMode:   (v) => set({ darkMode: v }),

    // ── Selectors (not reactive — call via getState()) ─────────────────
    isAnyRunning: () => get().robots.some(r => r.isRunning),

    // ── Animation lifecycle ───────────────────────────────────────────────
    startAll: () => {
      const s     = get()
      const ready = s.robots.filter(r => r.loaded)
      if (!ready.length) { s.addLog('error', 'No robots loaded yet'); return }
      set((st) => ({
        setMode: 'none', activeModeRobotId: null,
        robots: st.robots.map(r => {
          if (!r.loaded) return r
          return {
            ...r,
            isRunning: true, animState: ANIM_STATES.APPROACH_START,
            animProgress: 0, isCarrying: false,
            benchPos: { ...r.pickPoint },
          }
        }),
      }))
      s.addLog('ok', `Run started — ${ready.length} robot(s)`)
    },

    stopAll: () => {
      const s = get()
      set({
        robots: s.robots.map(r => ({
          ...r,
          isRunning: false, animState: ANIM_STATES.IDLE,
          animProgress: 0, isCarrying: false,
          gantryPos: { ...GANTRY_HOME },
          benchPos:  { ...(r.pickPoint ?? r.benchPos) },
        })),
      })
      get().addLog('info', 'All robots stopped')
    },

    onExitPhase: (id, state) => {
      const s = get()
      const r = s.robots.find(r => r.id === id)
      if (!r) return
      const num = s.robots.indexOf(r) + 1
      if (state === ANIM_STATES.GRAB) {
        get().updateRobot(id, { isCarrying: true })
        s.addLog('info', `Robot ${num} grabbed object`)
      }
      if (state === ANIM_STATES.RELEASE) {
        get().updateRobot(id, { isCarrying: false, benchPos: r.dropPoint })
        s.addLog('ok', `Robot ${num} placed object`)
      }
    },

    finishPhase: (id) => {
      const s   = get()
      const r   = s.robots.find(r => r.id === id)
      if (!r) return
      const idx  = ANIM_SEQUENCE.indexOf(r.animState)
      const next = ANIM_SEQUENCE[idx + 1]
      if (next) {
        get().updateRobot(id, { animState: next, animProgress: 0 })
      } else {
        const num = s.robots.indexOf(r) + 1
        get().updateRobot(id, {
          isRunning: false, animState: ANIM_STATES.IDLE,
          animProgress: 0, isCarrying: false, benchPos: r.dropPoint,
        })
        s.addLog('ok', `Robot ${num} placement complete`)
      }
    },

    addLog: (level, msg) => set((s) => ({
      logs: [...s.logs.slice(-19), { level, msg, t: Date.now() }],
    })),
  }))
)

export default useBenchStore
