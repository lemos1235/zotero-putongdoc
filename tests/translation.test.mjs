import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL } from 'node:url';
import { loader } from './helpers.mjs';

function fixture(interfaceLanguage = 'zh-CN') {
  const locale = interfaceLanguage.startsWith('zh') ? 'zh-CN' : 'en-US';
  const strings = fs.readFileSync(
    new URL(`../addon/locale/${locale}/addon.ftl`, import.meta.url),
    'utf8',
  );
  const updates = [];
  const api = {
    getQuota: async () => {
      throw new Error('Quota is checked once per batch, not per task');
    },
  };
  const dialogs = [];
  const delays = [];
  const addon = {
    api,
    data: { alive: true, task: { translationTaskList: [], translationGlobalQueue: [] } },
  };
  const preferences = {
    extractBackend: 'native',
    autoOpenPDF: false,
  };
  const imports = [];
  const monitored = [];
  const stored = [];
  const flushed = [];
  let flushFailure = false;
  let statSize = 4;
  let statError = null;
  const zotero = {
    locale: interfaceLanguage,
    Promise: {
      delay: async (ms) => {
        delays.push(ms);
      },
    },
    Items: { get: () => ({ isAttachment: () => true, getCollections: () => [] }) },
    Attachments: {
      importFromFile: async (options) => {
        const item = { id: 100 + imports.length, setTags() {}, async saveTx() {} };
        imports.push({ options, item });
        return item;
      },
    },
  };
  const load = loader(
    {
      addon,
      Services: {
        prefs: {
          savePrefFile: () => {
            if (flushFailure) throw new Error('disk unavailable');
            flushed.push(JSON.parse(JSON.stringify(stored.at(-1))));
          },
        },
      },
      Zotero: zotero,
      IOUtils: {
        stat: async () => {
          if (statError) throw statError;
          return { size: statSize };
        },
        read: async () => new Uint8Array([37, 80, 68, 70]),
        write: async () => {},
        remove: async () => {},
      },
      PathUtils: { tempDir: '/tmp', join: (...parts) => parts.join('/') },
      ztoolkit: { log() {} },
    },
    {
      'src/modules/translate/store.ts': {
        setTask: (task) => stored.push(JSON.parse(JSON.stringify(task))),
        clearTasks() {},
        getTaskKeys: () => [],
        getTaskText: () => '',
      },
      'src/utils/locale.ts': {
        getString: (key, options) => {
          if (!key.startsWith('attachment-title-')) return key;
          const pattern = strings
            .split('\n')
            .find((line) => line.startsWith(`${key} = `))
            ?.slice(key.length + 3);
          assert.ok(pattern, `Missing title string: ${key}`);
          return pattern.replace('{ $title }', options.args.title);
        },
      },
      'src/utils/prefs.ts': { getPref: (key) => preferences[key] },
      'src/utils/dialog.ts': { showDialog: (dialog) => dialogs.push(dialog) },
      'src/modules/translate/confirm-dialog.ts': {},
      'src/modules/translate/task-manager.ts': {
        showTaskManager() {},
        updateTaskInList: (id, update) => {
          updates.push({ id, ...update });
          const task = addon.data.task.translationTaskList.find((task) => task.attachmentId === id);
          if (task) Object.assign(task, update);
        },
      },
    },
  );
  const taskData = {
    attachmentId: 1,
    attachmentFilename: 'paper.pdf',
    attachmentPath: '/paper.pdf',
    translateMode: 'dual',
    targetLanguage: 'zh-CN',
  };
  addon.data.task.translationTaskList.push({ ...taskData });
  function monitorEntry() {
    return { taskData, startedAt: Date.now(), failures: 0, nextPoll: 0 };
  }
  return {
    load,
    api,
    dialogs,
    delays,
    zotero,
    setStatError: (value) => {
      statError = value;
    },
    addon,
    updates,
    imports,
    monitored,
    stored,
    flushed,
    setFlushFailure: (value) => {
      flushFailure = value;
    },
    taskData,
    monitorEntry,
    preferences,
    setSize: (value) => {
      statSize = value;
    },
  };
}

const remote = (status, progress = null, files = {}, title = null) => ({
  id: 'task-id',
  filename: 'paper.pdf',
  title,
  status,
  progress,
  files: { source: null, translated: null, compare: null, ...files },
  error: null,
});

