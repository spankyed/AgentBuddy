/**
 * Connection-handle shapes for flow-canvas nodes.
 *
 * Lives in a .ts module rather than inside BaseNode.vue so plain-TypeScript
 * consumers can import it — a `declare module '*.vue'` shim only models the
 * default export, so a type declared inside an SFC is unreachable from .ts.
 */
export interface HandleConfig {
  id: string
  label?: string
  offsetY?: number
  offsetPercent?: number
}
