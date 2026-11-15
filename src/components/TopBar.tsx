import React from 'react';
import { Menu, Plus } from 'lucide-react';
import { NavigationSectionId } from '../types/foundry';

const SECTION_TITLES: Record<NavigationSectionId, string> = {
  overview: 'Overview',
  projects: 'Projects & Intake',
  workflows: 'Engineering Workflows',
  verification: 'Verification & Evidence',
  'ai-assistance': 'AI Assistance (Simulated)',
  artifacts: 'Artifacts & Provenance',
  approvals: 'Approvals & Governance',
  connections: 'System Connections',
  repositories: 'Repository References',
};

interface TopBarProps {
  activeSection: NavigationSectionId;
  onOpenMobileMenu: () => void;
  onOpenIntake: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onOpenMobileMenu,
  onOpenIntake,
}) => {
  return (
    <header className="h-14 px-4 lg:px-6 border-b border-slate-800/90 bg-[#0E131D] flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 whitespace-nowrap hidden sm:inline">
            Operator Console
          </span>
          <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <h1 className="font-display font-semibold text-slate-100 truncate">
            {SECTION_TITLES[activeSection]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <span className="hidden md:inline text-xs font-mono text-slate-400 whitespace-nowrap">
          Simulation Sandbox · Windmill NOT CONNECTED
        </span>
        <button
          type="button"
          onClick={onOpenIntake}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New Engineering Intake</span>
        </button>
      </div>
    </header>
  );
};
