import React, { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import URDFLoader from 'urdf-loader'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import useBenchStore, { HOME_ANGLES, JOINT_NAMES } from '../store/useBenchStore.js'
import { applyAngles } from '../ik/ccdSolver.js'

const BASE         = (import.meta.env?.BASE_URL) ?? '/'
export const URDF_PATH    = `${BASE}lib-assets/kr210/kr210_r2700_2.urdf`
export const PACKAGE_PATH = `${BASE}lib-assets/kr210`

const MAT = {
  orange:     () => new THREE.MeshStandardMaterial({ color: 0xff6000, metalness: 0.30, roughness: 0.50 }),
  anthracite: () => new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.55, roughness: 0.40 }),
  charcoal:   () => new THREE.MeshStandardMaterial({ color: 0x1a1c1f, metalness: 0.60, roughness: 0.35 }),
}

function meshMat(path) {
  const name = path.split('/').pop().replace(/\.stl$/i, '').toLowerCase()
  if (name === 'base_link') return MAT.charcoal()
  if (name === 'link_6')    return MAT.anthracite()
  return MAT.orange()
}

function makeMeshLoader() {
  return (path, manager, done) => {
    if (!path.toLowerCase().endsWith('.stl')) { done(null, new Error(`Unsupported: ${path}`)); return }
    new STLLoader(manager).load(
      path,
      (geom) => {
        const mesh = new THREE.Mesh(geom, meshMat(path))
        mesh.castShadow = mesh.receiveShadow = true
        const group = new THREE.Group(); group.add(mesh); done(group)
      },
      undefined,
      (err) => done(null, err),
    )
  }
}

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

export default function KukaArm({ robotId, parentRef }) {
  const { scene } = useThree()
  const robotRef  = useRef(null)
  const addLog    = useBenchStore((s) => s.addLog)
  const setRef    = useBenchStore((s) => s.setRobotRef)
  const setLoaded = useBenchStore((s) => s.setRobotLoaded)

  useEffect(() => {
    let cancelled = false
    const loader = new URDFLoader()
    loader.packages   = { robot: PACKAGE_PATH }
    loader.loadMeshCb = makeMeshLoader()

    loader.load(URDF_PATH, (robot) => {
      if (cancelled) return
      robot.position.set(0, 0.05, 0)
      robot.rotation.set(-Math.PI / 2, 0, 0)
      const parent = parentRef?.current ?? scene
      parent.add(robot)
      robotRef.current = robot
      applyAngles(robot, HOME_ANGLES)
      const tip = robot.links?.tool0 ?? robot.links?.flange ?? robot.links?.link_6
      if (tip) { const g = buildGripper(); g.name = 'gripper'; tip.add(g) }
      setRef(robotId, robot)
      setLoaded(robotId, true)
      addLog('ok', `KR210 (${robotId}) loaded`)
      addLog('info', `Joints: ${JOINT_NAMES.map(n => robot.joints?.[n] ? '✓' : '✗').join(' ')}`)
    }, undefined, (err) => {
      if (cancelled) return
      addLog('error', `URDF load failed [${robotId}]: ${err?.message ?? err}`)
    })

    return () => {
      cancelled = true
      if (robotRef.current?.parent) robotRef.current.parent.remove(robotRef.current)
      setLoaded(robotId, false)
      setRef(robotId, null)
      robotRef.current = null
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
