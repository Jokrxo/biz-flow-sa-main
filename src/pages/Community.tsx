import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Heart, ThumbsUp, Star } from "lucide-react";

interface CommunityPost {
  id: string;
  user_id: string | null;
  author_name: string | null;
  title: string;
  content: string;
  created_at: string;
}

interface CommunityComment {
  id: string;
  post_id: string;
  user_id: string | null;
  author_name: string | null;
  content: string;
  created_at: string;
}

export default function Community() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<string, { comments: number; likes: number; loves: number }>>({});
  const [avgRating, setAvgRating] = useState<{ avg: number; count: number }>({ avg: 0, count: 0 });
  const [myRating, setMyRating] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState<string>("");
  const [starCounts, setStarCounts] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const [reviews, setReviews] = useState<Array<{ rating: number; comment: string | null; created_at: string }>>([]);

  useEffect(() => {
    const channel = supabase
      .channel("community-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, () => loadPosts())
      .on("postgres_changes", { event: "*", schema: "public", table: "community_comments" }, () => loadCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "community_reactions" }, () => loadCounts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadCounts() {
    try {
      const ids = posts.map(p => p.id);
      if (ids.length === 0) return;
      const { data: comments } = await supabase
        .from("community_comments")
        .select("id, post_id")
        .in("post_id", ids);
      const { data: reactions } = await supabase
        .from("community_reactions")
        .select("id, post_id, type")
        .in("post_id", ids);
      const next: typeof counts = {};
      ids.forEach(id => { next[id] = { comments: 0, likes: 0, loves: 0 }; });
      (comments || []).forEach((c: any) => { const k = String(c.post_id); next[k] = next[k] || { comments: 0, likes: 0, loves: 0 }; next[k].comments += 1; });
      (reactions || []).forEach((r: any) => { const k = String(r.post_id); next[k] = next[k] || { comments: 0, likes: 0, loves: 0 }; if (String(r.type).toLowerCase() === "like") next[k].likes += 1; else if (String(r.type).toLowerCase() === "love") next[k].loves += 1; });
      setCounts(next);
    } catch {}
  }

  async function loadPosts() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("community_posts")
        .select("id, user_id, author_name, title, content, created_at")
        .order("created_at", { ascending: false });
      setPosts((data || []) as any);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
      setTimeout(loadCounts, 0);
    }
  }

  async function loadRatings() {
    try {
      const { data: ratings } = await supabase
        .from("community_app_ratings")
        .select("rating, user_id, comment, created_at")
        .order("created_at", { ascending: false });
      const list = (ratings || []) as any[];
      const count = list.length;
      const avg = count > 0 ? (list.reduce((s, r) => s + Number(r.rating || 0), 0) / count) : 0;
      setAvgRating({ avg, count });
      const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      list.forEach(r => { const k = Math.max(1, Math.min(5, Number(r.rating || 0))); buckets[k] = (buckets[k] || 0) + 1; });
      setStarCounts(buckets);
      setReviews(list.slice(0, 6).map(r => ({ rating: Number(r.rating || 0), comment: r.comment || null, created_at: r.created_at })));
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const mine = list.find(r => r.user_id === user.id);
          if (mine) setMyRating(Number(mine.rating || 0));
        }
      } catch {}
    } catch {}
  }

  useEffect(() => { loadPosts(); loadRatings(); }, []);

  async function submitPost() {
    try {
      const title = newTitle.trim();
      const content = newContent.trim();
      if (!title || !content) {
        toast({ title: "Missing fields", description: "Enter a title and content", variant: "destructive" });
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const author = user ? user.email : "Anonymous";
      const { error } = await supabase
        .from("community_posts")
        .insert({ title, content, user_id: user?.id ?? null, author_name: author });
      if (error) throw error;
      setNewTitle(""); setNewContent("");
      toast({ title: "Posted", description: "Your post is live" });
      loadPosts();
    } catch (e: any) {
      toast({ title: "Post failed", description: e.message || "Could not create post" , variant: "destructive" });
    }
  }

  async function addComment(postId: string) {
    try {
      const content = String(replyText[postId] || "").trim();
      if (!content) return;
      const { data: { user } } = await supabase.auth.getUser();
      const author = user ? user.email : "Anonymous";
      const { error } = await supabase
        .from("community_comments")
        .insert({ post_id: postId, content, user_id: user?.id ?? null, author_name: author });
      if (error) throw error;
      setReplyText(prev => ({ ...prev, [postId]: "" }));
      loadCounts();
    } catch (e: any) {
      toast({ title: "Reply failed", description: e.message || "Could not add reply", variant: "destructive" });
    }
  }

  async function react(postId: string, type: "like" | "love") {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("community_reactions")
        .insert({ post_id: postId, type, user_id: user?.id ?? null });
      if (error) throw error;
      loadCounts();
    } catch (e: any) {
      toast({ title: "Reaction failed", description: e.message || "Could not react", variant: "destructive" });
    }
  }

  async function submitRating() {
    try {
      if (!myRating || myRating < 1 || myRating > 5) {
        toast({ title: "Select a rating", description: "Choose between 1 and 5 stars", variant: "destructive" });
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("community_app_ratings")
        .insert({ rating: myRating, comment: ratingComment || null, user_id: user?.id ?? null });
      if (error) throw error;
      toast({ title: "Thanks!", description: "Your rating was recorded" });
      setRatingComment("");
      await loadRatings();
    } catch (e: any) {
      toast({ title: "Rating failed", description: e.message || "Could not submit rating", variant: "destructive" });
    }
  }

  const header = useMemo(() => (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <CardTitle>Rigel Community</CardTitle>
        <div className="inline-flex items-center gap-1">
          {[1,2,3,4,5].map(i => (
            <Star key={`head-${i}`} className={`h-4 w-4 ${i <= Math.round(avgRating.avg) ? 'text-yellow-500' : 'text-muted-foreground'}`} />
          ))}
          <span className="text-xs text-muted-foreground">{avgRating.avg.toFixed(1)} ({avgRating.count})</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">Share feedback, ask questions, and help others</span>
    </div>
  ), [avgRating.avg, avgRating.count]);

  return (
    <div className="container mx-auto p-6">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>App Ratings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {[1,2,3,4,5].map(i => (
                  <Star key={`avg-top-${i}`} className={`h-5 w-5 ${i <= Math.round(avgRating.avg) ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                ))}
                <span className="text-sm text-muted-foreground">{avgRating.avg.toFixed(1)} ({avgRating.count})</span>
              </div>
              {[5,4,3,2,1].map(i => {
                const total = avgRating.count || 1;
                const pct = Math.round(((starCounts[i] || 0) / total) * 100);
                return (
                  <div key={`bar-top-${i}`} className="flex items-center gap-2 mb-1">
                    <span className="text-xs w-6">{i}★</span>
                    <div className="flex-1 h-2 bg-muted rounded">
                      <div className="h-2 bg-amber-500 rounded" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs w-10 text-right">{starCounts[i] || 0}</span>
                  </div>
                );
              })}
            </div>
            <div>
              {reviews.length === 0 ? (
                <div className="text-sm text-muted-foreground">No reviews yet</div>
              ) : (
                <div className="space-y-3">
                  {reviews.map((r, idx) => (
                    <div key={`rev-top-${idx}`} className="p-3 border rounded">
                      <div className="flex items-center gap-1 mb-1">
                        {[1,2,3,4,5].map(i => (
                          <Star key={`rev-top-${idx}-${i}`} className={`h-4 w-4 ${i <= r.rating ? 'text-amber-500' : 'text-muted-foreground'}`} />
                        ))}
                        <span className="text-xs text-muted-foreground ml-2">{String(r.created_at).slice(0,10)}</span>
                      </div>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">{r.comment || 'No comment provided'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="mb-6 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950 dark:to-slate-900">
        <CardHeader>{header}</CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {[1,2,3,4,5].map(i => (
                  <button key={i} aria-label={`Rate ${i} star`} onClick={() => setMyRating(i)} className="p-1">
                    <Star className={`h-5 w-5 ${i <= Math.round(avgRating.avg) ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                  </button>
                ))}
                <span className="text-sm text-muted-foreground">Avg {avgRating.avg.toFixed(1)} ({avgRating.count})</span>
              </div>
              <div className="flex items-center gap-2">
                {[1,2,3,4,5].map(i => (
                  <button key={`mine-${i}`} aria-label={`Your rating ${i}`} onClick={() => setMyRating(i)} className="p-1">
                    <Star className={`h-5 w-5 ${i <= myRating ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  </button>
                ))}
              </div>
            </div>
            <Input placeholder="Optional comment about the app" value={ratingComment} onChange={e => setRatingComment(e.target.value)} />
            <div className="flex justify-end">
              <Button variant="outline" onClick={submitRating}>Submit Rating</Button>
            </div>
            <Input placeholder="Post title" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
            <Textarea placeholder="Share your thoughts, problems, or what you love about Rigel…" value={newContent} onChange={e => setNewContent(e.target.value)} />
            <div className="flex justify-end">
              <Button onClick={submitPost}>Post</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card mb-6">
        <CardHeader>
          <CardTitle>Latest Posts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-muted-foreground">Loading community…</div>
          ) : posts.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No posts yet. Be the first to share!</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell>{p.author_name || "Anonymous"}</TableCell>
                    <TableCell>{String(p.created_at).slice(0, 10)}</TableCell>
                    <TableCell className="text-right">
                      <div className="space-y-2 text-sm">
                        <div className="text-muted-foreground whitespace-pre-wrap">{p.content}</div>
                        <div className="flex items-center gap-3">
                          <Button variant="outline" size="sm" onClick={() => react(p.id, "like")}><ThumbsUp className="h-3 w-3 mr-1" /> Like ({counts[p.id]?.likes || 0})</Button>
                          <Button variant="outline" size="sm" onClick={() => react(p.id, "love")}><Heart className="h-3 w-3 mr-1" /> Love ({counts[p.id]?.loves || 0})</Button>
                          <div className="inline-flex items-center gap-1 text-muted-foreground"><MessageSquare className="h-3 w-3" /> {counts[p.id]?.comments || 0} replies</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input placeholder="Write a reply" value={replyText[p.id] || ""} onChange={e => setReplyText(prev => ({ ...prev, [p.id]: e.target.value }))} />
                          <Button size="sm" onClick={() => addComment(p.id)}>Reply</Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      
    </div>
  );
}
