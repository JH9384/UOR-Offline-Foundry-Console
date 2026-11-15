import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { REPOSITORY_INVENTORY } from '../../data/repositoryInventory';
import { EpistemicCondition } from '../../types/foundry';
import { StatusTag } from '../StatusTag';

export const RepositoriesView: React.FC = () => {
  const [filter, setFilter] = useState<'ALL' | EpistemicCondition>('ALL');
  const [selectedId, setSelectedId] = useState<string>(REPOSITORY_INVENTORY[0].id);

  const visibleRepos = REPOSITORY_INVENTORY.filter(
    (repo) => filter === 'ALL' || repo.epistemicCondition === filter
  );
  const activeRepo =
    visibleRepos.find((r) => r.id === selectedId) ?? visibleRepos[0] ?? REPOSITORY_INVENTORY[0];

  return (
    <div className="space-y-6">
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <h2 className="font-display font-semibold text-sm text-slate-100">
            Repository Grounding & Epistemic Boundary Inventory
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Every console domain model and workflow stage traces directly to inspected public repositories (<span className="font-mono text-sky-300">DOCUMENTED</span>), planned Windmill/LM Studio adapters (<span className="font-mono text-indigo-300">PROPOSED</span>), or restricted local systems (<span className="font-mono text-amber-300">UNVERIFIED</span>).
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-md shrink-0">
          {(['ALL', 'DOCUMENTED', 'UNVERIFIED'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                filter === item
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-5 bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm text-slate-100">
              Referenced Repositories
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {visibleRepos.length} entries
            </span>
          </div>
          <div className="divide-y divide-slate-800/70">
            {visibleRepos.map((repo) => {
              const selected = activeRepo.id === repo.id;
              return (
                <button
                  key={repo.id}
                  type="button"
                  onClick={() => setSelectedId(repo.id)}
                  className={`w-full text-left px-5 py-3.5 transition-colors block ${
                    selected ? 'bg-slate-800/75' : 'hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">
                      {repo.owner}/{repo.name}
                    </span>
                    <StatusTag value={repo.epistemicCondition} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{repo.role}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="xl:col-span-7 bg-[#111827] border border-slate-800/90 rounded-lg p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-100">
                {activeRepo.owner}/{activeRepo.name}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">{activeRepo.role}</p>
              <div className="mt-2 flex items-center gap-2 text-xs font-mono text-blue-400">
                {activeRepo.canonicalUrl.startsWith('https://') ? (
                  <a
                    href={activeRepo.canonicalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    <span>{activeRepo.canonicalUrl}</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-amber-300">{activeRepo.canonicalUrl}</span>
                )}
              </div>
            </div>
            <StatusTag value={activeRepo.epistemicCondition} />
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <h4 className="font-medium text-slate-200 mb-1.5">Observed Capabilities</h4>
              <ul className="space-y-1 text-slate-300 list-disc pl-4">
                {activeRepo.observedCapabilities.map((item, i) => (
                  <li key={i} className="leading-relaxed">{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-slate-200 mb-1.5">Documented Interfaces & Contracts</h4>
              <ul className="space-y-1 font-mono text-slate-300 bg-[#0B0F17] border border-slate-800 rounded-md p-3">
                {activeRepo.documentedInterfaces.map((item, i) => (
                  <li key={i} className="leading-relaxed">{item}</li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-slate-200 mb-1.5">Templates, Workflows & Verification</h4>
                <ul className="space-y-1 text-slate-300 list-disc pl-4">
                  {[...activeRepo.existingTemplatesOrWorkflows, ...activeRepo.verificationMechanisms].map((item, i) => (
                    <li key={i} className="leading-relaxed">{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-amber-300 mb-1.5">Missing, Unclear, or Unestablished</h4>
                <ul className="space-y-1 text-slate-300 list-disc pl-4">
                  {activeRepo.missingOrUnclear.map((item, i) => (
                    <li key={i} className="leading-relaxed">{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800">
              <h4 className="font-medium text-slate-200 mb-1.5">Console Integration Mapping</h4>
              <ul className="space-y-1 text-slate-300 list-disc pl-4">
                {activeRepo.consoleIntegrationPoints.map((item, i) => (
                  <li key={i} className="leading-relaxed">{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
