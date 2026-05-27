/**
 * Gantry system — KUKA KR210 R2700-2 mounted INVERTED on overhead XZ rails.
 *
 * The robot model reuses the same real KR210 URDF + STL mesh files as the
 * floor arm (public/lib-assets/kr210/) — an authentic KUKA model, not
 * procedural geometry.  rotation.x = PI/2 flips the arm to hang downward
 * from the gantry trolley.
 *
 * Architecture:
 *   GantryFrame  — portal columns + runway box beams (static, JSX)
 *   GantryBridge — bridge beam that translates in X (JSX, bridgeX prop)
 *   KukaKR60     — URDF-loaded arm, child of trolley group (prop: trolleyGroupRef)
 */
import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import URDFLoader from 'urdf-loader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import useBenchStore, { KR60_HOME_ANGLES, JOINT_NAMES } from '../store/useBenchStore.js'
import { applyAngles } from '../ik/ccdSolver.js'

const BASE = import.meta.env?.BASE_URL ?? '/'
const URDF_PATH    = `${BASE}lib-assets/kr210/kr210_r2700_2.urdf`
const PACKAGE_PATH = `${BASE}lib-assets/kr210`

export const RAIL_H  = 2.80   // height of runway rails / trolley Y position
export const MOUNT_H = 2.80   // kept for compatibility

// ── KUKA colour materials ─────────────────────────────────────────────────
function meshMat(path) {
  const name = path.split('/').pop().replace(/\.stl$/i, '').toLowerCase()
  if (name === 'base_link') return new THREE.MeshStandardMaterial({ color: 0x1a1c1f, metalness: 0.60, roughness: 0.35 })
  if (name === 'link_6')    return new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.55, roughness: 0.40 })
  return new THREE.MeshStandardMaterial({ color: 0xff6000, metalness: 0.30, roughness: 0.50 })
}

function makeMeshLoader() {
  return (path, manager, done) => {
    if (!path.toLowerCase().endsWith('.stl')) { done(null, new Error(`Unsupported: ${path}`)); return }
    new STLLoader(manager).load(
      path,
      (geom) => {
        const mesh = new THREE.Mesh(geom, meshMat(path))
        mesh.castShadow = mesh.receiveShadow = true
        const g = new THREE.Group(); g.add(mesh); done(g)
      },
      undefined,
      (err) => done(null, err),
    )
  }
}

// Parallel-jaw gripper (same as floor arm)
function buildGripper() {
  const g      = new THREE.Group()
  const dark   = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.6,  roughness: 0.35 })
  const orange = new THREE.MeshStandardMaterial({ color: 0xff6000, metalness: 0.30, roughness: 0.50 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111316, metalness: 0.1,  roughness: 0.85 })

  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 32), orange)
  mount.rotation.x = Math.PI / 2; mount.position.set(0, 0, 0.0125); g.add(mount)

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 24), dark)
  body.rotation.x = Math.PI / 2; body.position.set(0, 0, 0.06); g.add(body)

  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.04), dark)
  knuckle.position.set(0, 0, 0.115); g.add(knuckle)

  for (const side of [-1, 1]) {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.085), dark)
    finger.position.set(side * 0.05, 0, 0.135 + 0.085 / 2); g.add(finger)
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.043, 0.068), rubber)
    pad.position.set(side * (0.05 - 0.022 / 2 - 0.0025), 0, 0.140 + 0.085 / 2); g.add(pad)
  }
  g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return g
}

