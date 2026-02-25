import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, Shield, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";

declare global {
  interface Window {
    Connect: any;
  }
}

export const ConnectBank = ({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  
  const supportedBanks = [
      { name: "ABSA", logo: "https://upload.wikimedia.org/wikipedia/commons/c/c2/ABSA_Group_Limited_Logo.svg" },
      { name: "FNB", logo: "https://upload.wikimedia.org/wikipedia/en/8/80/First_National_Bank_Logo.svg" },
      { name: "Standard Bank", logo: "https://upload.wikimedia.org/wikipedia/commons/3/30/Standard_Bank_Logo.svg" },
      { name: "Nedbank", logo: "https://upload.wikimedia.org/wikipedia/commons/e/e9/Nedbank_logo.svg" },
      { name: "Capitec", logo: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Capitec_Bank_Logo.svg" },
      { name: "Investec", logo: "https://upload.wikimedia.org/wikipedia/en/8/87/Investec_Bank_Logo.svg" },
      { name: "Discovery Bank", logo: "https://upload.wikimedia.org/wikipedia/en/thumb/8/8b/Discovery_Limited_logo.svg/1200px-Discovery_Limited_logo.svg.png" },
      { name: "TymeBank", logo: "https://upload.wikimedia.org/wikipedia/commons/6/62/TymeBank_Logo.png" },
      { name: "African Bank", logo: "https://upload.wikimedia.org/wikipedia/en/5/5f/African_Bank_Limited_Logo.svg" },
      { name: "Bidvest", logo: "https://upload.wikimedia.org/wikipedia/en/1/12/Bidvest_Bank_Logo.svg" },
  ];

  // Load Mono Connect Script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://connect.withmono.com/connect.js";
    script.async = true;
    document.body.appendChild(script);
    
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleConnect = async () => {
    if (!window.Connect) {
      toast({
        title: "System Not Ready",
        description: "Banking secure connection is initializing. Please try again in a moment.",
        variant: "destructive"
      });
      return;
    }

    // Fetch profile for pre-filling Mono customer data
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user?.id || "")
      .single();

    const connect = new window.Connect({
      key: "test_pk_ei45hnd8deegfysyvy82", // Using provided Test Public Key
      onSuccess: async (code: any) => {
        console.log("Mono Success Code (Raw):", code);
        
        // Handle object vs string
        let codeString = code;
        if (typeof code === 'object' && code !== null) {
            codeString = code.code || code.token;
        }
        if (typeof codeString !== 'string') {
             codeString = String(codeString);
        }
        
        // Debug Toast
        toast({ title: "Debug Code", description: `Code: ${codeString}` });

        setIsConnecting(true);
        toast({ title: "Authenticating", description: "Verifying credentials with bank..." });
        
        try {
           // 1. Exchange Token via Local Proxy
           const response = await fetch('http://localhost:3000/mono-exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: codeString })
           });
           
           if (!response.ok) {
             const errData = await response.json();
             throw new Error(errData.error || "Failed to exchange token");
           }
           
           const monoData = await response.json();
           
           if (!monoData?.id) throw new Error("Failed to retrieve account ID");
           
           console.log("Mono Exchange Result:", monoData);
           
           const accountId = monoData.id;
           const details = monoData.details?.account;
           const meta = monoData.details?.meta;

           // 2. Save to Database
           if (profile?.company_id) {
               const { error: dbError } = await supabase.from("bank_accounts").insert({
                   company_id: profile.company_id,
                   bank_name: details?.institution?.name || "Mono Connected Bank",
                   account_name: details?.name || "Business Account",
                   account_number: details?.accountNumber || "XXXX",
                   currency: details?.currency || "NGN",
                   current_balance: details?.balance || 0,
                   opening_balance: details?.balance || 0,
                   mono_account_id: accountId,
                   auth_method: meta?.auth_method,
                   data_status: meta?.data_status,
                   status: 'active',
                   // Store last synced time
                   last_synced_at: new Date().toISOString()
               });
               
               if (dbError) throw dbError;
           }

           toast({ 
             title: "Success", 
             description: `${details?.institution?.name || "Bank"} account connected successfully!` 
           });
           
           // Close the dialog logic would go here if we had control over the Dialog state via props or context
           // For now, we rely on the user closing it or the success message
           
        } catch (err: any) {
           console.error("Link Error:", err);
           toast({ 
             title: "Linking Failed", 
             description: err.message || "Could not finalize bank connection.", 
             variant: "destructive" 
           });
        } finally {
           setIsConnecting(false);
        }
      },
      onClose: () => {
        console.log("Widget closed");
        setIsConnecting(false);
      },
      onEvent: (eventName: string, data: any) => {
        console.log("Mono Event:", eventName, data);
      },
      data: {
        customer: {
            name: (profile?.first_name || "Guest") + " " + (profile?.last_name || "User"),
            email: profile?.email || user?.email || "user@example.com",
            // id field removed to prevent Mono from looking up a non-existent customer
        }
      }
    });
    
    connect.setup();
    connect.open();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="flex flex-col items-center justify-center pb-2 border-b">
           <img src="/logo.png" alt="Rigel Business" className="h-12 w-auto mb-2" />
           <DialogTitle className="text-xl">Connect Bank Account</DialogTitle>
          <DialogDescription className="text-center">
            Link your business bank account securely to automatically import transactions.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center justify-center py-6 space-y-6">
            
            {/* Card Icons */}
            <div className="flex items-center gap-4 mb-2">
                 {/* Visa */}
                 <div className="h-8 w-12 bg-white border rounded shadow-sm flex items-center justify-center">
                    <span className="font-bold text-blue-800 italic text-sm font-sans">VISA</span>
                 </div>
                 {/* Mastercard */}
                 <div className="h-8 w-12 bg-white border rounded flex items-center justify-center relative overflow-hidden shadow-sm">
                    <div className="absolute left-2 w-5 h-5 bg-[#EB001B] rounded-full opacity-90 z-10"></div>
                    <div className="absolute right-2 w-5 h-5 bg-[#F79E1B] rounded-full opacity-90"></div>
                 </div>
            </div>

            <Button 
              onClick={handleConnect} 
              disabled={isConnecting} 
              className="w-full max-w-sm h-12 text-md font-medium bg-[#182d52] hover:bg-[#182d52]/90 shadow-lg transition-all" 
            >
                {isConnecting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Connecting to Mono...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-5 w-5 text-green-400" />
                    Link Bank Account Securely
                  </>
                )}
            </Button>
            
            <div className="w-full space-y-3">
                 <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    <div className="h-px bg-slate-200 w-12"></div>
                    Supported South African Banks
                    <div className="h-px bg-slate-200 w-12"></div>
                 </div>
                 
                 <div className="grid grid-cols-5 gap-2 px-2">
                    {supportedBanks.map((bank) => (
                        <div key={bank.name} className="flex flex-col items-center justify-center p-2 rounded-md hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group" title={bank.name}>
                            <div className="w-8 h-8 rounded-full bg-white shadow-sm border flex items-center justify-center overflow-hidden mb-1">
                                {/* Fallback to text if image fails or use specific text colors for known banks if no image */}
                                <span className="text-[8px] font-bold text-slate-700 leading-none text-center">{bank.name.substring(0,2)}</span>
                            </div>
                            <span className="text-[9px] text-slate-500 text-center truncate w-full group-hover:text-slate-800">{bank.name}</span>
                        </div>
                    ))}
                 </div>
            </div>

            <div className="text-center space-y-1">
                 <p className="text-xs text-muted-foreground">
                    Secured by <strong>Mono</strong>. Your credentials are encrypted and never stored.
                 </p>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
