import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { navGroups } from "@/config/navigation";
import { UserMenu } from "./UserMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Calculator } from "lucide-react";
import { useState } from "react";

export const TopNavigation = () => {
  const location = useLocation();
  const [logoError, setLogoError] = useState(false);

  const isActive = (path: string) => location.pathname === path;
  const isGroupActive = (items: { href: string }[]) => items.some(item => isActive(item.href));

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 font-bold text-xl mr-4">
              {logoError ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
                  <Calculator className="h-4 w-4 text-primary-foreground" />
                </div>
              ) : (
                <img 
                  src="/logo.png" 
                  alt="Rigel" 
                  className="h-8 w-8 rounded-lg object-cover" 
                  onError={() => setLogoError(true)}
                />
              )}
              <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                Rigel
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navGroups.map((group) => (
                <DropdownMenu key={group.title}>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className={cn(
                        "h-9 px-4 py-2 group gap-1 font-medium",
                        isGroupActive(group.items) 
                          ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" 
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {group.title}
                      <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 p-2">
                    {group.items.map((item) => (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link
                          to={item.href}
                          className={cn(
                            "flex items-center gap-2 cursor-pointer rounded-md px-2 py-2 text-sm transition-colors",
                            isActive(item.href) 
                              ? "bg-primary/10 text-primary font-medium" 
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <UserMenu />
          </div>
        </div>
      </header>
    </>
  );
};
