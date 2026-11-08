export const platformAdapter = {
  getAppImportLink(token: string) {
    void token;
    return null;
  },

  isNetworkError(error: unknown) {
    if (!navigator.onLine) return true;
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { name?: unknown; message?: unknown; code?: unknown };
    const message = typeof candidate.message === 'string' ? candidate.message : '';
    const code = typeof candidate.code === 'string' ? candidate.code : '';
    return (candidate.name === 'TypeError' && /fetch|network|load failed/i.test(message))
      || /failed to fetch|fetch failed|network request failed|network error|internet disconnected|connection (?:was )?(?:lost|closed|reset)|timed out|econnreset|enotfound/i.test(message)
      || ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ERR_INTERNET_DISCONNECTED'].includes(code);
  },
};
