/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gateway base URL — dev http://localhost:8081, prod https://api.sweetvaluelab.com. */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
