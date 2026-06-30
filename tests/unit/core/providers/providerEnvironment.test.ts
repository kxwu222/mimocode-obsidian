import '@/providers';

import {
  getEnvironmentReviewKeysForScope,
  getEnvironmentScopeUpdates,
  getProviderEnvironmentVariables,
  getRuntimeEnvironmentText,
  getSharedEnvironmentVariables,
  inferEnvironmentSnippetScope,
  resolveEnvironmentSnippetScope,
  setProviderEnvironmentVariables,
  setSharedEnvironmentVariables,
} from '@/core/providers/providerEnvironment';

describe('providerEnvironment', () => {
  describe('classifyEnvironmentVariablesByOwnership', () => {
    it('classifies shared known keys into shared section', async () => {
      const { classifyEnvironmentVariablesByOwnership } = await import(
        '@/core/providers/providerEnvironment'
      );

      const result = classifyEnvironmentVariablesByOwnership([
        'PATH=/usr/local/bin',
        'CUSTOM_FLAG=1',
      ].join('\n'));

      expect(result.shared).toBe(['PATH=/usr/local/bin', 'CUSTOM_FLAG=1'].join('\n'));
      expect(result.reviewKeys).toEqual(['CUSTOM_FLAG']);
    });
  });

  describe('runtime env accessors', () => {
    it('reads split shared/provider env from settings', () => {
      const settings: Record<string, unknown> = {
        sharedEnvironmentVariables: 'PATH=/usr/local/bin',
        providerConfigs: {
          mimo: { environmentVariables: 'CUSTOM_KEY=value' },
        },
      };

      expect(getSharedEnvironmentVariables(settings)).toBe('PATH=/usr/local/bin');
      expect(getProviderEnvironmentVariables(settings, 'mimo')).toBe('CUSTOM_KEY=value');
      expect(getRuntimeEnvironmentText(settings, 'mimo')).toBe([
        'PATH=/usr/local/bin',
        'CUSTOM_KEY=value',
      ].join('\n'));
    });

    it('updates split env settings through scoped setters', () => {
      const settings: Record<string, unknown> = {};

      setSharedEnvironmentVariables(settings, 'PATH=/usr/local/bin');
      setProviderEnvironmentVariables(settings, 'mimo', 'CUSTOM_KEY=test-value');

      expect(settings.sharedEnvironmentVariables).toBe('PATH=/usr/local/bin');
      expect(settings.providerConfigs).toEqual({
        mimo: { environmentVariables: 'CUSTOM_KEY=test-value' },
      });
    });
  });

  describe('getEnvironmentReviewKeysForScope', () => {
    it('flags unknown keys left in shared env for manual review', () => {
      const reviewKeys = getEnvironmentReviewKeysForScope([
        'PATH=/usr/local/bin',
        'CUSTOM_FLAG=1',
      ].join('\n'), 'shared');

      expect(reviewKeys).toEqual(['CUSTOM_FLAG']);
    });
  });

  describe('inferEnvironmentSnippetScope', () => {
    it('returns shared for neutral-only snippets', () => {
      expect(inferEnvironmentSnippetScope('PATH=/usr/local/bin')).toBe('shared');
    });
  });

  describe('resolveEnvironmentSnippetScope', () => {
    it('keeps the fallback scope only for empty snippets', () => {
      expect(resolveEnvironmentSnippetScope('', 'provider:mimo')).toBe('provider:mimo');
    });
  });

  describe('getEnvironmentScopeUpdates', () => {
    it('uses the fallback scope only when there is no inferable content', () => {
      expect(getEnvironmentScopeUpdates('', 'provider:mimo')).toEqual([
        { scope: 'provider:mimo', envText: '' },
      ]);
    });
  });
});
