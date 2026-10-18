import { saveTranslationData } from './persistence';
import { showTaskManager, updateTaskInList } from './task-manager';
import type { TranslationTaskData } from '../../types';
import { getPref } from '../../utils/prefs';
import { showConfirmationDialog } from './confirm-dialog';
import { translatePDF, getTranslationOptions } from './translate';
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

async function validateTranslationAuth(): Promise<boolean> {
  try {
    await addon.api.getQuota();
    return true;
  } catch (error) {
    showDialog({ title: getString('pref-test-failed'), message: (error as Error).message });
    return false;
  }
}

export async function addTasksToQueue() {
  if (!(await validateTranslationAuth())) {
    return;
  }

  try {
    await addTasksToQueueFromTasks(await getTranslationTasks());
  } catch (error) {
    showDialog({ title: getString('pref-test-failed'), message: (error as Error).message });
  }
}

async function addTasksToQueueFromTasks(tasksToQueue: TranslationTaskData[]) {
  if (tasksToQueue.length === 0) {
    ztoolkit.log('No valid PDF attachments found to add to the queue.');
    showDialog({
      title: getString('task-no-pdf'),
    });
    return;
  }
  const translateMode = getPref('translateMode');
  const targetLanguage = getPref('targetLanguage') as Language;
  const confirmResult = await showConfirmationDialog(getConfirmationArticleInfo(tasksToQueue));
  if (confirmResult.action === 'cancel') {
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
      updateTaskInList(taskData.attachmentId, {
        status: 'translating',
      });
      // 直接启动监控任务
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
    const failure = getSubmissionFailure(taskData, error);
    ztoolkit.log('PutongDoc submission failed:', failure.debugInfo);
    updateTaskInList(taskData.attachmentId, failure);
  } finally {
    Zotero.Promise.delay(0).then(processNextItem);
  }
}
