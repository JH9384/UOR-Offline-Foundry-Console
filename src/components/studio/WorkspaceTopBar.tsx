import React, { useState } from 'react';
import {
  Download,
  Lock,
  Menu,
  SlidersHorizontal,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { DurableStorageDiagnostics } from '../../services/durableLocalStore';
import { foundrySyncService } from '../../services/syncService';
import {
  ConnectivityProfile,
  DurableOperation,
  IntegrationMode,
  NavigationSectionId,
  ProjectRecord,
  WorkspaceMode,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface WorkspaceTopBarProps {
  activeProject?: ProjectRecord;
  mode: WorkspaceMode;
  onSelectMode: (mode: WorkspaceMode) => void;
  integrationMode: IntegrationMode;
  connectivityProfile: ConnectivityProfile;
  onSelectConnectivityProfile: (profile: ConnectivityProfile) => void;
  operations: DurableOperation[];
  storageDiagnostics: DurableStorageDiagnostics;
  onPreviewAirGappedExport: () => import('../../types/foundry').AirGappedExportPreview;
  onExportAirGappedBundle: (operatorConfirmed: boolean) => string;
  onClearOperations: () => void;
  onOpenMobileMenu: () => void;
  onOpenAdvancedSection: (section: NavigationSectionId) => void;
}

const MODES: Array<{ id: WorkspaceMode; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'preview', label: 'Preview' },
  { id: 'build', label: 'Build' },
  { id: 'verify', label: 'Verify & Release' },
];

const CONNECTIVITY_PROFILES: Array<{
  id: ConnectivityProfile;
  label: string;
  locked: boolean;
}> = [
  { id: 'OFFLINE_ONLY', label: 'Offline-Only', locked: false },
  { id: 'AIR_GAPPED_TRANSFER', label: 'Air-Gapped Transfer', locked: false },
  { id: 'LOCAL_CONNECTED', label: 'Local Connected (Auth Required)', locked: true },
  { id: 'ONLINE_AUTHORIZED', label: 'Online Authorized (Locked)', locked: true },
];

export const WorkspaceTopBar: React.FC<WorkspaceTopBarProps> = ({
  activeProject,
  mode,
  onSelectMode,
  integrationMode,
  connectivityProfile,
  onSelectConnectivityProfile,
  operations,
  storageDiagnostics,
  onPreviewAirGappedExport,
  onExportAirGappedBundle,
  onClearOperations,
  onOpenMobileMenu,
  onOpenAdvancedSection,
}) => {
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [exportConfirmed, setExportConfirmed] = useState(false);
  const [bundleNotice, setBundleNotice] = useState<string | null>(null);

  const policy = foundrySyncService.evaluateConnectivityPolicy({
    profile: connectivityProfile,
    integrationMode,
    localWindmillValidated: false,
    onlineAuthValidated: false,
  });

  const exportPreview = exportPreviewOpen ? onPreviewAirGappedExport() : null;

  const handleBundleDownload = () => {
    if (!exportConfirmed) return;
    const filename = onExportAirGappedBundle(true);
    setBundleNotice(`Exported allowlisted JSON: ${filename}`);
    setExportConfirmed(false);
    setExportPreviewOpen(false);
  };

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
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="font-display font-semibold text-sm text-slate-100 truncate">
            {activeProject?.name ?? 'UOR Offline Foundry'}
          </h1>
          <StatusTag value={integrationMode} className="hidden md:inline-flex" />
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

      {/* Zone 3: Runtime, Persistence & Sync Indicator */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setRuntimeOpen((prev) => !prev)}
          aria-expanded={runtimeOpen}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-[#111827] hover:bg-slate-800/90 border border-slate-700/80 rounded-md text-slate-200 transition-colors whitespace-nowrap shrink-0"
        >
          <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">
            {connectivityProfile === 'AIR_GAPPED_TRANSFER' ? 'Air-Gapped' : 'Offline Mode'}
          </span>
          {operations.length > 0 && (
            <span className="font-mono text-[11px] text-blue-300 tabular-nums">
              · {operations.length} ops
            </span>
          )}
        </button>

        {runtimeOpen && (
          <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[82vh] overflow-y-auto bg-[#111827] border border-slate-700/80 rounded-lg p-4 space-y-3.5 shadow-xl z-40">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-100">
                Runtime, Persistence &amp; Sync Boundary
              </span>
              <StatusTag value={policy.integrationMode} />
            </div>

            <dl className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Windmill (uor-offline-foundry)</dt>
                <dd className="font-mono text-rose-300">NOT CONNECTED</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">LM Studio (via Windmill)</dt>
                <dd className="font-mono text-rose-300">NOT CONNECTED</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Browser Network (navigator)</dt>
                <dd className="font-mono text-slate-300">
                  {policy.browserNavigatorOnline ? 'Online (Non-Authoritative)' : 'Offline'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Local Cache Adapter</dt>
                <dd className="font-mono text-emerald-300 text-right">
                  {storageDiagnostics.backend}
                </dd>
              </div>
            </dl>

            {/* Connectivity Profile Selector */}
            <div className="pt-2.5 border-t border-slate-800 space-y-1.5">
              <div className="text-[11px] text-slate-400 font-medium">
                Connectivity Profile (Auto-replay: Disabled)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CONNECTIVITY_PROFILES.map((p) => {
                  const selected = connectivityProfile === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectConnectivityProfile(p.id)}
                      className={`px-2.5 py-1.5 text-[11px] rounded border text-left flex items-center justify-between gap-1 transition-colors ${
                        selected
                          ? 'bg-blue-950/40 border-blue-500/40 text-blue-200'
                          : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="truncate">{p.label}</span>
                      {p.locked && <Lock className="w-3 h-3 shrink-0 text-amber-400" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{policy.explanation}</p>
            </div>

            {/* Sanitized Air-Gapped Transfer Export (Preview + Explicit Confirmation) */}
            <div className="pt-2.5 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExportPreviewOpen((prev) => !prev);
                    setExportConfirmed(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 rounded text-slate-200 transition-colors"
                >
                  <Download className="w-3 h-3 text-blue-400" aria-hidden="true" />
                  <span>{exportPreviewOpen ? 'Hide Export Preview' : 'Preview Sanitized Export'}</span>
                </button>
                <span className="text-[10px] font-mono text-slate-500">Imports: Disabled</span>
              </div>

              {exportPreview && (
                <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded space-y-2 text-[11px]">
                  <div className="font-mono text-slate-200">
                    Allowlisted Metadata ({exportPreview.schema})
                  </div>
                  <ul className="space-y-1 text-slate-400">
                    {exportPreview.includedCategories.map((cat) => (
                      <li key={cat.category} className="flex items-center justify-between gap-2">
                        <span>{cat.category}</span>
                        <span className="font-mono text-slate-200 tabular-nums">{cat.count}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="text-[10px] text-slate-500 leading-relaxed">
                    Excluded by default: credentials, chat messages, raw artifacts, local paths, unknown properties.
                  </div>
                  <div className="text-[10px] text-amber-300 leading-relaxed">
                    {exportPreview.securityDisclaimer}
                  </div>
                  <label className="flex items-start gap-2 text-[11px] text-slate-300 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportConfirmed}
                      onChange={(e) => setExportConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-600"
                    />
                    <span>I confirm exporting allowlisted plaintext metadata only.</span>
                  </label>
                  <button
                    type="button"
                    disabled={!exportConfirmed}
                    onClick={handleBundleDownload}
                    className="w-full py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition-colors"
                  >
                    Confirm &amp; Download Export
                  </button>
                </div>
              )}

              {bundleNotice && (
                <div className="text-[11px] font-mono text-blue-300 truncate">{bundleNotice}</div>
              )}
            </div>

            {/* Durable Local Operations */}
            <div className="pt-2.5 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Durable Local Operations ({operations.length})
                </span>
                {operations.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearOperations}
                    className="text-[11px] text-slate-400 hover:text-rose-300 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {operations.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No local operations recorded yet.
                </p>
              ) : (
                <ul className="space-y-1.5 max-h-32 overflow-y-auto">
                  {operations.slice(0, 4).map((op) => (
                    <li
                      key={op.operationId}
                      className="p-2 bg-[#0B0F17] border border-slate-800 rounded text-[11px]"
                    >
                      <div className="text-slate-200 truncate">{op.label}</div>
                      <div className="font-mono text-slate-500 truncate mt-0.5">
                        rev {op.revision} · {op.syncState}
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
                <span>Connections &amp; Adapters</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRuntimeOpen(false);
                  onOpenAdvancedSection('repositories');
                }}
                className="text-blue-400 hover:text-blue-300"
              >
                Repository Boundaries
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
