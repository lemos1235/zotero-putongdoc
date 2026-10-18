import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL } from 'node:url';
import { loader, networkFixture } from './helpers.mjs';

function preferenceFixture(initialToken = '') {
  let token = initialToken;
  let requests = 0;
  const saved = [];
  const dialogs = [];
  const preferences = {
    targetLanguage: '',
    translateMode: 'dual',
    extractBackend: 'mineru',
  };
  const elements = new Map();
  function element(id) {
    const item = {
      id,
      value: '',
      placeholder: '',
      listeners: {},
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
      async emit(type) {
        await this.listeners[type]?.({ target: this });
      },
    };
    elements.set(id, item);
    return item;
  }
  const input = element('zotero-prefpane-putongdoc-authkey');
  const button = element('zotero-prefpane-putongdoc-test-button');
  const remove = element('putongdoc-token-remove');
  element('putongdoc-token-feedback');
  for (const id of ['target-language', 'translate-mode', 'extract-backend']) {
    element(`putongdoc-${id}-placeholder`);
  }
  const doc = {
    getElementById: (id) => elements.get(id) || null,
    querySelector: (selector) => elements.get(selector.replace(/^#/, '')) || null,
  };
  const load = loader(
    {
      addon: {
        data: {},
        api: {
          getQuota: async () => {
            requests++;
            return { dailyFileQuota: 5, dailyUsedFiles: 0, dailyPageQuota: 50, dailyUsedPages: 0 };
          },
        },
      },
      Zotero: { locale: 'zh-CN' },
      ztoolkit: {
        UI: {
          replaceElement: (options) => {
            elements.set(options.id, options);
          },
        },
      },
    },
    {
      'src/utils/locale.ts': { getString: (key) => key },
      'src/utils/prefs.ts': {
        getPref: (key) => preferences[key],
        setPref: (key, value) => {
          preferences[key] = value;
        },
      },
      'src/utils/dialog.ts': { showDialog: (data) => dialogs.push(data) },
      'src/api/credentials.ts': {
        getApiToken: async () => {
          if (!token) throw new Error('missing token');
          return token;
        },
        saveApiToken: async (value) => {
          token = value;
          saved.push(value);
        },
      },
    },
  );
  return {
    load,
    input,
    button,
    remove,
    preferences,
    elements,
    saved,
    dialogs,
    open: () => load('src/modules/preference-window.ts').registerPrefsScripts({ document: doc }),
    requests: () => requests,
  };
}

test('PDF extraction engine choices have the requested localized labels and unchanged values', async () => {
  const f = preferenceFixture();
  await f.open();
  const engineMenu = f.elements.get('putongdoc-extract-backend');
  assert.equal(engineMenu.attributes.value, 'mineru');
  const choices = engineMenu.children[0].children;
  assert.deepEqual(
    Array.from(choices, (choice) => choice.attributes.value),
    ['native', 'mineru', 'zhipu'],
  );
  for (const [locale, expected] of [
    ['zh-CN', ['内置', 'Mineru', '智谱']],
    ['en-US', ['Default', 'MinerU', 'Z.AI']],
  ]) {
    const strings = fs.readFileSync(
      new URL(`../addon/locale/${locale}/addon.ftl`, import.meta.url),
      'utf8',
    );
    const localize = (key) =>
      strings
        .split('\n')
        .find((line) => line.startsWith(`${key} = `))
        ?.slice(key.length + 3);
    assert.deepEqual(
      Array.from(choices, (choice) => localize(choice.attributes.label)),
      expected,
    );
    const load = loader({}, { 'src/utils/locale.ts': { getString: localize } });
    const config = load('src/config/index.ts');
    assert.deepEqual(
      Array.from(config.extractBackends, (choice) => config.getExtractBackendLabel(choice.value)),
      expected,
    );
  }
});

test('MinerU is the default engine without overriding saved choices', async () => {
  const defaults = fs.readFileSync(new URL('../addon/prefs.js', import.meta.url), 'utf8');
  assert.match(defaults, /pref\('extractBackend', 'mineru'\)/);
  for (const backend of ['native', 'mineru', 'zhipu']) {
    const f = preferenceFixture();
    f.preferences.extractBackend = backend;
    await f.open();
    const menu = f.elements.get('putongdoc-extract-backend');
    assert.equal(menu.attributes.value, backend);
    assert.equal(f.preferences.extractBackend, backend);
  }
});

test('fixed language list has exactly the supplied codes and localized names without API access', () => {
  const load = loader();
  const languages = load('src/modules/language/index.ts');
  assert.deepEqual(Array.from(languages.getLanguages()), [
    'zh-CN',
    'zh-Hant',
    'ja',
    'ko',
    'vi',
    'lo',
    'th',
    'ms',
    'id',
    'fil',
    'hi',
    'ar',
    'en',
    'fr',
    'de',
    'ru',
    'it',
    'es',
    'pt',
    'sw',
  ]);
  assert.equal(languages.getLanguageOptions('zh-CN')[0].label, '简体中文');
  assert.equal(languages.getLanguageOptions('en-US')[1].label, 'Traditional Chinese');
  assert.equal(languages.getLanguageName('fil', 'zh-CN'), '菲律宾语');
  assert.equal(networkFixture().load('src/api/index.ts').getLanguages, undefined);
});

test('without token, settings show 20 selectable languages and default to the first', async () => {
  const f = preferenceFixture();
  await f.open();
  const menu = f.elements.get('putongdoc-target-language');
  assert.equal(menu.attributes.value, 'zh-CN');
  assert.equal(menu.attributes.label, '简体中文');
  assert.equal(menu.attributes.disabled, undefined);
  assert.equal(menu.children[0].children.length, 20);
  assert.equal(f.requests(), 0);
  assert.equal(f.input.placeholder, 'api-token-placeholder-empty');
  assert.equal(f.elements.get('putongdoc-token-feedback').textContent, '');
});

test('saved token is indicated by placeholder without exposing the credential', async () => {
  const f = preferenceFixture('pt_existing');
  await f.open();
  assert.equal(f.input.value, '');
  assert.equal(f.input.placeholder, 'api-token-placeholder-saved');
  assert.equal(f.elements.get('putongdoc-token-feedback').textContent, 'api-token-saved');
  assert.equal(f.requests(), 0);
});

test('save and test retains the configured placeholder; removal does not clear language options', async () => {
  const f = preferenceFixture();
  await f.open();
  f.input.value = 'pt_new';
  await f.input.emit('change');
  await f.button.emit('command');
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0], 'pt_new');
  assert.equal(f.input.value, '');
  assert.equal(f.input.placeholder, 'api-token-placeholder-saved');
  assert.equal(f.requests(), 1);
  assert.equal(f.dialogs.at(-1).title, 'pref-test-success');
  await f.remove.emit('command');
  assert.equal(f.input.placeholder, 'api-token-placeholder-empty');
  assert.equal(f.elements.get('putongdoc-token-feedback').textContent, '');
  assert.equal(f.elements.get('putongdoc-target-language').children[0].children.length, 20);
});

