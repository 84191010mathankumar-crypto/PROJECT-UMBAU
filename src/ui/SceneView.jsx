import React, { Suspense, useRef, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  OrbitControls, Grid, GizmoHelper, GizmoViewport, ContactShadows, Line,
} from '@react-three/drei'
import * as THREE from 'three'
import useBenchStore, {
  ANIM_STATES, BENCH_GRAB_Y, KR210_MAX_REACH, KR210_MIN_REACH,
} from '../store/useBenchStore.js'
import KukaArm from '../robot/KukaArm.jsx'
import KukaKR60, {
  GantryFrame, GantryBridge, RAIL_H,
} from '../robot/KukaKR60Gantry.jsx'
import GroundMarker from '../bench/GroundMarker.jsx'
import RobotController from '../animation/PickPlaceController.jsx'
import { getPinchWorld } from '../ik/ccdSolver.js'
import './SceneView.css'

const BOX_W = 0.50, BOX_H = 0.40, BOX_D = 0.30
const CLAMP_XZ = (v) => Math.max(-6.0, Math.min(6.0, parseFloat(v.toFixed(2))))

// ── Bench mesh ────────────────────────────────────────────────────────────
function BenchMesh({ selected }) {
  const woodMat  = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.88, metalness: 0.04 }), [])
  const metalMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x2a2d32, metalness: 0.72, roughness: 0.30 }), [])
  const selMat   = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.88, metalness: 0.04, emissive: '#1a0800', emissiveIntensity: selected ? 0.4 : 0 }), [selected])

  return (
    <group>
      {/* Three seat slats */}
      {[0.09, 0, -0.09].map((z, i) => (
        <mesh key={i} position={[0, 0.33, z]} castShadow receiveShadow material={i === 1 ? selMat : woodMat}>
          <boxGeometry args={[0.48, 0.036, 0.055]} />
        </mesh>
      ))}
      {/* Two end supports */}
      {[-0.19, 0.19].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 0.165, 0]} castShadow receiveShadow material={metalMat}>
            <boxGeometry args={[0.028, 0.330, 0.220]} />
          </mesh>
          <mesh position={[0, 0.010, 0]} castShadow receiveShadow material={metalMat}>
            <boxGeometry args={[0.055, 0.020, 0.260]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ── Box mesh ──────────────────────────────────────────────────────────────
function BoxMesh({ ghost = false, selected = false }) {
  const color    = ghost ? '#4a90e2' : selected ? '#38bdf8' : '#1a56db'
  const emissive = ghost ? '#000' : selected ? '#0ea5e9' : '#000'
  const opacity  = ghost ? 0.12 : 1

  return (
    <group>
      <mesh castShadow={!ghost} receiveShadow={!ghost} position={[0, BOX_H / 2, 0]}>
        <boxGeometry args={[BOX_W, BOX_H, BOX_D]} />
        {ghost
          ? <meshStandardMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
          : <meshStandardMaterial color={color} metalness={0.35} roughness={0.50} emissive={emissive} emissiveIntensity={selected ? 0.3 : 0} />
        }
      </mesh>
      <lineSegments position={[0, BOX_H / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(BOX_W + 0.002, BOX_H + 0.002, BOX_D + 0.002)]} />
        <lineBasicMaterial color={ghost ? '#4a90e2' : selected ? '#38bdf8' : '#60a5fa'} transparent opacity={ghost ? 0.40 : 0.70} />
      </lineSegments>
    </group>
  )
}

// ── Per-robot object (box or bench) ───────────────────────────────────────
function ObjectItem({ robotId }) {
  const objectType  = useBenchStore((s) => s.objectType)
  const selectedId  = useBenchStore((s) => s.selectedId)
  const groupRef    = useRef()
  const selected    = selectedId === robotId

  function onClick(e) {
    e.stopPropagation()
    const s = useBenchStore.getState()
    const robot = s.robots.find(r => r.id === robotId)
    if (robot?.isRunning) return
    s.selectRobot(robotId)
    s.setSetMode('pick', robotId)
  }

  useFrame(() => {
    const g = groupRef.current; if (!g) return
    const robot = useBenchStore.getState().robots.find(r => r.id === robotId)
    if (!robot) return
    if (robot.isCarrying && robot.ref) {
      const wp = getPinchWorld(robot.ref)
      g.position.set(wp.x, Math.max(0, wp.y - BENCH_GRAB_Y), wp.z)
    } else {
      g.position.set(robot.benchPos.x, 0, robot.benchPos.z)
    }
  })

  // Ghost (drop-point preview)
  const GhostComp = objectType === 'bench' ? BenchMesh : BoxMesh

  return (
    <>
      {/* Actual object */}
      <group ref={groupRef} onClick={onClick}>
        {objectType === 'bench'
          ? <BenchMesh selected={selected} />
          : <BoxMesh selected={selected} />}
      </group>

      {/* Drop-point ghost */}
      <DropGhost robotId={robotId} GhostComp={GhostComp} />
    </>
  )
}

function DropGhost({ robotId, GhostComp }) {
  const groupRef = useRef()

  function onClick(e) {
    e.stopPropagation()
    const s = useBenchStore.getState()
    const robot = s.robots.find(r => r.id === robotId)
    if (robot?.isRunning) return
    s.selectRobot(robotId)
    s.setSetMode('drop', robotId)
  }

  useFrame(() => {
    const g = groupRef.current; if (!g) return
    const robot = useBenchStore.getState().robots.find(r => r.id === robotId)
    if (!robot) return
    g.position.set(robot.dropPoint.x, 0, robot.dropPoint.z)
  })

  return (
    <group ref={groupRef} onClick={onClick}>
      <BoxMesh ghost />
    </group>
  )
}

// ── Ground markers for pick/drop ─────────────────────────────────────────
function RobotMarkers({ robotId, index }) {
  const robot = useBenchStore((s) => s.robots.find(r => r.id === robotId))
  if (!robot || robot.isRunning) return null

  function onPickClick(e) {
    e.stopPropagation()
    const s = useBenchStore.getState()
    s.selectRobot(robotId)
    s.setSetMode('pick', robotId)
  }
  function onDropClick(e) {
    e.stopPropagation()
    const s = useBenchStore.getState()
    s.selectRobot(robotId)
    s.setSetMode('drop', robotId)
  }

  return (
    <>
      <group onClick={onPickClick}>
        <GroundMarker
          position={[robot.pickPoint.x, 0, robot.pickPoint.z]}
          color="#f59e0b"
          label={`R${index + 1} PICK`}
          visible
        />
      </group>
      <group onClick={onDropClick}>
        <GroundMarker
          position={[robot.dropPoint.x, 0, robot.dropPoint.z]}
          color="#4a90e2"
          label={`R${index + 1} DROP`}
          visible
        />
      </group>
    </>
  )
}

// ── Reach circle ─────────────────────────────────────────────────────────
function ReachCircle({ cx, cz, ok }) {
  const pts = useMemo(() => {
    const N = 128, arr = []
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2
      arr.push([cx + Math.cos(a) * KR210_MAX_REACH, 0.008, cz + Math.sin(a) * KR210_MAX_REACH])
    }
    return arr
  }, [cx, cz])

  return (
    <Line points={pts} color={ok ? '#ff6000' : '#ef4444'}
      lineWidth={1.5} dashed dashSize={0.13} gapSize={0.08}
      transparent opacity={0.55}
    />
  )
}

