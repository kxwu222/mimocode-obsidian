import { Notice, Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import {
  getMimoBaseUrl,
  getMimoProviderSettings,
  MIMO_CLUSTER_URLS,
  MIMO_MODELS,
  MIMO_PAYG_BASE_URL,
  type MimoBillingMode,
  type MimoCluster,
  updateMimoProviderSettings,
} from '../settings';

export const mimoSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;

    // ── Setup ────────────────────────────────────────────────────────────────

    new Setting(container).setName('Setup').setHeading();

    new Setting(container)
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setName('Enable MiMo')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('Use Xiaomi MiMo as the AI provider in this vault.')
      .addToggle((toggle) =>
        toggle
          .setValue(getMimoProviderSettings(settingsBag).enabled)
          .onChange(async (value) => {
            updateMimoProviderSettings(settingsBag, { enabled: value });
            await context.plugin.saveSettings();
            context.refreshModelSelectors();
          })
      );

    // ── Billing mode ─────────────────────────────────────────────────────────

    new Setting(container).setName('Billing').setHeading();

    // Cluster row — shown/hidden depending on billing mode.
    let clusterSetting: Setting | null = null;
    let baseUrlSetting: Setting | null = null;

    const refreshVisibility = (): void => {
      const isTokenPlan = getMimoProviderSettings(settingsBag).billingMode === 'token-plan';
      clusterSetting?.settingEl.toggleClass('claudian-hidden', !isTokenPlan);
    };

    new Setting(container)
      .setName('Billing mode')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('Token Plan uses a subscription key (tp-xxxxx). Pay as you go uses a usage-based key (sk-xxxxx).')
      .addDropdown((dropdown) => {
        dropdown
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .addOption('token-plan', 'Token Plan (tp-xxxxx)')
          .addOption('payg', 'Pay as you go (sk-xxxxx)')
          .setValue(getMimoProviderSettings(settingsBag).billingMode)
          .onChange(async (value) => {
            updateMimoProviderSettings(settingsBag, { billingMode: value as MimoBillingMode });
            await context.plugin.saveSettings();
            refreshVisibility();
            // Update the read-only base URL display.
            const mimoSettings = getMimoProviderSettings(settingsBag);
            baseUrlSetting?.controlEl
              .querySelector('input')
              ?.setAttribute('value', getMimoBaseUrl(mimoSettings));
          });
      });

    clusterSetting = new Setting(container)
      .setName('Cluster')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('Select the Token Plan server cluster geographically closest to you.')
      .addDropdown((dropdown) => {
        dropdown
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .addOption('ams', 'Europe — Amsterdam')
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .addOption('sgp', 'Asia Pacific — Singapore')
          .addOption('cn', 'China')
          .setValue(getMimoProviderSettings(settingsBag).cluster)
          .onChange(async (value) => {
            updateMimoProviderSettings(settingsBag, { cluster: value as MimoCluster });
            await context.plugin.saveSettings();
            const mimoSettings = getMimoProviderSettings(settingsBag);
            baseUrlSetting?.controlEl
              .querySelector('input')
              ?.setAttribute('value', getMimoBaseUrl(mimoSettings));
          });
      });

    // Apply initial visibility.
    refreshVisibility();

    // ── Credentials ──────────────────────────────────────────────────────────

    new Setting(container).setName('Credentials').setHeading();

    new Setting(container)
      .setName('API key')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('Token Plan key starts with tp-xxxxx. Pay-as-you-go key starts with sk-xxxxx.')
      .addText((text) => {
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .setPlaceholder('tp-xxxxx  or  sk-xxxxx')
          .setValue(getMimoProviderSettings(settingsBag).apiKey)
          .onChange(async (value) => {
            updateMimoProviderSettings(settingsBag, { apiKey: value.trim() });
            await context.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
        text.inputEl.autocomplete = 'off';
      });

    new Setting(container)
      .setName('Test connection')
      .setDesc('Send a quick request to verify your key is working.')
      .addButton((button) => {
        button
          .setButtonText('Test')
          .onClick(async () => {
            const mimoSettings = getMimoProviderSettings(settingsBag);
            if (!mimoSettings.apiKey) {
              // eslint-disable-next-line obsidianmd/ui/sentence-case
              new Notice('MiMo: API key is empty. Enter your key above first.');
              return;
            }

            button.setButtonText('Testing…').setDisabled(true);
            try {
              const baseUrl = getMimoBaseUrl(mimoSettings);
              const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  'api-key': mimoSettings.apiKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: mimoSettings.model,
                  messages: [{ role: 'user', content: 'Hi' }],
                  max_completion_tokens: 5,
                }),
              });

              if (response.ok) {
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                new Notice('MiMo: Connection successful ✓');
              } else {
                const text = await response.text().catch(() => '');
                new Notice(`MiMo error ${response.status}: ${text.slice(0, 120) || response.statusText}`);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              new Notice(`MiMo: Connection failed — ${message}`);
            } finally {
              button.setButtonText('Test').setDisabled(false);
            }
          });
      });

    // ── Model ────────────────────────────────────────────────────────────────

    new Setting(container).setName('Model').setHeading();

    new Setting(container)
      .setName('Default model')
      .setDesc('Model used when no per-tab selection is active.')
      .addDropdown((dropdown) => {
        for (const m of MIMO_MODELS) {
          dropdown.addOption(m.value, m.label);
        }
        dropdown
          .setValue(getMimoProviderSettings(settingsBag).model)
          .onChange(async (value) => {
            updateMimoProviderSettings(settingsBag, { model: value });
            await context.plugin.saveSettings();
            context.refreshModelSelectors();
          });
      });

    // ── Advanced ─────────────────────────────────────────────────────────────

    new Setting(container).setName('Advanced').setHeading();

    const initialBaseUrl = getMimoBaseUrl(getMimoProviderSettings(settingsBag));
    baseUrlSetting = new Setting(container)
      .setName('Base URL')
      .setDesc(
        `Read-only. Token Plan: cluster-specific endpoint. Pay as you go: ${MIMO_PAYG_BASE_URL}.`,
      )
      .addText((text) => {
        text.setValue(initialBaseUrl).setDisabled(true);
      });

    // Token Plan cluster reference (always visible for discoverability).
    new Setting(container)
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setName('Token Plan cluster URLs')
      .setDesc(
        `Europe: ${MIMO_CLUSTER_URLS.ams} · Singapore: ${MIMO_CLUSTER_URLS.sgp} · China: ${MIMO_CLUSTER_URLS.cn}`,
      );

    context.renderCustomContextLimits(container, 'mimo');
  },
};
