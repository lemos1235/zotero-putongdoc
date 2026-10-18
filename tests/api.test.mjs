import { test } from 'node:test';
import assert from 'node:assert/strict';
import { networkFixture, ok } from './helpers.mjs';

const storage = 'https://storage.example/paper.pdf?signature=temporary%2Fvalue&x=1';

test('business requests use fixed origin, Bearer, JSON and anonymous channels', async () => {
  const f = networkFixture([
    ok({ maxFileSize: 100 }),
    ok({ key: 'input-key' }),
    ok({ id: 'task-id' }),
    ok({ status: 'queued' }),
  ]);
  const api = f.load('src/api/index.ts');
  assert.equal((await api.getQuota()).maxFileSize, 100);
  await api.getPdfUploadUrl({ name: '文献.pdf', size: 12 });
  await api.createTranslateTask({ key: 'input-key', name: '文献.pdf', targetLanguage: 'zh-CN' });
  await api.getTranslateStatus({ pdfId: 'task-id' });
  assert.ok(f.calls.every((call) => call.headers.Origin === 'https://putongdoc.com'));
  assert.equal(f.calls[0].url, 'https://putongdoc.com/api/v1/me');
  assert.equal(f.calls[0].headers.Authorization, 'Bearer pt_test_only');
  assert.equal(f.calls[1].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(f.calls[1].body), { name: '文献.pdf', size: 12 });
  assert.ok(f.calls.every((call) => call.channel.loadFlags & 16384));
});

test('upload sends exact bytes without credentials and preserves signature', async () => {
  const f = networkFixture([{ status: 204 }]);
  const api = f.load('src/api/index.ts');
  const file = new Uint8Array([37, 80, 68, 70]);
  await api.uploadPdf({
    upload: {
      key: 'key',
      method: 'PUT',
      url: storage,
      headers: {
        'content-type': 'application/pdf',
        Authorization: 'must-not-forward',
        Cookie: 'must-not-forward',
        Origin: 'must-not-forward',
      },
    },
    file,
  });
  assert.equal(f.calls[0].url, storage);
  assert.equal(f.calls[0].body, file);
  assert.deepEqual(f.calls[0].headers, { 'Content-Type': 'application/pdf' });
});

test('download intercepts 302 before forwarding token, then fetches anonymously', async () => {
  const body = new Uint8Array([37, 80, 68, 70]).buffer;
  const f = networkFixture([
    { status: 302, redirect: storage, headers: { Location: storage } },
    { status: 200, body },
  ]);
  const api = f.load('src/api/index.ts');
  assert.equal(
    await api.downloadPdf('https://putongdoc.com/api/v1/translations/id/files/compare'),
    body,
  );
  assert.equal(f.calls[0].redirectResult, 1);
  assert.equal(f.calls[0].headers.Authorization, 'Bearer pt_test_only');
  assert.equal(f.calls[0].headers.Origin, 'https://putongdoc.com');
  assert.equal(f.calls[1].url, storage);
  assert.deepEqual(f.calls[1].headers, {});
});

test('untrusted origins, credentials and non-file URLs are blocked before sending token', async () => {
  const f = networkFixture();
  const { downloadPdf } = f.load('src/api/index.ts');
  for (const url of [
    'https://evil.example/api/v1/translations/id/files/compare',
    'https://user@putongdoc.com/api/v1/translations/id/files/compare',
    'https://putongdoc.com/api/tasks',
  ]) {
    await assert.rejects(downloadPdf(url));
  }
  assert.equal(f.calls.length, 0);
});

test('API redirects never automatically forward Authorization', async () => {
  const f = networkFixture([{ status: 302, redirect: storage, headers: { Location: storage } }]);
  const { getQuota } = f.load('src/api/index.ts');
  await assert.rejects(getQuota());
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].redirectResult, 1);
});

test('internal same-origin redirect is permitted, cross-origin internal redirect is blocked', async () => {
  const same = networkFixture([
    {
      status: 200,
      internal: true,
      redirect: 'https://putongdoc.com/api/v1/me',
      body: JSON.stringify({ success: true, data: {} }),
    },
  ]);
  await same.load('src/api/index.ts').getQuota();
  assert.equal(same.calls[0].redirectResult, 0);
  const cross = networkFixture([
    { status: 302, internal: true, redirect: storage, headers: { Location: storage } },
  ]);
  await assert.rejects(cross.load('src/api/index.ts').getQuota());
  assert.equal(cross.calls[0].redirectResult, 1);
});

