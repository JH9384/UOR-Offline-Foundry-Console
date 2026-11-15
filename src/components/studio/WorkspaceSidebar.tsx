import React from 'react';
import {
  Layers,
  MessageSquare,
  PanelLeft,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { ConversationThread, ProjectRecord } from '../../types/foundry';

interface WorkspaceSidebarProps {
  projects: ProjectRecord[];
  activeProjectId: string;
  threads: ConversationThread[];
  activeThreadId: string;
  onSelectProject: (projectId: string) => void;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onOpenNewProject: () => void;
  onOpenAdvancedConsole: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  projects,
  activeProjectId,
  threads,
  activeThreadId,
  onSelectProject,
  onSelectThread,
  onNewThread,
  onOpenNewProject,
  onOpenAdvancedConsole,
  mobileOpen,
  onCloseMobile,
}) => {
  const projectThreads = threads.filter((t) => t.projectId === activeProjectId);

  const content = (
    <div className="flex flex-col h-full w-[252px] bg-[#0D121B] border-r border-slate-800/80">
      {/* Brand */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-blue-600/15 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 text-blue-400" aria-hidden="true" />
          </div>
          <span className="font-display font-semibold text-sm text-slate-100 tracking-tight truncate">
            UOR Offline Foundry
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Action */}
      <div className="p-3 border-b border-slate-800/70">
        <button
          type="button"
          onClick={() => {
            onOpenNewProject();
            onCloseMobile();
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New Project</span>
        </button>
      </div>

      {/* Scrollable Projects + Conversations */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Projects */}
        <div>
          <div className="px-2 mb-2 text-[11px] font-medium text-slate-500">
            Projects
          </div>
          <div className="space-y-0.5">
            {projects.map((project) => {
              const active = project.id === activeProjectId;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(project.id);
                    onCloseMobile();
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-md text-[13px] transition-colors flex items-center justify-between gap-2 ${
                    active
                      ? 'bg-slate-800/85 text-white font-medium'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/70'
                  }`}
                >
                  <span className="truncate">{project.name}</span>
                  {project.isSyntheticDemo && (
                    <span className="text-[10px] font-mono text-indigo-300 shrink-0">
                      Demo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversations for active project */}
        <div>
          <div className="px-2 mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">
              Conversations
            </span>
            <button
              type="button"
              onClick={onNewThread}
              className="text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
              title="Start new conversation thread"
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
              <span>New</span>
            </button>
          </div>
          <div className="space-y-0.5">
            {projectThreads.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-slate-500">
                No conversations yet.
              </div>
            ) : (
              projectThreads.map((thread) => {
                const active = thread.id === activeThreadId;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      onSelectThread(thread.id);
                      onCloseMobile();
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors flex items-start gap-2 ${
                      active
                        ? 'bg-slate-800/60 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{thread.title}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                        {thread.messages.length} messages
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer: Advanced Console Access */}
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        <button
          type="button"
          onClick={() => {
            onOpenAdvancedConsole();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white bg-[#111827] hover:bg-slate-800 border border-slate-800 rounded-md transition-colors"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>Advanced Workspace</span>
          </span>
          <PanelLeft className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
        </button>
        <div className="px-1 text-[11px] text-slate-500 leading-snug">
          Offline-first local workspace · Mac Studio runtime disconnected
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
