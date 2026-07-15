/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (resp: { credential: string }) => void;
        }) => void;
        renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
      };
    };
  };
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