// ── KR210 arm — loaded from real URDF/STL, mounted inverted on trolley ────
export default function KukaKR60({ robotId, trolleyGroupRef }) {
  const robotRef  = useRef(null)
  const setRef    = useBenchStore((s) => s.setRobotRef)
  const setLoaded = useBenchStore((s) => s.setRobotLoaded)
  const addLog    = useBenchStore((s) => s.addLog)

  useEffect(() => {
    let cancelled = false
    const loader  = new URDFLoader()
    loader.packages   = { robot: PACKAGE_PATH }
    loader.loadMeshCb = makeMeshLoader()

    loader.load(URDF_PATH, (robot) => {
      if (cancelled) return
      robot.rotation.set(Math.PI / 2, 0, 0)
      robot.position.set(0, 0, 0)
      const parent = trolleyGroupRef?.current
      if (parent) parent.add(robot)
      robotRef.current = robot
      applyAngles(robot, KR60_HOME_ANGLES)
      const tip = robot.links?.tool0 ?? robot.links?.flange ?? robot.links?.link_6
      if (tip) { const g = buildGripper(); g.name = 'gripper'; tip.add(g) }
      setRef(robotId, robot)
      setLoaded(robotId, true)
      addLog('ok', `KR210 gantry (${robotId}) loaded`)
      addLog('info', `Joints: ${JOINT_NAMES.map((n) => robot.joints?.[n] ? '✓' : '✗').join(' ')}`)
    }, undefined, (err) => {
      if (cancelled) return
      addLog('error', `Gantry URDF load failed [${robotId}]: ${err?.message ?? err}`)
    })

    return () => {
      cancelled = true
      if (robotRef.current?.parent) robotRef.current.parent.remove(robotRef.current)
      setLoaded(robotId, false); setRef(robotId, null); robotRef.current = null
    }
  }, [robotId])

  useEffect(() => {
    return useBenchStore.subscribe(
      (s) => s.robots,
      (robots) => {
        const r = robots.find(r => r.id === robotId)
        if (r && robotRef.current) applyAngles(robotRef.current, r.jointAngles)
      },
    )
  }, [robotId])

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// Gantry structural elements (procedural — frame + bridge only)
// ═══════════════════════════════════════════════════════════════════════════

const HALF_Z   = 3.6
const RAIL_LEN = 8.0
const COL_W    = 0.200
const BEAM_H   = 0.260
const BEAM_D   = 0.180

const M_STRUCT = new THREE.MeshStandardMaterial({ color: 0x2e3035, metalness: 0.65, roughness: 0.35 })
const M_ORG    = new THREE.MeshStandardMaterial({ color: 0xff6000, metalness: 0.30, roughness: 0.50 })
const M_DK     = new THREE.MeshStandardMaterial({ color: 0x0d0f12, metalness: 0.50, roughness: 0.60 })
const M_GREY   = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.55, roughness: 0.42 })

export function GantryFrame() {
  const xPosts = [-RAIL_LEN/2 + 0.45, RAIL_LEN/2 - 0.45]
  const zPosts = [-HALF_Z, HALF_Z]
  const colH   = RAIL_H - BEAM_H / 2
  const elements = []

  for (const x of xPosts) {
    for (const z of zPosts) {
      const key = `${x}-${z}`
      elements.push(
        <mesh key={`col-${key}`} position={[x, colH/2, z]} castShadow receiveShadow material={M_STRUCT}>
          <boxGeometry args={[COL_W, colH, COL_W]} />
        </mesh>,
        <mesh key={`bp-${key}`} position={[x, 0.030, z]} castShadow receiveShadow material={M_STRUCT}>
          <boxGeometry args={[0.520, 0.060, 0.520]} />
        </mesh>,
        ...[[1,1],[-1,1],[1,-1],[-1,-1]].map(([bx,bz],bi) => (
          <mesh key={`ab-${key}-${bi}`} position={[x+bx*0.20, 0.055, z+bz*0.20]} castShadow material={M_DK}>
            <cylinderGeometry args={[0.014,0.014,0.040,8]} />
          </mesh>
        )),
        <mesh key={`cap-${key}`} position={[x, colH - 0.020, z]} castShadow material={M_ORG}>
          <boxGeometry args={[COL_W + 0.040, 0.040, COL_W + 0.040]} />
        </mesh>,
        <mesh key={`br-${key}`} position={[x, colH * 0.68, z + Math.sign(z) * 0.30]}
          rotation={[Math.sign(z) * -0.44, 0, 0]} castShadow material={M_STRUCT}>
          <boxGeometry args={[COL_W * 0.60, colH * 0.32, COL_W * 0.60]} />
        </mesh>,
        <mesh key={`gp1-${key}`} position={[x, colH * 0.92, z + 0.06]} castShadow material={M_GREY}>
          <boxGeometry args={[COL_W + 0.020, 0.100, 0.120]} />
        </mesh>,
      )
    }
    elements.push(
      <mesh key={`xb-${x}`} position={[x, RAIL_H * 0.50, 0]} castShadow receiveShadow material={M_STRUCT}>
        <boxGeometry args={[COL_W * 0.75, COL_W * 0.75, HALF_Z * 2 - 0.60]} />
      </mesh>,
      <mesh key={`xd1-${x}`} position={[x, RAIL_H * 0.36, -HALF_Z * 0.34]} rotation={[0.50,0,0]} castShadow material={M_GREY}>
        <boxGeometry args={[COL_W * 0.40, RAIL_H * 0.36, COL_W * 0.40]} />
      </mesh>,
      <mesh key={`xd2-${x}`} position={[x, RAIL_H * 0.36,  HALF_Z * 0.34]} rotation={[-0.50,0,0]} castShadow material={M_GREY}>
        <boxGeometry args={[COL_W * 0.40, RAIL_H * 0.36, COL_W * 0.40]} />
      </mesh>,
    )
  }

  for (const z of zPosts) {
    elements.push(
      <group key={`rw-${z}`} position={[0, RAIL_H - BEAM_H/2, z]}>
        <mesh castShadow receiveShadow material={M_STRUCT}>
          <boxGeometry args={[RAIL_LEN, BEAM_H, BEAM_D]} />
        </mesh>
        <mesh position={[0, BEAM_H/2 + 0.008, 0]} material={M_ORG}>
          <boxGeometry args={[RAIL_LEN, 0.016, BEAM_D + 0.020]} />
        </mesh>
        <mesh position={[0, -BEAM_H/2 - 0.010, 0]}>
          <boxGeometry args={[RAIL_LEN - 0.50, 0.020, 0.055]} />
          <meshStandardMaterial color={0x111316} metalness={0.7} roughness={0.35} />
        </mesh>
        {Array.from({length: 7}).map((_,i) => (
          <mesh key={i} position={[-RAIL_LEN/2 + 0.60 + i*1.10, 0, 0]} castShadow material={M_GREY}>
            <boxGeometry args={[0.020, BEAM_H - 0.010, BEAM_D - 0.010]} />
          </mesh>
        ))}
      </group>,
      <group key={`sr-${z}`} position={[0, RAIL_H + 0.28, z + Math.sign(z)*0.14]}>
        <mesh castShadow material={M_GREY}>
          <boxGeometry args={[RAIL_LEN, 0.025, 0.025]} />
        </mesh>
      </group>,
    )
  }
  return <group>{elements}</group>
}

