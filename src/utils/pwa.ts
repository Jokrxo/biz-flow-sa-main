export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PWAInstallState {
  canInstall: boolean;
  isInstalled: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
}

import { registerSW } from 'virtual:pwa-register';

class PWAManager {
  private installPrompt: BeforeInstallPromptEvent | null = null;
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  constructor() {
    this.initializeServiceWorker();
    this.setupInstallPrompt();
  }

  private initializeServiceWorker(): void {
    // In development, we can enable SW for testing if needed, 
    // but usually we want it enabled to verify PWA functionality.
    // The vite-plugin-pwa devOptions will handle the actual generation.
    
    if ('serviceWorker' in navigator) {
      const updateSW = registerSW({
        onRegistered(reg) {
          if (reg) {
            console.log('SW registered:', reg);
            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('New content available, please refresh.');
                    // Dispatch event to show update toast/prompt if we implement one
                    window.dispatchEvent(new CustomEvent('pwa-update-available'));
                  }
                });
              }
            });
          }
        },
        onRegisterError(error) {
           console.log('SW registration error', error);
        }
      });
    }
  }

  private setupInstallPrompt(): void {
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      
      // Stash the event so it can be triggered later
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.installPrompt = e as BeforeInstallPromptEvent;
      
      console.log('Install prompt captured');
      
      // Dispatch custom event for components to listen to
      window.dispatchEvent(new CustomEvent('pwa-install-ready'));
    });

    window.addEventListener('appinstalled', () => {
      console.log('PWA was installed');
      this.installPrompt = null;
      this.deferredPrompt = null;
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    });
  }

  public canInstall(): boolean {
    return !!this.deferredPrompt;
  }

  public isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone ||
           document.referrer.includes('android-app://');
  }

  public async install(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }

    try {
      // Show the install prompt
      await this.deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      // Clear the deferred prompt
      this.deferredPrompt = null;
      this.installPrompt = null;
      
      return outcome === 'accepted';
    } catch (error) {
      console.error('Install prompt failed:', error);
      return false;
    }
  }

  public getInstallState(): PWAInstallState {
    return {
      canInstall: this.canInstall(),
      isInstalled: this.isStandalone(),
      installPrompt: this.installPrompt
    };
  }

  // Background sync for offline functionality
  public async syncWhenOnline(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if ((reg as any).sync && typeof (reg as any).sync.register === 'function') {
          await (reg as any).sync.register('sync-transactions');
          console.log('Background sync registered');
        }
      } catch (error) {
        console.error('Background sync failed:', error);
      }
    }
  }

  // Request notification permission
  public async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('Notifications not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.error('Notification permission failed:', error);
      return false;
    }
  }

  // Send notification
  public async sendNotification(title: string, options?: NotificationOptions): Promise<void> {
    if (Notification.permission === 'granted') {
      try {
        await navigator.serviceWorker.ready;
        await navigator.serviceWorker.controller?.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options
        });
      } catch (error) {
        console.error('Notification failed:', error);
      }
    }
  }
}

// Create singleton instance
export const pwaManager = new PWAManager();

// Export hooks for React components
export const usePWAInstall = () => {
  const [installState, setInstallState] = useState<PWAInstallState>({
    canInstall: false,
    isInstalled: false,
    installPrompt: null
  });

  useEffect(() => {
    const updateInstallState = () => {
      setInstallState(pwaManager.getInstallState());
    };

    // Initial state
    updateInstallState();

    // Listen for PWA events
    window.addEventListener('pwa-install-ready', updateInstallState);
    window.addEventListener('pwa-installed', updateInstallState);

    return () => {
      window.removeEventListener('pwa-install-ready', updateInstallState);
      window.removeEventListener('pwa-installed', updateInstallState);
    };
  }, []);

  const install = async () => {
    return await pwaManager.install();
  };

  return {
    ...installState,
    install
  };
};

// Import React hook
import { useState, useEffect } from 'react';
