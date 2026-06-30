import { Notice, requestUrl, Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { getLocale } from '../../../i18n/i18n';
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

type MimoStrings = typeof MIMO_STRINGS_EN;

const MIMO_STRINGS_EN = {
  setupHeading: 'Setup',
  enableName: 'Enable MiMo',
  enableDesc: 'Use Xiaomi MiMo as the AI provider in this vault.',
  billingHeading: 'Billing',
  billingModeName: 'Billing mode',
  billingModeDesc: 'Token Plan uses a subscription key (tp-xxxxx). Pay as you go uses a usage-based key (sk-xxxxx).',
  tokenPlanOption: 'Token Plan (tp-xxxxx)',
  paygOption: 'Pay as you go (sk-xxxxx)',
  clusterName: 'Cluster',
  clusterDesc: 'Select the Token Plan server cluster geographically closest to you.',
  clusterAms: 'Europe — Amsterdam',
  clusterSgp: 'Asia Pacific — Singapore',
  clusterCn: 'China',
  credentialsHeading: 'Credentials',
  apiKeyName: 'API key',
  apiKeyDesc: 'Token Plan key starts with tp-xxxxx. Pay-as-you-go key starts with sk-xxxxx.',
  apiKeyPlaceholder: 'tp-xxxxx  or  sk-xxxxx',
  testConnectionName: 'Test connection',
  testConnectionDesc: 'Send a quick request to verify your key is working.',
  testButton: 'Test',
  testingButton: 'Testing…',
  testEmptyKey: 'MiMo: API key is empty. Enter your key above first.',
  testSuccess: 'MiMo: Connection successful ✓',
  modelHeading: 'Model',
  defaultModelName: 'Default model',
  defaultModelDesc: 'Model used when no per-tab selection is active.',
  advancedHeading: 'Advanced',
  baseUrlName: 'Base URL',
  baseUrlDesc: (paygUrl: string) => `Read-only. Token Plan: cluster-specific endpoint. Pay as you go: ${paygUrl}.`,
  clusterUrlsName: 'Token Plan cluster URLs',
};

const MIMO_STRINGS_ZH_CN: MimoStrings = {
  setupHeading: '设置',
  enableName: '启用 MiMo',
  enableDesc: '在此 Vault 中使用小米 MiMo 作为 AI 提供商。',
  billingHeading: '计费',
  billingModeName: '计费模式',
  billingModeDesc: 'Token Plan 使用订阅密钥（tp-xxxxx），按量付费使用按用量计费密钥（sk-xxxxx）。',
  tokenPlanOption: 'Token Plan（tp-xxxxx）',
  paygOption: '按量付费（sk-xxxxx）',
  clusterName: '服务器集群',
  clusterDesc: '选择地理位置距您最近的 Token Plan 服务器集群。',
  clusterAms: '欧洲 — 阿姆斯特丹',
  clusterSgp: '亚太 — 新加坡',
  clusterCn: '中国',
  credentialsHeading: '凭据',
  apiKeyName: 'API 密钥',
  apiKeyDesc: 'Token Plan 密钥以 tp-xxxxx 开头，按量付费密钥以 sk-xxxxx 开头。',
  apiKeyPlaceholder: 'tp-xxxxx 或 sk-xxxxx',
  testConnectionName: '测试连接',
  testConnectionDesc: '发送快速请求以验证您的密钥是否有效。',
  testButton: '测试',
  testingButton: '测试中…',
  testEmptyKey: 'MiMo：API 密钥为空，请先输入密钥。',
  testSuccess: 'MiMo：连接成功 ✓',
  modelHeading: '模型',
  defaultModelName: '默认模型',
  defaultModelDesc: '未单独选择模型时使用此默认模型。',
  advancedHeading: '高级',
  baseUrlName: '基础 URL',
  baseUrlDesc: (paygUrl: string) => `只读。Token Plan 使用集群专属地址，按量付费使用 ${paygUrl}。`,
  clusterUrlsName: 'Token Plan 集群地址',
};

const MIMO_STRINGS_ZH_TW: MimoStrings = {
  setupHeading: '設定',
  enableName: '啟用 MiMo',
  enableDesc: '在此 Vault 中使用小米 MiMo 作為 AI 提供商。',
  billingHeading: '計費',
  billingModeName: '計費模式',
  billingModeDesc: 'Token Plan 使用訂閱金鑰（tp-xxxxx），按量付費使用按用量計費金鑰（sk-xxxxx）。',
  tokenPlanOption: 'Token Plan（tp-xxxxx）',
  paygOption: '按量付費（sk-xxxxx）',
  clusterName: '伺服器叢集',
  clusterDesc: '選擇地理位置距您最近的 Token Plan 伺服器叢集。',
  clusterAms: '歐洲 — 阿姆斯特丹',
  clusterSgp: '亞太 — 新加坡',
  clusterCn: '中國',
  credentialsHeading: '憑證',
  apiKeyName: 'API 金鑰',
  apiKeyDesc: 'Token Plan 金鑰以 tp-xxxxx 開頭，按量付費金鑰以 sk-xxxxx 開頭。',
  apiKeyPlaceholder: 'tp-xxxxx 或 sk-xxxxx',
  testConnectionName: '測試連線',
  testConnectionDesc: '發送快速請求以驗證您的金鑰是否有效。',
  testButton: '測試',
  testingButton: '測試中…',
  testEmptyKey: 'MiMo：API 金鑰為空，請先輸入金鑰。',
  testSuccess: 'MiMo：連線成功 ✓',
  modelHeading: '模型',
  defaultModelName: '預設模型',
  defaultModelDesc: '未單獨選擇模型時使用此預設模型。',
  advancedHeading: '進階',
  baseUrlName: '基礎 URL',
  baseUrlDesc: (paygUrl: string) => `唯讀。Token Plan 使用叢集專屬位址，按量付費使用 ${paygUrl}。`,
  clusterUrlsName: 'Token Plan 叢集位址',
};

function getMimoStrings(): MimoStrings {
  const locale = getLocale();
  if (locale === 'zh-CN') return MIMO_STRINGS_ZH_CN;
  if (locale === 'zh-TW') return MIMO_STRINGS_ZH_TW;
  return MIMO_STRINGS_EN;
}

export const mimoSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const s = getMimoStrings();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;

    // ── Setup ────────────────────────────────────────────────────────────────

    new Setting(container).setName(s.setupHeading).setHeading();

    new Setting(container)
      .setName(s.enableName)
      .setDesc(s.enableDesc)
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

    new Setting(container).setName(s.billingHeading).setHeading();

    // Cluster row — shown/hidden depending on billing mode.
    let clusterSetting: Setting | null = null;
    let baseUrlSetting: Setting | null = null;

    const refreshVisibility = (): void => {
      const isTokenPlan = getMimoProviderSettings(settingsBag).billingMode === 'token-plan';
      clusterSetting?.settingEl.toggleClass('claudian-hidden', !isTokenPlan);
    };

    new Setting(container)
      .setName(s.billingModeName)
      .setDesc(s.billingModeDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption('token-plan', s.tokenPlanOption)
          .addOption('payg', s.paygOption)
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
      .setName(s.clusterName)
      .setDesc(s.clusterDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption('ams', s.clusterAms)
          .addOption('sgp', s.clusterSgp)
          .addOption('cn', s.clusterCn)
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

    new Setting(container).setName(s.credentialsHeading).setHeading();

    new Setting(container)
      .setName(s.apiKeyName)
      .setDesc(s.apiKeyDesc)
      .addText((text) => {
        text
          .setPlaceholder(s.apiKeyPlaceholder)
          .setValue(getMimoProviderSettings(settingsBag).apiKey)
          .onChange(async (value) => {
            updateMimoProviderSettings(settingsBag, { apiKey: value.trim() });
            await context.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
        text.inputEl.autocomplete = 'off';
      });

    new Setting(container)
      .setName(s.testConnectionName)
      .setDesc(s.testConnectionDesc)
      .addButton((button) => {
        button
          .setButtonText(s.testButton)
          .onClick(async () => {
            const mimoSettings = getMimoProviderSettings(settingsBag);
            if (!mimoSettings.apiKey) {
              new Notice(s.testEmptyKey);
              return;
            }

            button.setButtonText(s.testingButton).setDisabled(true);
            try {
              const baseUrl = getMimoBaseUrl(mimoSettings);
              const response = await requestUrl({
                url: `${baseUrl}/chat/completions`,
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
                throw: false,
              });

              if (response.status >= 200 && response.status < 300) {
                new Notice(s.testSuccess);
              } else {
                new Notice(`MiMo error ${response.status}: ${response.text.slice(0, 120)}`);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              new Notice(`MiMo: Connection failed — ${message}`);
            } finally {
              button.setButtonText(s.testButton).setDisabled(false);
            }
          });
      });

    // ── Model ────────────────────────────────────────────────────────────────

    new Setting(container).setName(s.modelHeading).setHeading();

    new Setting(container)
      .setName(s.defaultModelName)
      .setDesc(s.defaultModelDesc)
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

    new Setting(container).setName(s.advancedHeading).setHeading();

    const initialBaseUrl = getMimoBaseUrl(getMimoProviderSettings(settingsBag));
    baseUrlSetting = new Setting(container)
      .setName(s.baseUrlName)
      .setDesc(s.baseUrlDesc(MIMO_PAYG_BASE_URL))
      .addText((text) => {
        text.setValue(initialBaseUrl).setDisabled(true);
      });

    new Setting(container)
      .setName(s.clusterUrlsName)
      .setDesc(
        `Europe: ${MIMO_CLUSTER_URLS.ams} · Singapore: ${MIMO_CLUSTER_URLS.sgp} · China: ${MIMO_CLUSTER_URLS.cn}`,
      );

    const customContextEl = container.createDiv();
    context.renderCustomContextLimits(customContextEl, 'mimo');
  },
};