// ── Invisible ground plane (blocks orbit during drag) ────────────────────
function GroundPickPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={(e) => {
      if (useBenchStore.getState().setMode !== 'none') e.stopPropagation()
    }}>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

// ── Drag follower ─────────────────────────────────────────────────────────
function DragFollower() {
  const { gl, camera } = useThree()
  useEffect(() => {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const ray   = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const hit   = new THREE.Vector3()

    function onMove(e) {
      const s = useBenchStore.getState()
      if (s.setMode === 'none' || !s.activeModeRobotId) return
      const r = gl.domElement.getBoundingClientRect()
      mouse.x =  ((e.clientX - r.left) / r.width)  * 2 - 1
      mouse.y = -((e.clientY - r.top)  / r.height)  * 2 + 1
      ray.setFromCamera(mouse, camera)
      if (!ray.ray.intersectPlane(plane, hit)) return
      const x = CLAMP_XZ(hit.x), z = CLAMP_XZ(hit.z)
      const { setMode: m, activeModeRobotId: id } = s
      if (m === 'pick') s.setPickPoint(id, x, z)
      if (m === 'drop') s.setDropPoint(id, x, z)
      if (m === 'move') s.setRobotPos(id, x, z)
    }

    function onContextMenu(e) {
      if (useBenchStore.getState().setMode !== 'none') {
        e.preventDefault()
        useBenchStore.getState().setSetMode('none', null)
      }
    }

    gl.domElement.addEventListener('mousemove', onMove)
    gl.domElement.addEventListener('contextmenu', onContextMenu)
    return () => {
      gl.domElement.removeEventListener('mousemove', onMove)
      gl.domElement.removeEventListener('contextmenu', onContextMenu)
    }
  }, [gl, camera])
  return null
}

