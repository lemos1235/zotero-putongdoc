import type { TranslationTaskData } from '../../types';
import type { CreateTranslation } from '../../api';
import { ApiError } from '../../api/request';
import { getPref } from '../../utils/prefs';
import { getString } from '../../utils/locale';
import { updateTaskInList } from './task-manager';
import { TranslationTaskMonitor, toLocalStatus } from './task-monitor';
import { persistSubmissionState } from './persistence';
import { getLanguages } from '../language';

export function getTranslationOptions(): NonNullable<TranslationTaskData['options']> {
  const backend = getPref('extractBackend');
  if (!['native', 'mineru', 'zhipu'].includes(backend)) {
    throw new Error(getString('api-options-invalid'));
  }
  return {
    extractBackend: backend as CreateTranslation['extractBackend'],
  };
}

export async function translatePDF(
  taskData: TranslationTaskData,
  parentItem?: Zotero.Item,
): Promise<void> {
  const phase = (submissionPhase: TranslationTaskData['submissionPhase']) => {
    taskData.submissionPhase = submissionPhase;
  };
  updateTaskInList(taskData.attachmentId, {
    status: 'uploading',
    stage: 'uploading',
    progress: null,
    error: '',
    debugInfo: '',
  });
  phase('validation');
  const options = taskData.options || getTranslationOptions();
  if (!taskData.attachmentPath || !/\.pdf$/i.test(taskData.attachmentFilename)) {
    throw new Error(getString('api-pdf-invalid'));
  }
  // Size, daily quota and concurrency are pre-checked per batch; the server has the final say.
  phase('read-file');
  const stat = await IOUtils.stat(taskData.attachmentPath);
  if (!stat.size) throw new Error(getString('api-file-size'));
  if (!getLanguages().some((code) => code === taskData.targetLanguage)) {
    throw new Error(getString('api-language-invalid'));
  }
  const file = await IOUtils.read(taskData.attachmentPath);
  if (file.byteLength !== stat.size) throw new Error(getString('api-file-changed'));
  phase('upload-url');
  const upload = await retryRateLimited(taskData, () =>
    addon.api.getPdfUploadUrl({
      name: taskData.attachmentFilename,
      size: file.byteLength,
    }),
  );
  phase('upload');
  await addon.api.uploadPdf({ upload, file });
  if (isCanceled(taskData)) throw new TaskCanceledError();

  // Persist BEFORE POST: a crash/timeout after submission must never re-create a task.
  phase('persist');
  taskData.submissionPending = true;
  updateTaskInList(taskData.attachmentId, { submissionPending: true, stage: 'preparing' });
  persistSubmissionState(taskData); // A failure here prevents the POST entirely.
  try {
    phase('create');
    const task = await retryRateLimited(taskData, () =>
      addon.api.createTranslateTask({
        // Allowlist options so restored legacy tasks cannot reintroduce removed fields.
        extractBackend: options.extractBackend,
        key: upload.key,
        name: taskData.attachmentFilename,
        targetLanguage: taskData.targetLanguage,
      }),
    );
    if (!task.id) throw new Error(getString('api-submission-uncertain'));
    taskData.pdfId = task.id;
    taskData.submissionPending = false;
    updateTaskInList(taskData.attachmentId, {
      pdfId: task.id,
      submissionPending: false,
      status: toLocalStatus(task.status),
      stage: task.status,
      progress: task.progress,
    });
    phase('persist-id');
    persistSubmissionState(taskData);
    phase('monitor');
    TranslationTaskMonitor.addTask(task.id, taskData, parentItem);
  } catch (error) {
    // Only an explicit business rejection establishes that no task was created;
    // cancellation here only happens after a rate-limited (rejected) POST.
    if (
      error instanceof TaskCanceledError ||
      (error instanceof ApiError && error.status >= 400 && error.status < 500)
    ) {
      taskData.submissionPending = false;
      updateTaskInList(taskData.attachmentId, { submissionPending: false });
      persistSubmissionState(taskData);
    }
    throw error;
  }
}

/** The user canceled the task locally before it was created on the server. */
export class TaskCanceledError extends Error {}

function isCanceled(taskData: TranslationTaskData): boolean {
  // Same lookup as updateTaskInList: the most recent entry for this attachment.
  const tasks = addon.data.task.translationTaskList;
  for (let i = tasks.length - 1; i >= 0; i--) {
    if (tasks[i].attachmentId === taskData.attachmentId) return tasks[i].status === 'canceled';
  }
  return false;
}

/**
 * A rate-limited write was rejected before taking effect, so it is safe to resend.
 * Quota/concurrency 429s are final and are rethrown immediately.
 * The wait is capped because the submission queue is serial.
 */
async function retryRateLimited<T>(
  taskData: TranslationTaskData,
  send: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      const limited =
        error instanceof ApiError && error.status === 429 && error.key === 'error_rate_limited';
      if (!limited || attempt >= 2 || !addon.data.alive) throw error;
      await Zotero.Promise.delay(
        Math.min(30000, Math.max(error.retryAfter, 1000 * 2 ** attempt)) + Math.random() * 1000,
      );
      if (isCanceled(taskData)) throw new TaskCanceledError();
    }
  }
}
