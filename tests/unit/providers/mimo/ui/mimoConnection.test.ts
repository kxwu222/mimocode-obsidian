import { getMimoApiKeyIssue, getMimoApiKeyWarning, probeMimoConnection } from '@/providers/mimo/ui/mimoConnection';

describe('getMimoApiKeyIssue', () => {
  it('returns empty when the key is blank', () => {
    expect(getMimoApiKeyIssue('', 'token-plan')).toBe('empty');
    expect(getMimoApiKeyIssue('   ', 'payg')).toBe('empty');
  });

  it('requires tp- for Token Plan and sk- for pay as you go', () => {
    expect(getMimoApiKeyIssue('sk-abc', 'token-plan')).toBe('token-plan-prefix');
    expect(getMimoApiKeyIssue('tp-abc', 'payg')).toBe('payg-prefix');
    expect(getMimoApiKeyIssue('TP-abc', 'token-plan')).toBeNull();
    expect(getMimoApiKeyIssue('sk-abc', 'payg')).toBeNull();
  });

  it('does not warn on an empty field', () => {
    expect(getMimoApiKeyWarning('', 'token-plan')).toBeNull();
    expect(getMimoApiKeyWarning('sk-abc', 'token-plan')).toBe('token-plan-prefix');
  });
});

describe('probeMimoConnection', () => {
  const tokenPlan = {
    apiKey: 'tp-test',
    billingMode: 'token-plan' as const,
    cluster: 'ams' as const,
    model: 'mimo-v2.5',
  };

  it('fails fast on an empty or mismatched key without calling the network', async () => {
    const request = jest.fn();
    expect(await probeMimoConnection({ ...tokenPlan, apiKey: '' }, request)).toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(await probeMimoConnection({ ...tokenPlan, apiKey: 'sk-wrong' }, request)).toEqual({
      ok: false,
      reason: 'token-plan-prefix',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('reports auth failure on 401', async () => {
    const request = jest.fn().mockResolvedValue({ status: 401, text: 'invalid api key' });
    expect(await probeMimoConnection(tokenPlan, request)).toEqual({
      ok: false,
      reason: 'auth',
      status: 401,
      detail: 'invalid api key',
    });
  });

  it('reports a missing endpoint on 404', async () => {
    const request = jest.fn().mockResolvedValue({ status: 404, text: 'not found' });
    expect(await probeMimoConnection(tokenPlan, request)).toEqual({
      ok: false,
      reason: 'not-found',
      status: 404,
      detail: 'not found',
    });
  });

  it('reports other HTTP errors', async () => {
    const request = jest.fn().mockResolvedValue({ status: 500, text: 'upstream timeout' });
    expect(await probeMimoConnection(tokenPlan, request)).toEqual({
      ok: false,
      reason: 'http',
      status: 500,
      detail: 'upstream timeout',
    });
  });

  it('succeeds on 2xx', async () => {
    const request = jest.fn().mockResolvedValue({ status: 200, text: '{}' });
    expect(await probeMimoConnection(tokenPlan, request)).toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://token-plan-ams.xiaomimimo.com/v1/chat/completions',
      method: 'POST',
    }));
  });

  it('reports network errors', async () => {
    const request = jest.fn().mockRejectedValue(new Error('offline'));
    expect(await probeMimoConnection(tokenPlan, request)).toEqual({
      ok: false,
      reason: 'network',
      detail: 'offline',
    });
  });
});
