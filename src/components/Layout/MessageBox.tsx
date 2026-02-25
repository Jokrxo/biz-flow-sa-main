import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Search, User, Check, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read: boolean;
}

interface ChatUser {
  id: string; // This is the user_id
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url?: string | null;
  unread_count?: number;
  last_message?: string;
  last_message_time?: string;
}

export const MessageBox = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeChat, setActiveChat] = useState<ChatUser | null>(null);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // 1. Load Users (Colleagues)
  useEffect(() => {
    if (!open || !user) return;
    
    const loadUsers = async () => {
      // Get current user's company
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (!profile?.company_id) return;

      // 1. Get all profiles in the same company (excluding self)
      const { data: colleagues } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .eq('company_id', profile.company_id)
        .neq('user_id', user.id);

      // 2. Also get any users who are assigned to this company via user_roles (e.g. Accountants)
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('company_id', profile.company_id)
        .neq('user_id', user.id);
      
      const roleUserIds = (roles || []).map(r => r.user_id);
      
      // 3. Combine unique users
      const profileUsers = colleagues || [];
      
      // Fetch details for role-based users if they weren't in the first list
      const existingIds = new Set(profileUsers.map(u => u.user_id));
      const newIds = roleUserIds.filter(id => !existingIds.has(id));
      
      let allUsers = [...profileUsers];
      
      if (newIds.length > 0) {
        const { data: roleProfiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, email')
          .in('user_id', newIds);
          
        if (roleProfiles) {
          allUsers = [...allUsers, ...roleProfiles];
        }
      }

      if (allUsers.length > 0) {
        // Fetch unread counts and last messages
        const usersWithMeta = await Promise.all(allUsers.map(async (col) => {
          // Count unread
          const { count } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('sender_id', col.user_id)
            .eq('receiver_id', user.id)
            .eq('read', false);
            
          // Get last message
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('content, created_at')
            .or(`and(sender_id.eq.${col.user_id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${col.user_id})`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            id: col.user_id,
            first_name: col.first_name,
            last_name: col.last_name,
            email: col.email,
            unread_count: count || 0,
            last_message: lastMsg?.content,
            last_message_time: lastMsg?.created_at
          };
        }));
        
        // Sort by last message time
        usersWithMeta.sort((a, b) => {
          if (!a.last_message_time) return 1;
          if (!b.last_message_time) return -1;
          return new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime();
        });

        setUsers(usersWithMeta);
      }
    };

    loadUsers();
    
    // Subscribe to new messages to update list
    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadUsers();
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [open, user]);

  // 2. Load Messages for Active Chat
  useEffect(() => {
    if (!activeChat || !user) return;

    const loadMessages = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeChat.id}),and(sender_id.eq.${activeChat.id},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      
      setMessages(data || []);
      setLoading(false);
      
      // Mark as read
      const unreadIds = (data || []).filter(m => m.receiver_id === user.id && !m.read).map(m => m.id);
      if (unreadIds.length > 0) {
        await supabase.from('messages').update({ read: true }).in('id', unreadIds);
        // Update local unread count
        setUsers(prev => prev.map(u => u.id === activeChat.id ? { ...u, unread_count: 0 } : u));
      }
      
      scrollToBottom();
    };

    loadMessages();

    // Realtime subscription for this chat
    const channel = supabase
      .channel(`chat:${activeChat.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `receiver_id=eq.${user.id}` 
      }, (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.sender_id === activeChat.id) {
          setMessages(prev => [...prev, newMsg]);
          scrollToBottom();
          // Mark as read immediately if chat is open
          supabase.from('messages').update({ read: true }).eq('id', newMsg.id);
        }
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'messages'
      }, (payload) => {
        // Handle read receipts
        const updated = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChat, user]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 100);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeChat || !user) return;

    const content = newMessage.trim();
    setNewMessage(""); // Optimistic clear

    try {
      // Get company id
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      
      const { data, error } = await supabase.from('messages').insert({
        company_id: profile?.company_id,
        sender_id: user.id,
        receiver_id: activeChat.id,
        content: content,
        read: false
      }).select().single();

      if (error) throw error;
      if (data) {
        setMessages(prev => [...prev, data]);
        scrollToBottom();
      }
    } catch (error) {
      console.error("Failed to send", error);
    }
  };

  const filteredUsers = users.filter(u => 
    (u.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
     u.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     u.email?.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  const totalUnread = users.reduce((sum, u) => sum + (u.unread_count || 0), 0);

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon" 
        className="relative h-10 w-10 rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="h-5 w-5" />
        {totalUnread > 0 && (
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-background animate-pulse" />
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[800px] h-[600px] p-0 gap-0 overflow-hidden flex flex-row">
          
          {/* Left Sidebar: Users List */}
          <div className={`w-full sm:w-80 border-r flex flex-col bg-muted/10 ${activeChat ? 'hidden sm:flex' : 'flex'}`}>
            <div className="p-4 border-b">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Messages
              </h2>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search people..." 
                  className="pl-9 bg-background" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No colleagues found.
                </div>
              ) : (
                <div className="flex flex-col">
                  {filteredUsers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => setActiveChat(u)}
                      className={cn(
                        "flex items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors border-b last:border-0",
                        activeChat?.id === u.id && "bg-primary/5 hover:bg-primary/10"
                      )}
                    >
                      <div className="relative">
                        <Avatar>
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {(u.first_name?.[0] || u.email?.[0] || "?").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {u.unread_count && u.unread_count > 0 ? (
                          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-600 text-[10px] text-white flex items-center justify-center border-2 border-background">
                            {u.unread_count}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between items-baseline">
                          <span className="font-medium text-sm truncate">
                            {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email?.split('@')[0]}
                          </span>
                          {u.last_message_time && (
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                              {formatDistanceToNow(new Date(u.last_message_time), { addSuffix: false }).replace('about ', '')}
                            </span>
                          )}
                        </div>
                        <p className={cn("text-xs truncate mt-1", u.unread_count ? "text-foreground font-medium" : "text-muted-foreground")}>
                          {u.last_message || "Start a conversation"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right Area: Chat Window */}
          <div className={`flex-1 flex flex-col bg-background ${!activeChat ? 'hidden sm:flex' : 'flex'}`}>
            {activeChat ? (
              <>
                {/* Chat Header */}
                <div className="h-16 border-b flex items-center justify-between px-4 shrink-0 bg-muted/5">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="sm:hidden -ml-2" onClick={() => setActiveChat(null)}>
                      <Check className="h-4 w-4 rotate-180" /> {/* Back Icon Hack */}
                    </Button>
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {(activeChat.first_name?.[0] || activeChat.email?.[0] || "?").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm">
                        {[activeChat.first_name, activeChat.last_name].filter(Boolean).join(' ') || activeChat.email}
                      </div>
                      <div className="text-xs text-muted-foreground">Online</div>
                    </div>
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm">No messages yet. Say hello!</p>
                    </div>
                  ) : (
                    messages.map((msg, i) => {
                      const isMe = msg.sender_id === user?.id;
                      const showAvatar = !isMe && (i === 0 || messages[i-1].sender_id !== msg.sender_id);
                      
                      return (
                        <div key={msg.id} className={cn("flex gap-2 max-w-[80%]", isMe ? "ml-auto flex-row-reverse" : "")}>
                          {!isMe && (
                            <div className="w-8 shrink-0">
                              {showAvatar && (
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs">
                                    {(activeChat.first_name?.[0] || "?").toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          )}
                          <div className={cn(
                            "rounded-2xl px-4 py-2 text-sm",
                            isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted rounded-tl-none"
                          )}>
                            {msg.content}
                            <div className={cn("text-[10px] mt-1 opacity-70 flex items-center justify-end gap-1", isMe ? "text-primary-foreground/80" : "text-muted-foreground")}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {isMe && (
                                msg.read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t bg-muted/5 mt-auto">
                  <form 
                    className="flex gap-2"
                    onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                  >
                    <Input 
                      placeholder="Type a message..." 
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      className="rounded-full bg-muted/50 border-transparent focus:bg-background transition-colors"
                    />
                    <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={!newMessage.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground text-lg mb-2">Your Messages</h3>
                <p className="max-w-xs">Select a colleague from the list to start chatting or send a direct message.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
