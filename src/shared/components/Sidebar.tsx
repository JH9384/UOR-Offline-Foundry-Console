import React from 'react';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Bot,
  FolderKanban,
  GitBranch,
  Layers,
  PackageCheck,
  PlugZap,
  Scale,
  ShieldCheck,
  X,
} from 'lucide-react';
import { evaluateWindmillReadOnlyConnectivity } from '../adapters/windmillExecutionService';
import { NavigationSectionId, WindmillHealthStatus } from '../types/foundry';

interface NavItem {
  id: NavigationSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'operations' | 'governance' | 'infrastructure';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: Activity, group: 'operations' },
  { id: 'projects', label: 'Projects', icon: FolderKanban, group: 'operations' },
  { id: 'workflows', label: 'Engineering Workflows', icon: GitBranch, group: 'operations' },
  { id: 'verification', label: 'Verification & Evidence', icon: ShieldCheck, group: 'governance' },
  { id: 'compliance', label: 'Source Review & Compliance', icon: Layers, group: 'governance' },
  { id: 'artifacts', label: 'Artifacts & Provenance', icon: PackageCheck, group: 'governance' },
  { id: 'approvals', label: 'Approvals & Governance', icon: Scale, group: 'governance' },
  { id: 'ai-assistance', label: 'AI Assistance', icon: Bot, group: 'infrastructure' },
  { id: 'connections', label: 'System Connections', icon: PlugZap, group: 'infrastructure' },
  { id: 'repositories', label: 'Repository References', icon: BookOpen, group: 'infrastructure' },
];

interface SidebarProps {
  activeSection: NavigationSectionId;
  onSelectSection: (section: NavigationSectionId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  blockedReleaseCount: number;
  onReturnToStudio?: () => void;
  windmillHealth?: WindmillHealthStatus | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  mobileOpen,
  onCloseMobile,
  blockedReleaseCount,
  onReturnToStudio,
  windmillHealth,
}) => {
  const connectivity = evaluateWindmillReadOnlyConnectivity(windmillHealth);
  const renderGroup = (group: NavItem['group'], title: string) => {
    const items = NAV_ITEMS.filter((item) => item.group === group);
    return (
      <div className="mb-6">
        <div className="px-3 mb-2 text-[11px] font-medium text-slate-500 tracking-wide">
          {title}
        </div>
        <nav className="space-y-0.5" aria-label={title}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] rounded-md transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? 'bg-slate-800/90 text-white font-medium border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/80 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-blue-400' : 'text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                </span>
                {item.id === 'approvals' && blockedReleaseCount > 0 && (
                  <span className="font-mono text-[11px] tabular-nums text-amber-400 shrink-0">
                    {blockedReleaseCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0E131D] border-r border-slate-800/90 w-[264px]">
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800/90 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-blue-600/15 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 text-blue-400" aria-hidden="true" />
          </div>
          <span className="font-display font-semibold text-sm text-slate-100 tracking-tight whitespace-nowrap truncate">
            UOR Foundry
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
          aria-label="Close navigation menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {onReturnToStudio && (
          <button
            type="button"
            onClick={() => {
              onReturnToStudio();
              onCloseMobile();
            }}
            className="w-full mb-5 flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-300 bg-blue-950/30 hover:bg-blue-950/50 border border-blue-500/30 rounded-md transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Back to Studio Workspace</span>
          </button>
        )}
        {renderGroup('operations', 'Operations')}
        {renderGroup('governance', 'Verification & Custody')}
        {renderGroup('infrastructure', 'Advisory & Architecture')}
      </div>

      <div className="p-3 border-t border-slate-800/90 text-[11px] text-slate-400 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Runtime Target</span>
          <span className="font-mono text-slate-300 truncate">uor-offline-foundry</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Windmill API</span>
          <span
            data-testid="sidebar-windmill-status"
            className={`font-mono ${
              connectivity.isReadOnlyConnected ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {connectivity.readOnlyConnectivityStatus}
          </span>
        </div>
        <div className="pt-1 text-slate-500 leading-relaxed">
          {connectivity.isReadOnlyConnected
            ? 'Read-only local inspection active. No live compiler or release authority is active.'
            : 'Browser sandbox mode. No live compiler or release authority is active.'}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{sidebarContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
