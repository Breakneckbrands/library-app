import { Toaster } from 'sonner';
import { ShiftTracker } from './components/ShiftTracker';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <ShiftTracker />
      <Toaster position="top-center" />
    </ErrorBoundary>
  );
}