test('errors tolerate non-JSON, hide response details, and classify Retry-After', async () => {
  const f = networkFixture([
    { status: 502, body: '<html>sensitive signed URL</html>' },
    {
      status: 429,
      body: JSON.stringify({ success: false, error: { key: 'error_rate_limited' }, msg: 'secret' }),
      headers: { 'Retry-After': '17' },
    },
  ]);
  const { getQuota } = f.load('src/api/index.ts');
  const { ApiError, retryDelay } = f.load('src/api/request.ts');
  await assert.rejects(getQuota(), (error) => !error.message.includes('sensitive'));
  await assert.rejects(
    getQuota(),
    (error) => error.retryAfter === 17000 && !error.message.includes('secret'),
  );
  assert.ok(retryDelay(new ApiError(429, 'error_rate_limited', 17000), 0) >= 17000);
  assert.equal(retryDelay(new ApiError(429, 'error_quota_pages'), 0), null);
  assert.equal(retryDelay(new ApiError(401, 'error_api_token_invalid'), 0), null);
  assert.equal(retryDelay(new ApiError(500, ''), 4), null);
});

test('cancel uses DELETE and retry uses POST on the documented endpoints', async () => {
  const f = networkFixture([
    ok({ id: 'task-id', deleted: true }),
    ok({ id: 'task-id', status: 'queued' }),
  ]);
  const api = f.load('src/api/index.ts');
  assert.equal((await api.cancelTranslateTask({ pdfId: 'task-id' })).deleted, true);
  assert.equal((await api.retryTranslateTask({ pdfId: 'task-id' })).status, 'queued');
  assert.equal(f.calls[0].method, 'DELETE');
  assert.equal(f.calls[0].url, 'https://putongdoc.com/api/v1/translations/task-id');
  assert.equal(f.calls[1].method, 'POST');
  assert.equal(f.calls[1].url, 'https://putongdoc.com/api/v1/translations/task-id/retry');
  assert.equal(f.calls[1].headers['Content-Type'], 'application/json');
  assert.ok(f.calls.every((call) => call.headers.Origin === 'https://putongdoc.com'));
  assert.ok(f.calls.every((call) => call.headers.Authorization === 'Bearer pt_test_only'));
});

test('canceling a running task surfaces error_delete_running', async () => {
  const f = networkFixture([
    {
      status: 400,
      body: JSON.stringify({ success: false, error: { key: 'error_delete_running' }, msg: 'x' }),
    },
  ]);
  const { ApiError } = f.load('src/api/request.ts');
  await assert.rejects(
    f.load('src/api/index.ts').cancelTranslateTask({ pdfId: 'task-id' }),
    (error) => error instanceof ApiError && error.key === 'error_delete_running',
  );
  assert.equal(f.calls.length, 1);
});

test('creation POST has no automatic retry on server or network failure', async () => {
  for (const reply of [{ status: 500, body: '{}' }, { networkError: true }]) {
    const f = networkFixture([reply]);
    await assert.rejects(
      f
        .load('src/api/index.ts')
        .createTranslateTask({ key: 'key', name: 'paper.pdf', targetLanguage: 'zh-CN' }),
    );
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].method, 'POST');
  }
});

test('legacy preference migrates to password manager and environment takes precedence', async () => {
  const f = networkFixture();
  f.prefs.authkey = 'pt_legacy';
  const creds = f.load('src/api/credentials.ts');
  assert.equal(await creds.getApiToken(), 'pt_test_only');
  assert.equal(f.logins[0].password, 'pt_legacy');
  assert.equal(f.logins[0].formActionOrigin, null);
  assert.equal(f.prefs.authkey, undefined);
  f.setEnv('');
  assert.equal(await creds.getApiToken(), 'pt_legacy');
  await creds.saveApiToken('pt_replaced');
  assert.equal(await creds.getApiToken(), 'pt_replaced');
  await creds.saveApiToken('');
  await assert.rejects(creds.getApiToken());
});
