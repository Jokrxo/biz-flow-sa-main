import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";
import { cn } from "@/lib/utils";

export function CookieConsentBanner() {
  const [show, setShow] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Check if cookie consent has already been given/declined
    const getCookie = (name: string) => {
      try {
        const pairs = document.cookie.split('; ').map((s) => s.split('='));
        const found = pairs.find(([k]) => k === name);
        return found ? decodeURIComponent(found[1] || '') : null;
      } catch { return null; }
    };

    const existing = getCookie('cookie_consent');
    if (!existing) {
      // Small delay for animation
      setTimeout(() => {
        setShow(true);
        requestAnimationFrame(() => setAnimate(true));
      }, 1000);
    }
  }, []);

  const setCookie = (name: string, value: string, days: number) => {
    try {
      const expires = new Date(Date.now() + days * 864e5).toUTCString();
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Expires=${expires}; SameSite=Lax${secure}`;
    } catch (e) {
      console.error("Failed to set cookie", e);
    }
  };

  const accept = () => {
    setAnimate(false);
    setTimeout(() => {
      setCookie('cookie_consent', 'accepted', 365);
      setShow(false);
    }, 300);
  };

  const decline = () => {
    setAnimate(false);
    setTimeout(() => {
      setCookie('cookie_consent', 'declined', 365);
      setShow(false);
    }, 300);
  };

  if (!show) return null;

  return (
    <div 
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[100] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] transition-all duration-500 ease-in-out transform translate-y-full",
        animate && "translate-y-0"
      )}
    >
      <div className="container mx-auto p-4 md:p-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-4 flex-1">
            <div className="hidden md:flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Cookie className="h-6 w-6" />
            </div>
            <div className="space-y-1 text-center md:text-left">
              <h3 className="text-lg font-semibold tracking-tight flex items-center justify-center md:justify-start gap-2">
                <Cookie className="h-5 w-5 md:hidden text-primary" />
                Cookie Policy
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. 
                Cookies are small text files stored on your device that help us remember your preferences and keep you signed in securely.
                By clicking "Accept", you consent to our use of cookies.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full sm:w-auto">
            <Button 
              variant="outline" 
              onClick={decline}
              className="w-full sm:w-32 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Decline
            </Button>
            <Button 
              onClick={accept}
              className="w-full sm:w-32 bg-primary hover:bg-primary/90 shadow-sm"
            >
              Accept
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
