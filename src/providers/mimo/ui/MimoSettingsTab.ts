import { Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { getLocale } from '../../../i18n/i18n';
import {
  getMimoBaseUrl,
  getMimoProviderSettings,
  MIMO_MODELS,
  MIMO_PAYG_BASE_URL,
  type MimoBillingMode,
  type MimoCluster,
  updateMimoProviderSettings,
} from '../settings';
import {
  getMimoApiKeyWarning,
  type MimoProbeResult,
  probeMimoConnection,
} from './mimoConnection';

type MimoStrings = typeof MIMO_STRINGS_EN;

const MIMO_STRINGS_EN = {
  setupHeading: 'Setup',
  enableName: 'Enable MiMo',
  enableDesc: 'Turn off to disable MiMo in this vault. Leave on to chat with a MiMo API key.',
  billingHeading: 'Billing',
  billingModeName: 'Billing mode',
  billingModeDesc: `Token Plan uses a subscription key (tp-xxxxx) and a regional cluster. Pay as you go uses a usage-based key (sk-xxxxx) at ${MIMO_PAYG_BASE_URL}.`,
  tokenPlanOption: 'Token Plan (tp-xxxxx)',
  paygOption: 'Pay as you go (sk-xxxxx)',
  clusterName: 'Cluster',
  clusterDesc: 'Select the Token Plan cluster closest to you.',
  clusterEndpoint: (url: string) => `Requests go to ${url}.`,
  clusterAms: 'Europe — Amsterdam',
  clusterSgp: 'Asia Pacific — Singapore',
  clusterCn: 'China',
  credentialsHeading: 'Credentials',
  apiKeyName: 'API key',
  apiKeyDesc: 'Token Plan keys start with tp-. Pay-as-you-go keys start with sk-.',
  apiKeyPlaceholder: 'tp-xxxxx  or  sk-xxxxx',
  showKey: 'Show key',
  hideKey: 'Hide key',
  keyPrefixTokenPlan: 'Token Plan keys start with tp-. This looks like a pay-as-you-go key.',
  keyPrefixPayg: 'Pay-as-you-go keys start with sk-. This looks like a Token Plan key.',
  testConnectionName: 'Test connection',
  testConnectionDesc: 'Send a quick request to verify billing, cluster, and key.',
  testButton: 'Test',
  testingButton: 'Testing…',
  testEmptyKey: 'Enter an API key first.',
  testSuccess: 'Connection successful.',
  testAuthFailed: 'Auth failed. Check the key and billing mode.',
  testNotFound: 'Endpoint not found. Check the Token Plan cluster.',
  testHttpError: 'Request failed.',
  testNetworkFailed: 'Connection failed.',
  modelHeading: 'Model',
  defaultModelName: 'Default model',
  defaultModelDesc: 'Model used when no per-tab selection is active.',
};

const MIMO_STRINGS_ZH_CN: MimoStrings = {
  setupHeading: '设置',
  enableName: '启用 MiMo',
  enableDesc: '关闭后将在此 Vault 中停用 MiMo。保持开启即可使用 API 密钥聊天。',
  billingHeading: '计费',
  billingModeName: '计费模式',
  billingModeDesc: `Token Plan 使用订阅密钥（tp-xxxxx）和区域集群。按量付费使用按用量计费密钥（sk-xxxxx），地址为 ${MIMO_PAYG_BASE_URL}。`,
  tokenPlanOption: 'Token Plan（tp-xxxxx）',
  paygOption: '按量付费（sk-xxxxx）',
  clusterName: '服务器集群',
  clusterDesc: '选择距您最近的 Token Plan 集群。',
  clusterEndpoint: (url: string) => `请求将发送至 ${url}。`,
  clusterAms: '欧洲 — 阿姆斯特丹',
  clusterSgp: '亚太 — 新加坡',
  clusterCn: '中国',
  credentialsHeading: '凭据',
  apiKeyName: 'API 密钥',
  apiKeyDesc: 'Token Plan 密钥以 tp- 开头，按量付费密钥以 sk- 开头。',
  apiKeyPlaceholder: 'tp-xxxxx 或 sk-xxxxx',
  showKey: '显示密钥',
  hideKey: '隐藏密钥',
  keyPrefixTokenPlan: 'Token Plan 密钥以 tp- 开头。当前密钥看起来像按量付费密钥。',
  keyPrefixPayg: '按量付费密钥以 sk- 开头。当前密钥看起来像 Token Plan 密钥。',
  testConnectionName: '测试连接',
  testConnectionDesc: '发送快速请求以验证计费模式、集群和密钥。',
  testButton: '测试',
  testingButton: '测试中…',
  testEmptyKey: '请先输入 API 密钥。',
  testSuccess: '连接成功。',
  testAuthFailed: '鉴权失败。请检查密钥和计费模式。',
  testNotFound: '找不到接口。请检查 Token Plan 集群。',
  testHttpError: '请求失败。',
  testNetworkFailed: '连接失败。',
  modelHeading: '模型',
  defaultModelName: '默认模型',
  defaultModelDesc: '未单独选择模型时使用此默认模型。',
};

const MIMO_STRINGS_ZH_TW: MimoStrings = {
  setupHeading: '設定',
  enableName: '啟用 MiMo',
  enableDesc: '關閉後將在此 Vault 中停用 MiMo。保持開啟即可使用 API 金鑰聊天。',
  billingHeading: '計費',
  billingModeName: '計費模式',
  billingModeDesc: `Token Plan 使用訂閱金鑰（tp-xxxxx）和區域叢集。按量付費使用按用量計費金鑰（sk-xxxxx），位址為 ${MIMO_PAYG_BASE_URL}。`,
  tokenPlanOption: 'Token Plan（tp-xxxxx）',
  paygOption: '按量付費（sk-xxxxx）',
  clusterName: '伺服器叢集',
  clusterDesc: '選擇距您最近的 Token Plan 叢集。',
  clusterEndpoint: (url: string) => `請求將傳送至 ${url}。`,
  clusterAms: '歐洲 — 阿姆斯特丹',
  clusterSgp: '亞太 — 新加坡',
  clusterCn: '中國',
  credentialsHeading: '憑證',
  apiKeyName: 'API 金鑰',
  apiKeyDesc: 'Token Plan 金鑰以 tp- 開頭，按量付費金鑰以 sk- 開頭。',
  apiKeyPlaceholder: 'tp-xxxxx 或 sk-xxxxx',
  showKey: '顯示金鑰',
  hideKey: '隱藏金鑰',
  keyPrefixTokenPlan: 'Token Plan 金鑰以 tp- 開頭。目前金鑰看起來像按量付費金鑰。',
  keyPrefixPayg: '按量付費金鑰以 sk- 開頭。目前金鑰看起來像 Token Plan 金鑰。',
  testConnectionName: '測試連線',
  testConnectionDesc: '發送快速請求以驗證計費模式、叢集和金鑰。',
  testButton: '測試',
  testingButton: '測試中…',
  testEmptyKey: '請先輸入 API 金鑰。',
  testSuccess: '連線成功。',
  testAuthFailed: '驗證失敗。請檢查金鑰和計費模式。',
  testNotFound: '找不到介面。請檢查 Token Plan 叢集。',
  testHttpError: '請求失敗。',
  testNetworkFailed: '連線失敗。',
  modelHeading: '模型',
  defaultModelName: '預設模型',
  defaultModelDesc: '未單獨選擇模型時使用此預設模型。',
};

function getMimoStrings(): MimoStrings {
  const locale = getLocale();
  if (locale === 'zh-CN') return MIMO_STRINGS_ZH_CN;
  if (locale === 'zh-TW') return MIMO_STRINGS_ZH_TW;
  return MIMO_STRINGS_EN;
}

function formatProbeMessage(s: MimoStrings, result: MimoProbeResult): string {
  if (result.ok) {
    return s.testSuccess;
  }
  switch (result.reason) {
    case 'empty':
      return s.testEmptyKey;
    case 'token-plan-prefix':
      return s.keyPrefixTokenPlan;
    case 'payg-prefix':
      return s.keyPrefixPayg;
    case 'auth':
      return result.detail ? `${s.testAuthFailed} ${result.detail}` : s.testAuthFailed;
    case 'not-found':
      return s.testNotFound;
    case 'http':
      return result.status
        ? `${s.testHttpError} (${result.status}${result.detail ? `: ${result.detail}` : ''})`
        : s.testHttpError;
    case 'network':
      return result.detail ? `${s.testNetworkFailed} ${result.detail}` : s.testNetworkFailed;
  }
}

export const mimoSettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const s = getMimoStrings();
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;

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

    new Setting(container).setName(s.billingHeading).setHeading();

    let clusterSetting: Setting | null = null;
    let refreshKeyWarning = (): void => undefined;

    const describeCluster = (): string => {
      const mimoSettings = getMimoProviderSettings(settingsBag);
      return `${s.clusterDesc} ${s.clusterEndpoint(getMimoBaseUrl(mimoSettings))}`;
    };

    const refreshVisibility = (): void => {
      const isTokenPlan = getMimoProviderSettings(settingsBag).billingMode === 'token-plan';
      clusterSetting?.settingEl.toggleClass('claudian-hidden', !isTokenPlan);
      clusterSetting?.setDesc(describeCluster());
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
            refreshKeyWarning();
          });
      });

    clusterSetting = new Setting(container)
      .setName(s.clusterName)
      .setDesc(describeCluster())
      .addDropdown((dropdown) => {
        dropdown
          .addOption('ams', s.clusterAms)
          .addOption('sgp', s.clusterSgp)
          .addOption('cn', s.clusterCn)
          .setValue(getMimoProviderSettings(settingsBag).cluster)
          .onChange(async (value) => {
            updateMimoProviderSettings(settingsBag, { cluster: value as MimoCluster });
            await context.plugin.saveSettings();
            clusterSetting?.setDesc(describeCluster());
          });
      });

    refreshVisibility();

    new Setting(container).setName(s.credentialsHeading).setHeading();

    let keyVisible = false;
    let apiKeyInput: HTMLInputElement | null = null;

    new Setting(container)
      .setName(s.apiKeyName)
      .setDesc(s.apiKeyDesc)
      .addText((text) => {
        apiKeyInput = text.inputEl;
        text.inputEl.type = 'password';
        text.inputEl.setAttribute('autocomplete', 'off');
        text
          .setPlaceholder(s.apiKeyPlaceholder)
          .setValue(getMimoProviderSettings(settingsBag).apiKey)
          .onChange(async (value) => {
            updateMimoProviderSettings(settingsBag, { apiKey: value.trim() });
            await context.plugin.saveSettings();
            refreshKeyWarning();
          });
      })
      .addExtraButton((button) => {
        button
          .setIcon('eye')
          .setTooltip(s.showKey)
          .onClick(() => {
            keyVisible = !keyVisible;
            if (apiKeyInput) {
              apiKeyInput.type = keyVisible ? 'text' : 'password';
            }
            button.setIcon(keyVisible ? 'eye-off' : 'eye');
            button.setTooltip(keyVisible ? s.hideKey : s.showKey);
          });
      });

    const keyWarningEl = container.createDiv({
      cls: 'claudian-setting-validation claudian-setting-validation-warning claudian-mimo-key-warning claudian-hidden',
    });

    refreshKeyWarning = (): void => {
      const mimoSettings = getMimoProviderSettings(settingsBag);
      const warning = getMimoApiKeyWarning(mimoSettings.apiKey, mimoSettings.billingMode);
      if (!warning) {
        keyWarningEl.addClass('claudian-hidden');
        keyWarningEl.setText('');
        return;
      }
      keyWarningEl.removeClass('claudian-hidden');
      keyWarningEl.setText(warning === 'token-plan-prefix' ? s.keyPrefixTokenPlan : s.keyPrefixPayg);
    };
    refreshKeyWarning();

    let showTestStatus = (_result: MimoProbeResult): void => undefined;

    new Setting(container)
      .setName(s.testConnectionName)
      .setDesc(s.testConnectionDesc)
      .addButton((button) => {
        button
          .setButtonText(s.testButton)
          .onClick(async () => {
            button.setButtonText(s.testingButton).setDisabled(true);
            try {
              const result = await probeMimoConnection(getMimoProviderSettings(settingsBag));
              showTestStatus(result);
            } finally {
              button.setButtonText(s.testButton).setDisabled(false);
            }
          });
      });

    const testStatusEl = container.createDiv({
      cls: 'claudian-setting-validation claudian-mimo-test-status claudian-hidden',
    });

    showTestStatus = (result: MimoProbeResult): void => {
      testStatusEl.removeClass('claudian-hidden');
      testStatusEl.toggleClass('claudian-setting-validation-error', !result.ok);
      testStatusEl.toggleClass('claudian-setting-validation-success', result.ok);
      testStatusEl.setText(formatProbeMessage(s, result));
    };

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
  },
};
