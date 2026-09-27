import React from 'react';

export const LoadingState: React.FC<{ message: string }> = ({ message }) => (
  <div className="py-20 text-center text-slate-500" role="status" aria-live="polite">
    {message}
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div
    className="py-20 text-center space-y-3"
    role="alert"
    aria-live="assertive"
  >
    <div className="text-sm font-semibold text-rose-400">Request failed</div>
    <div className="text-xs text-slate-400 max-w-md mx-auto">{message}</div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
      >
        Retry
      </button>
    )}
  </div>
);

export const EmptyState: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="py-20 text-center space-y-2" role="status" aria-live="polite">
    <div className="text-sm font-semibold text-slate-300">{title}</div>
    <div className="text-xs text-slate-400 max-w-md mx-auto">{message}</div>
  </div>
);
