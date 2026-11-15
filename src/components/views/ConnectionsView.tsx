import React, { useState } from 'react';
import { RefreshCw, Unplug } from 'lucide-react';
import { LEXLEAN_MCP_HOST_EFFECTS, WINDMILL_TARGET_CONFIG } from '../../adapters/windmillAdapter';
import { foundryService } from '../../services/foundryService';
import { SystemConnectionRecord } from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface ConnectionsViewProps {
  connections: SystemConnectionRecord[];
}

export const ConnectionsView: React.FC<ConnectionsViewProps> = ({ connections }) => {
  const [probeMessage, setProbeMessage] = useState<string | null>(null);

  const handleCheckConnection = (name: string) => {
    const res = foundryService.probeWindmillRuntime();
    setProbeMessage(`${name}: ${res.reason}`);
  };

  return (
    <div className="space-y-6">
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display font-semibold text-sm text-slate-100">
              System Connections & Integration Adapters
            </h2>
            <StatusTag value="NOT CONNECTED" />
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
            All unconnected services explicitly display <span className="font-mono text-rose-300">NOT CONNECTED</span>. Future orchestration connects via adapter contracts to self-hosted Windmill (<span className="font-mono">{WINDMILL_TARGET_CONFIG.baseUrl}</span>, workspace <span className="font-mono">{WINDMILL_TARGET_CONFIG.workspace}</span>).
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleCheckConnection('Windmill Target Probe')}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 border border-slate-700 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Check Adapter Status</span>
        </button>
      </section>

      {probeMessage && (
        <div className="p-3.5 bg-[#111827] border border-rose-500/35 rounded-md text-xs text-rose-200 flex items-center gap-2">
          <Unplug className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />
          <span>{probeMessage}</span>
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connections.map((conn) => (
          <article
            key={conn.id}
            className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-mono text-slate-500">{conn.category}</div>
                  <h3 className="font-display font-semibold text-sm text-slate-100 mt-0.5">
                    {conn.name}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusTag value={conn.epistemicCondition} />
                  <StatusTag value={conn.status} />
                </div>
              </div>

              <dl className="space-y-1.5 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-500">Target:</dt>
                  <dd className="font-mono text-slate-300 text-right truncate">{conn.targetEndpoint}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-500">Scope:</dt>
                  <dd className="font-mono text-slate-300 text-right truncate">{conn.workspaceOrScope}</dd>
                </div>
              </dl>

              <ul className="space-y-1 font-mono text-[11px] text-slate-400 bg-[#0B0F17] border border-slate-800 rounded p-2.5">
                {conn.capabilities.map((cap, idx) => (
                  <li key={idx} className="truncate">{cap}</li>
                ))}
              </ul>
            </div>

            <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 leading-relaxed">
              {conn.diagnosticNote}
            </div>
          </article>
        ))}
      </section>

      {/* Documented lexlean-mcp Host Effects Contract */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold text-sm text-slate-100">
              Documented LexLean MCP Host Effects Contract (Planned Windmill MCP Bridge)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Read directly from UOR-Foundation/lexlean-mcp/EFFECTS.md (E1..E10)
            </p>
          </div>
          <StatusTag value="DOCUMENTED" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-2.5 px-5">Effect</th>
                <th className="py-2.5 px-4">Wire Name</th>
                <th className="py-2.5 px-4">Tag</th>
                <th className="py-2.5 px-5">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {LEXLEAN_MCP_HOST_EFFECTS.map((eff) => (
                <tr key={eff.effectId} className="hover:bg-slate-900/40">
                  <td className="py-2 px-5 font-mono text-slate-200">{eff.effectId}</td>
                  <td className="py-2 px-4 font-mono text-blue-300">{eff.wireName}</td>
                  <td className="py-2 px-4 font-mono text-slate-400 tabular-nums">{eff.tag}</td>
                  <td className="py-2 px-5 text-slate-300">{eff.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