// ── Cursor helper ─────────────────────────────────────────────────────────
function CursorHelper() {
  const { gl } = useThree()
  useEffect(() => {
    return useBenchStore.subscribe(
      (s) => s.setMode,
      (mode) => { gl.domElement.style.cursor = mode !== 'none' ? 'crosshair' : 'default' },
    )
  }, [gl])
  return null
}

// ── Pedestal (static) ─────────────────────────────────────────────────────
const PEDESTAL_M1 = new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.6, roughness: 0.45 })
const PEDESTAL_M2 = new THREE.MeshStandardMaterial({ color: 0x22252b, metalness: 0.5, roughness: 0.55 })

function StaticPedestal() {
  return (
    <group>
      <mesh position={[0, 0.025, 0]} castShadow receiveShadow material={PEDESTAL_M1}>
        <cylinderGeometry args={[0.55, 0.60, 0.05, 64]} />
      </mesh>
      <mesh position={[0, 0.051, 0]} material={PEDESTAL_M2}>
        <cylinderGeometry args={[0.50, 0.50, 0.002, 64]} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.52, 0.053, Math.sin(a) * 0.52]} castShadow material={PEDESTAL_M2}>
            <cylinderGeometry args={[0.018, 0.018, 0.008, 8]} />
          </mesh>
        )
      })}
    </group>
  )
}