test('intermediate stages including archiving and progress=100 are not failures or completion', async () => {
  for (const status of ['preparing', 'extracting', 'translating', 'rendering', 'archiving']) {
    const f = fixture();
    f.api.getTranslateStatus = async () => remote(status, 100);
    const monitor = f.load('src/modules/translate/task-monitor.ts').TranslationTaskMonitor;
    const entry = f.monitorEntry();
    monitor.activeTasks.set('task-id', entry);
    await monitor.checkTaskProgress('task-id', entry);
    assert.equal(monitor.activeTasks.size, 1);
    assert.equal(f.imports.length, 0);
    assert.equal(f.updates.at(-1).status, 'translating');
    assert.equal(f.updates.at(-1).stage, status);
  }
});

test('server-queued task stays cancellable instead of showing as translating', async () => {
  const f = fixture();
  f.api.getTranslateStatus = async () => remote('queued', 0);
  const monitor = f.load('src/modules/translate/task-monitor.ts').TranslationTaskMonitor;
  const entry = f.monitorEntry();
  monitor.activeTasks.set('task-id', entry);
  await monitor.checkTaskProgress('task-id', entry);
  assert.equal(monitor.activeTasks.size, 1);
  assert.equal(f.updates.at(-1).status, 'queued');
  assert.equal(f.updates.at(-1).stage, 'queued');
});

test('completed with unavailable files keeps waiting', async () => {
  const f = fixture();
  f.api.getTranslateStatus = async () => remote('completed', 100);
  const monitor = f.load('src/modules/translate/task-monitor.ts').TranslationTaskMonitor;
  const entry = f.monitorEntry();
  monitor.activeTasks.set('task-id', entry);
  await monitor.checkTaskProgress('task-id', entry);
  assert.equal(monitor.activeTasks.size, 1);
  assert.equal(f.imports.length, 0);
});

test('server failed is terminal even without error code/message', async () => {
  const f = fixture();
  f.api.getTranslateStatus = async () => ({
    ...remote('failed'),
    error: { code: null, message: null },
  });
  const monitor = f.load('src/modules/translate/task-monitor.ts').TranslationTaskMonitor;
  const entry = f.monitorEntry();
  monitor.activeTasks.set('task-id', entry);
  await monitor.checkTaskProgress('task-id', entry);
  assert.equal(monitor.activeTasks.size, 0);
  assert.equal(f.updates.at(-1).status, 'failed');
});

test('download is awaited and both kinds are imported only once across retries', async () => {
  const f = fixture();
  f.taskData.translateMode = 'all';
  f.api.getTranslateStatus = async () =>
    remote('completed', 100, {
      compare: '/api/v1/translations/task-id/files/compare',
      translated: '/api/v1/translations/task-id/files/translated',
    });
  let downloadCount = 0;
  f.api.downloadPdf = async () => {
    downloadCount++;
    if (downloadCount === 2) throw new Error('download failed');
    return new Uint8Array([37, 80, 68, 70]).buffer;
  };
  const monitor = f.load('src/modules/translate/task-monitor.ts').TranslationTaskMonitor;
  const entry = f.monitorEntry();
  monitor.activeTasks.set('task-id', entry);
  await monitor.checkTaskProgress('task-id', entry);
  assert.equal(f.imports.length, 1);
  assert.equal(f.updates.at(-1).status, 'paused');
  monitor.activeTasks.set('task-id', entry);
  await monitor.checkTaskProgress('task-id', entry);
  assert.equal(f.imports.length, 2);
  assert.equal(downloadCount, 3);
  assert.equal(f.updates.at(-1).status, 'success');
  assert.equal(monitor.activeTasks.size, 0);
});

