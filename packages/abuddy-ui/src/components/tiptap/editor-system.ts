let _system: { get(id: string): any } | null = null

export function setEditorSystem(system: { get(id: string): any }) {
  _system = system
}

export function getEditorSystem(): { get(id: string): any } {
  if (!_system) throw new Error('Editor system not initialized — call setEditorSystem() first')
  return _system
}
