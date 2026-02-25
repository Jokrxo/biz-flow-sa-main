import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  description?: string;
  className?: string;
  gradient?: string;
}

export function MetricCard({ title, value, icon, trend, trendUp, description, className, gradient }: MetricCardProps) {
  return (
    <Card className={cn("overflow-hidden relative", className)}>
      <div className={cn("absolute inset-0 opacity-10", gradient || "bg-primary/10")} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 z-10 relative">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && <div className="h-4 w-4 text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent className="z-10 relative">
        <div className="text-2xl font-bold">{value}</div>
        {(trend || description) && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {trend && (
              <span className={cn(trendUp ? "text-green-500" : "text-red-500", "flex items-center")}>
                {trend}
              </span>
            )}
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