test('result attachments use the task title, falling back to the filename', async () => {
  for (const [locale, compareSuffix, translatedSuffix] of [
    ['zh-CN', '（双语对照）', '（译文）'],
    ['en-US', ' (Bilingual)', ' (Translation)'],
  ]) {
    for (const [title, expected] of [
      ['Attention Is All You Need', 'Attention Is All You Need'],
      ['  Trimmed Title  ', 'Trimmed Title'],
      [null, 'paper'],
      ['', 'paper'],
    ]) {
      const f = fixture(locale);
      f.taskData.translateMode = 'all';
      f.api.getTranslateStatus = async () =>
        remote('completed', 100, { compare: '/compare', translated: '/translated' }, title);
      f.api.downloadPdf = async () => new Uint8Array([37, 80, 68, 70]).buffer;
      const monitor = f.load('src/modules/translate/task-monitor.ts').TranslationTaskMonitor;
      const entry = f.monitorEntry();
      monitor.activeTasks.set('task-id', entry);
      await monitor.checkTaskProgress('task-id', entry);
      assert.equal(f.updates.at(-1).status, 'success');
      assert.equal(f.imports.length, 2);
      assert.equal(f.imports[0].options.title, `${expected}${compareSuffix}`);
      assert.equal(f.imports[1].options.title, `${expected}${translatedSuffix}`);
      assert.equal(f.imports[0].options.file, '/tmp/paper_zh-CN_dual.pdf');
      assert.equal(f.imports[1].options.file, '/tmp/paper_zh-CN_translation.pdf');
    }
  }
});

test('transient query errors back off; auth errors pause without marking server failed', async () => {
  const f = fixture();
  const { ApiError } = f.load('src/api/request.ts');
  const monitor = f.load('src/modules/translate/task-monitor.ts').TranslationTaskMonitor;
  const entry = f.monitorEntry();
  monitor.activeTasks.set('task-id', entry);
  f.api.getTranslateStatus = async () => {
    throw new ApiError(429, 'error_rate_limited', 20000);
  };
  await monitor.checkTaskProgress('task-id', entry);
  assert.ok(entry.nextPoll >= Date.now() + 19000);
  assert.equal(monitor.activeTasks.size, 1);
  f.api.getTranslateStatus = async () => {
    throw new ApiError(401, 'error_api_token_invalid');
  };
  await monitor.checkTaskProgress('task-id', entry);
  assert.equal(monitor.activeTasks.size, 0);
  assert.equal(f.updates.at(-1).status, 'paused');
});

test('total wait timeout preserves task ID and pauses', async () => {
  const f = fixture();
  f.taskData.pdfId = 'task-id';
  const monitor = f.load('src/modules/translate/task-monitor.ts').TranslationTaskMonitor;
  const entry = f.monitorEntry();
  entry.startedAt -= 31 * 60 * 1000;
  monitor.activeTasks.set('task-id', entry);
  await monitor.startPolling();
  assert.equal(f.updates.at(-1).status, 'paused');
  assert.equal(f.taskData.pdfId, 'task-id');
});

test('submission marker is persisted before POST, and success ID before polling', async () => {
  const f = fixture();
  // Simulate a restored task carrying removed settings from an older version.
  f.taskData.options = {
    extractBackend: 'native',
    ocrEnabled: true,
    tableTextMode: 'preserve',
    pages: '1-2',
    glossaryId: 'legacy-glossary',
  };
  f.api.getPdfUploadUrl = async (data) => {
    assert.equal(data.size, 4);
    return { key: 'uploaded-key' };
  };
  f.api.uploadPdf = async () => {};
  f.api.createTranslateTask = async (body) => {
    assert.equal(f.updates.at(-1).submissionPending, true);
    assert.equal(f.flushed.at(-1).submissionPending, true);
    assert.equal(body.key, 'uploaded-key');
    assert.equal(body.name, 'paper.pdf');
    assert.equal(body.requestModel, undefined);
    assert.deepEqual(Object.keys(body).sort(), ['extractBackend', 'key', 'name', 'targetLanguage']);
    assert.equal(body.extractBackend, 'native');
    return remote('preparing');
  };
  const monitor = f.load('src/modules/translate/task-monitor.ts').TranslationTaskMonitor;
  monitor.addTask = (id) => {
    assert.equal(f.updates.at(-1).pdfId, id);
    assert.equal(f.updates.at(-1).submissionPending, false);
  };
  await f.load('src/modules/translate/translate.ts').translatePDF(f.taskData);
  assert.equal(f.taskData.pdfId, 'task-id');
  assert.equal(f.flushed.at(-1).pdfId, 'task-id');
  assert.equal(f.flushed.at(-1).submissionPending, false);
});

