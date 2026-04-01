/**
 * Splits Gemini legacy "[Thought: true]" markers in assistant text
 * into structured segments with thinking/final flags.
 *
 * Shared between server (gemini-cli.js) and client (chatFormatting.ts)
 * to ensure consistent parsing behavior.
 *
 * @param {string} text - The assistant message text to parse.
 * @returns {{ content: string, isThinking: boolean }[] | null}
 *   Array of segments if markers are found, null otherwise.
 */
export function splitLegacyGeminiThoughtContent(text) {
  if (!text || typeof text !== 'string' || !/\[Thought:\s*true\]/i.test(text)) {
    return null;
  }

  const segments = text
    .split(/\n?\s*\[Thought:\s*true\]\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  return segments.map((segment, index) => ({
    content: segment,
    isThinking: index < segments.length - 1,
  }));
}
