import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Percent } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

export const TaxRates = () => {
  const rates = [
    { name: "Standard VAT Rate", rate: "15%", description: "Applied to most goods and services" },
    { name: "Zero-Rated VAT", rate: "0%", description: "Applied to exports and basic food items" },
    { name: "Income Tax (Corporate)", rate: "27%", description: "Standard corporate tax rate" },
  ];

  const wearAndTear = [
    { asset: "Computer hardware", method: "Straight-line", period: "3 years", note: "General IT equipment" },
    { asset: "Off-the-shelf software", method: "Straight-line", period: "3 years", note: "Licenses and packages" },
    { asset: "Office equipment (printers/copiers)", method: "Straight-line", period: "3–5 years", note: "Per model usage" },
    { asset: "Furniture and fittings", method: "Straight-line", period: "6 years", note: "Desks, chairs, cabinets" },
    { asset: "Motor vehicles (passenger)", method: "Straight-line", period: "5 years", note: "Company cars" },
    { asset: "Delivery vehicles (commercial)", method: "Straight-line", period: "4–5 years", note: "Light commercial vehicles" },
    { asset: "Plant and machinery (general)", method: "Straight-line", period: "5–10 years", note: "Depends on class" },
    { asset: "Manufacturing equipment", method: "Straight-line", period: "5–10 years", note: "Per class schedules" },
    { asset: "Tools and implements", method: "Straight-line", period: "3–5 years", note: "Frequent replacement" },
    { asset: "Servers & network gear", method: "Straight-line", period: "3–5 years", note: "Data/Comms equipment" }
  ];

  const capitalAllowances = [
    { allowance: "Section 12C (Manufacturing plant)", pattern: "20% p.a. over 5 years", note: "New/unused assets used in manufacturing" },
    { allowance: "Small Business Corporation (qualifying)", pattern: "Accelerated per SBC rules", note: "Subject to SBC eligibility" },
    { allowance: "Section 12B (Renewable energy – PV)", pattern: "50/30/20", note: "Certain solar PV installations" },
    { allowance: "Section 12B (Renewable energy – other)", pattern: "Accelerated schedules", note: "Per technology class" },
    { allowance: "Buildings – s13 industrial", pattern: "Per regime", note: "Specific industrial building allowance" },
    { allowance: "Leasehold improvements", pattern: "Regime specific", note: "Depends on lease and improvement nature" }
  ];

  let filter = "";

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-primary" />
          Tax Rates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-4">
            {rates.map((rate) => (
              <div key={rate.name} className="flex items-center justify-between p-4 border rounded">
                <div>
                  <p className="font-medium">{rate.name}</p>
                  <p className="text-sm text-muted-foreground">{rate.description}</p>
                </div>
                <span className="text-2xl font-bold text-primary">{rate.rate}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-lg font-semibold">Wear-and-Tear Allowances</p>
            <Input placeholder="Filter asset class..." onChange={(e) => { filter = e.target.value.toLowerCase(); }} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset class</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wearAndTear
                  .filter(a => !filter || a.asset.toLowerCase().includes(filter))
                  .map((a) => (
                    <TableRow key={`${a.asset}-${a.period}`}>
                      <TableCell>{a.asset}</TableCell>
                      <TableCell>{a.method}</TableCell>
                      <TableCell>{a.period}</TableCell>
                      <TableCell className="text-muted-foreground">{a.note}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3">
            <p className="text-lg font-semibold">Capital Allowances</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Allowance</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {capitalAllowances.map((c) => (
                  <TableRow key={`${c.allowance}-${c.pattern}`}>
                    <TableCell>{c.allowance}</TableCell>
                    <TableCell>{c.pattern}</TableCell>
                    <TableCell className="text-muted-foreground">{c.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
