import { Facebook, Twitter, Linkedin, Instagram } from "lucide-react";

export function AuthFooter() {
  return (
    <div className="mt-8 flex flex-col items-center space-y-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center space-x-6">
        <a href="#" className="text-muted-foreground hover:text-[#1877F2] transition-colors duration-300">
          <Facebook className="h-4 w-4" />
          <span className="sr-only">Facebook</span>
        </a>
        <a href="#" className="text-muted-foreground hover:text-[#1DA1F2] transition-colors duration-300">
          <Twitter className="h-4 w-4" />
          <span className="sr-only">Twitter</span>
        </a>
        <a href="#" className="text-muted-foreground hover:text-[#0A66C2] transition-colors duration-300">
          <Linkedin className="h-4 w-4" />
          <span className="sr-only">LinkedIn</span>
        </a>
        <a href="#" className="text-muted-foreground hover:text-[#E4405F] transition-colors duration-300">
          <Instagram className="h-4 w-4" />
          <span className="sr-only">Instagram</span>
        </a>
      </div>
      <div className="flex items-center justify-center space-x-2 text-xs text-muted-foreground tracking-wide">
        <span>Powered by</span>
        <div className="flex items-center space-x-1">
          <img src="/logo.png" alt="Stella Lumen" className="h-5 w-auto" />
          <span className="font-semibold text-foreground">Stella Lumen</span>
        </div>
      </div>
    </div>
  );
}
