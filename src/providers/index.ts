import { ProviderRegistry } from '../core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '../core/providers/ProviderWorkspaceRegistry';
import { mimoWorkspaceRegistration } from './mimo/app/MimoWorkspaceServices';
import { mimoProviderRegistration } from './mimo/registration';

let builtInProvidersRegistered = false;

export function registerBuiltInProviders(): void {
  if (builtInProvidersRegistered) {
    return;
  }

  ProviderRegistry.register('mimo', mimoProviderRegistration);
  ProviderWorkspaceRegistry.register('mimo', mimoWorkspaceRegistration);
  builtInProvidersRegistered = true;
}

registerBuiltInProviders();
