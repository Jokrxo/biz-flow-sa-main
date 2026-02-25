import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

export function UpdatePrompt() {
  const { toast } = useToast();

  useEffect(() => {
    const handleUpdate = () => {
      console.log('Update available event received');
      toast({
        title: "Update Available",
        description: "A new version of the app is available. Refresh to update.",
        action: (
          <ToastAction altText="Refresh" onClick={() => window.location.reload()}>
            Refresh
          </ToastAction>
        ),
        duration: Infinity, // Keep it visible until action
      });
    };

    window.addEventListener('pwa-update-available', handleUpdate);

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdate);
    };
  }, [toast]);

  return null; // Logic only component
}
