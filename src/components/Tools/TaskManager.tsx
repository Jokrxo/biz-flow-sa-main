import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckSquare, Plus, Trash2, GripVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

interface TaskManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TaskManager = ({ isOpen, onClose }: TaskManagerProps) => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem("rigel_tasks");
    return saved ? JSON.parse(saved) : [
      { id: '1', text: 'Review daily transactions', completed: false },
      { id: '2', text: 'Reconcile bank feed', completed: false },
    ];
  });
  const [newTask, setNewTask] = useState("");

  useEffect(() => {
    localStorage.setItem("rigel_tasks", JSON.stringify(tasks));
  }, [tasks]);

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks([...tasks, { id: Date.now().toString(), text: newTask, completed: false }]);
    setNewTask("");
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const activeCount = tasks.filter(t => !t.completed).length;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-blue-600" />
            Task Checklist
            {activeCount > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-auto">{activeCount} pending</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 my-2">
          <Input 
            placeholder="Add a new task..." 
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
          />
          <Button size="icon" onClick={addTask} disabled={!newTask.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="h-[300px] pr-4 -mr-4">
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No tasks yet. Stay organized!</p>
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.id} className="group flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors">
                  <Checkbox 
                    checked={task.completed} 
                    onCheckedChange={() => toggleTask(task.id)}
                    className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                  <span className={cn(
                    "flex-1 text-sm transition-all",
                    task.completed ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground font-medium"
                  )}>
                    {task.text}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    onClick={() => deleteTask(task.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