test('unknown submission outcome retains marker; explicit business rejection clears it', async () => {
  for (const status of [0, 500, 429, 400]) {
    const f = fixture();
    const { ApiError } = f.load('src/api/request.ts');
    f.api.getPdfUploadUrl = async () => ({ key: 'key' });
    f.api.uploadPdf = async () => {};
    let posts = 0;
    f.api.createTranslateTask = async () => {
      posts++;
      throw new ApiError(status, '');
    };
    await assert.rejects(f.load('src/modules/translate/translate.ts').translatePDF(f.taskData));
    assert.equal(f.taskData.submissionPending, status === 0 || status === 500);
    assert.equal(posts, 1);
  }
});

test('unsupported language is rejected before upload', async () => {
  const f = fixture();
  f.taskData.targetLanguage = 'zh-TW';
  let uploads = 0;
  f.api.getPdfUploadUrl = async () => {
    uploads++;
  };
  await assert.rejects(f.load('src/modules/translate/translate.ts').translatePDF(f.taskData));
  assert.equal(uploads, 0);
});

test('concurrency and daily-quota 429s fail the task without retrying', async () => {
  for (const [stage, key] of [
    ['upload-url', 'error_quota_concurrency_running'],
    ['create', 'error_quota_concurrency_running'],
    ['create', 'error_quota_pages'],
  ]) {
    const f = fixture();
    const { ApiError } = f.load('src/api/request.ts');
    let calls = 0;
    const reject = async () => {
      calls++;
      throw new ApiError(429, key);
    };
    f.api.getPdfUploadUrl = stage === 'upload-url' ? reject : async () => ({ key: 'key' });
    f.api.uploadPdf = async () => {};
    f.api.createTranslateTask = reject;
    await assert.rejects(f.load('src/modules/translate/translate.ts').translatePDF(f.taskData));
    assert.equal(calls, 1);
    assert.equal(f.taskData.submissionPending, stage === 'create' ? false : undefined);
    const failure = f
      .load('src/modules/translate/task-diagnostics.ts')
      .getSubmissionFailure(f.taskData, new ApiError(429, key));
    assert.equal(failure.status, 'failed');
  }
});

test('rate-limited writes are resent after backing off', async () => {
  const f = fixture();
  const { ApiError } = f.load('src/api/request.ts');
  let uploads = 0;
  let posts = 0;
  f.api.getPdfUploadUrl = async () => {
    if (++uploads === 1) throw new ApiError(429, 'error_rate_limited', 3600 * 1000);
    return { key: 'key' };
  };
  f.api.uploadPdf = async () => {};
  f.api.createTranslateTask = async () => {
    if (++posts < 3) throw new ApiError(429, 'error_rate_limited');
    return remote('queued');
  };
  f.load('src/modules/translate/task-monitor.ts').TranslationTaskMonitor.addTask = () => {};
  await f.load('src/modules/translate/translate.ts').translatePDF(f.taskData);
  assert.equal(uploads, 2);
  assert.equal(posts, 3);
  // A huge Retry-After must not stall the serial submission queue.
  assert.ok(f.delays.every((ms) => ms <= 31000));
  assert.equal(f.taskData.pdfId, 'task-id');
});

test('batch exceeding remaining slots or file size is rejected as a whole', async () => {
  const daily = { dailyFileQuota: 10, dailyUsedFiles: 0, dailyPageQuota: 100, dailyUsedPages: 0 };
  const quota = (activeTasks, extra = {}) => ({
    maxFileSize: 100,
    concurrencyLimit: 3,
    activeTasks,
    ...daily,
    ...extra,
  });
  const batch = (count) =>
    Array.from({ length: count }, (_, i) => ({
      attachmentId: 10 + i,
      attachmentFilename: `p${i}.pdf`,
      attachmentPath: `/p${i}.pdf`,
    }));
  const f = fixture();
  const { checkBatchLimits } = f.load('src/modules/translate/task.ts');
  assert.equal(await checkBatchLimits(batch(2), quota(1)), true);
  assert.equal(await checkBatchLimits(batch(3), quota(1)), false);
  assert.equal(f.dialogs.at(-1).title, 'api-error-quota-concurrency');
  // Tasks still waiting in the local queue will each take a slot.
  f.addon.data.task.translationTaskList[0].status = 'queued';
  assert.equal(await checkBatchLimits(batch(2), quota(1)), false);
  // Submitted tasks are already included in the server's activeTasks.
  f.addon.data.task.translationTaskList[0].pdfId = 'task-id';
  assert.equal(await checkBatchLimits(batch(2), quota(1)), true);
  // Older servers without activeTasks fall back to the server-side 429.
  assert.equal(
    await checkBatchLimits(batch(5), { maxFileSize: 100, concurrencyLimit: 3, ...daily }),
    true,
  );
  const dialogs = f.dialogs.length;
  f.setSize(101);
  assert.equal(await checkBatchLimits(batch(1), quota(0)), false);
  assert.equal(f.dialogs.length, dialogs + 1);
  assert.equal(f.dialogs.at(-1).title, 'api-file-size');
  // A missing file is reported by name, never with the raw Gecko message.
  f.setSize(4);
  f.setStatError(new Error('NotFoundError: /Users/secret/path.pdf'));
  assert.equal(await checkBatchLimits(batch(1), quota(0)), false);
  assert.equal(f.dialogs.at(-1).message, 'p0.pdf');
});

