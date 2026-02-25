declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onRegistered?(registration: ServiceWorkerRegistration | undefined): void;
    onRegisterError?(error: any): void;
  }
  export function registerSW(options?: RegisterSWOptions): (() => void) | undefined;
}