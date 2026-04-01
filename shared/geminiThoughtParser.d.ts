export type LegacyGeminiThoughtSegment = {
  content: string;
  isThinking: boolean;
};

export function splitLegacyGeminiThoughtContent(
  text: string,
): LegacyGeminiThoughtSegment[] | null;
