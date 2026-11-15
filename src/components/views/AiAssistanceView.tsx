import React, { useState } from 'react';
import { Lock, Send } from 'lucide-react';
import { AiAdvisoryEntry, ProjectRecord } from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface AiAssistanceViewProps {
  projects: ProjectRecord[];
  advisories: AiAdvisoryEntry[];
  selectedProjectId: string;
  onGenerateAdvisory: (
    category: AiAdvisoryEntry['category'],
    promptText: string,
    projectId?: string
  ) => void;
}

export const AiAssistanceView: React.FC<AiAssistanceViewProps> = ({
  projects,
  advisories,
  selectedProjectId,
  onGenerateAdvisory,
}) => {
  const [category, setCategory] = useState<AiAdvisoryEntry['category']>('workflow-recommendation');
  const [projectId, setProjectId] = useState<string>(selectedProjectId || projects[0]?.id || '');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || prompt.trim().length < 6) {
      setError('Enter an engineering question or interpretation request (minimum 6 characters).');
      return;
    }
    setError(null);
    onGenerateAdvisory(category, prompt, projectId || undefined);
    setPrompt('');
  };

  const quickPrompts: Array<{
    label: string;
    category: AiAdvisoryEntry['category'];
    text: string;
  }> = [
    {
      label: 'Explain why release is blocked',
      category: 'interpretation',
      text: 'Interpret current verification blockers and explain why release remains blocked.',
    },
    {
      label: 'Recommend workflow template',
      category: 'workflow-recommendation',
      text: 'Recommend the appropriate UOR-Workflow / PrismPM template for the selected project.',
    },
    {
      label: 'Summarize Windmill + LM Studio plan',
      category: 'planning',
      text: 'Outline how this advisory request maps to LM Studio via self-hosted Windmill (uor-offline-foundry).',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Honest Boundary Banner */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display font-semibold text-sm text-slate-100">
              Engineering Advisory Surface
            </h2>
            <StatusTag value="SIMULATED" />
            <StatusTag value="NOT CONNECTED" />
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
            In Google AI Studio, all responses below are clearly labeled <span className="font-mono text-indigo-300">SIMULATED</span>. Production execution routes advisory inference to local LM Studio via self-hosted Windmill (<span className="font-mono">http://127.0.0.1:8080</span>).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/25 border border-amber-500/30 rounded-md px-3 py-2 shrink-0">
          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>AI cannot authorize product releases</span>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Advisory Request Form */}
        <section className="xl:col-span-5 bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
          <h3 className="font-display font-semibold text-sm text-slate-100">
            Request Simulated Engineering Advisory
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="ai-category" className="block text-xs font-medium text-slate-300 mb-1.5">
                Advisory Mode
              </label>
              <select
                id="ai-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as AiAdvisoryEntry['category'])}
                className="w-full px-3 py-2 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="workflow-recommendation">Workflow Recommendation</option>
                <option value="interpretation">Engineering & Verification Interpretation</option>
                <option value="planning">Execution Planning</option>
                <option value="research">Repository Reference Research</option>
              </select>
            </div>

            <div>
              <label htmlFor="ai-project" className="block text-xs font-medium text-slate-300 mb-1.5">
                Context Project
              </label>
              <select
                id="ai-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="">General Foundry Context</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ai-prompt" className="block text-xs font-medium text-slate-300 mb-1.5">
                Advisory Question
              </label>
              <textarea
                id="ai-prompt"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask for workflow selection, repository boundary clarification, or release-blocker interpretation..."
                className="w-full px-3 py-2 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-500">Quick Advisory Prompts</div>
              <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp.label}
                    type="button"
                    onClick={() => {
                      setCategory(qp.category);
                      setPrompt(qp.text);
                      setError(null);
                    }}
                    className="px-2.5 py-1 text-[11px] text-slate-300 bg-[#0B0F17] border border-slate-800 hover:border-slate-600 rounded transition-colors"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Generate Simulated Advisory</span>
            </button>
          </form>
        </section>

        {/* Advisory Output Feed */}
        <section className="xl:col-span-7 space-y-4">
          {advisories.map((entry) => {
            const proj = entry.projectId
              ? projects.find((p) => p.id === entry.projectId)
              : undefined;
            return (
              <article
                key={entry.id}
                className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <StatusTag value="SIMULATED" />
                    <span className="font-mono text-slate-400">{entry.category}</span>
                    {proj && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-200 font-medium">{proj.name}</span>
                      </>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    {new Date(entry.generatedAt).toLocaleString()}
                  </span>
                </div>

                <div className="text-xs text-slate-400">
                  <span className="font-medium text-slate-300">Prompt:</span> {entry.promptSummary}
                </div>

                <p className="text-sm text-slate-200 leading-relaxed">{entry.responseSummary}</p>

                <ul className="space-y-1 text-xs text-slate-300 list-disc pl-4">
                  {entry.observations.map((obs, i) => (
                    <li key={i}>{obs}</li>
                  ))}
                </ul>

                <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="font-mono">
                    Cited: {entry.citedRepositories.join(' · ')}
                  </span>
                  <span>{entry.targetRuntimeNote}</span>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
};
