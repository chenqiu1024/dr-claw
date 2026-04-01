import { describe, expect, it } from 'vitest';

import {
  buildCodexRealtimeTokenBudget,
  buildCodexTokenUsageFromJsonl,
} from '../sessionTokenUsage.js';

describe('buildCodexTokenUsageFromJsonl', () => {
  it('returns unsupported context usage when only lifetime totals are available', () => {
    const jsonl = [
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {
        total_token_usage: { total_tokens: 245001 },
        model_context_window: 200000,
      } } }),
    ].join('\n');

    expect(buildCodexTokenUsageFromJsonl(jsonl)).toEqual({
      used: null,
      total: 200000,
      unsupportedContext: true,
      message: 'Current context usage is unavailable for Codex sessions.',
      lifetimeTokens: 245001,
    });
  });

  it('uses explicit current context usage when Codex provides it', () => {
    const jsonl = [
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {
        current_context_usage: { total_tokens: 81234 },
        total_token_usage: { total_tokens: 301122 },
        model_context_window: 200000,
      } } }),
    ].join('\n');

    expect(buildCodexTokenUsageFromJsonl(jsonl)).toEqual({
      used: 81234,
      total: 200000,
    });
  });

  it('ignores malformed lines and scans backward for the latest token_count event', () => {
    const jsonl = [
      '{"bad": ',
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {
        total_token_usage: { total_tokens: 1000 },
        model_context_window: 128000,
      } } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {
        current_context_usage: { total_tokens: 4096 },
        model_context_window: 128000,
      } } }),
    ].join('\n');

    expect(buildCodexTokenUsageFromJsonl(jsonl)).toEqual({
      used: 4096,
      total: 128000,
    });
  });
});

describe('buildCodexRealtimeTokenBudget', () => {
  it('marks realtime Codex usage as unsupported when only aggregate usage is present', () => {
    expect(buildCodexRealtimeTokenBudget({
      input_tokens: 210000,
      output_tokens: 3200,
    })).toEqual({
      used: null,
      total: 200000,
      unsupportedContext: true,
      message: 'Current context usage is unavailable for Codex sessions.',
    });
  });

  it('uses explicit context token counts when present', () => {
    expect(buildCodexRealtimeTokenBudget({
      current_context_tokens: 64000,
    }, 256000)).toEqual({
      used: 64000,
      total: 256000,
    });
  });
});
