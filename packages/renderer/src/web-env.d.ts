/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Removed VITE_API_WS - port is now injected dynamically
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
