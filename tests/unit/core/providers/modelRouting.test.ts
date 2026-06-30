import '@/providers';

import { getEnabledProviderForModel, getProviderForModel } from '@/core/providers/modelRouting';

describe('getProviderForModel', () => {
  it('routes mimo model ids to mimo', () => {
    expect(getProviderForModel('mimo-v2.5')).toBe('mimo');
    expect(getProviderForModel('mimo-v2.5-pro')).toBe('mimo');
    expect(getProviderForModel('mimo-v2.5-pro-max')).toBe('mimo');
  });

  it('routes unknown models to mimo (default)', () => {
    expect(getProviderForModel('some-unknown-model')).toBe('mimo');
  });

  it('returns mimo for enabled provider lookup with a mimo model', () => {
    const settings = {
      providerConfigs: {
        mimo: { enabled: true },
      },
    };
    expect(getEnabledProviderForModel('mimo-v2.5', settings)).toBe('mimo');
  });
});
