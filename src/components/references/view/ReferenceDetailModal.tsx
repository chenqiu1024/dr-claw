import { useTranslation } from 'react-i18next';
import { X, ExternalLink, FileText, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import type { Reference } from '../types';
import { formatAuthors, formatReferenceContext } from '../types';

interface ReferenceDetailModalProps {
  reference: Reference;
  onClose: () => void;
  onAddToChat?: (ref: Reference) => void;
}

export default function ReferenceDetailModal({
  reference,
  onClose,
  onAddToChat,
}: ReferenceDetailModalProps) {
  const { t } = useTranslation('references');
  const [copied, setCopied] = useState(false);

  const handleCopyContext = async () => {
    try {
      await navigator.clipboard.writeText(formatReferenceContext(reference));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard write failed — do not show "Copied"
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="pr-8">
          <div className="flex items-start gap-3">
            <FileText className="mt-1 h-5 w-5 shrink-0 text-sky-500" />
            <h2 className="text-lg font-semibold text-foreground">{reference.title}</h2>
          </div>

          <div className="mt-3 text-sm text-muted-foreground">
            {formatAuthors(reference.authors, 10)}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {reference.year && <Badge variant="secondary">{reference.year}</Badge>}
            {reference.journal && <Badge variant="outline">{reference.journal}</Badge>}
            <Badge variant="outline" className="capitalize">{reference.item_type}</Badge>
            <Badge variant="outline" className="capitalize">{reference.source}</Badge>
          </div>

          {reference.doi && (
            <div className="mt-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">DOI</span>
              <a
                href={`https://doi.org/${reference.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {reference.doi}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {reference.abstract && (
            <div className="mt-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('detail.abstract')}
              </span>
              <p className="mt-1 text-sm leading-6 text-foreground">{reference.abstract}</p>
            </div>
          )}

          {reference.keywords.length > 0 && (
            <div className="mt-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('detail.keywords')}
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {reference.keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="text-[10px]">{kw}</Badge>
                ))}
              </div>
            </div>
          )}

          {reference.url && (
            <div className="mt-4">
              <a
                href={reference.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {t('detail.viewSource')}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-border/40 pt-4">
          {onAddToChat && (
            <Button size="sm" onClick={() => onAddToChat(reference)}>
              {t('actions.addToChat')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleCopyContext}>
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {copied ? t('actions.copied') : t('actions.copyContext')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('actions.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
