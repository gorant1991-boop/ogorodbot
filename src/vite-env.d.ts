/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YANDEX_METRICA_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
