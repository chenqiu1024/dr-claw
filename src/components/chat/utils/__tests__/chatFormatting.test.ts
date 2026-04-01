import { describe, it, expect } from 'vitest';
import { splitLegacyGeminiThoughtContent, buildAssistantMessages } from '../chatFormatting';

describe('splitLegacyGeminiThoughtContent', () => {
  it('returns null for plain text without markers', () => {
    expect(splitLegacyGeminiThoughtContent('Hello world')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(splitLegacyGeminiThoughtContent('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(splitLegacyGeminiThoughtContent(null as unknown as string)).toBeNull();
    expect(splitLegacyGeminiThoughtContent(undefined as unknown as string)).toBeNull();
    expect(splitLegacyGeminiThoughtContent(42 as unknown as string)).toBeNull();
  });

  it('returns null when marker exists but produces fewer than 2 segments', () => {
    expect(splitLegacyGeminiThoughtContent('[Thought: true]')).toBeNull();
    expect(splitLegacyGeminiThoughtContent('[Thought: true]   ')).toBeNull();
  });

  it('splits single marker into thinking + final message', () => {
    const result = splitLegacyGeminiThoughtContent('thinking content\n[Thought: true]\nfinal answer');
    expect(result).toEqual([
      { content: 'thinking content', isThinking: true },
      { content: 'final answer', isThinking: false },
    ]);
  });

  it('splits multiple markers into multiple thinking + final message', () => {
    const result = splitLegacyGeminiThoughtContent(
      'thought 1\n[Thought: true]\nthought 2\n[Thought: true]\nfinal answer'
    );
    expect(result).toEqual([
      { content: 'thought 1', isThinking: true },
      { content: 'thought 2', isThinking: true },
      { content: 'final answer', isThinking: false },
    ]);
  });

  it('is case insensitive', () => {
    const result = splitLegacyGeminiThoughtContent('thinking\n[thought: TRUE]\nfinal');
    expect(result).toEqual([
      { content: 'thinking', isThinking: true },
      { content: 'final', isThinking: false },
    ]);
  });

  it('handles extra whitespace around markers', () => {
    const result = splitLegacyGeminiThoughtContent('thinking\n  [Thought:  true]  \nfinal');
    expect(result).toEqual([
      { content: 'thinking', isThinking: true },
      { content: 'final', isThinking: false },
    ]);
  });

  it('handles marker at the beginning of text', () => {
    const result = splitLegacyGeminiThoughtContent('[Thought: true]\nfirst\n[Thought: true]\nsecond');
    expect(result).toEqual([
      { content: 'first', isThinking: true },
      { content: 'second', isThinking: false },
    ]);
  });
});

describe('buildAssistantMessages', () => {
  const timestamp = new Date('2025-01-01T00:00:00Z');

  it('returns single message for plain text', () => {
    const result = buildAssistantMessages('Hello world', timestamp);
    expect(result).toEqual([
      { type: 'assistant', content: 'Hello world', timestamp },
    ]);
  });

  it('splits legacy thought content into multiple messages', () => {
    const result = buildAssistantMessages('thinking\n[Thought: true]\nfinal', timestamp);
    expect(result).toEqual([
      { type: 'assistant', content: 'thinking', timestamp, isThinking: true },
      { type: 'assistant', content: 'final', timestamp },
    ]);
  });

  it('does not add isThinking to non-thinking messages', () => {
    const result = buildAssistantMessages('plain text', timestamp);
    expect(result[0]).not.toHaveProperty('isThinking');
  });

  it('preserves timestamp across all segments', () => {
    const result = buildAssistantMessages('t1\n[Thought: true]\nt2\n[Thought: true]\nfinal', timestamp);
    expect(result).toHaveLength(3);
    result.forEach((msg) => expect(msg.timestamp).toBe(timestamp));
  });
});
