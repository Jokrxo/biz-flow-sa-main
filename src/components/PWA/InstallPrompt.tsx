import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Download, Smartphone, Monitor } from 'lucide-react';
import { pwaManager, BeforeInstallPromptEvent } from '@/utils/pwa';

export function InstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const updateInstallState = () => {
      const state = pwaManager.getInstallState();
      setCanInstall(state.canInstall);
      setIsInstalled(state.isInstalled);
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

  useEffect(() => {
    // Show prompt after 3 seconds if installable
    if (canInstall && !isInstalled) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [canInstall, isInstalled]);

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const success = await pwaManager.install();
      if (success) {
        setShowPrompt(false);
      }
    } catch (error) {
      console.error('Installation failed:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  if (!showPrompt || isInstalled) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
      <Card className="shadow-lg border-primary">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Install Rigel Business
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPrompt(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Install our app for faster access and offline functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Monitor className="h-4 w-4" />
              <span>Works offline</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Download className="h-4 w-4" />
              <span>Quick access from home screen</span>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleInstall}
                disabled={isInstalling}
                className="flex-1"
              >
                {isInstalling ? 'Installing...' : 'Install'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowPrompt(false)}
              >
                Later
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function InstallButton() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const updateInstallState = () => {
      const state = pwaManager.getInstallState();
      setCanInstall(state.canInstall);
      setIsInstalled(state.isInstalled);
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

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await pwaManager.install();
    } catch (error) {
      console.error('Installation failed:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  if (!canInstall || isInstalled) {
    return null;
  }

  return (
    <Button
      onClick={handleInstall}
      disabled={isInstalling}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      {isInstalling ? 'Installing...' : 'Install App'}
    </Button>
  );
}
