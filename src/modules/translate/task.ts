import { saveTranslationData } from './persistence';
import { showTaskManager, updateTaskInList } from './task-manager';
import type { TranslationTaskData } from '../../types';
import type { Quota } from '../../api';
import { getPref } from '../../utils/prefs';
import { showConfirmationDialog } from './confirm-dialog';
import { translatePDF, getTranslationOptions, TaskCanceledError } from './translate';
import { TranslationTaskMonitor } from './task-monitor';
import { getString } from '../../utils/locale';
import { showDialog } from '../../utils/dialog';
import { Language } from '../language/types';
import { getSubmissionFailure } from './task-diagnostics';

const ATTR_TAG = 'PutongDoc_translated';

/**
 * Check if attachment is already in the translation task list
 */
export function isAttachmentInTaskList(attachmentId: number): boolean {
  return !!addon.data.task.translationTaskList?.find(
    (task) =>
      task.attachmentId === attachmentId &&
      !['success', 'failed', 'canceled'].includes(task.status || ''),
  );
}

type ConfirmationArticleInfo = {
  count: number;
  title?: string;
  metadata?: string;
};

async function fetchQuota(): Promise<Quota | null> {
  try {
    return await addon.api.getQuota();
  } catch (error) {
    showDialog({ title: getString('pref-test-failed'), message: (error as Error).message });
    return null;
  }
}

export async function addTasksToQueue() {
  const quota = await fetchQuota();
  if (!quota) {
    return;
  }

  try {
    const tasks = await getTranslationTasks();
    if (tasks.length && !(await checkBatchLimits(tasks, quota))) {
      return;
    }
    await addTasksToQueueFromTasks(tasks);
  } catch (error) {
    showDialog({ title: getString('pref-test-failed'), message: (error as Error).message });
  }
}

/**
 * Reject the whole batch up front, matching the web uploader: no local waiting for slots.
 * The server still has the final say (429) since other clients share the same slots.
 */
export async function checkBatchLimits(
  tasks: TranslationTaskData[],
  quota: Quota,
): Promise<boolean> {
  const invalid: string[] = [];
  for (const task of tasks) {
    try {
      const { size } = await IOUtils.stat(task.attachmentPath);
      if (!size || size > quota.maxFileSize) invalid.push(task.attachmentFilename);
    } catch {
      // Gecko errors embed local paths; report only the filename.
      invalid.push(task.attachmentFilename);
    }
  }
  if (invalid.length) {
    showDialog({ title: getString('api-file-size'), message: invalid.join('\n') });
    return false;
  }
  return checkAccountLimits(tasks, quota);
}

/**
 * Synchronous so that, run with a fresh quota and right before enqueueing (no await in
 * between), concurrent local submissions see each other's queued tasks. Tasks created on
 * the server while the quota request was in flight may still be missed; the server's
 * 429 covers that.
 */
export function checkAccountLimits(tasks: TranslationTaskData[], quota: Quota): boolean {
  // Locally queued tasks are not on the server yet but will each take a slot and a file.
  const pending = addon.data.task.translationTaskList.filter(
    (task) =>
      !task.pdfId && !task.submissionPending && ['queued', 'uploading'].includes(task.status || ''),
  ).length;

  // Pages are only known after server parsing, so only an exhausted page quota is certain.
  const files = Math.max(0, quota.dailyFileQuota - quota.dailyUsedFiles - pending);
  if (tasks.length > files || quota.dailyUsedPages >= quota.dailyPageQuota) {
    showDialog({
      title: getString('api-quota-exhausted'),
      message:
        quota.dailyUsedPages >= quota.dailyPageQuota
          ? undefined
          : getString('task-daily-quota-exceeded', { args: { files, count: tasks.length } }),
    });
    return false;
  }

  if (!Number.isFinite(quota.activeTasks)) return true; // Older server: rely on its 429.
  const active = quota.activeTasks + pending;
  const remaining = Math.max(0, quota.concurrencyLimit - active);
  if (tasks.length > remaining) {
    showDialog({
      title: getString('api-error-quota-concurrency'),
      message: getString('task-concurrency-exceeded', {
        args: { active, limit: quota.concurrencyLimit, remaining, count: tasks.length },
      }),
    });
    return false;
  }
  return true;
}

