import * as THREE from 'three'
import useBenchStore, { JOINT_NAMES, JOINT_LIMITS } from '../store/useBenchStore.js'

export function clampJoint(name, value, limits = JOINT_LIMITS) {
  const [lo, hi] = limits[name] ?? [-Math.PI, Math.PI]
  return Math.max(lo, Math.min(hi, value))
}

export function applyAngles(robot, angles, limits = JOINT_LIMITS) {
  for (const name of JOINT_NAMES) {
    const joint = robot.joints?.[name]
    if (joint) joint.setJointValue(clampJoint(name, angles[name] ?? 0, limits))
  }
  robot.updateMatrixWorld(true)
}

export function readAngles(robot) {
  const out = {}
  for (const name of JOINT_NAMES) {
    out[name] = robot.joints?.[name]?.angle ?? 0
  }
  return out
}

// World position of the gripper pinch point (~0.20m past tool0 flange)
export function getPinchWorld(robot) {
  const tip = robot.links?.tool0 ?? robot.links?.flange ?? robot.links?.link_6
  if (!tip) return new THREE.Vector3()
  const pos = new THREE.Vector3()
  tip.getWorldPosition(pos)
  const dir = new THREE.Vector3(0, 0, 1)
  const q   = new THREE.Quaternion()
  tip.getWorldQuaternion(q)
  dir.applyQuaternion(q)
  pos.addScaledVector(dir, 0.20)
  return pos
}

function getJointAxisWorld(joint) {
  // Must use the joint's OWN world quaternion, not the parent's.
  // Each joint has an origin rpy that transforms the joint frame relative to the
  // parent link — using parent's quat alone ignores that transform and gives the
  // wrong axis direction.  Since all KR210 joints rotate around their local Z, and
  // Rz(θ)·Z = Z (Z is invariant under Z-rotation), applying the joint's current
  // world quaternion to (0,0,1) always yields the correct world-space axis regardless
  // of the current joint angle θ.
  const localAxis = joint.axis ? joint.axis.clone() : new THREE.Vector3(0, 0, 1)
  const q = new THREE.Quaternion()
  joint.getWorldQuaternion(q)
  return localAxis.applyQuaternion(q).normalize()
}

function signedAnglePlane(u, v, axis) {
  const pu = u.clone().addScaledVector(axis, -u.dot(axis))
  const pv = v.clone().addScaledVector(axis, -v.dot(axis))
  if (pu.length() < 1e-6 || pv.length() < 1e-6) return 0
  pu.normalize(); pv.normalize()
  const dot   = Math.max(-1, Math.min(1, pu.dot(pv)))
  const cross = new THREE.Vector3().crossVectors(pu, pv)
  return (cross.dot(axis) >= 0 ? 1 : -1) * Math.acos(dot)
}

// ── Compute correct joint_1 angle to face a world-space target ────────────
//
// For KR210 floor-mount (rotation.x = -PI/2):
//   joint_1 physical axis = World -Y  (Rx(-π/2) · Rx(-π) · Z = World -Y)
//   At j1=0 arm faces World +X.  At j1=θ arm faces (cos θ, 0, +sin θ).
//   To face (dx, 0, dz) → j1 = atan2(+dz, dx)
//
// For KR210 gantry-mount (rotation.x = +PI/2, inverted):
//   joint_1 physical axis = World +Y  (Rx(+π/2) · Rx(-π) · Z = World +Y)
//   At j1=θ arm faces (cos θ, 0, -sin θ).
//   To face (dx, 0, dz) → j1 = atan2(-dz, dx)
//
// Mount type detected by robot local-Z direction in world space.
function computeJ1(robot, targetPos) {
  const basePos = new THREE.Vector3()
  robot.getWorldPosition(basePos)
  const dx = targetPos.x - basePos.x
  const dz = targetPos.z - basePos.z

  // Robot local Z in world: floor → World +Y (y > 0), gantry → World -Y (y < 0)
  const localZ = new THREE.Vector3(0, 0, 1)
  const q = new THREE.Quaternion()
  robot.getWorldQuaternion(q)
  localZ.applyQuaternion(q)

  const isInverted = localZ.y < 0

  const j1 = isInverted ? Math.atan2(-dz, dx) : Math.atan2(dz, dx)
  const [lo, hi] = JOINT_LIMITS.joint_1 ?? [-3.2289, 3.2289]
  return Math.max(lo, Math.min(hi, j1))
}