test('existing language selection is preserved and changes persist', async () => {
  const f = preferenceFixture();
  f.preferences.targetLanguage = 'en';
  await f.open();
  const menu = f.elements.get('putongdoc-target-language');
  assert.equal(menu.attributes.value, 'en');
  menu.listeners[0].listener({ target: { value: 'zh-Hant' } });
  assert.equal(f.preferences.targetLanguage, 'zh-Hant');
});

test('token buttons have matching widths, spacing and XUL label localization', () => {
  const xhtml = fs.readFileSync(
    new URL('../addon/content/preferences.xhtml', import.meta.url),
    'utf8',
  );
  const testButton = xhtml.match(
    /<button\s+id="zotero-prefpane-__addonRef__-test-button"[^>]*>/,
  )[0];
  const removeButton = xhtml.match(/<button\s+id="putongdoc-token-remove"[^>]*>/)[0];
  for (const button of [testButton, removeButton]) {
    assert.match(button, /width: 72px/);
    assert.match(button, /margin-inline-start: 8px/);
  }
  for (const locale of ['zh-CN', 'en-US']) {
    const ftl = fs.readFileSync(
      new URL(`../addon/locale/${locale}/preferences.ftl`, import.meta.url),
      'utf8',
    );
    assert.match(ftl, /pref-test-button =\s+\.label = \S+/);
  }
  const defaults = fs.readFileSync(new URL('../addon/prefs.js', import.meta.url), 'utf8');
  assert.match(defaults, /pref\('targetLanguage', 'zh-CN'\)/);
  for (const option of [
    'ocrEnabled',
    'tableTextMode',
    'pages',
    'glossaryId',
    'autoTranslate',
    'enableShortcuts',
    'shortcutTranslate',
    'shortcutTaskManager',
  ]) {
    assert.ok(!xhtml.includes(`preference="${option}"`));
    assert.ok(!defaults.includes(`pref('${option}'`));
  }
});

