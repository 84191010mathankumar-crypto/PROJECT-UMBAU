import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useBenchStore, {
  ANIM_STATES, ANIM_SEQUENCE, getAnimDuration,
  KR60_HOME_ANGLES, KR60_JOINT_LIMITS,
  BENCH_GRAB_Y, CARRY_Y,
} from '../store/useBenchStore.js'
import {
  solveCCD, applyAngles, lerpAngles, easeInOutCubic,
} from '../ik/ccdSolver.js'

function lerpGantryPos(from, to, t) {
  const e = easeInOutCubic(t)
  return { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e }
}

export default function RobotController({ robotId }) {
  const stateRef   = useRef(ANIM_STATES.IDLE)
  const elapsedRef = useRef(0)
  const snap       = useRef({ anglesFrom: null, anglesTo: null, gantryFrom: null, gantryTo: null })

  useFrame((_, delta) => {
    const store = useBenchStore.getState()
    const robot = store.robots.find(r => r.id === robotId)
    if (!robot?.isRunning) return

    const { animState } = robot
    if (animState === ANIM_STATES.IDLE) return

    elapsedRef.current += delta
    const raw = Math.min(elapsedRef.current / getAnimDuration(animState), 1)

    if (stateRef.current !== animState) {
      stateRef.current   = animState
      elapsedRef.current = delta
      onEnter(animState, robot, snap)
      return
    }

    tick(animState, raw, robot, snap, robotId)
    store.updateRobot(robotId, { animProgress: raw })

    if (raw >= 1) {
      elapsedRef.current = 0
      store.onExitPhase(robotId, animState)
      store.finishPhase(robotId)
    }
  })

  return null
}

function onEnter(state, robot, snap) {
  const { type, ref, jointAngles, gantryPos, pickPoint, dropPoint } = robot

  if (type === 'kuka') {
    switch (state) {
      case ANIM_STATES.APPROACH_START: {
        if (ref) {
          const from = { ...jointAngles }
          const solved = solveCCD(ref, new THREE.Vector3(pickPoint.x, CARRY_Y, pickPoint.z))
          snap.current = { ...snap.current, anglesFrom: from, anglesTo: { ...solved } }
          applyAngles(ref, from)
        }
        break
      }
      case ANIM_STATES.DESCEND_START: {
        if (ref) {
          const from = { ...jointAngles }
          const solved = solveCCD(ref, new THREE.Vector3(pickPoint.x, BENCH_GRAB_Y, pickPoint.z))
          snap.current = { ...snap.current, anglesFrom: from, anglesTo: { ...solved } }
          applyAngles(ref, from)
        }
        break
      }
      case ANIM_STATES.ASCEND: {
        if (ref) {
          const from = { ...jointAngles }
          const solved = solveCCD(ref, new THREE.Vector3(pickPoint.x, CARRY_Y, pickPoint.z))
          snap.current = { ...snap.current, anglesFrom: from, anglesTo: { ...solved } }
          applyAngles(ref, from)
        }
        break
      }
      case ANIM_STATES.TRANSPORT: {
        if (ref) {
          const from = { ...jointAngles }
          const solved = solveCCD(ref, new THREE.Vector3(dropPoint.x, CARRY_Y, dropPoint.z))
          snap.current = { ...snap.current, anglesFrom: from, anglesTo: { ...solved } }
          applyAngles(ref, from)
        }
        break
      }
      case ANIM_STATES.DESCEND_END: {
        if (ref) {
          const from = { ...jointAngles }
          const solved = solveCCD(ref, new THREE.Vector3(dropPoint.x, BENCH_GRAB_Y, dropPoint.z))
          snap.current = { ...snap.current, anglesFrom: from, anglesTo: { ...solved } }
          applyAngles(ref, from)
        }
        break
      }
      case ANIM_STATES.ASCEND_END: {
        if (ref) {
          const from = { ...jointAngles }
          const solved = solveCCD(ref, new THREE.Vector3(dropPoint.x, CARRY_Y, dropPoint.z))
          snap.current = { ...snap.current, anglesFrom: from, anglesTo: { ...solved } }
          applyAngles(ref, from)
        }
        break
      }
    }
  } else {
    // Gantry
    switch (state) {
      case ANIM_STATES.APPROACH_START:
        snap.current = {
          gantryFrom: { ...gantryPos },
          // gantryPos is stored in world space; subtract robot.pos to get frame-local coords
          gantryTo:   { x: pickPoint.x - robot.pos.x, z: pickPoint.z - robot.pos.z },
          anglesFrom: { ...jointAngles },
          anglesTo:   { ...KR60_HOME_ANGLES },
        }
        break
      case ANIM_STATES.DESCEND_START: {
        if (ref) {
          const from = { ...jointAngles }
          const solved = solveCCD(ref, new THREE.Vector3(pickPoint.x, BENCH_GRAB_Y, pickPoint.z), { limits: KR60_JOINT_LIMITS })
          snap.current = { ...snap.current, anglesFrom: from, anglesTo: { ...solved } }
          applyAngles(ref, from, KR60_JOINT_LIMITS)
        }
        break
      }
      case ANIM_STATES.ASCEND:
        snap.current = { ...snap.current, anglesFrom: { ...jointAngles }, anglesTo: { ...KR60_HOME_ANGLES } }
        break
      case ANIM_STATES.TRANSPORT:
        snap.current = {
          ...snap.current,
          gantryFrom: { ...gantryPos },
          gantryTo:   { x: dropPoint.x - robot.pos.x, z: dropPoint.z - robot.pos.z },
        }
        break
      case ANIM_STATES.DESCEND_END: {
        if (ref) {
          const from = { ...jointAngles }
          const solved = solveCCD(ref, new THREE.Vector3(dropPoint.x, BENCH_GRAB_Y, dropPoint.z), { limits: KR60_JOINT_LIMITS })
          snap.current = { ...snap.current, anglesFrom: from, anglesTo: { ...solved } }
          applyAngles(ref, from, KR60_JOINT_LIMITS)
        }
        break
      }
      case ANIM_STATES.ASCEND_END:
        snap.current = { ...snap.current, anglesFrom: { ...jointAngles }, anglesTo: { ...KR60_HOME_ANGLES } }
        break
    }
  }
}

