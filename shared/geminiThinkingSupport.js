export const GEMINI_THINKING_MODE_IDS = [
  'default',
  'minimal',
  'low',
  'medium',
  'high',
  'dynamic',
  'off',
  'light',
  'balanced',
  'deep',
  'max',
];

function isGemini3Model(model) {
  return typeof model === 'string' && model.startsWith('gemini-3');
}

function isGemini25Model(model) {
  return typeof model === 'string' && model.startsWith('gemini-2.5');
}

export function getGeminiThinkingFamily(model) {
  if (isGemini3Model(model)) return 'gemini-3';
  if (isGemini25Model(model)) return 'gemini-2.5';
  return null;
}

export function getSupportedGeminiThinkingModes(model) {
  switch (model) {
    case 'gemini-3.1-pro-preview':
      return ['default', 'low', 'medium', 'high'];
    case 'gemini-3.1-flash-lite-preview':
    case 'gemini-3-flash-preview':
      return ['default', 'minimal', 'low', 'medium', 'high'];
    case 'gemini-2.5-pro':
      return ['default', 'dynamic', 'light', 'balanced', 'deep', 'max'];
    case 'gemini-2.5-flash':
    case 'gemini-2.5-flash-lite':
      return ['default', 'dynamic', 'off', 'light', 'balanced', 'deep'];
    default:
      return ['default'];
  }
}

export function supportsExplicitGeminiThinkingMode(model) {
  return getSupportedGeminiThinkingModes(model).length > 1;
}

export function buildGeminiThinkingConfig(model, mode) {
  if (!model || !mode || mode === 'default') {
    return null;
  }

  if (isGemini3Model(model)) {
    const levelMap = {
      minimal: 'MINIMAL',
      low: 'LOW',
      medium: 'MEDIUM',
      high: 'HIGH',
    };
    const thinkingLevel = levelMap[mode];
    return thinkingLevel ? { thinkingLevel } : null;
  }

  if (isGemini25Model(model)) {
    const budgetMapByModel = {
      'gemini-2.5-pro': {
        dynamic: -1,
        light: 1024,
        balanced: 8192,
        deep: 24576,
        max: 32768,
      },
      'gemini-2.5-flash': {
        dynamic: -1,
        off: 0,
        light: 1024,
        balanced: 8192,
        deep: 24576,
      },
      'gemini-2.5-flash-lite': {
        dynamic: -1,
        off: 0,
        light: 512,
        balanced: 8192,
        deep: 24576,
      },
    };

    const budget = budgetMapByModel[model]?.[mode];
    return Number.isInteger(budget) ? { thinkingBudget: budget } : null;
  }

  return null;
}