test('batch exceeding the daily file quota or with pages exhausted is rejected before upload', async () => {
  const f = fixture();
  const { checkAccountLimits } = f.load('src/modules/translate/task.ts');
  const quota = (extra) => ({
    maxFileSize: 100,
    concurrencyLimit: 20,
    activeTasks: 0,
    dailyFileQuota: 5,
    dailyUsedFiles: 3,
    dailyPageQuota: 100,
    dailyUsedPages: 0,
    ...extra,
  });
  const batch = (count) => Array.from({ length: count }, (_, i) => ({ attachmentId: 10 + i }));
  assert.equal(checkAccountLimits(batch(2), quota()), true);
  assert.equal(checkAccountLimits(batch(3), quota()), false);
  assert.equal(f.dialogs.at(-1).title, 'api-quota-exhausted');
  // A locally queued task will also consume a file.
  f.addon.data.task.translationTaskList[0].status = 'queued';
  assert.equal(checkAccountLimits(batch(2), quota()), false);
  f.addon.data.task.translationTaskList[0].status = 'success';
  assert.equal(checkAccountLimits(batch(1), quota({ dailyUsedPages: 100 })), false);
});

test('after confirmation the quota is refreshed and concurrent batches are de-duplicated', async () => {
  const f = fixture();
  f.preferences.targetLanguage = 'zh-CN';
  f.addon.data.task.translationTaskList.length = 0;
  f.addon.data.task.isQueueProcessing = true; // Keep the submission loop out of this test.
  const pdf = {
    id: 7,
    attachmentFilename: 'shared.pdf',
    isRegularItem: () => false,
    isPDFAttachment: () => true,
    getTags: () => [],
    fileExists: async () => true,
    getFilePathAsync: async () => '/shared.pdf',
  };
  f.zotero.getActiveZoteroPane = () => ({ getSelectedItems: () => [pdf] });
  const quotas = [];
  f.api.getQuota = async () => ({
    maxFileSize: 100,
    concurrencyLimit: 3,
    dailyFileQuota: 10,
    dailyUsedFiles: 0,
    dailyPageQuota: 100,
    dailyUsedPages: 0,
    activeTasks: quotas.shift() ?? 0,
  });
  const confirms = [];
  f.load('src/modules/translate/confirm-dialog.ts').showConfirmationDialog = () =>
    new Promise((resolve) => confirms.push(() => resolve({ action: 'confirm', data: {} })));
  const { addTasksToQueue } = f.load('src/modules/translate/task.ts');

  // Two batches select the same attachment while both dialogs are open.
  const first = addTasksToQueue();
  const second = addTasksToQueue();
  while (confirms.length < 2) await new Promise((resolve) => globalThis.setTimeout(resolve));
  confirms.forEach((confirm) => confirm());
  await Promise.all([first, second]);
  assert.equal(f.addon.data.task.translationGlobalQueue.length, 1);
  assert.equal(f.addon.data.task.translationTaskList.length, 1);

  // Slots taken elsewhere while the dialog was open are caught by the refreshed quota.
  f.addon.data.task.translationGlobalQueue.length = 0;
  f.addon.data.task.translationTaskList.length = 0;
  quotas.push(0, 3);
  const third = addTasksToQueue();
  while (confirms.length < 3) await new Promise((resolve) => globalThis.setTimeout(resolve));
  confirms[2]();
  await third;
  assert.equal(f.addon.data.task.translationTaskList.length, 0);
  assert.equal(f.dialogs.at(-1).title, 'api-error-quota-concurrency');
});