function tick(state, t, robot, snap, robotId) {
  const { type, ref } = robot
  const store = useBenchStore.getState()

  if (type === 'kuka') {
    const lerpArm = () => {
      if (snap.current.anglesFrom && snap.current.anglesTo && ref) {
        const a = lerpAngles(snap.current.anglesFrom, snap.current.anglesTo, t)
        applyAngles(ref, a)
        store.updateRobot(robotId, { jointAngles: a })
      }
    }
    switch (state) {
      case ANIM_STATES.APPROACH_START:
      case ANIM_STATES.DESCEND_START:
      case ANIM_STATES.ASCEND:
      case ANIM_STATES.TRANSPORT:
      case ANIM_STATES.DESCEND_END:
      case ANIM_STATES.ASCEND_END:
        lerpArm(); break
    }
  } else {
    const lerpArm = () => {
      if (snap.current.anglesFrom && snap.current.anglesTo && ref) {
        const a = lerpAngles(snap.current.anglesFrom, snap.current.anglesTo, t)
        applyAngles(ref, a, KR60_JOINT_LIMITS)
        store.updateRobot(robotId, { jointAngles: a })
      }
    }
    const lerpGantry = () => {
      const { gantryFrom: gf, gantryTo: gt } = snap.current
      if (!gf || !gt) return
      store.updateRobot(robotId, { gantryPos: lerpGantryPos(gf, gt, t) })
    }
    switch (state) {
      case ANIM_STATES.APPROACH_START: lerpGantry(); lerpArm(); break
      case ANIM_STATES.TRANSPORT:      lerpGantry(); break
      case ANIM_STATES.DESCEND_START:
      case ANIM_STATES.ASCEND:
      case ANIM_STATES.DESCEND_END:
      case ANIM_STATES.ASCEND_END:
        lerpArm(); break
    }
  }
}
