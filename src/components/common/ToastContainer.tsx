import React from 'react';
import { useApp } from '../../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        let borderClass = 'border-primary/40';
        let iconName = 'info';
        let iconColor = 'text-primary';

        if (toast.type === 'success') {
          borderClass = 'border-fluent-success/40';
          iconName = 'check_circle';
          iconColor = 'text-fluent-success';
        } else if (toast.type === 'warning') {
          borderClass = 'border-fluent-warning/40';
          iconName = 'warning';
          iconColor = 'text-fluent-warning';
        } else if (toast.type === 'error') {
          borderClass = 'border-fluent-error/40';
          iconName = 'error';
          iconColor = 'text-fluent-error';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3 rounded-lg bg-[#252525]/95 backdrop-blur-xl border ${borderClass} shadow-2xl flex items-start gap-2.5 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`}
          >
            <span className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${iconColor}`}>
              {iconName}
            </span>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[12.5px] font-semibold text-white leading-tight">
                {toast.title}
              </span>
              <span className="text-[11.5px] text-on-surface-variant leading-snug mt-0.5">
                {toast.message}
              </span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-on-surface-muted hover:text-white transition-colors p-0.5"
            >
              <span className="material-symbols-outlined text-[15px]">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
};