test('canceling during a rate-limit backoff stops before creating the task', async () => {
  for (const stage of ['upload-url', 'create']) {
    const f = fixture();
    const { ApiError } = f.load('src/api/request.ts');
    const { translatePDF, TaskCanceledError } = f.load('src/modules/translate/translate.ts');
    const cancel = () => {
      f.addon.data.task.translationTaskList[0].status = 'canceled';
      throw new ApiError(429, 'error_rate_limited');
    };
    let posts = 0;
    f.api.getPdfUploadUrl = stage === 'upload-url' ? cancel : async () => ({ key: 'key' });
    f.api.uploadPdf = async () => {};
    f.api.createTranslateTask = async () => {
      posts++;
      cancel();
    };
    await assert.rejects(translatePDF(f.taskData), TaskCanceledError);
    assert.equal(posts, stage === 'create' ? 1 : 0);
    assert.ok(!f.taskData.submissionPending);
  }
  // Canceled while uploading: no POST at all.
  const f = fixture();
  const { translatePDF, TaskCanceledError } = f.load('src/modules/translate/translate.ts');
  f.api.getPdfUploadUrl = async () => ({ key: 'key' });
  f.api.uploadPdf = async () => {
    f.addon.data.task.translationTaskList[0].status = 'canceled';
  };
  f.api.createTranslateTask = async () => assert.fail('must not POST after cancel');
  await assert.rejects(translatePDF(f.taskData), TaskCanceledError);
});

test('restart does not enqueue ambiguous submissions, paused tasks, or server failures', () => {
  const taskList = [
    { attachmentId: 1, status: 'uploading', submissionPending: true },
    { attachmentId: 2, status: 'translating', pdfId: 'existing-id' },
    { attachmentId: 3, status: 'paused', pdfId: 'paused-id' },
    { attachmentId: 4, status: 'failed', pdfId: 'failed-id' },
  ];
  const addon = { data: { task: { translationTaskList: taskList, translationGlobalQueue: [] } } };
  const saved = [];
  const load = loader(
    {
      addon,
      Zotero: { Items: { get: () => ({ isAttachment: () => true }) } },
      ztoolkit: { log() {} },
    },
    {
      'src/utils/locale.ts': { getString: (key) => key },
      'src/modules/translate/store.ts': { clearTasks() {}, setTask: (task) => saved.push(task) },
    },
  );
  assert.equal(load('src/modules/translate/persistence.ts').restoreUnfinishedTasks(), 1);
  assert.equal(addon.data.task.translationGlobalQueue[0].pdfId, 'existing-id');
  assert.equal(taskList[0].status, 'uncertain');
  assert.equal(saved.length, 4);
});

test('disk flush failure prevents the non-idempotent POST entirely', async () => {
  const f = fixture();
  f.api.getPdfUploadUrl = async () => ({ key: 'key' });
  f.api.uploadPdf = async () => {};
  let posts = 0;
  f.api.createTranslateTask = async () => {
    posts++;
    return remote('preparing');
  };
  f.setFlushFailure(true);
  await assert.rejects(
    f.load('src/modules/translate/translate.ts').translatePDF(f.taskData),
    /api-persistence-failed/,
  );
  assert.equal(posts, 0);
  assert.equal(f.flushed.length, 0);
});

test('ID persistence failure retains the previously flushed submission intent', async () => {
  const f = fixture();
  f.api.getPdfUploadUrl = async () => ({ key: 'key' });
  f.api.uploadPdf = async () => {};
  f.api.createTranslateTask = async () => {
    f.setFlushFailure(true);
    return remote('preparing');
  };
  await assert.rejects(
    f.load('src/modules/translate/translate.ts').translatePDF(f.taskData),
    /api-persistence-failed/,
  );
  assert.equal(f.flushed.length, 1);
  assert.equal(f.flushed[0].submissionPending, true);
  assert.equal(f.flushed[0].pdfId, undefined);
  assert.equal(f.taskData.pdfId, 'task-id');
});
