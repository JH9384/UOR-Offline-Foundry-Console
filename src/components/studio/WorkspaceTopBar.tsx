import React, { useState } from 'react';
import {
  CloudOff,
  Menu,
  SlidersHorizontal,
  Trash2,
  WifiOff,
} from 'lucide-react';
import {
  NavigationSectionId,
  OfflineQueueItem,
  ProjectRecord,
  WorkspaceMode,
} from '../../types/foundry';

interface WorkspaceTopBarProps {
  activeProject?: ProjectRecord;
  mode: WorkspaceMode;
  onSelectMode: (mode: WorkspaceMode) => void;
  offlineQueue: OfflineQueueItem[];
  onlineSyncPreference: 'OFFLINE_ONLY' | 'SYNC_STANDBY';
  onToggleOnlineSync: () => void;
  onClearQueue: () => void;
  onOpenMobileMenu: () => void;
  onOpenAdvancedSection: (section: NavigationSectionId) => void;
}

const MODES: Array<{ id: WorkspaceMode; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'preview', label: 'Preview' },
  { id: 'build', label: 'Build' },
  { id: 'verify', label: 'Verify & Release' },
];

export const WorkspaceTopBar: React.FC<WorkspaceTopBarProps> = ({
  activeProject,
  mode,
  onSelectMode,
  offlineQueue,
  onlineSyncPreference,
  onToggleOnlineSync,
  onClearQueue,
  onOpenMobileMenu,
  onOpenAdvancedSection,
}) => {
  const [runtimeOpen, setRuntimeOpen] = useState(false);

  return (
    <header className="h-14 px-4 lg:px-6 border-b border-slate-800/80 bg-[#0D121B] flex items-center justify-between gap-4 shrink-0 relative z-30">
      {/* Zone 1: Project Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-md"
          aria-label="Open workspace sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-display font-semibold text-sm text-slate-100 truncate">
            {activeProject?.name ?? 'UOR Offline Foundry'}
          </h1>
        </div>
      </div>

      {/* Zone 2: 4 Workspace Modes */}
      <nav
        aria-label="Workspace modes"
        className="flex items-center gap-1 p-1 bg-[#090D14] border border-slate-800 rounded-md overflow-x-auto"
      >
        {MODES.map((item) => {
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectMode(item.id)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Offline-First Runtime Indicator */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setRuntimeOpen((prev) => !prev)}
          aria-expanded={runtimeOpen}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-[#111827] hover:bg-slate-800/90 border border-slate-700/80 rounded-md text-slate-200 transition-colors whitespace-nowrap shrink-0"
        >
          <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Offline Mode</span>
          {offlineQueue.length > 0 && (
            <span className="font-mono text-[11px] text-blue-300 tabular-nums">
              · {offlineQueue.length} queued
            </span>
          )}
        </button>

        {runtimeOpen && (
          <div className="absolute right-0 mt-2 w-80 bg-[#111827] border border-slate-700/80 rounded-lg p-4 space-y-3.5 shadow-xl z-40">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-100">
                Local Runtime &amp; Sync Status
              </span>
              <span className="font-mono text-[11px] text-emerald-300">
                Local Storage Active
              </span>
            </div>

            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Windmill (127.0.0.1:8080)</dt>
                <dd className="font-mono text-rose-300">NOT CONNECTED</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">LM Studio Inference</dt>
                <dd className="font-mono text-rose-300">NOT CONNECTED</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Optional Online Sync</dt>
                <dd>
                  <button
                    type="button"
                    onClick={onToggleOnlineSync}
                    className="font-mono text-[11px] px-2 py-0.5 border border-slate-700 hover:border-slate-600 rounded text-slate-200 inline-flex items-center gap-1"
                  >
                    <CloudOff className="w-3 h-3" aria-hidden="true" />
                    <span>
                      {onlineSyncPreference === 'OFFLINE_ONLY' ? 'Disabled' : 'Standby'}
                    </span>
                  </button>
                </dd>
              </div>
            </dl>

            <div className="pt-2.5 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Queued Local Actions ({offlineQueue.length})
                </span>
                {offlineQueue.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearQueue}
                    className="text-[11px] text-slate-400 hover:text-rose-300 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {offlineQueue.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No local actions queued for Mac Studio Windmill.
                </p>
              ) : (
                <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                  {offlineQueue.slice(0, 5).map((item) => (
                    <li
                      key={item.id}
                      className="p-2 bg-[#0B0F17] border border-slate-800 rounded text-[11px]"
                    >
                      <div className="text-slate-200 truncate">{item.label}</div>
                      <div className="font-mono text-slate-500 truncate mt-0.5">
                        {item.kind} · {item.status}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setRuntimeOpen(false);
                  onOpenAdvancedSection('connections');
                }}
                className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
                <span>Connections</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRuntimeOpen(false);
                  onOpenAdvancedSection('repositories');
                }}
                className="text-blue-400 hover:text-blue-300"
              >
                Repository References
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
