import React from 'react'
import SceneView from './ui/SceneView.jsx'
import ControlPanel from './ui/ControlPanel.jsx'
import './App.css'

export default function App() {
  return (
    <div className="app-layout">
      <ControlPanel />
      <SceneView />
    </div>
  )
}
