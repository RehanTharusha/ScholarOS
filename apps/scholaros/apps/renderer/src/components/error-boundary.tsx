import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  showDetails: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, showDetails: false }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="flex flex-col items-center text-center max-w-md px-6">
            <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 mb-6">
              <AlertTriangle className="size-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Something went wrong</h1>
            <p className="text-base text-muted-foreground mb-8">
              ScholarOS encountered an unexpected error. Please reload to continue.
            </p>
            <Button onClick={() => window.location.reload()} size="lg" className="gap-2">
              <RefreshCw className="size-4" />
              Reload ScholarOS
            </Button>
            <button
              onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
              className="flex items-center gap-1 mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {this.state.showDetails ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              Error details
            </button>
            {this.state.showDetails && this.state.error && (
              <pre className="mt-3 w-full text-left text-xs text-muted-foreground bg-muted rounded-md p-4 overflow-auto max-h-48">
                {this.state.error.name}: {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
