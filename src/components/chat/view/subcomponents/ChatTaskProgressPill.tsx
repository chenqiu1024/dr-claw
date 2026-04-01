import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, ListChecks, Play, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaskMaster } from '../../../../contexts/TaskMasterContext';

type TaskItem = {
  id?: string | number;
  title?: string;
  status?: string;
  stage?: string;
  nextActionPrompt?: string;
  whyNext?: string;
  guidance?: {
    nextActionPrompt?: string;
    whyNext?: string;
  } | null;
};

interface ChatTaskProgressPillProps {
  onStartTask?: (prompt?: string, task?: TaskItem | null) => void;
  onShowAllTasks?: (() => void) | null;
  className?: string;
}

type TaskMasterContextValue = {
  tasks?: TaskItem[];
  nextTask?: TaskItem | null;
  isLoadingTasks?: boolean;
};

export default function ChatTaskProgressPill({
  onStartTask,
  onShowAllTasks,
  className = '',
}: ChatTaskProgressPillProps) {
  const { t } = useTranslation('chat');
  const {
    tasks = [],
    nextTask,
    isLoadingTasks,
  } = useTaskMaster() as TaskMasterContextValue;
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === 'done').length;
    const inProgress = tasks.filter((task) => task.status === 'in-progress').length;
    const pending = tasks.filter((task) => task.status === 'pending').length;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, pending, progress };
  }, [tasks]);

  const actionPrompt = nextTask?.nextActionPrompt || nextTask?.guidance?.nextActionPrompt || '';
  const whyNext = nextTask?.whyNext || nextTask?.guidance?.whyNext || '';
  const hasTasks = summary.total > 0;
  const isLoading = Boolean(isLoadingTasks);

  return (
    <div className={`relative w-full mt-2 mb-2 ${className}`}>
      {expanded && (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-2 space-y-2 rounded-xl border border-border/70 bg-card/95 px-3 py-2.5 shadow-xl backdrop-blur">
          {hasTasks ? (
            <>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${summary.progress}%` }}
                />
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{t('tasks.compact.done')}: {summary.done}</span>
                <span>{t('tasks.compact.inProgress')}: {summary.inProgress}</span>
                <span>{t('tasks.compact.pending')}: {summary.pending}</span>
              </div>

              {whyNext && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {whyNext}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('tasks.compact.emptyHint', {
                defaultValue: 'Talk to the Agent to generate and configure a research pipeline.',
              })}
            </p>
          )}

          {onShowAllTasks && (
            <button
              onClick={onShowAllTasks}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-muted/70"
            >
              <ListChecks className="h-3.5 w-3.5" />
              {t('tasks.compact.allTasks')}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/95 px-3 py-2.5 shadow-sm backdrop-blur">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
          {summary.done === summary.total ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Target className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">
            {isLoading
              ? t('tasks.loading', { defaultValue: 'Loading tasks...' })
              : hasTasks
                ? t('tasks.compact.progress', {
                    done: summary.done,
                    total: summary.total,
                    pending: summary.pending,
                  })
                : t('tasks.compact.noTasks', { defaultValue: 'No tasks yet. Start by chatting with the Agent.' })}
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {nextTask?.title ||
              (hasTasks
                ? t('tasks.compact.allDone')
                : t('tasks.compact.emptyTitle', { defaultValue: 'Task progress unavailable' }))}
          </p>
        </div>

        {nextTask && (
          <button
            onClick={() => onStartTask?.(actionPrompt, nextTask)}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-cyan-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-cyan-500"
          >
            <Play className="h-3 w-3" />
            {t('tasks.compact.useInChat')}
          </button>
        )}

        <button
          onClick={() => setExpanded((previous) => !previous)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted/70"
          title={expanded ? t('tasks.compact.collapse') : t('tasks.compact.expand')}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
