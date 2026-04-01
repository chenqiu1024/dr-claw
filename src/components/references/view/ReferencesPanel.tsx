import { useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Library, RefreshCw, Upload, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { useReferencesData } from '../hooks/useReferencesData';
import ReferenceCard from './ReferenceCard';
import ReferenceDetailModal from './ReferenceDetailModal';
import ImportDialog from './ImportDialog';
import type { Reference } from '../types';

interface ReferencesPanelProps {
  projectName: string;
  onChatFromReference?: (ref: Reference) => void;
}

type DeleteMode =
  | { type: 'single'; ref: Reference }
  | { type: 'bulk'; refs: Reference[]; label: string };

export default function ReferencesPanel({ projectName, onChatFromReference }: ReferencesPanelProps) {
  const { t } = useTranslation('references');
  const {
    projectReferences,
    zoteroStatus,
    loading,
    deleteReference,
    bulkDeleteReferences,
    refresh,
  } = useReferencesData({ projectName });

  const [selectedRef, setSelectedRef] = useState<Reference | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteMode | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const toggleCheck = useCallback((ref: Reference) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ref.id)) next.delete(ref.id);
      else next.add(ref.id);
      return next;
    });
  }, []);

  const handleChatAbout = useCallback(
    (ref: Reference) => {
      onChatFromReference?.(ref);
    },
    [onChatFromReference],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteMode) return;
    try {
      if (deleteMode.type === 'single') {
        await deleteReference(deleteMode.ref.id);
      } else {
        await bulkDeleteReferences(deleteMode.refs.map(r => r.id));
      }
    } catch {
      // error logged in hook
    }
    if (deleteMode.type === 'bulk') setCheckedIds(new Set());
    setDeleteMode(null);
  }, [deleteMode, deleteReference, bulkDeleteReferences]);

  // Derive confirmation dialog text
  const deleteDialogTitle = deleteMode?.type === 'single'
    ? t('actions.deleteTitle')
    : t('actions.deleteAllTitle');
  const deleteDialogMessage = deleteMode?.type === 'single'
    ? t('actions.deleteConfirm', { title: deleteMode.ref.title })
    : t('actions.deleteAllConfirm', { count: deleteMode?.refs.length ?? 0 });
  const deleteDialogWarning = deleteMode?.type === 'single'
    ? t('actions.deleteWarning')
    : t('actions.deleteAllWarning');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Library className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium text-foreground">{t('panel.title')}</span>
          <Badge variant="outline">{projectReferences.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {checkedIds.size > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground hover:text-destructive hover:border-destructive/40"
              onClick={() => {
                const refs = projectReferences.filter((r) => checkedIds.has(r.id));
                setDeleteMode({ type: 'bulk', refs, label: 'selected' });
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('actions.deleteSelected', { count: checkedIds.size })}
            </Button>
          ) : projectReferences.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground hover:text-destructive hover:border-destructive/40"
              onClick={() => setDeleteMode({ type: 'bulk', refs: projectReferences, label: 'project' })}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('actions.deleteAll')}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            {t('panel.import')}
          </Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Project references */}
      {projectReferences.length > 0 ? (
        <div className="space-y-2">
          {projectReferences.map((ref) => (
            <ReferenceCard
              key={ref.id}
              reference={ref}
              isSelected={selectedRef?.id === ref.id}
              isLinked
              isChecked={checkedIds.has(ref.id)}
              onSelect={setSelectedRef}
              onToggleCheck={toggleCheck}
              onChat={onChatFromReference ? handleChatAbout : undefined}
              onDelete={(r) => setDeleteMode({ type: 'single', ref: r })}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
          {t('panel.noProjectRefs')}
        </div>
      )}

      {/* Detail modal — portal to body to escape CollapsiblePanel stacking context */}
      {selectedRef && ReactDOM.createPortal(
        <ReferenceDetailModal
          reference={selectedRef}
          onClose={() => setSelectedRef(null)}
          onAddToChat={onChatFromReference ? (ref) => handleChatAbout(ref) : undefined}
        />,
        document.body,
      )}

      {/* Import dialog — portal to body to escape CollapsiblePanel stacking context */}
      {showImportDialog && ReactDOM.createPortal(
        <ImportDialog
          zoteroStatus={zoteroStatus}
          projectName={projectName}
          onClose={() => setShowImportDialog(false)}
          onComplete={refresh}
        />,
        document.body,
      )}

      {/* Delete confirmation dialog (single + bulk) */}
      {deleteMode && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setDeleteMode(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <h3 className="text-base font-semibold text-foreground">{deleteDialogTitle}</h3>
            </div>
            <p className="mt-3 text-sm text-foreground">{deleteDialogMessage}</p>
            <p className="mt-2 text-xs text-muted-foreground">{deleteDialogWarning}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteMode(null)}>
                {t('actions.cancel')}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleConfirmDelete}>
                {t('actions.deleteButton')}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
