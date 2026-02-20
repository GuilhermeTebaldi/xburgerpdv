/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_SYSTEM_PATH?: string;
  readonly VITE_ADMIN_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
