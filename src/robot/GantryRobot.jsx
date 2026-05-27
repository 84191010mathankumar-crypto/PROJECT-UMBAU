import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useBenchStore from '../store/useBenchStore.js'

// KUKA overhead Cartesian gantry.
// Structure:
//   - Two runway rails along X, at Z = ±HALF_SPAN, at height RAIL_H
//   - A bridge beam spanning Z, positioned at current bridgeX
//   - A trolley on the bridge at current trolleyZ
//   - A Z-column (hoist) dropping from the trolley to current hoistY
//   - End effector / gripper at bottom of hoist

const HALF_SPAN  = 3.2   // half width (Z direction)
const RAIL_H     = 4.0   // rail height
const RAIL_LEN   = 7.0   // runway length (X direction)
const COL_W      = 0.12  // column cross-section
const BRIDGE_W   = 0.15
const TROLLEY_SZ = 0.28

const M_STRUCT  = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.6, roughness: 0.35 })
const M_ORANGE  = new THREE.MeshStandardMaterial({ color: 0xff6000, metalness: 0.3, roughness: 0.5  })
const M_DARK    = new THREE.MeshStandardMaterial({ color: 0x111316, metalness: 0.4, roughness: 0.55 })
const M_RUBBER  = new THREE.MeshStandardMaterial({ color: 0x191b1f, metalness: 0.2, roughness: 0.7  })

// Static structural frame (two runways + columns)
function Frame() {
  const columns = []
  const xPos = [-RAIL_LEN / 2 + 0.3, RAIL_LEN / 2 - 0.3]
  const zPos = [-HALF_SPAN, HALF_SPAN]

  for (const x of xPos) {
    for (const z of zPos) {
      columns.push(
        <mesh key={`col-${x}-${z}`} position={[x, RAIL_H / 2, z]} castShadow receiveShadow material={M_STRUCT}>
          <boxGeometry args={[COL_W, RAIL_H, COL_W]} />
        </mesh>,
        // foot plate
        <mesh key={`fp-${x}-${z}`} position={[x, 0.025, z]} castShadow material={M_DARK}>
          <boxGeometry args={[0.30, 0.05, 0.30]} />
        </mesh>,
      )
    }
  }

  // Two runway rails
  const railGeo = [HALF_SPAN * 2 + 0.18, COL_W * 0.6, COL_W * 0.6]
  const runways = zPos.map((z) => (
    <mesh key={`runway-${z}`} position={[0, RAIL_H, z]} castShadow receiveShadow material={M_STRUCT}>
      <boxGeometry args={[RAIL_LEN, COL_W * 0.6, COL_W * 0.6]} />
    </mesh>
  ))

  // Orange accent stripe on each runway
  const stripes = zPos.map((z) => (
    <mesh key={`stripe-${z}`} position={[0, RAIL_H + COL_W * 0.3, z]}>
      <boxGeometry args={[RAIL_LEN, 0.015, COL_W * 0.65]} />
      <meshStandardMaterial color={0xff6000} metalness={0.3} roughness={0.5} />
    </mesh>
  ))

  return <group>{columns}{runways}{stripes}</group>
}

// Bridge beam (moves along X)
function Bridge({ bridgeX }) {
  return (
    <group position={[bridgeX, RAIL_H, 0]}>
      {/* Main bridge beam */}
      <mesh castShadow receiveShadow material={M_STRUCT}>
        <boxGeometry args={[BRIDGE_W, BRIDGE_W, HALF_SPAN * 2 + 0.2]} />
      </mesh>
      {/* Orange rail on top of bridge */}
      <mesh position={[0, BRIDGE_W / 2 + 0.007, 0]}>
        <boxGeometry args={[BRIDGE_W + 0.02, 0.014, HALF_SPAN * 2]} />
        <meshStandardMaterial color={0xff6000} metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  )
}

// Trolley (rides along bridge in Z)
function Trolley({ bridgeX, trolleyZ }) {
  return (
    <group position={[bridgeX, RAIL_H, trolleyZ]}>
      <mesh castShadow receiveShadow material={M_ORANGE}>
        <boxGeometry args={[TROLLEY_SZ + 0.04, TROLLEY_SZ, TROLLEY_SZ + 0.04]} />
      </mesh>
      {/* Drive motor box */}
      <mesh position={[0, TROLLEY_SZ * 0.6, 0]} material={M_DARK} castShadow>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
      </mesh>
      {/* Status LED */}
      <mesh position={[0, TROLLEY_SZ * 0.6 + 0.065, 0]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color={0x00ff88} emissive={0x00ff88} emissiveIntensity={1.2} />
      </mesh>
    </group>
  )
}

// Vertical hoist column (drops from trolley)
function Hoist({ bridgeX, trolleyZ, hoistY }) {
  // hoistY = world Y of gripper base; column goes from RAIL_H down to hoistY
  const colLen   = RAIL_H - hoistY
  const colCenY  = hoistY + colLen / 2

  return (
    <group>
      {/* Hoist column */}
      <mesh position={[bridgeX, colCenY, trolleyZ]} castShadow receiveShadow material={M_STRUCT}>
        <boxGeometry args={[0.06, colLen, 0.06]} />
      </mesh>

      {/* End effector housing */}
      <group position={[bridgeX, hoistY, trolleyZ]}>
        <mesh castShadow material={M_DARK}>
          <boxGeometry args={[0.18, 0.08, 0.18]} />
        </mesh>
        {/* Four gripper hooks / slings */}
        {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz], i) => (
          <group key={i} position={[sx * 0.07, -0.04, sz * 0.07]}>
            <mesh castShadow material={M_ORANGE}>
              <cylinderGeometry args={[0.006, 0.006, 0.12, 8]} />
            </mesh>
            {/* Hook curve */}
            <mesh position={[0, -0.06, 0]} rotation={[0, 0, Math.PI * 0.2]} castShadow material={M_RUBBER}>
              <torusGeometry args={[0.022, 0.006, 8, 12, Math.PI * 1.2]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

export default function GantryRobot() {
  const gantryPos = useBenchStore((s) => s.gantryPos)
  const { x: bridgeX = 0, z: trolleyZ = 0, y: hoistOffset = 0 } = gantryPos

  // hoistOffset in store is 0 (raised) .. 1 (fully lowered)
  const benchGrabH = 0.50    // height at which gripper reaches bench
  const raisedH    = RAIL_H - 0.35
  const hoistY     = raisedH - hoistOffset * (raisedH - benchGrabH)

  return (
    <group>
      <Frame />
      <Bridge bridgeX={bridgeX} />
      <Trolley bridgeX={bridgeX} trolleyZ={trolleyZ} />
      <Hoist bridgeX={bridgeX} trolleyZ={trolleyZ} hoistY={hoistY} />
    </group>
  )
}