async function addTasksToQueueFromTasks(selectedTasks: TranslationTaskData[]) {
  if (selectedTasks.length === 0) {
    ztoolkit.log('No valid PDF attachments found to add to the queue.');
    showDialog({
      title: getString('task-no-pdf'),
    });
    return;
  }
  const translateMode = getPref('translateMode');
  const targetLanguage = getPref('targetLanguage') as Language;
  const confirmResult = await showConfirmationDialog(getConfirmationArticleInfo(selectedTasks));
  if (confirmResult.action === 'cancel') {
    return;
  }
  // The dialog may stay open for a while: refresh the quota and re-check right before enqueueing.
  const quota = await fetchQuota();
  if (!quota) {
    return;
  }
  // No await from here to the push below, so another batch cannot slip in between.
  // Drop attachments that another batch queued while the dialog was open.
  const tasksToQueue = selectedTasks.filter((task) => !isAttachmentInTaskList(task.attachmentId));
  if (tasksToQueue.length === 0 || !checkAccountLimits(tasksToQueue, quota)) {
    return;
  }

  tasksToQueue.forEach((task) => {
    task.translateMode = confirmResult.data?.translateMode || translateMode;
    task.options = getTranslationOptions();
    task.options.extractBackend = confirmResult.data?.extractBackend as
      'native' | 'mineru' | 'zhipu';
    task.targetLanguage = confirmResult.data?.targetLanguage || targetLanguage;
  });
  ztoolkit.log(`Adding ${tasksToQueue.length} translation tasks to the queue.`);
  addon.data.task.translationGlobalQueue.push(...tasksToQueue); // Add new tasks

  // Deep clone the tasks to translationTaskList for tracking
  if (!addon.data.task.translationTaskList) {
    addon.data.task.translationTaskList = [];
  }
  const clonedTasks = tasksToQueue.map((task) => JSON.parse(JSON.stringify(task)));
  addon.data.task.translationTaskList.push(...clonedTasks);

  // Save the updated queues
  saveTranslationData();

  startQueueProcessing();
}

// get translation tasks from selected items
async function getTranslationTasks(): Promise<TranslationTaskData[]> {
  const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
  const tasks: TranslationTaskData[] = [];

  for (const item of selectedItems) {
    try {
      const itemTasks = await processItemForTranslation(item);
      tasks.push(...itemTasks);
    } catch (error) {
      ztoolkit.log(`Error processing selected item ${item.id}:`, error);
      continue;
    }
  }

  ztoolkit.log('Found tasks (after refined deduplication):', tasks);
  return tasks;
}

function getConfirmationArticleInfo(tasksToQueue: TranslationTaskData[]): ConfirmationArticleInfo {
  const firstTask = tasksToQueue[0];
  const uniqueParentIds = new Set(
    tasksToQueue
      .map((task) => task.parentItemId || task.attachmentId)
      .filter((id): id is number => typeof id === 'number'),
  );
  const parentItem = firstTask?.parentItemId ? Zotero.Items.get(firstTask.parentItemId) : undefined;
  const title = firstTask?.parentItemTitle || firstTask?.attachmentFilename;
  const metadataParts = [];
  if (parentItem?.firstCreator) {
    metadataParts.push(parentItem.firstCreator);
  }
  const date = parentItem?.getField('date', true, true) as string | undefined;
  const year = date?.substring(0, 4);
  if (year && year !== '0000') {
    metadataParts.push(year);
  }

  return {
    count: uniqueParentIds.size || tasksToQueue.length,
    title,
    metadata: metadataParts.join(' · '),
  };
}

// 处理单个条目，提取其中的PDF附件并创建翻译任务
async function processItemForTranslation(item: Zotero.Item): Promise<TranslationTaskData[]> {
  const tasks: TranslationTaskData[] = [];
  let parentItem: Zotero.Item | null = null;
  const attachmentsToProcess: Zotero.Item[] = [];

  if (item.isRegularItem()) {
    parentItem = item;
    const attachmentIds = item.getAttachments(false);
    // 只处理PDF附件
    for (const attachmentId of attachmentIds) {
      const attachment = Zotero.Items.get(attachmentId);
      if (shouldSkipAttachment(attachment)) {
        continue;
      }
      if (attachment && attachment.isPDFAttachment()) {
        attachmentsToProcess.push(attachment);
      }
    }
  } else if (item.isPDFAttachment()) {
    if (shouldSkipAttachment(item)) {
      return tasks;
    }
    const parentItemId = item.parentItemID;

    if (parentItemId) {
      const potentialParent = Zotero.Items.get(parentItemId);
      if (potentialParent && potentialParent.isRegularItem()) {
        parentItem = potentialParent;
        attachmentsToProcess.push(item);
      } else {
        ztoolkit.log(`Attachment ${item.id} has no valid parent item, skipping.`);
        return tasks;
      }
    } else {
      attachmentsToProcess.push(item);
    }
  }

  for (const attachment of attachmentsToProcess) {
    const task = await createTranslationTask(attachment, parentItem);
    if (task) {
      tasks.push(task);
    }
  }

  return tasks;
}

// 检查附件是否应该跳过
export function shouldSkipAttachment(attachment: Zotero.Item): boolean {
  const hasTranslatedTag = attachment.getTags().find((tagItem) => tagItem.tag === ATTR_TAG);
  const hasNameSuffix =
    attachment.attachmentFilename?.endsWith('_dual.pdf') ||
    attachment.attachmentFilename?.endsWith('_translation.pdf');
  if (hasTranslatedTag || hasNameSuffix) {
    ztoolkit.log(`Attachment ${attachment.id} is already a translation result, skipping.`);
    return true;
  }
  return false;
}