// ── Build target-directed seeds ───────────────────────────────────────────
// j1 is set to point the arm toward the target; j2/j3/j5 sweep arm configs.
function buildSeeds(robot, targetPos, limits) {
  const j1      = computeJ1(robot, targetPos)
  const [lo, hi] = limits.joint_1 ?? [-3.2289, 3.2289]
  const clamp = (n, v) => Math.max((limits[n] ?? [-Math.PI, Math.PI])[0],
                                    Math.min((limits[n] ?? [-Math.PI, Math.PI])[1], v))

  // j1 variants: primary + ±0.3 spread + opposite side for ambiguous cases
  const j1Variants = [
    j1,
    Math.max(lo, Math.min(hi, j1 + 0.3)),
    Math.max(lo, Math.min(hi, j1 - 0.3)),
    Math.max(lo, Math.min(hi, j1 + 0.7)),
    Math.max(lo, Math.min(hi, j1 - 0.7)),
  ]

  // [j2, j3, j5] configurations spanning grab height → carry height
  const configs = [
    [-0.45,  1.30,  0.75],   // home-like: good for carry height
    [-0.80,  1.60,  0.50],   // medium extension
    [-1.20,  2.00,  0.20],   // extended, lower
    [-1.50,  2.20, -0.10],   // near max extension, level wrist
    [-0.50,  1.35, -0.50],   // carry height, wrist angled down
    [-1.00,  1.80, -0.70],   // extended, wrist down
    [-1.40,  2.10, -0.90],   // max reach, wrist down (grab height)
  ]

  // Warm-start first: CCD from current config finds the nearest local minimum,
  // which gives the shortest rotation path from the arm's current position.
  const seeds = [readAngles(robot)]

  for (const j1v of j1Variants) {
    for (const [j2, j3, j5] of configs) {
      seeds.push({
        joint_1: j1v,
        joint_2: clamp('joint_2', j2),
        joint_3: clamp('joint_3', j3),
        joint_4: 0,
        joint_5: clamp('joint_5', j5),
        joint_6: 0,
      })
    }
  }

  return seeds  // 1 + 5 × 7 = 36 seeds
}

// ── CCD inverse kinematics ────────────────────────────────────────────────
export function solveCCD(robot, targetPos, {
  limits    = JOINT_LIMITS,
  maxIter   = 200,
  tolerance = 0.010,
  seeds     = null,
} = {}) {
  // Ensure the robot's world matrices are fully up-to-date before solving.
  // This guards against stale parent matrixWorld when called early in a frame.
  if (robot.parent) robot.parent.updateWorldMatrix(true, false)
  robot.updateMatrixWorld(true)

  const joints = JOINT_NAMES.map((n) => robot.joints?.[n]).filter(Boolean)
  if (!joints.length) return readAngles(robot)

  const activeSeedsBase = seeds ?? buildSeeds(robot, targetPos, limits)

  let bestAngles = readAngles(robot)
  let bestDist   = Infinity

  for (const seed of activeSeedsBase) {
    applyAngles(robot, seed, limits)

    for (let iter = 0; iter < maxIter; iter++) {
      for (let j = joints.length - 1; j >= 0; j--) {
        const joint    = joints[j]
        const jointPos = new THREE.Vector3()
        joint.getWorldPosition(jointPos)

        const toTip = getPinchWorld(robot).sub(jointPos)
        const toTgt = targetPos.clone().sub(jointPos)
        if (toTip.length() < 1e-4 || toTgt.length() < 1e-4) continue

        const axis  = getJointAxisWorld(joint)
        const delta = signedAnglePlane(toTip, toTgt, axis)

        const damp  = Math.min(1, 0.5 + toTip.length() * 0.3)
        const step  = Math.max(-0.4, Math.min(0.4, delta * damp))

        const name  = JOINT_NAMES[j]
        joint.setJointValue(clampJoint(name, (joint.angle ?? 0) + step, limits))
        robot.updateMatrixWorld(true)
      }
      if (getPinchWorld(robot).distanceTo(targetPos) < tolerance) break
    }

    const dist = getPinchWorld(robot).distanceTo(targetPos)
    if (dist < bestDist) {
      bestDist   = dist
      bestAngles = readAngles(robot)
      if (dist < tolerance) break
    }
  }

  applyAngles(robot, bestAngles, limits)
  if (bestDist > 0.05) {
    useBenchStore.getState().addLog('warn', `IK off by ${(bestDist * 100).toFixed(0)} cm — try repositioning`)
  }
  return bestAngles
}

// Angle interpolation with easing.
// Uses the shortest angular path, BUT falls back to the direct (non-wrapped)
// path if the shortest path would land outside the joint's physical limit.
// This prevents the arm from freezing against a joint stop mid-rotation.
export function lerpAngles(a, b, t) {
  const e = easeInOutCubic(t)
  const out = {}
  for (const name of JOINT_NAMES) {
    const from = a[name] ?? 0
    const to   = b[name] ?? 0

    // Shortest angular path
    let diff = to - from
    while (diff >  Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI

    // If shortest path would land outside joint limits, use the direct path.
    // Direct path (to - from, no wrapping) always terminates at `to` and stays
    // within limits because both `from` and `to` are IK-clamped values.
    const shortEnd = from + diff
    const [lo, hi] = JOINT_LIMITS[name] ?? [-Math.PI, Math.PI]
    if (shortEnd < lo - 1e-4 || shortEnd > hi + 1e-4) {
      diff = to - from
    }

    out[name] = from + diff * e
  }
  return out
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function grabPoseAbove(objectPos, grabHeight = 0.28) {
  return objectPos.clone().add(new THREE.Vector3(0, grabHeight, 0))
}
