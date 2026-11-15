import React, { useState } from 'react';
import { ArrowRight, Lock, Plus, Search } from 'lucide-react';
import { ENGINEERING_COMPONENTS, WORKFLOW_CATALOG } from '../../data/seedFoundryData';
import {
  NavigationSectionId,
  ProjectRecord,
  WorkflowRun,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface ProjectsViewProps {
  projects: ProjectRecord[];
  runs: WorkflowRun[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  onOpenIntake: () => void;
  onNavigate: (section: NavigationSectionId) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  runs,
  selectedProjectId,
  onSelectProject,
  onOpenIntake,
  onNavigate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<string>('all');

  const filtered = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sourceRevision.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.purpose.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFamily = familyFilter === 'all' || p.productFamily === familyFilter;
    return matchesSearch && matchesFamily;
  });

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? filtered[0] ?? projects[0];
  const activeComponent = activeProject
    ? ENGINEERING_COMPONENTS.find((c) => c.id === activeProject.componentId)
    : undefined;
  const activeWorkflow = activeProject
    ? WORKFLOW_CATALOG.find((w) => w.id === activeProject.workflowId)
    : undefined;
  const activeRun = activeProject
    ? runs.find((r) => r.projectId === activeProject.id)
    : undefined;

  return (
    <div className="space-y-6">
      {/* Filter & Intake Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#111827] border border-slate-800/90 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search
              className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search project, revision, or purpose..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-md overflow-x-auto">
            {[
              { id: 'all', label: 'All Families' },
              { id: 'application', label: 'Application' },
              { id: 'formal-verification', label: 'Formal Verification' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFamilyFilter(tab.id)}
                className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap ${
                  familyFilter === tab.id
                    ? 'bg-slate-800 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenIntake}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New Engineering Intake</span>
        </button>
      </div>

      {/* Split Layout: Project Directory + Selected Project Detail */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-5 bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-display font-semibold text-sm text-slate-100">
              Project Registry
            </h2>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {filtered.length} shown
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-slate-400">No projects match the active filter.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFamilyFilter('all');
                }}
                className="px-3 py-1.5 text-xs text-blue-400 border border-slate-700 rounded-md hover:text-blue-300"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {filtered.map((project) => {
                const selected = activeProject?.id === project.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className={`w-full text-left px-5 py-4 transition-colors block ${
                      selected ? 'bg-slate-800/70' : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-slate-100">{project.name}</span>
                      <StatusTag value={project.lifecycleStatus} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                      <span>{project.sourceRevision}</span>
                      <span aria-hidden="true">·</span>
                      <span>{project.productFamily}</span>
                      {project.isSyntheticDemo && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-indigo-300">SIMULATED DEMO</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Project Detail */}
        {activeProject && (
          <section className="xl:col-span-7 bg-[#111827] border border-slate-800/90 rounded-lg p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-1">
                  <span>{activeProject.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeProject.acceptancePolicySchema}</span>
                </div>
                <h2 className="font-display font-semibold text-lg text-slate-100">
                  {activeProject.name}
                </h2>
              </div>
              <StatusTag value={activeProject.lifecycleStatus} />
            </div>

            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <dt className="text-slate-500">Engineering Component</dt>
                <dd className="mt-1 text-slate-200 font-medium flex items-center gap-2 flex-wrap">
                  <span>{activeComponent?.name}</span>
                  {activeComponent && <StatusTag value={activeComponent.epistemicCondition} />}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Assigned Workflow</dt>
                <dd className="mt-1 text-slate-200">{activeWorkflow?.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Source Revision</dt>
                <dd className="mt-1 font-mono text-slate-200">{activeProject.sourceRevision}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Product Family</dt>
                <dd className="mt-1 font-mono text-slate-200">{activeProject.productFamily}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-slate-500">Observable Capability / Purpose</dt>
                <dd className="mt-1 text-slate-300 leading-relaxed">{activeProject.purpose}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-slate-500">Declared Inputs</dt>
                <dd className="mt-1 font-mono text-slate-300 bg-[#0B0F17] border border-slate-800 rounded px-3 py-2">
                  {activeProject.declaredInputs}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-slate-500">Sanitized Environment Declaration</dt>
                <dd className="mt-1 text-slate-300">{activeProject.environmentDeclaration}</dd>
              </div>
            </dl>

            {/* Release Blockers */}
            <div className="pt-4 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
                <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Fail-Closed Release Blockers</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {activeProject.releaseBlockedReasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-mono text-slate-500 tabular-nums">{idx + 1}.</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Cross-Screen Action Links */}
            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3">
              {activeRun ? (
                <button
                  type="button"
                  onClick={() => onNavigate('workflows')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors"
                >
                  <span>Inspect Workflow Run ({activeRun.currentStageId.toUpperCase()})</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenIntake}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors"
                >
                  <span>Create Simulated Run via Intake</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onNavigate('verification')}
                className="px-3.5 py-2 text-xs font-medium text-slate-200 border border-slate-700 hover:border-slate-600 rounded-md transition-colors"
              >
                Review Verification Status
              </button>
              <button
                type="button"
                onClick={() => onNavigate('artifacts')}
                className="px-3.5 py-2 text-xs font-medium text-slate-200 border border-slate-700 hover:border-slate-600 rounded-md transition-colors"
              >
                Inspect Artifacts
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