// 为单个附件创建翻译任务
async function createTranslationTask(
  attachment: Zotero.Item,
  parentItem: Zotero.Item | null,
): Promise<TranslationTaskData | null> {
  const attachmentId = attachment.id;
  const attachmentFilename = attachment.attachmentFilename || `Attachment ${attachmentId}`;

  // Check attachment is already in the translation task list?
  const isInTaskList = isAttachmentInTaskList(attachmentId);
  // TODO 检查是否是已成功的翻译任务，给予提示
  // 1. 在 tasklist 中，并且状态是成功
  // 2. 有同名称的带 PutongDoc tag 的翻译结果附件
  if (isInTaskList) {
    ztoolkit.log(
      `Attachment ${attachmentId} (${attachmentFilename}) is already in the translation task list, skipping.`,
    );
    return null;
  }
  // --- End Deduplication Checks ---

  // Proceed only if not deduplicated
  const exists = await attachment.fileExists();
  if (!exists) {
    ztoolkit.log(`Attachment file does not exist for ${attachmentId}, skipping.`);
    return null;
  }

  const filePath = await attachment.getFilePathAsync();
  if (!filePath || !attachmentFilename) {
    ztoolkit.log(`Could not get path or valid filename for attachment ${attachmentId}, skipping.`);
    return null;
  }

  const translateMode = getPref('translateMode');
  const targetLanguage = getPref('targetLanguage') as Language;

  return {
    parentItemId: parentItem?.id,
    parentItemTitle: parentItem?.getField('title'),
    attachmentId: attachmentId,
    attachmentFilename: attachmentFilename,
    attachmentPath: filePath,
    status: 'queued',
    targetLanguage: targetLanguage,
    translateMode: translateMode,
  };
}

export async function startQueueProcessing() {
  if (addon.data.task.isQueueProcessing || addon.data.task.translationGlobalQueue.length === 0) {
    return; // Already running or queue empty
  }
  showTaskManager();
  addon.data.task.isQueueProcessing = true;
  ztoolkit.log('Starting queue processing loop.');
  // Use Zotero.Promise.delay(0).then() to avoid deep recursion and yield
  Zotero.Promise.delay(0).then(processNextItem);
}

async function processNextItem() {
  if (!addon.data.alive || addon.data.task.translationGlobalQueue.length === 0) {
    addon.data.task.isQueueProcessing = false;
    ztoolkit.log('Translation queue empty. Stopping processing loop.');
    saveTranslationData(); // Save the empty queue state
    return;
  }

  // Rename queueItem to taskData for clarity
  const taskData = addon.data.task.translationGlobalQueue.shift();

  // Save queue state after removing an item
  saveTranslationData();

  if (!taskData) {
    Zotero.Promise.delay(0).then(processNextItem);
    return;
  }

  // Get the parent item using parentItemId from taskData
  const parentItem = taskData.parentItemId ? Zotero.Items.get(taskData.parentItemId) : undefined;

  ztoolkit.log(
    `Processing task for attachment: ${taskData.attachmentFilename} (Parent: ${taskData.parentItemTitle}, ID: ${taskData.parentItemId})`,
  );

  try {
    // 如果任务已经有pdfId，说明是程序重启后恢复的任务，并且已经创建了翻译任务
    if (taskData.pdfId) {
      ztoolkit.log(
        `恢复已有pdfId(${taskData.pdfId})的任务: ${taskData.attachmentFilename}，直接进入监控阶段`,
      );
      // 本地状态由首次轮询按服务端返回更新，避免排队中的任务短暂显示为翻译中
      TranslationTaskMonitor.addTask(taskData.pdfId, taskData, parentItem);
    } else if (taskData.submissionPending || taskData.status === 'uncertain') {
      updateTaskInList(taskData.attachmentId, {
        status: 'uncertain',
        error: getString('api-submission-uncertain'),
      });
    } else {
      // 常规流程 - 从上传开始
      await translatePDF(taskData, parentItem);
      ztoolkit.log(
        `Initiated processing for: ${taskData.attachmentFilename}. Moving to next queue item.`,
      );
    }
  } catch (error: unknown) {
    if (error instanceof TaskCanceledError) {
      ztoolkit.log(`Submission canceled: ${taskData.attachmentFilename}`);
      return;
    }
    const failure = getSubmissionFailure(taskData, error);
    ztoolkit.log('PutongDoc submission failed:', failure.debugInfo);
    updateTaskInList(taskData.attachmentId, failure);
  } finally {
    Zotero.Promise.delay(0).then(processNextItem);
  }
}
