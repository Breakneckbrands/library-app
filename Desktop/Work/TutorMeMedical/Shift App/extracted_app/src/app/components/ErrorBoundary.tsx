import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Shift Tracker error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Oops! Something went wrong</h1>
            <p className="text-gray-600 mb-4">
              The app encountered an unexpected error. Your shift data has been saved to your device.
            </p>
            {this.state.error && (
              <details className="text-left bg-gray-50 p-3 rounded-lg mb-4 text-xs text-gray-600 max-h-32 overflow-auto">
                <summary className="cursor-pointer font-mono font-bold mb-2">Error details</summary>
                <code>{this.state.error.toString()}</code>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-500 text-white py-2 rounded-lg hover:bg-indigo-600 transition-colors font-semibold"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
