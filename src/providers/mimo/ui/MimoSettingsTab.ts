import { Notice, Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import {
  getMimoBaseUrl,
  getMimoProviderSettings,
  MIMO_CLUSTER_URLS,
  MIMO_MODELS,
  type MimoCluster,
  updateMimoProviderSettings,
} from '../settings';

export const mimoSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;

    new Setting(container).setName('Setup').setHeading();

    new Setting(container)
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setName('Enable MiMo')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('Use Xiaomi MiMo Token Plan API as the AI provider.')
      .addToggle((toggle) =>
        toggle
          .setValue(getMimoProviderSettings(settingsBag).enabled)
          .onChange(async (value) => {
            updateMimoProviderSettings(settingsBag, { enabled: value });
            await context.plugin.saveSettings();
            context.refreshModelSelectors();
          })
      );

    new Setting(container)
      .setName('API key')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('Your MiMo Token Plan API key (tp-xxxxx). Obtain it from the Token Plan console.')
      .addText((text) => {
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .setPlaceholder('tp-xxxxx')
          .setValue(getMimoProviderSettings(settingsBag).apiKey)
          .onChange(async (value) => {
            updateMimoProviderSettings(settingsBag, { apiKey: value.trim() });
            await context.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
        text.inputEl.autocomplete = 'off';
      });

    new Setting(container).setName('Connection').setHeading();

    new Setting(container)
      .setName('Cluster')
      .setDesc('Select the server cluster geographically closest to you.')
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
          });
      });

    new Setting(container)
      .setName('Test connection')
      .setDesc('Send a quick request to verify your API key and cluster are working.')
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
                new Notice(`MiMo: Error ${response.status} — ${text.slice(0, 120) || response.statusText}`);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              new Notice(`MiMo: Connection failed — ${message}`);
            } finally {
              button.setButtonText('Test').setDisabled(false);
            }
          });
      });

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

    new Setting(container)
      .setName('Base URL')
      .setDesc('Read-only — derived from the cluster selection above.')
      .addText((text) => {
        const mimoSettings = getMimoProviderSettings(settingsBag);
        text.setValue(MIMO_CLUSTER_URLS[mimoSettings.cluster]).setDisabled(true);
      });

    context.renderCustomContextLimits(container, 'mimo');
  },
};
