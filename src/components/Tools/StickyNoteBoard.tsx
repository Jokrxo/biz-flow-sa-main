import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Plus, X, Trash2, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StickyNote {
  id: string;
  content: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

const COLORS = [
  { bg: "bg-yellow-100", border: "border-yellow-200", text: "text-yellow-900", hover: "hover:bg-yellow-200" },
  { bg: "bg-blue-100", border: "border-blue-200", text: "text-blue-900", hover: "hover:bg-blue-200" },
  { bg: "bg-green-100", border: "border-green-200", text: "text-green-900", hover: "hover:bg-green-200" },
  { bg: "bg-rose-100", border: "border-rose-200", text: "text-rose-900", hover: "hover:bg-rose-200" },
  { bg: "bg-purple-100", border: "border-purple-200", text: "text-purple-900", hover: "hover:bg-purple-200" },
];

interface StickyNoteBoardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StickyNoteBoard = ({ isOpen, onClose }: StickyNoteBoardProps) => {
  const [notes, setNotes] = useState<StickyNote[]>(() => {
    const saved = localStorage.getItem("rigel_advanced_notes");
    return saved ? JSON.parse(saved) : [
      { id: '1', content: 'Welcome to your new sticky notes board! Click + to add more.', color: 'bg-yellow-100', x: 50, y: 50, width: 200, height: 200, zIndex: 1 }
    ];
  });

  const [maxZ, setMaxZ] = useState(10);
  const boardRef = useRef<HTMLDivElement>(null);
  
  // Dragging state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    localStorage.setItem("rigel_advanced_notes", JSON.stringify(notes));
  }, [notes]);

  const addNote = () => {
    const newZ = maxZ + 1;
    setMaxZ(newZ);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)].bg;
    const newNote: StickyNote = {
      id: Date.now().toString(),
      content: '',
      color,
      x: 50 + (notes.length * 20) % 300,
      y: 50 + (notes.length * 20) % 300,
      width: 220,
      height: 220,
      zIndex: newZ
    };
    setNotes([...notes, newNote]);
  };

  const updateNote = (id: string, content: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, content } : n));
  };

  const deleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  const bringToFront = (id: string) => {
    const newZ = maxZ + 1;
    setMaxZ(newZ);
    setNotes(notes.map(n => n.id === id ? { ...n, zIndex: newZ } : n));
  };

  const handleMouseDown = (e: React.MouseEvent, id: string, x: number, y: number) => {
    e.stopPropagation();
    bringToFront(id);
    setDraggingId(id);
    setDragOffset({
      x: e.clientX - x,
      y: e.clientY - y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingId) {
        setNotes(prev => prev.map(n => {
          if (n.id === draggingId) {
            return {
              ...n,
              x: e.clientX - dragOffset.x,
              y: e.clientY - dragOffset.y
            };
          }
          return n;
        }));
      }
    };

    const handleMouseUp = () => {
      setDraggingId(null);
    };

    if (draggingId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, dragOffset]);

  const changeColor = (id: string, colorClass: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, color: colorClass } : n));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[90vw] h-[80vh] p-0 overflow-hidden bg-muted/20">
        <div className="h-full flex flex-col">
          {/* Toolbar */}
          <div className="h-14 border-b bg-background flex items-center justify-between px-4 shadow-sm z-50">
            <div className="flex items-center gap-2">
               <h2 className="font-semibold text-lg flex items-center gap-2">
                 <span className="text-xl">📝</span> Sticky Board
               </h2>
               <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">Drag notes to organize</span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={addNote} className="gap-2">
                <Plus className="h-4 w-4" /> Add Note
              </Button>
            </div>
          </div>

          {/* Board Area */}
          <div ref={boardRef} className="flex-1 relative overflow-hidden bg-[url('/grid-pattern.svg')] bg-repeat">
            {notes.map(note => {
              const colorSet = COLORS.find(c => c.bg === note.color) || COLORS[0];
              return (
                <div
                  key={note.id}
                  style={{
                    position: 'absolute',
                    left: note.x,
                    top: note.y,
                    width: note.width,
                    height: note.height,
                    zIndex: note.zIndex,
                  }}
                  className={cn(
                    "flex flex-col shadow-lg rounded-lg border transition-shadow",
                    colorSet.bg,
                    colorSet.border,
                    draggingId === note.id ? "shadow-2xl cursor-grabbing" : "cursor-default"
                  )}
                  onMouseDown={() => bringToFront(note.id)}
                >
                  {/* Note Header */}
                  <div 
                    className={cn(
                      "h-8 flex items-center justify-between px-2 cursor-grab active:cursor-grabbing border-b border-black/5",
                      draggingId === note.id ? "cursor-grabbing" : ""
                    )}
                    onMouseDown={(e) => handleMouseDown(e, note.id, note.x, note.y)}
                  >
                    <GripHorizontal className="h-4 w-4 text-black/20" />
                    <div className="flex items-center gap-1">
                      {COLORS.map((c, i) => (
                         <div 
                           key={i} 
                           className={cn("h-3 w-3 rounded-full cursor-pointer border border-black/10", c.bg)}
                           onClick={(e) => { e.stopPropagation(); changeColor(note.id, c.bg); }}
                         />
                      ))}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 ml-1 hover:bg-black/10 text-black/40 hover:text-red-600"
                        onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Note Content */}
                  <textarea
                    className={cn(
                      "flex-1 w-full resize-none bg-transparent border-none p-3 focus:ring-0 focus:outline-none font-handwriting text-lg leading-relaxed",
                      colorSet.text
                    )}
                    style={{ fontFamily: '"Comic Sans MS", "Chalkboard SE", sans-serif' }}
                    value={note.content}
                    onChange={(e) => updateNote(note.id, e.target.value)}
                    placeholder="Type here..."
                  />
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
