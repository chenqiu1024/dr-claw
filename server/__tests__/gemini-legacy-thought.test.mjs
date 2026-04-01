import { describe, it, expect } from 'vitest';
import { splitLegacyGeminiThoughtContent } from '../../shared/geminiThoughtParser.js';
import { normalizePersistedGeminiAssistantEntries } from '../gemini-cli.js';

describe('splitLegacyGeminiThoughtContent (server)', () => {
  it('returns null for plain text without markers', () => {
    expect(splitLegacyGeminiThoughtContent('Hello world')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(splitLegacyGeminiThoughtContent(null)).toBeNull();
    expect(splitLegacyGeminiThoughtContent(undefined)).toBeNull();
    expect(splitLegacyGeminiThoughtContent(42)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(splitLegacyGeminiThoughtContent('')).toBeNull();
  });

  it('returns null when marker produces fewer than 2 segments', () => {
    expect(splitLegacyGeminiThoughtContent('[Thought: true]')).toBeNull();
  });

  it('splits single marker into thinking + final', () => {
    const result = splitLegacyGeminiThoughtContent('thinking\n[Thought: true]\nfinal');
    expect(result).toEqual([
      { content: 'thinking', isThinking: true },
      { content: 'final', isThinking: false },
    ]);
  });

  it('splits multiple markers correctly', () => {
    const result = splitLegacyGeminiThoughtContent(
      't1\n[Thought: true]\nt2\n[Thought: true]\nfinal'
    );
    expect(result).toEqual([
      { content: 't1', isThinking: true },
      { content: 't2', isThinking: true },
      { content: 'final', isThinking: false },
    ]);
  });

  it('is case insensitive', () => {
    const result = splitLegacyGeminiThoughtContent('thinking\n[thought: TRUE]\nfinal');
    expect(result).toEqual([
      { content: 'thinking', isThinking: true },
      { content: 'final', isThinking: false },
    ]);
  });
});

describe('normalizePersistedGeminiAssistantEntries', () => {
  it('returns single assistant entry for plain text', () => {
    const result = normalizePersistedGeminiAssistantEntries('Hello world');
    expect(result).toEqual([
      { role: 'assistant', content: 'Hello world', type: 'message' },
    ]);
  });

  it('splits legacy thought text into thinking + message entries', () => {
    const result = normalizePersistedGeminiAssistantEntries(
      'thinking content\n[Thought: true]\nfinal answer'
    );
    expect(result).toEqual([
      { role: 'assistant', type: 'thinking', content: 'thinking content' },
      { role: 'assistant', content: 'final answer', type: 'message' },
    ]);
  });

  it('handles multiple thinking segments', () => {
    const result = normalizePersistedGeminiAssistantEntries(
      't1\n[Thought: true]\nt2\n[Thought: true]\nfinal'
    );
    expect(result).toEqual([
      { role: 'assistant', type: 'thinking', content: 't1' },
      { role: 'assistant', type: 'thinking', content: 't2' },
      { role: 'assistant', content: 'final', type: 'message' },
    ]);
  });

  it('preserves non-string content as-is', () => {
    const content = { parts: [{ text: 'hello' }] };
    const result = normalizePersistedGeminiAssistantEntries(content);
    expect(result).toEqual([
      { role: 'assistant', content, type: 'message' },
    ]);
  });
});
