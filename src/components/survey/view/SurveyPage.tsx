import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  FileText,
  Network,
  NotebookText,
  RefreshCw,
  AlertCircle,
  ClipboardList,
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Library,
} from 'lucide-react';

import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { cn } from '../../../lib/utils';
import { api } from '../../../utils/api';
import type { Project } from '../../../types/app';
import { useSurveyData, type SurveyFile, type SurveyTask } from '../hooks/useSurveyData';
import MermaidDiagramViewer from './MermaidDiagramViewer';
import { saveSurveyDiagramSource } from '../utils/diagramWindow';
import ReferencesPanel from '../../references/view/ReferencesPanel';
import type { Reference } from '../../references/types';

type SurveyPageProps = {
  selectedProject: Project;
  onChatFromReference?: (ref: Reference) => void;
};

type SelectedItem =
  | { type: 'file'; value: SurveyFile }
  | { type: 'task'; value: SurveyTask }
  | null;

type PreviewState = {
  loading: boolean;
  content: string | null;
  pdfUrl: string | null;
  mermaidSvg: string | null;
  error: string | null;
};

const SECTION_META = {
  papers: { icon: BookOpen, tone: 'text-sky-600 dark:text-sky-400' },
  reports: { icon: FileText, tone: 'text-emerald-600 dark:text-emerald-400' },
  graphs: { icon: Network, tone: 'text-indigo-600 dark:text-indigo-400' },
  notes: { icon: NotebookText, tone: 'text-amber-600 dark:text-amber-400' },
} as const;

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof BookOpen;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.78))] p-4 shadow-sm dark:bg-[linear-gradient(180deg,rgba(20,23,29,0.92),rgba(17,24,39,0.82))]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
        </div>
        <div className={cn('rounded-xl border border-border/40 bg-background/80 p-2 shadow-sm', tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function CollapsiblePanel({
  title,
  badge,
  collapsed,
  onToggle,
  children,
  accentClassName,
}: {
  title: string;
  badge?: string | number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accentClassName?: string;
}) {
  const { t } = useTranslation('common');

  return (
    <div className="rounded-2xl border border-border/50 bg-card/75 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left hover:bg-muted/30"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('h-2.5 w-2.5 rounded-full bg-primary/60', accentClassName)} />
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          {badge !== undefined ? <Badge variant="outline">{badge}</Badge> : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{collapsed ? t('surveyPage.actions.expand') : t('surveyPage.actions.collapse')}</span>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      {!collapsed ? <div className="border-t border-border/40">{children}</div> : null}
    </div>
  );
}

function SurveySection({
  sectionKey,
  title,
  files,
  selectedItem,
  onSelect,
  emptyLabel,
  filter,
  collapsed,
  onToggle,
}: {
  sectionKey: keyof typeof SECTION_META;
  title: string;
  files: SurveyFile[];
  selectedItem: SelectedItem;
  onSelect: (item: SelectedItem) => void;
  emptyLabel: string;
  filter: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('common');
  const filteredFiles = files.filter((file) => {
    if (!filter) {
      return true;
    }

    const haystack = `${file.name} ${file.relativePath}`.toLowerCase();
    return haystack.includes(filter.toLowerCase());
  });

  const Icon = SECTION_META[sectionKey].icon;

  return (
    <div className="rounded-xl border border-border/50 bg-background/55 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn('rounded-lg border border-border/40 bg-background/80 p-1.5', SECTION_META[sectionKey].tone)}>
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          <Badge variant="outline">{filteredFiles.length}</Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{collapsed ? t('surveyPage.actions.expand') : t('surveyPage.actions.collapse')}</span>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      {!collapsed ? (
      <div className="border-t border-border/40 p-2">
        {filteredFiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          filteredFiles.map((file) => {
            const isSelected = selectedItem?.type === 'file' && selectedItem.value.id === file.id;
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => onSelect({ type: 'file', value: file })}
                className={cn(
                  'mb-2 flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left transition-colors last:mb-0',
                  isSelected
                    ? 'border-primary/60 bg-primary/8'
                    : 'border-transparent bg-muted/40 hover:border-border/60 hover:bg-muted/70',
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{file.relativePath}</div>
                </div>
                <Badge variant="secondary" className="ml-3 shrink-0 uppercase">
                  {file.extension.replace('.', '') || 'file'}
                </Badge>
              </button>
            );
          })
        )}
      </div>
      ) : null}
    </div>
  );
}

function PreviewPane({
  selectedItem,
  preview,
  onOpenMermaidWindow,
  collapsed,
  onToggle,
}: {
  selectedItem: SelectedItem;
  preview: PreviewState;
  onOpenMermaidWindow: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('common');
  const previewLabel = selectedItem?.type === 'task'
    ? t('surveyPage.preview.surveyTask')
    : selectedItem?.type === 'file'
      ? selectedItem.value.name
      : t('surveyPage.labels.preview');
  const previewMeta = selectedItem?.type === 'file'
    ? selectedItem.value.relativePath
    : selectedItem?.type === 'task'
      ? selectedItem.value.status || 'pending'
      : t('surveyPage.empty.noSelection');

  return (
    <div className="rounded-2xl border border-border/50 bg-card/75 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left hover:bg-muted/30"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">{t('surveyPage.labels.preview')}</h3>
            {selectedItem?.type === 'file' ? (
              <Badge variant="outline" className="uppercase">{selectedItem.value.category}</Badge>
            ) : null}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{previewLabel} · {previewMeta}</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{collapsed ? t('surveyPage.actions.expand') : t('surveyPage.actions.collapse')}</span>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      {!collapsed ? (
        <div className="border-t border-border/40 p-5">
          {!selectedItem ? (
            <div className="flex min-h-[24vh] items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 px-6 text-center text-sm text-muted-foreground">
              {t('surveyPage.empty.noSelection')}
            </div>
          ) : selectedItem.type === 'task' ? (
            <div className="rounded-xl border border-border/50 bg-background/40">
              <div className="border-b border-border/40 px-5 py-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-sky-500" />
                  <h3 className="text-sm font-semibold text-foreground">{selectedItem.value.title}</h3>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{t('surveyPage.preview.surveyTask')}</Badge>
                  <Badge variant="secondary">{selectedItem.value.status || 'pending'}</Badge>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {t('surveyPage.preview.taskDescription')}
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {selectedItem.value.description || t('surveyPage.empty.noTaskDescription')}
                  </div>
                </div>
              </div>
            </div>
          ) : preview.loading ? (
            <div className="flex min-h-[28vh] items-center justify-center rounded-xl border border-border/60 bg-background/40 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('surveyPage.preview.loading')}
            </div>
          ) : preview.error ? (
            <div className="flex min-h-[28vh] items-center justify-center rounded-xl border border-destructive/30 bg-background/40 px-6 text-center text-sm text-destructive">
              <AlertCircle className="mr-2 h-4 w-4" />
              {t('surveyPage.preview.failed')}
            </div>
          ) : (
            <PreviewContent
              file={selectedItem.value}
              preview={preview}
              onOpenMermaidWindow={onOpenMermaidWindow}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function PreviewContent({
  file,
  preview,
  onOpenMermaidWindow,
}: {
  file: SurveyFile;
  preview: PreviewState;
  onOpenMermaidWindow: () => void;
}) {
  const { t } = useTranslation('common');

  return (
    <>
      {file.previewKind === 'pdf' && preview.pdfUrl ? (
        <iframe
          title={file.name}
          src={preview.pdfUrl}
          className="min-h-[85vh] w-full rounded-xl border border-border/50 bg-background shadow-sm"
        />
      ) : null}

      {preview.mermaidSvg ? (
        <MermaidDiagramViewer svg={preview.mermaidSvg} onOpenInWindow={onOpenMermaidWindow} />
      ) : null}

      {file.previewKind === 'html' && preview.content ? (
        <iframe
          title={file.name}
          srcDoc={preview.content}
          sandbox="allow-scripts allow-same-origin"
          className="min-h-[85vh] w-full rounded-xl border border-border/50 bg-white shadow-sm"
        />
      ) : null}

      {file.previewKind === 'markdown' && preview.content ? (
        <div className="prose prose-sm max-w-none rounded-xl border border-border/50 bg-background/60 p-6 shadow-sm dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content}</ReactMarkdown>
        </div>
      ) : null}

      {(file.previewKind === 'json' || file.previewKind === 'text') && preview.content ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border/50 bg-background/80 p-5 text-sm text-foreground shadow-sm">
          {preview.content}
        </pre>
      ) : null}

      {file.previewKind === 'unsupported' ? (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
          {t('surveyPage.preview.unsupported')}
        </div>
      ) : null}
    </>
  );
}

export default function SurveyPage({ selectedProject, onChatFromReference }: SurveyPageProps) {
  const { t } = useTranslation('common');
  const { papers, reports, graphs, notes, tasks, loading, error, refresh } = useSurveyData(selectedProject);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [preview, setPreview] = useState<PreviewState>({
    loading: false,
    content: null,
    pdfUrl: null,
    mermaidSvg: null,
    error: null,
  });
  const [filter, setFilter] = useState('');
  const [collapsedPanels, setCollapsedPanels] = useState({
    tasks: false,
    library: false,
    references: true,
    preview: false,
  });
  const [collapsedSections, setCollapsedSections] = useState({
    papers: false,
    reports: false,
    graphs: false,
    notes: false,
  });
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const pendingPreviewScrollRef = useRef(false);

  const togglePanel = (panel: keyof typeof collapsedPanels) => {
    setCollapsedPanels((current) => ({ ...current, [panel]: !current[panel] }));
  };

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const handleSelectItem = (item: SelectedItem) => {
    pendingPreviewScrollRef.current = Boolean(item);
    setCollapsedPanels((current) => (
      current.preview
        ? { ...current, preview: false }
        : current
    ));
    setSelectedItem(item);
  };

  const handleOpenMermaidWindow = () => {
    if (!preview.content) {
      return;
    }

    const mermaidSource = extractMermaidSource(preview.content);
    if (!mermaidSource) {
      return;
    }

    const diagramId = saveSurveyDiagramSource(mermaidSource);
    const basename = window.__ROUTER_BASENAME__ || '';
    window.open(`${basename}/survey/diagram?diagramId=${encodeURIComponent(diagramId)}`, '_blank', 'noopener,noreferrer,width=1600,height=1000');
  };

  useEffect(() => {
    const availableFiles = [...papers, ...reports, ...graphs, ...notes];

    if (selectedItem?.type === 'file') {
      const stillExists = availableFiles.some((file) => file.id === selectedItem.value.id);
      if (stillExists) {
        return;
      }
    }

    if (availableFiles.length > 0) {
      setSelectedItem({ type: 'file', value: availableFiles[0] });
      return;
    }

    if (tasks.length > 0) {
      setSelectedItem({ type: 'task', value: tasks[0] });
      return;
    }

    setSelectedItem(null);
  }, [graphs, notes, papers, reports, selectedItem, tasks]);

  useEffect(() => {
    let revokedUrl: string | null = null;
    let isCancelled = false;

    const loadPreview = async () => {
      if (!selectedItem || selectedItem.type !== 'file') {
        setPreview({ loading: false, content: null, pdfUrl: null, mermaidSvg: null, error: null });
        return;
      }

      const file = selectedItem.value;
      if (file.previewKind === 'unsupported') {
        setPreview({ loading: false, content: null, pdfUrl: null, mermaidSvg: null, error: null });
        return;
      }

      setPreview({ loading: true, content: null, pdfUrl: null, mermaidSvg: null, error: null });

      try {
        if (file.previewKind === 'pdf') {
          const blob = await api.getFileContentBlob(selectedProject.name, file.absolutePath);
          if (isCancelled) {
            return;
          }

          revokedUrl = URL.createObjectURL(blob);
          setPreview({ loading: false, content: null, pdfUrl: revokedUrl, mermaidSvg: null, error: null });
          return;
        }

        const response = await api.readFile(selectedProject.name, file.relativePath);
        if (!response.ok) {
          throw new Error(`preview:${response.status}`);
        }

        const payload = await response.json();
        const rawContent = String(payload?.content ?? '');
        const mermaidSource = extractMermaidSource(rawContent);

        if (mermaidSource) {
          const mermaid = (await import('mermaid')).default;
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
          });

          const renderId = `survey-mermaid-${Date.now().toString(36)}`;
          const { svg } = await mermaid.render(renderId, mermaidSource);
          if (!isCancelled) {
            setPreview({
              loading: false,
              content: rawContent,
              pdfUrl: null,
              mermaidSvg: svg,
              error: null,
            });
          }
          return;
        }

        let content = rawContent;
        if (file.previewKind === 'json') {
          try {
            content = JSON.stringify(JSON.parse(rawContent), null, 2);
          } catch {
            content = rawContent;
          }
        }

        setPreview({ loading: false, content, pdfUrl: null, mermaidSvg: null, error: null });
      } catch (previewError) {
        console.error('Failed to load survey preview:', previewError);
        if (!isCancelled) {
          setPreview({ loading: false, content: null, pdfUrl: null, mermaidSvg: null, error: 'preview-failed' });
        }
      }
    };

    void loadPreview();

    return () => {
      isCancelled = true;
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [selectedItem, selectedProject.name]);

  useEffect(() => {
    if (!selectedItem || !pendingPreviewScrollRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      previewPaneRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      pendingPreviewScrollRef.current = false;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [selectedItem]);

  const sections = [
    { key: 'papers', title: t('surveyPage.sections.papers'), files: papers },
    { key: 'reports', title: t('surveyPage.sections.reports'), files: reports },
    { key: 'graphs', title: t('surveyPage.sections.graphs'), files: graphs },
    { key: 'notes', title: t('surveyPage.sections.notes'), files: notes },
  ] as const;

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.10),transparent_24%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.08),transparent_22%),linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.92))] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_24%),radial-gradient(circle_at_top_right,rgba(99,102,241,0.10),transparent_22%),linear-gradient(180deg,rgba(10,15,24,0.98),rgba(15,23,42,0.98))]">
      <div className="flex min-h-full flex-col">
        <div className="border-b border-border/50 bg-background/55 px-4 py-5 backdrop-blur-sm sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-background/70">{t('surveyPage.labels.workspaceTag')}</Badge>
                <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary dark:bg-primary/15">
                  <Sparkles className="h-3 w-3" />
                  {t('surveyPage.labels.focusTag')}
                </Badge>
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">{t('surveyPage.title')}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t('surveyPage.description')}</p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('surveyPage.filterPlaceholder')}
                className="w-full min-w-[220px] bg-background xl:w-[280px]"
              />
              <Button variant="outline" onClick={refresh}>
                <RefreshCw className="h-4 w-4" />
                {t('buttons.refresh')}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label={t('surveyPage.summary.papers')} value={papers.length} icon={BookOpen} tone={SECTION_META.papers.tone} />
            <SummaryCard label={t('surveyPage.summary.reports')} value={reports.length} icon={FileText} tone={SECTION_META.reports.tone} />
            <SummaryCard label={t('surveyPage.summary.graphs')} value={graphs.length} icon={Network} tone={SECTION_META.graphs.tone} />
            <SummaryCard label={t('surveyPage.summary.tasks')} value={tasks.length} icon={ClipboardList} tone="text-violet-600 dark:text-violet-400" />
          </div>
        </div>

        <div className="flex-1 px-4 py-4 sm:px-6">
          {loading ? (
            <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('surveyPage.loading')}
            </div>
          ) : error ? (
            <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-destructive/30 bg-card/60 text-sm text-destructive">
              <AlertCircle className="mr-2 h-4 w-4" />
              {t('surveyPage.errors.loadFailed')}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <CollapsiblePanel
                  title={t('surveyPage.sections.tasks')}
                  badge={tasks.length}
                  collapsed={collapsedPanels.tasks}
                  onToggle={() => togglePanel('tasks')}
                  accentClassName="bg-violet-500/70"
                >
                  <div className="p-2">
                    {tasks.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                        {t('surveyPage.empty.noTasks')}
                      </div>
                    ) : (
                      tasks.map((task) => {
                        const isSelected = selectedItem?.type === 'task' && selectedItem.value.id === task.id;
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => handleSelectItem({ type: 'task', value: task })}
                            className={cn(
                              'mb-2 w-full rounded-xl border px-3 py-3 text-left transition-all last:mb-0',
                              isSelected
                                ? 'border-primary/60 bg-primary/8 shadow-sm'
                                : 'border-transparent bg-background/55 hover:border-border/60 hover:bg-background/80',
                            )}
                          >
                            <div className="text-sm font-medium text-foreground">{task.title}</div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {task.description || t('surveyPage.empty.noTaskDescription')}
                            </div>
                            <Badge variant="secondary" className="mt-3">
                              {task.status || 'pending'}
                            </Badge>
                          </button>
                        );
                      })
                    )}
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel
                  title={t('surveyPage.labels.library')}
                  badge={papers.length + reports.length + graphs.length + notes.length}
                  collapsed={collapsedPanels.library}
                  onToggle={() => togglePanel('library')}
                  accentClassName="bg-sky-500/70"
                >
                  <div className="space-y-4 p-3">
                    {sections.map((section) => (
                      <SurveySection
                        key={section.key}
                        sectionKey={section.key}
                        title={section.title}
                        files={section.files}
                        selectedItem={selectedItem}
                        onSelect={handleSelectItem}
                        emptyLabel={t('surveyPage.empty.noSectionFiles', { section: section.title.toLowerCase() })}
                        filter={filter}
                        collapsed={collapsedSections[section.key]}
                        onToggle={() => toggleSection(section.key)}
                      />
                    ))}
                    {papers.length + reports.length + graphs.length + notes.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
                        {t('surveyPage.empty.noSurveyFiles')}
                      </div>
                    ) : null}
                  </div>
                </CollapsiblePanel>
              </div>

              <CollapsiblePanel
                title={t('surveyPage.sections.references')}
                collapsed={collapsedPanels.references}
                onToggle={() => togglePanel('references')}
                accentClassName="bg-purple-500/70"
              >
                <div className="p-3">
                  <ReferencesPanel projectName={selectedProject.name} onChatFromReference={onChatFromReference} />
                </div>
              </CollapsiblePanel>

              <div ref={previewPaneRef}>
                <PreviewPane
                  selectedItem={selectedItem}
                  preview={preview}
                  onOpenMermaidWindow={handleOpenMermaidWindow}
                  collapsed={collapsedPanels.preview}
                  onToggle={() => togglePanel('preview')}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function extractMermaidSource(rawContent: string) {
  const fencedMatch = rawContent.match(/```mermaid\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]?.trim()) {
    return fencedMatch[1].trim();
  }

  if (/^\s*(graph|flowchart|mindmap|timeline|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|requirementDiagram)\b/m.test(rawContent)) {
    return rawContent.trim();
  }

  return null;
}
