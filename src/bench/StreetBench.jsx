import React from 'react'
import * as THREE from 'three'

// Street bench geometry — procedural park bench
// Origin is at ground centre of the bench.
// Overall size: ~1.8m long, 0.55m deep, 0.85m tall

const WOOD_MAT  = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, metalness: 0.05, roughness: 0.85 })
const IRON_MAT  = new THREE.MeshStandardMaterial({ color: 0x2e3035, metalness: 0.70, roughness: 0.45 })
const BOLT_MAT  = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, metalness: 0.80, roughness: 0.30 })

// Reusable geometries
const SLAT_GEO  = new THREE.BoxGeometry(1.80, 0.035, 0.110)
const BOLTS_GEO = new THREE.CylinderGeometry(0.007, 0.007, 0.06, 8)

function SeatSlats() {
  const slatZ = [-0.18, -0.06, 0.06, 0.18]  // four seat slats spread across depth
  return (
    <group position={[0, 0.44, 0.04]}>
      {slatZ.map((z, i) => (
        <mesh key={i} position={[0, 0, z]} geometry={SLAT_GEO} material={WOOD_MAT} castShadow receiveShadow />
      ))}
    </group>
  )
}

function BackrestSlats() {
  const slatY = [0.60, 0.70]
  return (
    <group position={[0, 0, -0.18]}>
      {slatY.map((y, i) => (
        <mesh key={i} position={[0, y, 0]} geometry={SLAT_GEO} material={WOOD_MAT} castShadow receiveShadow />
      ))}
    </group>
  )
}

// Classic curved cast-iron end frame (approximated with cylinders/boxes)
function EndFrame({ x }) {
  return (
    <group position={[x, 0, 0]}>
      {/* Front leg */}
      <mesh position={[0, 0.22, 0.19]} castShadow receiveShadow material={IRON_MAT}>
        <cylinderGeometry args={[0.022, 0.022, 0.44, 12]} />
      </mesh>
      {/* Rear leg */}
      <mesh position={[0, 0.22, -0.16]} castShadow receiveShadow material={IRON_MAT}>
        <cylinderGeometry args={[0.022, 0.022, 0.44, 12]} />
      </mesh>
      {/* Diagonal brace */}
      <mesh
        position={[0, 0.30, 0.015]}
        rotation={[0.6, 0, 0]}
        castShadow
        material={IRON_MAT}
      >
        <cylinderGeometry args={[0.014, 0.014, 0.42, 8]} />
      </mesh>
      {/* Upper arm connecting rear leg to backrest */}
      <mesh
        position={[0, 0.60, -0.15]}
        rotation={[-0.35, 0, 0]}
        castShadow
        material={IRON_MAT}
      >
        <cylinderGeometry args={[0.016, 0.016, 0.28, 8]} />
      </mesh>
      {/* Seat rail (horizontal bar below seat) */}
      <mesh position={[0, 0.41, 0.02]} castShadow receiveShadow material={IRON_MAT}>
        <boxGeometry args={[0.032, 0.032, 0.40]} />
      </mesh>
      {/* Foot pads */}
      {[[0.19], [-0.16]].map(([z], i) => (
        <mesh key={i} position={[0, 0.015, z]} castShadow material={IRON_MAT}>
          <boxGeometry args={[0.055, 0.030, 0.060]} />
        </mesh>
      ))}
      {/* Decorative scroll at top of backrest arm */}
      <mesh position={[0, 0.76, -0.20]} castShadow material={IRON_MAT}>
        <torusGeometry args={[0.04, 0.012, 8, 16, Math.PI * 1.5]} />
      </mesh>
    </group>
  )
}

// The whole bench — position driven by props
export default function StreetBench({ position = [0, 0, 0], opacity = 1, wireframe = false }) {
  const mat = wireframe
    ? new THREE.MeshStandardMaterial({ color: 0xff6000, wireframe: true })
    : null

  return (
    <group position={position}>
      <EndFrame x={ 0.85} />
      <EndFrame x={-0.85} />
      <SeatSlats />
      <BackrestSlats />
    </group>
  )
}

// Ghost / silhouette bench shown at the target end position
export function GhostBench({ position = [0, 0, 0] }) {
  return (
    <group position={position}>
      <EndFrame x={ 0.85} />
      <EndFrame x={-0.85} />
      <group position={[0, 0.44, 0.04]}>
        {[-0.18, -0.06, 0.06, 0.18].map((z, i) => (
          <mesh key={i} position={[0, 0, z]} geometry={SLAT_GEO} castShadow receiveShadow>
            <meshStandardMaterial color={0x4a90e2} transparent opacity={0.25} wireframe={false} />
          </mesh>
        ))}
      </group>
      <group position={[0, 0, -0.18]}>
        {[0.60, 0.70].map((y, i) => (
          <mesh key={i} position={[0, y, 0]} geometry={SLAT_GEO}>
            <meshStandardMaterial color={0x4a90e2} transparent opacity={0.25} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
