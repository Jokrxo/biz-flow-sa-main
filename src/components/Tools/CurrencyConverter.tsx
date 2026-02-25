import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft, RefreshCw, DollarSign } from "lucide-react";
import { Label } from "@/components/ui/label";

interface CurrencyConverterProps {
  isOpen: boolean;
  onClose: () => void;
}

const RATES: Record<string, number> = {
  ZAR: 1,
  USD: 0.053, // 1 ZAR = 0.053 USD
  EUR: 0.049,
  GBP: 0.042,
  AUD: 0.081,
};

const SYMBOLS: Record<string, string> = {
  ZAR: "R",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
};

export const CurrencyConverter = ({ isOpen, onClose }: CurrencyConverterProps) => {
  const [amount, setAmount] = useState<string>("100");
  const [from, setFrom] = useState("ZAR");
  const [to, setTo] = useState("USD");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const calculate = () => {
    setLoading(true);
    // Simulate API delay
    setTimeout(() => {
      const val = parseFloat(amount);
      if (isNaN(val)) {
        setResult("Invalid");
        setLoading(false);
        return;
      }

      // Convert to base (ZAR) then to target
      // Rate is ZAR -> Currency. 
      // If From is not ZAR, we divide by its rate to get ZAR, then multiply by To rate.
      // Wait, my rates above are 1 ZAR = X Currency.
      // So ZAR -> USD = 1 * 0.053
      // USD -> ZAR = 1 / 0.053
      
      const fromRate = RATES[from];
      const toRate = RATES[to];
      
      // Convert 'from' to ZAR
      const inZar = val / fromRate;
      
      // Convert ZAR to 'to'
      const final = inZar * toRate;
      
      setResult(final.toFixed(2));
      setLoading(false);
    }, 600);
  };

  useEffect(() => {
    if (isOpen) calculate();
  }, [isOpen, amount, from, to]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Currency Converter
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground font-semibold">{SYMBOLS[from]}</span>
              <Input 
                type="number" 
                value={amount} 
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div className="space-y-2">
              <Label>From</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(RATES).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button variant="ghost" size="icon" className="mb-0.5" onClick={swap}>
              <ArrowRightLeft className="h-4 w-4" />
            </Button>

            <div className="space-y-2">
              <Label>To</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(RATES).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-center space-y-1">
            <div className="text-sm text-muted-foreground">Result</div>
            <div className="text-3xl font-bold text-foreground flex items-center justify-center gap-2">
              {loading ? (
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <span className="text-muted-foreground text-lg align-top">{SYMBOLS[to]}</span>
                  {result}
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              1 {from} = {(RATES[to] / RATES[from]).toFixed(4)} {to}
            </div>
          </div>
          
          <div className="text-[10px] text-center text-muted-foreground">
            * Rates are for demonstration purposes only.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
