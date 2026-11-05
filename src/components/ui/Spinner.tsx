import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'w-5 h-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function FullPageSpinner({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-ink-50">
      <Spinner className="w-8 h-8 text-primary-500" />
      {message && <p className="text-ink-500 text-sm font-medium">{message}</p>}
    </div>
  );
}
