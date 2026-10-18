import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL } from 'node:url';
import { loader, networkFixture } from './helpers.mjs';

const secret = 'pt_secret https://storage.example/file?signature=secret';

test('upload URL 403 reports the failing API operation without leaking the body', async () => {
  const f = networkFixture([{ status: 403, body: `<html>${secret}</html>` }]);
  const api = f.load('src/api/index.ts');
  const { formatErrorDiagnostic } = f.load('src/api/request.ts');
  await assert.rejects(api.getPdfUploadUrl({ name: 'paper.pdf', size: 100 }), (error) => {
    assert.match(error.message, /api-operation-upload-url/);
    assert.match(error.message, /403/);
    const diagnostic = formatErrorDiagnostic(error);
    assert.equal(JSON.parse(diagnostic).operation, 'upload-url');
    assert.equal(JSON.parse(diagnostic).failure, 'http');
    assert.ok(!diagnostic.includes('secret'));
    assert.ok(!error.message.includes('secret'));
    return true;
  });
  assert.equal(f.calls.length, 1);
});

test('transport distinguishes timeout, abort, network and synchronous setup failures', async () => {
  for (const [failure, reply] of [
    ['network', { networkError: true }],
    ['timeout', { timeout: true }],
    ['aborted', { aborted: true }],
    [
      'setup',
      {
        sendError: Object.assign(new Error(secret), {
          name: 'NS_ERROR_FAILURE',
          result: 2147500037,
        }),
      },
    ],
  ]) {
    const f = networkFixture([reply]);
    const { formatErrorDiagnostic } = f.load('src/api/request.ts');
    await assert.rejects(f.load('src/api/index.ts').getQuota(), (error) => {
      const diagnostic = JSON.parse(formatErrorDiagnostic(error));
      assert.equal(diagnostic.failure, failure);
      assert.equal(diagnostic.operation, 'quota');
      if (failure === 'setup') {
        assert.equal(diagnostic.exception, 'NS_ERROR_FAILURE');
        assert.equal(diagnostic.result, 2147500037);
      }
      assert.ok(!formatErrorDiagnostic(error).includes('secret'));
      assert.ok(!error.message.includes('secret'));
      return true;
    });
  }
});

test('storage failures expose only allowlisted XML codes', async () => {
  for (const code of ['SignatureDoesNotMatch', 'AccessDenied', 'UntrustedSecret']) {
    const f = networkFixture([
      { status: 403, body: `<Error><Code>${code}</Code><Message>${secret}</Message></Error>` },
    ]);
    const { formatErrorDiagnostic } = f.load('src/api/request.ts');
    await assert.rejects(
      f.load('src/api/index.ts').uploadPdf({
        upload: {
          key: 'key',
          method: 'PUT',
          url: 'https://storage.example/?signature=secret',
          headers: { 'content-type': 'application/pdf' },
        },
        file: new Uint8Array([37, 80, 68, 70]),
      }),
      (error) => {
        const diagnostic = JSON.parse(formatErrorDiagnostic(error));
        assert.equal(diagnostic.operation, 'upload');
        assert.equal(diagnostic.storageCode, code === 'UntrustedSecret' ? undefined : code);
        assert.ok(!error.message.includes('secret'));
        assert.ok(!formatErrorDiagnostic(error).includes('secret'));
        return true;
      },
    );
  }
});

test('uncertain submissions retain the original failure and the no-resubmission warning', () => {
  const load = loader({}, { 'src/utils/locale.ts': { getString: (key) => key } });
  const { ApiError } = load('src/api/request.ts');
  const { getSubmissionFailure } = load('src/modules/translate/task-diagnostics.ts');
  const failure = getSubmissionFailure(
    { submissionPending: true, submissionPhase: 'create' },
    new ApiError(0, '', 0, { operation: 'create', failure: 'timeout' }),
  );
  assert.equal(failure.status, 'uncertain');
  assert.match(failure.error, /api-submission-uncertain/);
  assert.match(failure.error, /timeout/);
  assert.equal(JSON.parse(failure.debugInfo).phase, 'create');
  assert.equal(JSON.parse(failure.debugInfo).submissionPending, true);
});

test('local exceptions and restored phase values cannot leak URLs or tokens', () => {
  const load = loader({}, { 'src/utils/locale.ts': { getString: (key) => key } });
  const { getSubmissionFailure } = load('src/modules/translate/task-diagnostics.ts');
  const failure = getSubmissionFailure(
    { submissionPhase: secret },
    Object.assign(new Error(secret), { name: secret }),
  );
  assert.equal(failure.status, 'failed');
  assert.equal(failure.error, 'api-request-failed');
  assert.equal(JSON.parse(failure.debugInfo).phase, 'unknown');
  assert.equal(JSON.parse(failure.debugInfo).exception, 'Error');
  assert.ok(!JSON.stringify(failure).includes('secret'));
});

test('known local validation errors remain actionable', () => {
  const load = loader({}, { 'src/utils/locale.ts': { getString: (key) => key } });
  const { getSubmissionFailure } = load('src/modules/translate/task-diagnostics.ts');
  const failure = getSubmissionFailure(
    { submissionPhase: 'persist' },
    new Error('api-persistence-failed'),
  );
  assert.equal(failure.error, 'api-persistence-failed');
});

test('task manager offers a copy/view diagnostic entry even without a server task ID', () => {
  const xhtml = fs.readFileSync(
    new URL('../addon/content/taskManager.xhtml', import.meta.url),
    'utf8',
  );
  const manager = fs.readFileSync(
    new URL('../src/modules/translate/task-manager.ts', import.meta.url),
    'utf8',
  );
  assert.match(xhtml, /id="copy-debug-info"/);
  assert.ok(manager.includes("addText(task.debugInfo, 'text/unicode')"));
  assert.ok(manager.includes('message: task.debugInfo'));
  for (const locale of ['zh-CN', 'en-US']) {
    const strings = fs.readFileSync(
      new URL(`../addon/locale/${locale}/taskManager.ftl`, import.meta.url),
      'utf8',
    );
    assert.match(strings, /copy-debug-info\s*=/);
  }
});
