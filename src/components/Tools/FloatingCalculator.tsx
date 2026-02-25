import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Calculator, X, Lock, Unlock, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FloatingCalculator = ({ isOpen, onClose }: FloatingCalculatorProps) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 350, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [display, setDisplay] = useState("0");
  const [equation, setEquation] = useState("");

  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && !isLocked) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isLocked, dragOffset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isLocked) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleInput = (val: string) => {
    if (val === 'C') {
      setDisplay("0");
      setEquation("");
    } else if (val === '=') {
      try {
        // eslint-disable-next-line no-eval
        const result = eval(equation + display);
        setDisplay(String(result));
        setEquation("");
      } catch (e) {
        setDisplay("Error");
      }
    } else if (['+', '-', '*', '/'].includes(val)) {
      setEquation(equation + display + val);
      setDisplay("0");
    } else {
      setDisplay(display === "0" ? val : display + val);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={nodeRef}
      style={{
        left: position.x,
        top: position.y,
      }}
      className={cn(
        "fixed z-50 w-[300px] bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden transition-shadow",
        isDragging ? "shadow-xl cursor-grabbing" : "",
        "animate-in fade-in zoom-in-95 duration-200"
      )}
    >
      {/* Header / Drag Handle */}
      <div
        className={cn(
          "flex items-center justify-between p-3 bg-muted/80 border-b select-none",
          isLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        )}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <img src="/logo.png" alt="Logo" className="h-5 w-5 rounded object-cover" />
          Rigel Calc
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setIsLocked(!isLocked)}
            title={isLocked ? "Unlock Position" : "Lock Position"}
          >
            {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Calculator Body */}
      <div className="p-4 bg-card">
        <div className="bg-muted p-3 rounded-lg text-right mb-4 font-mono text-2xl h-12 overflow-hidden flex items-center justify-end">
          {display}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {['C', '(', ')', '/'].map(btn => (
            <Button key={btn} variant={btn === 'C' ? "destructive" : "secondary"} size="sm" onClick={() => handleInput(btn)}>{btn}</Button>
          ))}
          {['7', '8', '9', '*'].map(btn => (
            <Button key={btn} variant={['*'].includes(btn) ? "secondary" : "outline"} size="sm" onClick={() => handleInput(btn)}>{btn}</Button>
          ))}
          {['4', '5', '6', '-'].map(btn => (
            <Button key={btn} variant={['-'].includes(btn) ? "secondary" : "outline"} size="sm" onClick={() => handleInput(btn)}>{btn}</Button>
          ))}
          {['1', '2', '3', '+'].map(btn => (
            <Button key={btn} variant={['+'].includes(btn) ? "secondary" : "outline"} size="sm" onClick={() => handleInput(btn)}>{btn}</Button>
          ))}
          {['0', '.', '=', ''].map((btn, i) => (
            btn === '' ? <div key={i} /> :
            <Button key={btn} className={btn === '=' ? "col-span-2 bg-primary text-primary-foreground" : ""} variant={btn === '=' ? "default" : "outline"} size="sm" onClick={() => handleInput(btn)}>{btn}</Button>
          ))}
        </div>
      </div>
      
      {/* Footer Hint */}
      {!isLocked && (
        <div className="bg-muted/30 py-1 flex justify-center border-t">
          <GripHorizontal className="h-3 w-3 text-muted-foreground/30" />
        </div>
      )}
    </div>
  );
};
