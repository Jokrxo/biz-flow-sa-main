import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Receipt, Building, Calculator, TrendingUp, Wallet, CreditCard, PieChart, DollarSign, FileText, Users, Crown, Settings, Info, Building2, PlayCircle, X } from "lucide-react";
import { useState } from "react";

interface DocumentationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const appVersion = (import.meta as any).env?.VITE_APP_VERSION || "2025.12.04";

export const DocumentationModal = ({ open, onOpenChange }: DocumentationModalProps) => {
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  const handlePlayVideo = (title: string) => {
    // In a real app, you would map titles to actual video URLs
    setPlayingVideo(title);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden">
        {playingVideo ? (
          <div className="flex-1 bg-black flex flex-col items-center justify-center relative animate-in fade-in">
            <button 
              onClick={() => setPlayingVideo(null)}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-50"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="text-center text-white space-y-4">
              <PlayCircle className="h-20 w-20 mx-auto text-white/50" />
              <h3 className="text-2xl font-bold">Tutorial: {playingVideo}</h3>
              <p className="text-white/60">Video player placeholder</p>
            </div>
          </div>
        ) : (
          <>
        {/* Header Area with Logo & Version */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-soft-light"></div>
          <div className="relative z-10 flex items-center gap-4">
            <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md border border-white/20 shadow-inner">
              <img 
                src="/logo.png" 
                alt="Rigel Business" 
                className="w-12 h-12 object-cover rounded-lg"
              />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Rigel Business Documentation</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm">
                  v{appVersion}
                </Badge>
                <span className="text-slate-300 text-sm">The "How-To" Guide for Humans</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex">
          <Tabs defaultValue="overview" className="flex-1 flex flex-col">
            <div className="border-b px-6 py-2 bg-slate-50/50 shrink-0">
              <TabsList className="w-full justify-start h-auto p-0 bg-transparent gap-6 overflow-x-auto no-scrollbar">
                <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3">Overview</TabsTrigger>
                <TabsTrigger value="accounting" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3">Accounting</TabsTrigger>
                <TabsTrigger value="sales" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3">Sales & Purchase</TabsTrigger>
                <TabsTrigger value="system" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 py-3">System</TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1 bg-slate-50/30">
              <div className="p-6 space-y-8 max-w-4xl mx-auto">
                
                {/* Overview Tab */}
                <TabsContent value="overview" className="m-0 space-y-6 animate-in fade-in-50">
                  <div className="prose max-w-none">
                    <h3 className="text-xl font-bold text-slate-900">Welcome to the Command Center! 🚀</h3>
                    <p className="text-muted-foreground">This is where you pretend to know exactly what's happening with your money. We've organized everything into neat little boxes so you don't panic.</p>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <DocCard 
                      icon={LayoutDashboard} 
                      title="Dashboard" 
                      desc="The 'Big Picture'. It has colorful charts that go up (good) or down (panic). Use this to impress your boss or just stare at it while sipping coffee."
                      onPlay={() => handlePlayVideo("Dashboard Walkthrough")}
                    />
                    <DocCard 
                      icon={Receipt} 
                      title="Transactions" 
                      desc="The heartbeat of your business. Every penny in and out lives here. If it's not here, it didn't happen (or you're committing tax fraud, but let's assume the first one)."
                      onPlay={() => handlePlayVideo("Managing Transactions")}
                    />
                    <DocCard 
                      icon={Building} 
                      title="Bank" 
                      desc="Connect your real bank accounts so you don't have to type things manually. It's like magic, but with more security protocols."
                      onPlay={() => handlePlayVideo("Bank Feeds")}
                    />
                  </div>
                </TabsContent>

                {/* Accounting Tab */}
                <TabsContent value="accounting" className="m-0 space-y-6 animate-in fade-in-50">
                  <div className="prose max-w-none">
                    <h3 className="text-xl font-bold text-slate-900">The Bean Counting Zone 🧮</h3>
                    <p className="text-muted-foreground">This is the serious stuff. Put on your glasses and look professional.</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <DocCard 
                      icon={Receipt} 
                      title="Tax" 
                      desc="Nobody likes it, but everyone has to do it. We track your VAT so the taxman doesn't come knocking. You're welcome."
                      onPlay={() => handlePlayVideo("Tax & VAT")}
                    />
                    <DocCard 
                      icon={Building2} 
                      title="Fixed Assets" 
                      desc="Tracks the stuff you own that you can touch. Computers, desks, the office cat (kidding, cats are expenses). We calculate depreciation so you don't have to."
                      onPlay={() => handlePlayVideo("Fixed Assets")}
                    />
                    <DocCard 
                      icon={Calculator} 
                      title="Trial Balance" 
                      desc="The accountant's favorite toy. It proves that your left side matches your right side. If it doesn't balance, the universe might implode."
                      onPlay={() => handlePlayVideo("Trial Balance")}
                    />
                    <DocCard 
                      icon={TrendingUp} 
                      title="Financial Reports" 
                      desc="Income Statements, Balance Sheets, Cash Flow. The holy trinity of 'Are we making money?'. Print these out to look important in meetings."
                      onPlay={() => handlePlayVideo("Reporting")}
                    />
                    <DocCard 
                      icon={Wallet} 
                      title="Budget" 
                      desc="A fantasy land where you plan how much you *want* to spend. Real life will probably laugh at this, but it's good to have goals."
                      onPlay={() => handlePlayVideo("Budgeting")}
                    />
                    <DocCard 
                      icon={CreditCard} 
                      title="Loans" 
                      desc="Money you borrowed. We track the interest so you can cry about it later accurately."
                      onPlay={() => handlePlayVideo("Loans Management")}
                    />
                    <DocCard 
                      icon={PieChart} 
                      title="Investments" 
                      desc="Where you park money hoping it grows. Like a digital garden, but with compound interest instead of fertilizer."
                      onPlay={() => handlePlayVideo("Investments")}
                    />
                    <DocCard 
                      icon={DollarSign} 
                      title="Payroll" 
                      desc="Paying people to tolerate you. Tracks salaries, PAYE, and UIF. Keep your employees happy, or they'll eat your lunch from the fridge."
                      onPlay={() => handlePlayVideo("Payroll Basics")}
                    />
                  </div>
                </TabsContent>

                {/* Sales & Purchase Tab */}
                <TabsContent value="sales" className="m-0 space-y-6 animate-in fade-in-50">
                  <div className="prose max-w-none">
                    <h3 className="text-xl font-bold text-slate-900">Money In, Money Out 💸</h3>
                    <p className="text-muted-foreground">The circle of life. You sell things, you buy things. We just write it down.</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <DocCard 
                      icon={FileText} 
                      title="Invoices" 
                      desc="Polite letters asking for money. You send these to people who owe you. We make them look pretty so they pay faster."
                      onPlay={() => handlePlayVideo("Invoicing 101")}
                    />
                    <DocCard 
                      icon={FileText} 
                      title="Quotes" 
                      desc="Like an invoice, but with commitment issues. 'This is what it MIGHT cost'. If they say yes, you turn it into an invoice with one click."
                      onPlay={() => handlePlayVideo("Quotes & Estimates")}
                    />
                    <DocCard 
                      icon={DollarSign} 
                      title="Sales" 
                      desc="The fun part! A dashboard showing how popular you are. Watch the numbers go up and feel the dopamine hit."
                      onPlay={() => handlePlayVideo("Sales Dashboard")}
                    />
                    <DocCard 
                      icon={CreditCard} 
                      title="Purchase" 
                      desc="The spending part. Track what you buy from suppliers. Try to keep this number smaller than the Sales number. That's business 101."
                      onPlay={() => handlePlayVideo("Purchases")}
                    />
                    <DocCard 
                      icon={Users} 
                      title="Customers" 
                      desc="Your fan club. Keep their details here. Name, email, phone number, and how much they owe you."
                      onPlay={() => handlePlayVideo("Customer Management")}
                    />
                  </div>
                </TabsContent>

                {/* System Tab */}
                <TabsContent value="system" className="m-0 space-y-6 animate-in fade-in-50">
                  <div className="prose max-w-none">
                    <h3 className="text-xl font-bold text-slate-900">The Engine Room ⚙️</h3>
                    <p className="text-muted-foreground">Tweak the knobs and dials to make Rigel run perfectly for you.</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <DocCard 
                      icon={Crown} 
                      title="License" 
                      desc="Your golden ticket. Shows what plan you're on. Upgrade here if you want more power (and we want more money)."
                      onPlay={() => handlePlayVideo("License Management")}
                    />
                    <DocCard 
                      icon={Settings} 
                      title="Settings" 
                      desc="Customize everything. Logos, tax rates, users, email templates. Make it yours."
                      onPlay={() => handlePlayVideo("System Settings")}
                    />
                    <DocCard 
                      icon={Info} 
                      title="About" 
                      desc="Who made this masterpiece? (Spoiler: It was Stella Lumen). Also shows technical mumbo-jumbo like version numbers."
                      onPlay={() => handlePlayVideo("About Rigel")}
                    />
                  </div>
                </TabsContent>

              </div>
            </ScrollArea>
          </Tabs>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const DocCard = ({ icon: Icon, title, desc, onPlay }: { icon: any, title: string, desc: string, onPlay: () => void }) => (
  <Card className="overflow-hidden hover:shadow-md transition-all duration-200 border-slate-200 bg-white group cursor-pointer" onClick={onPlay}>
    <CardHeader className="flex flex-row items-center gap-4 pb-2 space-y-0 bg-slate-50/50 border-b border-slate-100">
      <div className="p-2 bg-white rounded-lg border shadow-sm text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 flex items-center justify-between">
        <CardTitle className="text-base font-bold text-slate-800">{title}</CardTitle>
        <PlayCircle className="h-5 w-5 text-slate-400 group-hover:text-primary transition-colors" />
      </div>
    </CardHeader>
    <CardContent className="pt-4">
      <CardDescription className="text-sm leading-relaxed text-slate-600">
        {desc}
      </CardDescription>
    </CardContent>
  </Card>
);
