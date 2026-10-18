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
  phase('quota');
  const quota = await addon.api.getQuota();
  phase('read-file');
  const stat = await IOUtils.stat(taskData.attachmentPath);
  if (!stat.size || stat.size > quota.maxFileSize) throw new Error(getString('api-file-size'));
  if (
    quota.dailyUsedFiles >= quota.dailyFileQuota ||
    quota.dailyUsedPages >= quota.dailyPageQuota
  ) {
    throw new Error(getString('api-quota-exhausted'));
  }
  if (!getLanguages().some((code) => code === taskData.targetLanguage)) {
    throw new Error(getString('api-language-invalid'));
  }
  const file = await IOUtils.read(taskData.attachmentPath);
  if (file.byteLength !== stat.size) throw new Error(getString('api-file-changed'));
  phase('upload-url');
  const upload = await addon.api.getPdfUploadUrl({
    name: taskData.attachmentFilename,
    size: file.byteLength,
  });
  phase('upload');
  await addon.api.uploadPdf({ upload, file });

  // Persist BEFORE POST: a crash/timeout after submission must never re-create a task.
  phase('persist');
  taskData.submissionPending = true;
  updateTaskInList(taskData.attachmentId, { submissionPending: true, stage: 'preparing' });
  persistSubmissionState(taskData); // A failure here prevents the POST entirely.
  try {
    phase('create');
    const task = await addon.api.createTranslateTask({
      // Allowlist options so restored legacy tasks cannot reintroduce removed fields.
      extractBackend: options.extractBackend,
      key: upload.key,
      name: taskData.attachmentFilename,
      targetLanguage: taskData.targetLanguage,
    });
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
    // Only an explicit business rejection establishes that no task was created.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      taskData.submissionPending = false;
      updateTaskInList(taskData.attachmentId, { submissionPending: false });
      persistSubmissionState(taskData);
    }
    throw error;
  }
}
