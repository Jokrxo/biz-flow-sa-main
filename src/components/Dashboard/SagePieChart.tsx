import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Label, Legend } from "recharts";
import { MoreHorizontal, Table as TableIcon, PieChart as PieChartIcon, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from 'xlsx';

interface DataItem {
  name: string;
  value: number;
}

interface SagePieChartProps {
  title: string;
  data: DataItem[];
  totalAmount: number;
  icon: any;
  iconColor?: string;
  storageKey: string;
  colors: string[];
  limit?: number;
  formatType?: 'currency' | 'number';
}

export const SagePieChart = ({
  title,
  data,
  totalAmount,
  icon: Icon,
  iconColor = "text-primary",
  storageKey,
  colors,
  limit = 5,
  formatType = 'currency'
}: SagePieChartProps) => {
  // Persist view preference
  const [viewMode, setViewMode] = useState<'chart' | 'table'>(() => {
    const saved = localStorage.getItem(`viewMode-${storageKey}`);
    return (saved === 'table' ? 'table' : 'chart');
  });

  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleViewChange = (mode: 'chart' | 'table') => {
    setViewMode(mode);
    localStorage.setItem(`viewMode-${storageKey}`, mode);
  };

  // Process data: Sort desc, take top N, group others
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Clone and sort
    const sorted = [...data].sort((a, b) => b.value - a.value);
    
    if (sorted.length <= limit) return sorted;

    const top = sorted.slice(0, limit);
    const others = sorted.slice(limit);
    const otherValue = others.reduce((sum, item) => sum + item.value, 0);

    if (otherValue > 0) {
      return [...top, { name: "Other", value: otherValue }];
    }
    return top;
  }, [data, limit]);

  // Export to Excel
  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(processedData.map(d => ({
      Category: d.name,
      Amount: d.value,
      Percentage: `${((d.value / totalAmount) * 100).toFixed(1)}%`
    })));
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}.xlsx`);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const percent = totalAmount > 0 ? (d.value / totalAmount) * 100 : 0;
      
      const formattedValue = formatType === 'currency' 
        ? `R ${d.value.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
        : d.value.toLocaleString('en-ZA');

      return (
        <div className="bg-background border border-border p-2 rounded-lg shadow-lg text-sm">
          <div className="font-semibold mb-1">{d.name}</div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <span>{formatType === 'currency' ? 'Amount' : 'Value'}:</span>
            <span className="font-mono font-medium text-foreground">{formattedValue}</span>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <span>Share:</span>
            <span className="font-mono font-medium text-foreground">{percent.toFixed(1)}%</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="card-professional shadow-md hover:shadow-lg transition-all duration-300 flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-4 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <div className={cn("p-2 rounded-lg bg-primary/10", iconColor.replace("text-", "bg-").replace("600", "500/10"))}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
          {title}
        </CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewChange('chart')}>
              <PieChartIcon className="mr-2 h-4 w-4" /> Chart View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleViewChange('table')}>
              <TableIcon className="mr-2 h-4 w-4" /> Table View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export Data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      
      <CardContent className="pt-6 flex-1 min-h-[320px]">
        {processedData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No data available
          </div>
        ) : viewMode === 'chart' ? (
          <div className="flex flex-col h-full">
             {/* Chart Area */}
             <div className="flex-1 min-h-[220px] relative">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie
                     data={processedData}
                     cx="50%"
                     cy="50%"
                     innerRadius={60}
                     outerRadius={85}
                     paddingAngle={2}
                     dataKey="value"
                     onMouseEnter={(_, index) => setActiveIndex(index)}
                     onMouseLeave={() => setActiveIndex(null)}
                     isAnimationActive={false} // Prevent redraw flicker
                   >
                     {processedData.map((entry, index) => (
                       <Cell 
                         key={`cell-${index}`} 
                         fill={colors[index % colors.length]} 
                         strokeWidth={activeIndex === index ? 2 : 1}
                         stroke={activeIndex === index ? "#fff" : "transparent"}
                         className="transition-all duration-200"
                         style={{ filter: activeIndex === index ? 'brightness(1.1)' : 'none' }}
                       />
                     ))}
                     <Label
                       content={({ viewBox }) => {
                         if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                           let formattedTotal = "";
                           if (formatType === 'currency') {
                               formattedTotal = "R " + (totalAmount > 1000000 ? (totalAmount / 1000000).toFixed(1) + 'M' : totalAmount > 1000 ? (totalAmount / 1000).toFixed(1) + 'k' : totalAmount.toFixed(0));
                           } else {
                               formattedTotal = totalAmount.toLocaleString('en-ZA');
                           }

                           return (
                             <text
                               x={viewBox.cx}
                               y={viewBox.cy}
                               textAnchor="middle"
                               dominantBaseline="middle"
                             >
                               <tspan
                                 x={viewBox.cx}
                                 y={viewBox.cy}
                                 className="fill-foreground text-2xl font-bold"
                               >
                                 {formattedTotal}
                               </tspan>
                               <tspan
                                 x={viewBox.cx}
                                 y={(viewBox.cy || 0) + 20}
                                 className="fill-muted-foreground text-xs"
                               >
                                 Total
                               </tspan>
                             </text>
                           );
                         }
                       }}
                     />
                   </Pie>
                   <Tooltip content={<CustomTooltip />} />
                 </PieChart>
               </ResponsiveContainer>
             </div>

             {/* External Legend */}
             <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm max-h-[120px] overflow-y-auto pr-1">
               {processedData.map((item, index) => {
                  const percent = totalAmount > 0 ? (item.value / totalAmount) * 100 : 0;
                  const isActive = activeIndex === index;
                  
                  return (
                   <div 
                      key={`${item.name}-${index}`}
                      className={cn(
                        "flex items-center justify-between p-1.5 rounded-md cursor-pointer transition-colors border border-transparent",
                        isActive ? "bg-muted border-border" : "hover:bg-muted/50"
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                   >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: colors[index % colors.length] }} 
                        />
                        <span className="truncate font-medium text-muted-foreground" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-xs">
                          {percent.toFixed(1)}%
                        </span>
                        <span className="font-mono font-medium">
                          R {item.value.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                   </div>
                  );
               })}
             </div>
          </div>
        ) : (
          <div className="h-full overflow-hidden flex flex-col">
            <div className="overflow-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedData.map((item, index) => {
                    const percent = totalAmount > 0 ? (item.value / totalAmount) * 100 : 0;
                    return (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                             <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ backgroundColor: colors[index % colors.length] }} 
                              />
                             {item.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          R {item.value.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {percent.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