// ── Static KR210 arm group ────────────────────────────────────────────────
function StaticArm({ robotId }) {
  const groupRef = useRef()

  useFrame(() => {
    const g = groupRef.current; if (!g) return
    const robot = useBenchStore.getState().robots.find(r => r.id === robotId)
    if (!robot) return
    g.position.x = robot.pos.x
    g.position.z = robot.pos.z
    g.updateMatrixWorld(true)
  })

  function onRobotClick(e) {
    e.stopPropagation()
    const s = useBenchStore.getState()
    if (s.robots.find(r => r.id === robotId)?.isRunning) return
    s.selectRobot(robotId)
    s.setSetMode('move', robotId)
  }

  return (
    <group ref={groupRef}>
      <StaticPedestal />
      <KukaArm robotId={robotId} parentRef={groupRef} />
      {/* Invisible click target */}
      <mesh position={[0, 0.06, 0]} onClick={onRobotClick}>
        <cylinderGeometry args={[0.65, 0.65, 0.14, 32]} />
        <meshStandardMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ── Gantry system ─────────────────────────────────────────────────────────
// gantryPos is stored in world space; trolley local position = gantryPos - robot.pos
function GantrySystem({ robotId }) {
  const trolleyRef = useRef()

  useFrame(() => {
    const t = trolleyRef.current; if (!t) return
    const robot = useBenchStore.getState().robots.find(r => r.id === robotId)
    if (!robot) return
    // local position within the frame group = world gantryPos - frame origin (robot.pos)
    t.position.set(robot.gantryPos.x - robot.pos.x, RAIL_H, robot.gantryPos.z - robot.pos.z)
  })

  const robot    = useBenchStore((s) => s.robots.find(r => r.id === robotId))
  if (!robot) return null
  const localBX  = (robot.gantryPos?.x ?? 0) - robot.pos.x
  const localBZ  = (robot.gantryPos?.z ?? 0) - robot.pos.z

  return (
    <group position={[robot.pos.x, 0, robot.pos.z]}>
      <GantryFrame />
      <GantryBridge bridgeX={localBX} />
      <group ref={trolleyRef} position={[localBX, RAIL_H, localBZ]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.420, 0.320, 0.420]} />
          <meshStandardMaterial color="#2e3035" metalness={0.60} roughness={0.38} />
        </mesh>
        <mesh position={[0, 0.162, 0]} castShadow>
          <boxGeometry args={[0.440, 0.024, 0.440]} />
          <meshStandardMaterial color="#ff6000" metalness={0.30} roughness={0.50} />
        </mesh>
        <KukaKR60 robotId={robotId} trolleyGroupRef={trolleyRef} />
      </group>
    </group>
  )
}

// ── Complete robot group ──────────────────────────────────────────────────
function RobotGroup({ robotId, index }) {
  const robot = useBenchStore((s) => s.robots.find(r => r.id === robotId))
  if (!robot) return null

  return (
    <>
      {robot.type === 'kuka' ? <StaticArm robotId={robotId} /> : <GantrySystem robotId={robotId} />}
      <ObjectItem robotId={robotId} />
      <RobotMarkers robotId={robotId} index={index} />
      <RobotController robotId={robotId} />
      {robot.type === 'kuka' && (
        <ReachCircle cx={robot.pos.x} cz={robot.pos.z}
          ok={
            Math.hypot(robot.pickPoint.x - robot.pos.x, robot.pickPoint.z - robot.pos.z) <= KR210_MAX_REACH &&
            Math.hypot(robot.dropPoint.x - robot.pos.x, robot.dropPoint.z - robot.pos.z) <= KR210_MAX_REACH
          }
        />
      )}
    </>
  )
}

// ── Scene content ─────────────────────────────────────────────────────────
function SceneContent({ dark }) {
  const robots = useBenchStore((s) => s.robots)

  return (
    <>
      <color attach="background" args={[dark ? '#0d1117' : '#dce8f5']} />

      {dark ? (
        <>
          <ambientLight intensity={0.35} />
          <directionalLight position={[6, 9, 5]} intensity={1.10} castShadow
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} shadow-normalBias={0.02}
            shadow-camera-near={0.1} shadow-camera-far={60}
            shadow-camera-left={-12} shadow-camera-right={12}
            shadow-camera-top={12} shadow-camera-bottom={-6} />
          <directionalLight position={[-4, 5, -3]} intensity={0.18} />
          <hemisphereLight args={['#1e2a3a', '#0a0c10', 0.45]} />
        </>
      ) : (
        <>
          <ambientLight intensity={0.90} />
          <directionalLight position={[6, 9, 5]} intensity={1.40} castShadow
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} shadow-normalBias={0.02}
            shadow-camera-near={0.1} shadow-camera-far={60}
            shadow-camera-left={-12} shadow-camera-right={12}
            shadow-camera-top={12} shadow-camera-bottom={-6} />
          <directionalLight position={[-4, 5, -3]} intensity={0.40} />
          <hemisphereLight args={['#f4f6fa', '#d0d5dd', 0.80]} />
        </>
      )}

      <Grid
        args={[30, 30]} cellSize={0.5} cellThickness={0.7}
        cellColor={dark ? '#2a2d33' : '#8a9bb0'}
        sectionSize={2} sectionThickness={1.2}
        sectionColor={dark ? '#3d424a' : '#6a7f99'}
        fadeDistance={20} fadeStrength={2.0} fadeFrom={0}
        followCamera={false} infiniteGrid position={[0, 0.0004, 0]}
      />
      <ContactShadows
        position={[0, 0.001, 0]} opacity={dark ? 0.55 : 0.40} scale={20}
        blur={2.5} far={6} resolution={512}
        color={dark ? '#000000' : '#080c14'}
      />

      <GroundPickPlane />
      <DragFollower />

      {robots.map((r, i) => (
        <RobotGroup key={r.id} robotId={r.id} index={i} />
      ))}
    </>
  )
}

