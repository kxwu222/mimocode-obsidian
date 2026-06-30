import '@/providers';

import { getProviderForModel } from '@/core/providers/modelRouting';

describe('Tab Lifecycle - Model-Driven Provider Routing', () => {
  describe('getProviderForModel', () => {
    it('derives mimo from MiMo model names', () => {
      expect(getProviderForModel('mimo-v2.5')).toBe('mimo');
      expect(getProviderForModel('mimo-v2.5-pro')).toBe('mimo');
      expect(getProviderForModel('mimo-v2.5-pro-max')).toBe('mimo');
    });

    it('defaults unknown models to mimo', () => {
      expect(getProviderForModel('custom-model')).toBe('mimo');
      expect(getProviderForModel('')).toBe('mimo');
    });
  });
});
