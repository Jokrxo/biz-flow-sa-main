import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: any };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const reload = () => {
        this.setState({ hasError: false, error: undefined });
        location.reload();
      };
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full border rounded-lg p-6 bg-background shadow">
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">A loading error occurred. You can retry or return to the dashboard.</p>
            <div className="flex gap-2">
              <a href="/" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">Return Home</a>
              <button onClick={reload} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">Retry</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

