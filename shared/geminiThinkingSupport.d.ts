export type GeminiThinkingModeId =
  | 'default'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'dynamic'
  | 'off'
  | 'light'
  | 'balanced'
  | 'deep'
  | 'max';

export type GeminiThinkingFamily = 'gemini-3' | 'gemini-2.5' | null;

export function getGeminiThinkingFamily(model: string): GeminiThinkingFamily;
export function getSupportedGeminiThinkingModes(model: string): GeminiThinkingModeId[];
export function supportsExplicitGeminiThinkingMode(model: string): boolean;
export function buildGeminiThinkingConfig(
  model: string,
  mode?: GeminiThinkingModeId | null,
): { thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'; thinkingBudget?: number } | null;
