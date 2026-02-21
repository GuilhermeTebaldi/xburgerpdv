import React from 'react';

interface SyncStatusOverlayProps {
  visible: boolean;
  message: string;
  pendingCount?: number;
}

const SyncStatusOverlay: React.FC<SyncStatusOverlayProps> = ({
  visible,
  message,
  pendingCount = 0,
}) => {
  const pendingLabel = pendingCount > 1 ? `${pendingCount} operações` : '1 operação';

  return (
    <div
      aria-live="polite"
      aria-hidden={!visible}
      className={`pointer-events-none fixed left-1/2 top-4 z-[1200] w-[min(520px,calc(100%-1.25rem))] -translate-x-1/2 transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'
      }`}
    >
      <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl shadow-slate-400/20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="qb-sync-spinner" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              Sincronizando
            </p>
            <p className="truncate text-sm font-extrabold text-slate-800">{message}</p>
          </div>
          {visible ? (
            <span className="ml-auto rounded-full bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-red-700">
              {pendingLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-200">
          <span className="qb-sync-progress-bar block h-full w-2/5 rounded-full bg-red-600" />
        </div>
      </div>
    </div>
  );
};

export default SyncStatusOverlay;
