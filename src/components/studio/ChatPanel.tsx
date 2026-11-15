import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  Crosshair,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ConversationThread,
  PreviewElementRef,
  ProjectRecord,
  WorkspaceMode,
} from '../../types/foundry';

interface ChatPanelProps {
  project: ProjectRecord;
  thread?: ConversationThread;
  referencedElement: PreviewElementRef | null;
  onClearReferencedElement: () => void;
  onSendMessage: (prompt: string) => void;
  onApplyDraftProposal: (messageId: string, proposalId: string) => void;
  onSwitchMode: (mode: WorkspaceMode) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  project,
  thread,
  referencedElement,
  onClearReferencedElement,
  onSendMessage,
  onApplyDraftProposal,
  onSwitchMode,
}) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const starterSuggestions = referencedElement
    ? [
        `Update "${referencedElement.label}" to use compact spacing`,
        `Annotate "${referencedElement.label}" with monospace SHA-256 note`,
      ]
    : [
        'Rename the primary action button to "Run Local Check"',
        'Queue a simulated workflow run for Windmill',
        'Explain what blocks release for this project',
      ];

  const messages = thread?.messages ?? [];

  return (
    <section className="flex flex-col h-full min-h-[540px] bg-[#0F1520] border border-slate-800/80 rounded-lg overflow-hidden">
      {/* Subtle Context Header */}
      <div className="px-5 py-3 border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-200 truncate">
            {thread?.title ?? project.name}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            Simulated conversational builder · Future inference: LM Studio via Windmill
          </div>
        </div>
        <span className="text-[11px] font-mono text-indigo-300 whitespace-nowrap shrink-0">
          SIMULATED DRAFT MODE
        </span>
      </div>

      {/* Conversation Stream */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {messages.length === 0 ? (
          <div className="py-12 text-center max-w-md mx-auto space-y-2">
            <p className="text-sm text-slate-200 font-medium">
              Start building with {project.name}
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Describe draft UI changes, click any element in the Live Preview panel to reference it, or ask about workflow stages and release blockers.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-lg px-4 py-3 text-sm leading-relaxed space-y-2.5 ${
                    isUser
                      ? 'bg-blue-600/20 border border-blue-500/35 text-slate-100'
                      : 'bg-[#141C2B] border border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 text-[11px] font-mono text-slate-400">
                    <span>{isUser ? 'Operator' : 'Foundry Assistant (Simulated)'}</span>
                    <span className="tabular-nums">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {msg.referencedElement && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono bg-[#0B0F17] border border-slate-700 rounded text-blue-300">
                      <Crosshair className="w-3 h-3" aria-hidden="true" />
                      <span>Ref: {msg.referencedElement.label}</span>
                    </div>
                  )}

                  <p className="text-[13px] whitespace-pre-wrap">{msg.content}</p>

                  {/* Draft Change Proposal Card */}
                  {msg.draftProposal && (
                    <div className="p-3 bg-[#0B0F17] border border-slate-700/80 rounded-md space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-100 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-300" aria-hidden="true" />
                          <span>{msg.draftProposal.summary}</span>
                        </span>
                        <span className="text-[10px] font-mono text-indigo-300">
                          DRAFT PROPOSAL
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {msg.draftProposal.authorityNote}
                      </p>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          disabled={msg.draftProposal.applied}
                          onClick={() =>
                            onApplyDraftProposal(msg.id, msg.draftProposal!.id)
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                            msg.draftProposal.applied
                              ? 'bg-emerald-950/50 border border-emerald-500/35 text-emerald-300 cursor-default'
                              : 'bg-blue-600 hover:bg-blue-500 text-white'
                          }`}
                        >
                          {msg.draftProposal.applied && (
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>
                            {msg.draftProposal.applied
                              ? 'Applied to Preview'
                              : 'Apply Draft to Preview'}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {msg.suggestedWorkflowAction && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => onSwitchMode(msg.suggestedWorkflowAction!.targetMode)}
                        className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                      >
                        <span>{msg.suggestedWorkflowAction.label}</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-slate-800/80 bg-[#0D121B] space-y-2.5 shrink-0"
      >
        {referencedElement && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-blue-950/30 border border-blue-500/35 rounded text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Crosshair className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-hidden="true" />
              <span className="text-slate-200 truncate">
                Selected element: <strong className="font-medium">{referencedElement.label}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={onClearReferencedElement}
              className="p-0.5 text-slate-400 hover:text-white"
              aria-label="Remove referenced preview element"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {starterSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setInput(s)}
              className="px-2.5 py-1 text-[11px] text-slate-300 hover:text-white bg-[#131B29] border border-slate-800 hover:border-slate-700 rounded transition-colors truncate max-w-full"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) {
                  onSendMessage(input.trim());
                  setInput('');
                }
              }
            }}
            placeholder={
              referencedElement
                ? `Describe the change for "${referencedElement.label}"...`
                : 'Describe a change, ask about verification blockers, or queue a build...'
            }
            className="flex-1 px-3 py-2 text-xs bg-[#090D14] border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-md transition-colors shrink-0 h-[50px]"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Send</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-500">
          AI generates simulated drafts only. Verification evidence and release authorization require independent human governance.
        </div>
      </form>
    </section>
  );
};
