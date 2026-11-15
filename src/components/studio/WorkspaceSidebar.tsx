import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Layers,
  MessageSquare,
  PanelLeft,
  Pencil,
  Plus,
  Search,
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
  onRenameProject: (projectId: string, newName: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onToggleArchiveProject: (projectId: string) => void;
  onSelectThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
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
  onRenameProject,
  onDuplicateProject,
  onToggleArchiveProject,
  onSelectThread,
  onRenameThread,
  onNewThread,
  onOpenNewProject,
  onOpenAdvancedConsole,
  mobileOpen,
  onCloseMobile,
}) => {
  const [projectFilter, setProjectFilter] = useState<'active' | 'recent' | 'archived'>('active');
  const [projectSearch, setProjectSearch] = useState('');
  const [threadSearch, setThreadSearch] = useState('');

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectDraftName, setProjectDraftName] = useState('');

  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [threadDraftTitle, setThreadDraftTitle] = useState('');

  const activeProjectsCount = projects.filter((p) => !p.archived).length;
  const archivedProjectsCount = projects.filter((p) => p.archived).length;

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    let list = projects.filter((p) =>
      projectFilter === 'archived' ? Boolean(p.archived) : !p.archived
    );
    if (projectFilter === 'recent') {
      list = [...list].sort((a, b) =>
        (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt)
      );
    }
    if (query) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.productFamily.toLowerCase().includes(query) ||
          p.componentId.toLowerCase().includes(query)
      );
    }
    return list;
  }, [projects, projectFilter, projectSearch]);

  const projectThreads = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();
    const list = threads.filter((t) => t.projectId === activeProjectId);
    if (!query) return list;
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.messages.some((m) => m.content.toLowerCase().includes(query))
    );
  }, [threads, activeProjectId, threadSearch]);

  const commitProjectRename = (projectId: string) => {
    const trimmed = projectDraftName.trim();
    if (trimmed.length >= 3) {
      onRenameProject(projectId, trimmed);
    }
    setEditingProjectId(null);
  };

  const commitThreadRename = (threadId: string) => {
    const trimmed = threadDraftTitle.trim();
    if (trimmed.length >= 2) {
      onRenameThread(threadId, trimmed);
    }
    setEditingThreadId(null);
  };

  const content = (
    <div className="flex flex-col h-full w-[272px] bg-[#0D121B] border-r border-slate-800/80">
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
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {/* Projects */}
        <div className="space-y-2">
          <div className="px-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500">Projects</span>
            <div className="flex items-center gap-1 text-[10px]">
              <button
                type="button"
                onClick={() => setProjectFilter('active')}
                className={`px-1.5 py-0.5 rounded ${
                  projectFilter === 'active'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                All ({activeProjectsCount})
              </button>
              <button
                type="button"
                onClick={() => setProjectFilter('recent')}
                className={`px-1.5 py-0.5 rounded ${
                  projectFilter === 'recent'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Recent
              </button>
              <button
                type="button"
                onClick={() => setProjectFilter('archived')}
                className={`px-1.5 py-0.5 rounded ${
                  projectFilter === 'archived'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Archived ({archivedProjectsCount})
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" aria-hidden="true" />
            <input
              type="search"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Search projects..."
              aria-label="Search projects"
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#090D14] border border-slate-800 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            {filteredProjects.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-slate-500">
                {projectFilter === 'archived'
                  ? 'No archived projects.'
                  : 'No projects match your filter.'}
              </div>
            ) : (
              filteredProjects.map((project) => {
                const active = project.id === activeProjectId;
                const isEditing = editingProjectId === project.id;

                if (isEditing) {
                  return (
                    <div
                      key={project.id}
                      className="p-1.5 bg-[#090D14] border border-blue-500/40 rounded-md flex items-center gap-1"
                    >
                      <input
                        type="text"
                        value={projectDraftName}
                        onChange={(e) => setProjectDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitProjectRename(project.id);
                          if (e.key === 'Escape') setEditingProjectId(null);
                        }}
                        aria-label="Rename project input"
                        autoFocus
                        className="flex-1 min-w-0 px-2 py-1 text-xs bg-[#111827] border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => commitProjectRename(project.id)}
                        className="p-1 text-emerald-400 hover:text-emerald-300"
                        aria-label="Save project name"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProjectId(null)}
                        className="p-1 text-slate-400 hover:text-white"
                        aria-label="Cancel project rename"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={project.id}
                    className={`group rounded-md transition-colors ${
                      active ? 'bg-slate-800/85' : 'hover:bg-slate-900/70'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProject(project.id);
                        onCloseMobile();
                      }}
                      className={`w-full text-left px-2.5 py-2 text-[13px] flex items-center justify-between gap-2 ${
                        active ? 'text-white font-medium' : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      <span className="truncate">{project.name}</span>
                      {project.isSyntheticDemo && (
                        <span className="text-[10px] font-mono text-indigo-300 shrink-0">
                          Demo
                        </span>
                      )}
                    </button>

                    {(active || projectFilter === 'archived') && (
                      <div className="px-2 pb-1.5 flex items-center gap-1 text-[11px] text-slate-400">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProjectId(project.id);
                            setProjectDraftName(project.name);
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-700/70 hover:text-slate-100"
                          aria-label={`Rename ${project.name}`}
                          title="Rename project"
                        >
                          <Pencil className="w-3 h-3" aria-hidden="true" />
                          <span>Rename</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateProject(project.id)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-700/70 hover:text-slate-100"
                          aria-label={`Duplicate ${project.name}`}
                          title="Duplicate project"
                        >
                          <Copy className="w-3 h-3" aria-hidden="true" />
                          <span>Duplicate</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleArchiveProject(project.id)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-700/70 hover:text-slate-100"
                          aria-label={`${project.archived ? 'Restore' : 'Archive'} ${project.name}`}
                          title={project.archived ? 'Restore project' : 'Archive project'}
                        >
                          {project.archived ? (
                            <>
                              <ArchiveRestore className="w-3 h-3" aria-hidden="true" />
                              <span>Restore</span>
                            </>
                          ) : (
                            <>
                              <Archive className="w-3 h-3" aria-hidden="true" />
                              <span>Archive</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Conversations for active project */}
        <div className="space-y-2">
          <div className="px-1 flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Conversations</span>
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

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" aria-hidden="true" />
            <input
              type="search"
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search conversations..."
              aria-label="Search conversations"
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#090D14] border border-slate-800 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            {projectThreads.length === 0 ? (
              <div className="px-2.5 py-2 text-xs text-slate-500">
                {threadSearch.trim()
                  ? 'No conversations match search.'
                  : 'No conversations yet.'}
              </div>
            ) : (
              projectThreads.map((thread) => {
                const active = thread.id === activeThreadId;
                const isEditing = editingThreadId === thread.id;

                if (isEditing) {
                  return (
                    <div
                      key={thread.id}
                      className="p-1.5 bg-[#090D14] border border-blue-500/40 rounded-md flex items-center gap-1"
                    >
                      <input
                        type="text"
                        value={threadDraftTitle}
                        onChange={(e) => setThreadDraftTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitThreadRename(thread.id);
                          if (e.key === 'Escape') setEditingThreadId(null);
                        }}
                        aria-label="Rename conversation input"
                        autoFocus
                        className="flex-1 min-w-0 px-2 py-1 text-xs bg-[#111827] border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => commitThreadRename(thread.id)}
                        className="p-1 text-emerald-400 hover:text-emerald-300"
                        aria-label="Save conversation title"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingThreadId(null)}
                        className="p-1 text-slate-400 hover:text-white"
                        aria-label="Cancel conversation rename"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={thread.id}
                    className={`rounded-md transition-colors ${
                      active ? 'bg-slate-800/60' : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-start gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectThread(thread.id);
                          onCloseMobile();
                        }}
                        className={`flex-1 min-w-0 text-left px-2.5 py-2 text-xs flex items-start gap-2 ${
                          active ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <MessageSquare
                          className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{thread.title}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                            {thread.messages.length} messages
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingThreadId(thread.id);
                          setThreadDraftTitle(thread.title);
                        }}
                        className="p-1.5 mr-1 mt-1 text-slate-500 hover:text-slate-200 rounded"
                        aria-label={`Rename conversation ${thread.title}`}
                        title="Rename conversation"
                      >
                        <Pencil className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
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
