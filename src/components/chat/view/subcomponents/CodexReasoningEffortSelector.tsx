import { useState, useRef, useEffect } from 'react';
import { Brain, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { codexReasoningEfforts } from '../../constants/codexReasoningEfforts';
import type { CodexReasoningEffortId } from '../../constants/codexReasoningEfforts';
import { getSupportedCodexReasoningEfforts } from '../../constants/codexReasoningSupport';

type CodexReasoningEffortSelectorProps = {
  model: string;
  selectedEffort: CodexReasoningEffortId;
  onEffortChange: (effortId: CodexReasoningEffortId) => void;
  onClose?: () => void;
  className?: string;
};

function CodexReasoningEffortSelector({
  model,
  selectedEffort,
  onEffortChange,
  onClose,
  className = '',
}: CodexReasoningEffortSelectorProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const supportedEffortIds = getSupportedCodexReasoningEfforts(model);

  const translatedEfforts = codexReasoningEfforts
    .filter((effort) => supportedEffortIds.includes(effort.id))
    .map((effort) => ({
    ...effort,
    name: t(`codexReasoningEffort.levels.${effort.id}.name`),
    description: t(`codexReasoningEffort.levels.${effort.id}.description`),
    }));

  const currentEffort = translatedEfforts.find((effort) => effort.id === selectedEffort) || translatedEfforts[0];
  const IconComponent = currentEffort.icon || Brain;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-10 h-10 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
          selectedEffort === 'default'
            ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600'
            : 'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900 dark:hover:bg-emerald-800'
        }`}
        title={t('codexReasoningEffort.buttonTitle', { level: currentEffort.name })}
      >
        <IconComponent className={`w-5 h-5 ${currentEffort.color}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-72 max-h-[min(420px,70vh)] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('codexReasoningEffort.selector.title')}
              </h3>
              <button
                onClick={() => {
                  setIsOpen(false);
                  onClose?.();
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('codexReasoningEffort.selector.description')}
            </p>
          </div>

          <div className="py-1">
            {translatedEfforts.map((effort) => {
              const EffortIcon = effort.icon;
              const isSelected = effort.id === selectedEffort;

              return (
                <button
                  key={effort.id}
                  onClick={() => {
                    onEffortChange(effort.id);
                    setIsOpen(false);
                    onClose?.();
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    isSelected ? 'bg-gray-50 dark:bg-gray-700' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${effort.color}`}>
                      <EffortIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${
                          isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {effort.name}
                        </span>
                        {isSelected && (
                          <span className="text-xs bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">
                            {t('codexReasoningEffort.selector.active')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {effort.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <strong>Tip:</strong> {t('codexReasoningEffort.selector.tip')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default CodexReasoningEffortSelector;
