import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

// Pulsing ground disc for start/end point markers
export default function GroundMarker({ position, color, label, visible = true }) {
  const ringRef = useRef()
  const t = useRef(0)

  useFrame((_, delta) => {
    if (!ringRef.current) return
    t.current += delta * 1.8
    const s = 1 + Math.sin(t.current) * 0.12
    ringRef.current.scale.setScalar(s)
  })

  if (!visible) return null

  return (
    <group position={[position[0], 0.002, position[2]]}>
      {/* Filled disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.28, 32]} />
        <meshStandardMaterial color={color} transparent opacity={0.25} depthWrite={false} />
      </mesh>
      {/* Pulsing ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.30, 0.36, 32]} />
        <meshStandardMaterial color={color} transparent opacity={0.60} depthWrite={false} />
      </mesh>
      {/* Dashed circle (4 arcs) */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42]}
                rotation={[-Math.PI / 2, 0, a]}>
            <planeGeometry args={[0.06, 0.016]} />
            <meshStandardMaterial color={color} transparent opacity={0.5} depthWrite={false} />
          </mesh>
        )
      })}
      {/* Label */}
      <Html center position={[0, 0.18, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: color,
          color: '#fff',
          fontFamily: 'SF Mono, Fira Mono, monospace',
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: '3px',
          whiteSpace: 'nowrap',
          letterSpacing: '0.08em',
          boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
        }}>
          {label}
        </div>
      </Html>
    </group>
  )
}
