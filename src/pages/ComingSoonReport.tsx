import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Clock, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ComingSoonReportProps {
  title: string;
}

const ComingSoonReport: React.FC<ComingSoonReportProps> = ({ title }) => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <div className="flex flex-col items-center justify-center space-y-8 py-12 text-center">
        <div className="rounded-full bg-primary/10 p-6 animate-pulse">
          <Clock className="h-16 w-16 text-primary" />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            This module is currently under development and will be available in a future update.
          </p>
        </div>

        <Card className="w-full max-w-md border-primary/20 shadow-lg bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span>Alternative Access</span>
            </CardTitle>
            <CardDescription>
              To view this report now, please use the main Financial Reports module.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground italic">
              "Coming soon. To view report use financial report module."
            </div>
            <Button 
              className="w-full gap-2" 
              size="lg"
              onClick={() => navigate("/reports")}
            >
              <TrendingUp className="h-4 w-4" />
              Go to Financial Reports
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ComingSoonReport;
