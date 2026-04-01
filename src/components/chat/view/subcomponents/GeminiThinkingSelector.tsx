import { useEffect, useRef, useState } from 'react';
import { Brain, Gauge, Sparkles, Atom, Zap, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  getGeminiThinkingFamily,
  getSupportedGeminiThinkingModes,
  type GeminiThinkingModeId,
} from '../../../../../shared/geminiThinkingSupport';

type GeminiThinkingSelectorProps = {
  model: string;
  selectedMode: GeminiThinkingModeId;
  onModeChange: (modeId: GeminiThinkingModeId) => void;
  onClose?: () => void;
  className?: string;
};

const MODE_ICONS = {
  default: Gauge,
  minimal: Gauge,
  low: Brain,
  medium: Zap,
  high: Sparkles,
  dynamic: Sparkles,
  off: Gauge,
  light: Brain,
  balanced: Zap,
  deep: Sparkles,
  max: Atom,
} as const;

const MODE_COLORS = {
  default: 'text-gray-600',
  minimal: 'text-slate-600',
  low: 'text-blue-600',
  medium: 'text-violet-600',
  high: 'text-indigo-600',
  dynamic: 'text-cyan-600',
  off: 'text-gray-500',
  light: 'text-blue-600',
  balanced: 'text-violet-600',
  deep: 'text-indigo-600',
  max: 'text-red-600',
} as const;

function getBudgetForMode(model: string, mode: GeminiThinkingModeId) {
  if (model === 'gemini-2.5-pro') {
    if (mode === 'light') return 1024;
    if (mode === 'balanced') return 8192;
    if (mode === 'deep') return 24576;
    if (mode === 'max') return 32768;
  }

  if (model === 'gemini-2.5-flash') {
    if (mode === 'light') return 1024;
    if (mode === 'balanced') return 8192;
    if (mode === 'deep') return 24576;
  }

  if (model === 'gemini-2.5-flash-lite') {
    if (mode === 'light') return 512;
    if (mode === 'balanced') return 8192;
    if (mode === 'deep') return 24576;
  }

  return null;
}

export default function GeminiThinkingSelector({
  model,
  selectedMode,
  onModeChange,
  onClose,
  className = '',
}: GeminiThinkingSelectorProps) {
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

  const family = getGeminiThinkingFamily(model);
  const supportedModes = getSupportedGeminiThinkingModes(model);

  const translatedModes = supportedModes.map((mode) => {
    const budget = getBudgetForMode(model, mode);
    return {
      id: mode,
      name: t(`geminiThinking.modes.${mode}.name`),
      description: t(`geminiThinking.modes.${mode}.description`, budget ? { budget: budget.toLocaleString() } : {}),
      icon: MODE_ICONS[mode],
      color: MODE_COLORS[mode],
    };
  });

  const currentMode = translatedModes.find((mode) => mode.id === selectedMode) || translatedModes[0];
  const IconComponent = currentMode?.icon || Brain;

  if (!currentMode) {
    return null;
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-10 h-10 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
          selectedMode === 'default'
            ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600'
            : 'bg-sky-100 hover:bg-sky-200 dark:bg-sky-900 dark:hover:bg-sky-800'
        }`}
        title={t('geminiThinking.buttonTitle', { mode: currentMode.name })}
      >
        <IconComponent className={`w-5 h-5 ${currentMode.color}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-72 max-h-[min(440px,70vh)] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('geminiThinking.selector.title')}
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
              {t(
                family === 'gemini-3'
                  ? 'geminiThinking.selector.descriptionGemini3'
                  : 'geminiThinking.selector.descriptionGemini25',
              )}
            </p>
          </div>

          <div className="py-1">
            {translatedModes.map((mode) => {
              const ModeIcon = mode.icon;
              const isSelected = mode.id === selectedMode;

              return (
                <button
                  key={mode.id}
                  onClick={() => {
                    onModeChange(mode.id);
                    setIsOpen(false);
                    onClose?.();
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    isSelected ? 'bg-gray-50 dark:bg-gray-700' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${mode.color}`}>
                      <ModeIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${
                          isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {mode.name}
                        </span>
                        {isSelected && (
                          <span className="text-xs bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded">
                            {t('geminiThinking.selector.active')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {mode.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <strong>Tip:</strong>{' '}
              {t(
                family === 'gemini-3'
                  ? 'geminiThinking.selector.tipGemini3'
                  : 'geminiThinking.selector.tipGemini25',
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
