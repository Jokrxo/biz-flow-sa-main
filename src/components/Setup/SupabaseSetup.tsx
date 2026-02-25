import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const SupabaseSetup: React.FC = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center gap-2 justify-center">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            Supabase Setup Required
          </CardTitle>
          <CardDescription>
            Your application needs to be connected to Supabase to function properly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Missing Supabase environment variables. Please complete the setup to continue.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p className="mb-2"><strong>To set up Supabase:</strong></p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Click the green "Supabase" button at the top right</li>
                <li>Connect your Supabase project</li>
                <li>Configure your environment variables</li>
                <li>Refresh this page</li>
              </ol>
            </div>

            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2">
                Alternatively, you can set these environment variables manually:
              </p>
              <div className="bg-muted p-2 rounded text-xs font-mono">
                VITE_SUPABASE_URL=your_url<br />
                VITE_SUPABASE_ANON_KEY=your_key
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};