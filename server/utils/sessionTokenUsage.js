function getFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function findNestedTokenTotal(source, paths) {
  for (const path of paths) {
    let cursor = source;
    let missing = false;
    for (const key of path) {
      if (!cursor || typeof cursor !== 'object' || !(key in cursor)) {
        missing = true;
        break;
      }
      cursor = cursor[key];
    }
    if (!missing) {
      const candidate = getFiniteNumber(cursor);
      if (candidate != null) return candidate;
    }
  }
  return null;
}

export function buildCodexUnsupportedContextTokenUsage({
  total = 200000,
  lifetimeTokens = null,
} = {}) {
  return {
    used: null,
    total,
    unsupportedContext: true,
    message: 'Current context usage is unavailable for Codex sessions.',
    ...(lifetimeTokens != null ? { lifetimeTokens } : {}),
  };
}

export function buildCodexTokenUsageFromJsonl(fileContent) {
  const lines = String(fileContent || '').trim().split('\n').filter(Boolean);

  let contextWindow = 200000;
  let lifetimeTokens = null;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.type !== 'event_msg' || entry.payload?.type !== 'token_count' || !entry.payload?.info) {
        continue;
      }

      const tokenInfo = entry.payload.info;
      const contextFromPayload = findNestedTokenTotal(tokenInfo, [
        ['current_context_usage', 'total_tokens'],
        ['current_context_token_usage', 'total_tokens'],
        ['context_usage', 'total_tokens'],
        ['active_context_usage', 'total_tokens'],
        ['context_window_usage', 'total_tokens'],
      ]);

      const totalFromPayload = getFiniteNumber(tokenInfo.model_context_window);
      if (totalFromPayload != null) {
        contextWindow = totalFromPayload;
      }

      lifetimeTokens = findNestedTokenTotal(tokenInfo, [
        ['total_token_usage', 'total_tokens'],
        ['lifetime_token_usage', 'total_tokens'],
      ]);

      if (contextFromPayload != null) {
        return {
          used: contextFromPayload,
          total: contextWindow,
        };
      }

      break;
    } catch {
      // Ignore malformed lines and keep scanning backwards.
    }
  }

  return buildCodexUnsupportedContextTokenUsage({
    total: contextWindow,
    lifetimeTokens,
  });
}

export function buildCodexRealtimeTokenBudget(eventUsage, contextWindow = 200000) {
  const contextTokens = findNestedTokenTotal(eventUsage, [
    ['current_context_usage', 'total_tokens'],
    ['context_usage', 'total_tokens'],
    ['context_window_usage', 'total_tokens'],
    ['current_context_tokens'],
    ['context_tokens'],
  ]);

  if (contextTokens != null) {
    return {
      used: contextTokens,
      total: contextWindow,
    };
  }

  return buildCodexUnsupportedContextTokenUsage({ total: contextWindow });
}
