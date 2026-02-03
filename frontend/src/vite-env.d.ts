/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly PROD: boolean
  readonly DEV: boolean
  readonly MODE: string
  // Add more env variables here if needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