export function GantryBridge({ bridgeX }) {
  const BH = 0.240
  const BD = 0.200
  return (
    <group position={[bridgeX, RAIL_H, 0]}>
      <mesh castShadow receiveShadow material={M_STRUCT}>
        <boxGeometry args={[BD, BH, HALF_Z * 2 + 0.30]} />
      </mesh>
      <mesh position={[0, BH/2 + 0.009, 0]} material={M_ORG}>
        <boxGeometry args={[BD + 0.026, 0.018, HALF_Z * 2 + 0.20]} />
      </mesh>
      <mesh position={[0, -BH/2 - 0.014, 0]}>
        <boxGeometry args={[0.070, 0.028, HALF_Z * 2 + 0.10]} />
        <meshStandardMaterial color={0x111316} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[BD/2 + 0.016, 0, 0]}>
        <boxGeometry args={[0.022, 0.018, HALF_Z * 2]} />
        <meshStandardMaterial color={0x111316} metalness={0.6} roughness={0.40} />
      </mesh>
      {Array.from({length: 5}).map((_,i) => (
        <mesh key={i} position={[0, 0, -HALF_Z + 0.50 + i*1.40]} castShadow material={M_GREY}>
          <boxGeometry args={[BD - 0.008, BH - 0.010, 0.020]} />
        </mesh>
      ))}
      {[-1,1].map((s) => (
        <mesh key={s} position={[0, 0, s*(HALF_Z + 0.075)]} castShadow material={M_DK}>
          <boxGeometry args={[BD + 0.060, BH + 0.060, 0.050]} />
        </mesh>
      ))}
      {[-1,1].map((s) => (
        <group key={s} position={[0, BH/2 + 0.020, s*(HALF_Z - 0.10)]}>
          {[-1,1].map((w) => (
            <mesh key={w} position={[w*0.075, 0, 0]} castShadow material={M_DK}>
              <cylinderGeometry args={[0.038, 0.038, 0.060, 16]} />
            </mesh>
          ))}
          <mesh position={[0, 0.055, 0]} castShadow material={M_GREY}>
            <boxGeometry args={[0.190, 0.110, 0.140]} />
          </mesh>
          <mesh position={[0, 0.108, 0]}>
            <sphereGeometry args={[0.014, 8, 8]} />
            <meshStandardMaterial color={0x00ff88} emissive={0x00ff88} emissiveIntensity={1.2} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
