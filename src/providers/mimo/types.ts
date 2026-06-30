// Mimo is a stateless HTTP provider — no session concept, no fork state.
export type MimoProviderState = Record<string, never>;

export function getMimoState(_value: unknown): MimoProviderState {
  return {};
}