test('settings use two compact sections, text links and tooltip-only advanced help', () => {
  const xhtml = fs.readFileSync(
    new URL('../addon/content/preferences.xhtml', import.meta.url),
    'utf8',
  );
  assert.equal((xhtml.match(/<groupbox\b/g) || []).length, 2);
  assert.doesNotMatch(
    xhtml,
    /data-l10n-id="pref-translate-settings-advance"|data-l10n-id="pref-about"/,
  );
  assert.doesNotMatch(xhtml, /<description>\s*https?:\/\//);
  assert.equal((xhtml.match(/putongdoc\.com/g) || []).length, 1);
  assert.match(xhtml, /href="https:\/\/putongdoc\.com\/tokens"/);
  assert.match(xhtml, /data-l10n-id="pref-token-create"/);
  assert.doesNotMatch(xhtml, /pref-about-docs|#readme/);
  assert.match(xhtml, /data-l10n-id="pref-about-feedback"/);
  const translationSection = xhtml.match(/<groupbox[^>]*>[\s\S]*?<\/groupbox>/g)[1];
  for (const id of ['target-language', 'translate-mode', 'extract-backend']) {
    assert.ok(translationSection.includes(`id="__addonRef__-${id}-placeholder"`));
  }
  assert.match(translationSection, /preference="autoOpenPDF"/);
  assert.equal((translationSection.match(/width: 160px/g) || []).length, 3);
  for (const locale of ['zh-CN', 'en-US']) {
    const ftl = fs.readFileSync(
      new URL(`../addon/locale/${locale}/preferences.ftl`, import.meta.url),
      'utf8',
    );
    assert.match(ftl, /pref-about-version =\s+\.value = v\{ \$version \}\s+\.tooltiptext =/);
    assert.match(ftl, /pref-token-help =\n\s+\.tooltiptext = [^\n]*PUTONGDOC_API_TOKEN/);
    assert.doesNotMatch(ftl, /粘贴令牌后点击测试|Paste a token and click Test/);
    assert.doesNotMatch(ftl, /putongdoc\.com|pref-about-docs/);
    assert.ok(
      ftl.includes(`pref-about-feedback =\n    .value = ${locale === 'zh-CN' ? '反馈' : 'Issues'}`),
    );
  }
});

test('manual translation entry points remain without keyboard or item observers', () => {
  const hooks = fs.readFileSync(new URL('../src/hooks.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(hooks, /onNotify|onShortcuts|registerNotifier|registerShortcuts/);
  assert.match(hooks, /function onTranslate/);
  assert.match(hooks, /function onViewTranslationTasks/);
  const manager = fs.readFileSync(
    new URL('../addon/content/taskManager.xhtml', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(manager, /<xul:keyset/);
  assert.equal(fs.existsSync(new URL('../src/modules/shortcuts.ts', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../src/modules/notify.ts', import.meta.url)), false);
});