// ── Scene root ────────────────────────────────────────────────────────────
export default function SceneView() {
  const isAnyRunning = useBenchStore((s) => s.robots.some(r => r.isRunning))
  const darkMode     = useBenchStore((s) => s.darkMode)
  const setDarkMode  = useBenchStore((s) => s.setDarkMode)
  const setMode      = useBenchStore((s) => s.setMode)
  const robots       = useBenchStore((s) => s.robots)

  const runningRobot = robots.find(r => r.isRunning)

  const HINT_TEXT = {
    move: 'Move robot · right-click to confirm',
    pick: 'Set pick point · right-click to confirm',
    drop: 'Set drop point · right-click to confirm',
  }

  return (
    <div className="scene-view">
      <div className="scene-stamp">
        <div className="stamp-num">Fig. 01</div>
        <div className="stamp-title">Pick &amp; Place</div>
        <div className="stamp-rule" />
        <div className="stamp-sub">{robots.length} Robot{robots.length !== 1 ? 's' : ''} · Multi-Axis</div>
      </div>

      <button
        className="scene-theme-toggle"
        onClick={() => setDarkMode(!darkMode)}
        title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {darkMode ? '☀' : '☾'}
      </button>

      <div className="scene-axes">
        <div className="ax-row"><span>X · East</span><span className="swatch" style={{ background: '#ef4444' }} /></div>
        <div className="ax-row"><span>Y · Up</span><span className="swatch" style={{ background: '#10b981' }} /></div>
        <div className="ax-row"><span>Z · South</span><span className="swatch" style={{ background: '#3b6fff' }} /></div>
      </div>

      <div className="scene-hud">
        <span className="hud-label">Viewport</span>
        <span className="hud-kbd"><kbd>drag</kbd> orbit</span>
        <span className="hud-kbd"><kbd>scroll</kbd> zoom</span>
        <span className="hud-kbd"><kbd>shift+drag</kbd> pan</span>
      </div>

      {isAnyRunning && runningRobot && (
        <div className="scene-phase">
          <span className="phase-icon">⬤</span>
          {runningRobot.animState.replace(/_/g, ' ').toUpperCase()}
        </div>
      )}

      {setMode !== 'none' && (
        <div className="scene-drag-hint">
          {HINT_TEXT[setMode] ?? 'Move cursor · right-click to confirm'}
        </div>
      )}

      <Canvas
        camera={{ position: [7, 4.5, 8], fov: 42, near: 0.01, far: 200 }}
        shadows dpr={[1, 1.5]}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.toneMappingExposure = darkMode ? 1.20 : 1.10 }}
      >
        <CursorHelper />
        <Suspense fallback={null}>
          <SceneContent dark={darkMode} />
        </Suspense>
        <OrbitControls
          makeDefault target={[0, 1.2, 0]}
          maxPolarAngle={Math.PI * 0.49}
          minDistance={2} maxDistance={40}
          enableDamping dampingFactor={0.07}
        />
        <GizmoHelper alignment="bottom-right" margin={[44, 44]}>
          <group scale={0.30}>
            <GizmoViewport axisColors={['#ef4444', '#10b981', '#3b6fff']} labelColor="white" />
          </group>
        </GizmoHelper>
      </Canvas>
    </div>
  )
}
