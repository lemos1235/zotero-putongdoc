import { config } from '../../package.json';
import { getString } from '../utils/locale';
import { getPref, setPref } from '../utils/prefs';
import { showDialog } from '../utils/dialog';
import { getLanguageOptions } from './language';
import { translateModes, extractBackends } from '../config';
import { getApiToken, saveApiToken } from '../api/credentials';
export function registerPrefs() {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + 'content/preferences.xhtml',
    label: getString('prefs-title'),
    image: `chrome://${addon.data.config.addonRef}/content/icons/icon.svg`,
  });
}

export async function registerPrefsScripts(_window: Window) {
  addon.data.prefs = { window: _window };
  buildPrefsPane();
  bindPrefEvents();
  try {
    await getApiToken();
    setTokenConfigured(true);
  } catch {
    setTokenConfigured(false);
  }
}

function replaceMenu(
  id: string,
  pref: 'targetLanguage' | 'translateMode' | 'extractBackend',
  items: { value: string; label: string }[],
) {
  const doc = addon.data.prefs!.window.document;
  const target = doc.getElementById(id) || doc.getElementById(`${id}-placeholder`);
  if (!target) return;
  const selected = items.find((item) => item.value === getPref(pref)) || items[0];
  ztoolkit.UI.replaceElement(
    {
      tag: 'menulist',
      id,
      attributes: {
        value: selected?.value || '',
        label: selected?.label || '',
        native: 'true',
      },
      styles: { width: '250px', minWidth: '220px', maxWidth: '300px' },
      children: [
        {
          tag: 'menupopup',
          children: items.map((item) => ({
            tag: 'menuitem',
            attributes: { label: item.label, value: item.value },
          })),
        },
      ],
      listeners: [
        {
          type: 'command',
          listener: (event: Event) => setPref(pref, (event.target as XUL.MenuList).value),
        },
      ],
    },
    target,
  );
}

function buildLanguageMenu() {
  replaceMenu(
    `${config.addonRef}-target-language`,
    'targetLanguage',
    getLanguageOptions(Zotero.locale),
  );
}

function buildPrefsPane() {
  buildLanguageMenu();
  for (const [id, pref, items] of [
    ['translate-mode', 'translateMode', translateModes],
    ['extract-backend', 'extractBackend', extractBackends],
  ] as const) {
    replaceMenu(
      `${config.addonRef}-${id}`,
      pref,
      items.map((item) => ({ ...item, label: getString(item.label) })),
    );
  }
}

function setTokenFeedback(message: string) {
  const element = addon.data.prefs?.window.document.getElementById('putongdoc-token-feedback');
  if (element) element.textContent = message;
}

function setTokenConfigured(configured: boolean) {
  const input = addon.data.prefs?.window.document.querySelector<HTMLInputElement>(
    `#zotero-prefpane-${config.addonRef}-authkey`,
  );
  if (input)
    input.placeholder = getString(
      configured ? 'api-token-placeholder-saved' : 'api-token-placeholder-empty',
    );
  setTokenFeedback(configured ? getString('api-token-saved') : '');
}

function bindPrefEvents() {
  const doc = addon.data.prefs!.window.document;
  const input = doc.querySelector<HTMLInputElement>(`#zotero-prefpane-${config.addonRef}-authkey`)!;
  // The input is intentionally unbound to prefs and never prefilled with a secret.
  let saving = Promise.resolve();
  const saveInput = () => {
    if (input.value) {
      const value = input.value;
      input.value = '';
      saving = saving
        .catch(() => {})
        .then(async () => {
          await saveApiToken(value);
          setTokenConfigured(true);
        });
    }
    return saving;
  };
  input.addEventListener('change', () => {
    saveInput().catch(() => setTokenFeedback(getString('api-token-required')));
  });
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-test-button`)
    ?.addEventListener('command', async () => {
      try {
        await saveInput();
        const quota = await addon.api.getQuota();
        setTokenConfigured(true);
        showDialog({
          title: getString('pref-test-success'),
          message: getString('api-quota', {
            args: {
              files: Math.max(0, quota.dailyFileQuota - quota.dailyUsedFiles),
              pages: Math.max(0, quota.dailyPageQuota - quota.dailyUsedPages),
            },
          }),
        });
      } catch (error) {
        showDialog({ title: getString('pref-test-failed'), message: (error as Error).message });
      }
    });
  doc.getElementById('putongdoc-token-remove')?.addEventListener('command', async () => {
    try {
      await saving.catch(() => {});
      await saveApiToken('');
      input.value = '';
      setTokenConfigured(false);
    } catch {
      setTokenFeedback(getString('pref-test-failed'));
    }
  });
}
