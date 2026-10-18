import type { TranslationTaskData } from '../../types';
import type { Task } from '../../api';
import { formatErrorDiagnostic, retryDelay } from '../../api/request';
import { getPref } from '../../utils/prefs';
import { updateTaskInList } from './task-manager';
import { getString } from '../../utils/locale';

const ATTR_TAG = 'PutongDoc_translated';
const MAX_WAIT = 30 * 60 * 1000;

type MonitoredTask = {
  taskData: TranslationTaskData;
  parentItem?: Zotero.Item;
  startedAt: number;
  failures: number;
  nextPoll: number;
};

export const TranslationTaskMonitor = {
  activeTasks: new Map<string, MonitoredTask>(),
  pollingInterval: 5000,
  isPolling: false,
  nextReadAt: 0,

  addTask(pdfId: string, taskData: TranslationTaskData, parentItem?: Zotero.Item) {
    if (this.activeTasks.has(pdfId)) return;
    this.activeTasks.set(pdfId, {
      taskData,
      parentItem,
      startedAt: Date.now(),
      failures: 0,
      nextPoll: 0,
    });
    void this.startPolling();
  },

  async startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      while (addon.data.alive && this.activeTasks.size) {
        // Serialize reads across tasks to share the account's request budget.
        for (const [pdfId, entry] of this.activeTasks) {
          if (!addon.data.alive) break;
          if (Date.now() - entry.startedAt >= MAX_WAIT) {
            this.pause(pdfId, entry, getString('api-wait-timeout'));
            continue;
          }
          if (Date.now() < Math.max(entry.nextPoll, this.nextReadAt)) continue;
          await this.checkTaskProgress(pdfId, entry);
          await Zotero.Promise.delay(1000);
        }
        if (this.activeTasks.size) await Zotero.Promise.delay(1000);
      }
    } finally {
      this.isPolling = false;
    }
  },

  pause(pdfId: string, entry: MonitoredTask, message: string) {
    updateTaskInList(entry.taskData.attachmentId, { status: 'paused', error: message });
    this.activeTasks.delete(pdfId);
  },

  async checkTaskProgress(pdfId: string, entry: MonitoredTask) {
    const { taskData, parentItem } = entry;
    try {
      const task = await addon.api.getTranslateStatus({ pdfId });
      if (!addon.data.alive || !this.activeTasks.has(pdfId)) return;
      updateTaskInList(taskData.attachmentId, {
        status: 'translating',
        stage: task.status,
        progress: task.progress,
        error: '',
        debugInfo: '',
      });
      if (task.status === 'failed') {
        updateTaskInList(taskData.attachmentId, {
          status: 'failed',
          error: task.error?.message || task.error?.code || getString('api-task-failed'),
        });
        this.activeTasks.delete(pdfId);
        return;
      }
      if (task.status === 'completed') {
        const kinds =
          taskData.translateMode === 'all'
            ? (['compare', 'translated'] as const)
            : taskData.translateMode === 'dual'
              ? (['compare'] as const)
              : (['translated'] as const);
        if (kinds.every((kind) => typeof task.files[kind] === 'string' && task.files[kind])) {
          await downloadTranslateResult(task, taskData, parentItem);
          this.activeTasks.delete(pdfId);
          return;
        }
      }
      // progress=100 is NOT completion; completed files can still be unavailable.
      entry.failures = 0;
      entry.nextPoll = Date.now() + this.pollingInterval;
    } catch (error) {
      updateTaskInList(taskData.attachmentId, { debugInfo: formatErrorDiagnostic(error) });
      const delay = retryDelay(error, entry.failures++);
      if (delay !== null) {
        entry.nextPoll = Date.now() + delay;
        // Share rate-limit/backoff across all monitored tasks.
        this.nextReadAt = Math.max(this.nextReadAt, entry.nextPoll);
      } else {
        this.pause(pdfId, entry, (error as Error).message || getString('api-request-failed'));
      }
    }
  },
};

async function downloadTranslateResult(
  task: Task,
  taskData: TranslationTaskData,
  parentItem?: Zotero.Item,
) {
  updateTaskInList(taskData.attachmentId, { stage: 'downloading', progress: null });
  const kinds =
    taskData.translateMode === 'all'
      ? (['compare', 'translated'] as const)
      : taskData.translateMode === 'dual'
        ? (['compare'] as const)
        : (['translated'] as const);
  taskData.importedKinds ||= {};
  for (const kind of kinds) {
    const existing = taskData.importedKinds[kind];
    if (existing && Zotero.Items.get(existing)) continue;
    const fileUrl = task.files[kind];
    if (!fileUrl) throw new Error(getString('download-failed'));
    const attachment = await downloadAndProcessPdf({
      fileUrl,
      mode: kind === 'compare' ? 'dual' : 'translation',
      pdfId: task.id,
      title: getString(
        kind === 'compare' ? 'attachment-title-compare' : 'attachment-title-translated',
        { args: { title: task.title?.trim() || task.filename.replace(/\.pdf$/i, '') } },
      ),
      taskData,
      parentItem,
    });
    taskData.importedKinds[kind] = attachment.id;
    updateTaskInList(taskData.attachmentId, { importedKinds: { ...taskData.importedKinds } });
  }
  updateTaskInList(taskData.attachmentId, {
    status: 'success',
    stage: 'completed',
    progress: 100,
    error: '',
    resultAttachmentId: taskData.importedKinds.compare || taskData.importedKinds.translated,
  });
}

// Helper function to download and process a single PDF file
async function downloadAndProcessPdf({
  fileUrl,
  mode,
  pdfId,
  title,
  taskData,
  parentItem,
}: {
  fileUrl: string;
  mode: 'dual' | 'translation';
  pdfId: string;
  title: string;
  taskData: TranslationTaskData;
  parentItem?: Zotero.Item;
}) {
  if (!fileUrl) {
    throw new Error(`No download URL found for ${mode} mode (${taskData.attachmentFilename}).`);
  }

  const fileBuffer = await addon.api.downloadPdf(fileUrl);
  ztoolkit.log(
    `File downloaded for ${taskData.attachmentFilename} (${mode}, Size: ${fileBuffer.byteLength})`,
  );

  if (fileBuffer.byteLength === 0) {
    throw new Error(`Downloaded file is empty for ${taskData.attachmentFilename} (${mode}).`);
  }

  const originalFilename = taskData.attachmentFilename;
  const baseName = originalFilename.replace(/\.pdf$/i, '');
  const targetLanguage = taskData.targetLanguage;
  const fileName = `${baseName}_${targetLanguage}_${mode}.pdf`;

  const tempDir = PathUtils.tempDir || Zotero.getTempDirectory().path;
  const tempPath = PathUtils.join(tempDir, fileName);
  ztoolkit.log(`Writing downloaded file to temp path: ${tempPath}`);

  await IOUtils.write(tempPath, new Uint8Array(fileBuffer));

  ztoolkit.log(`Importing attachment to item: ${taskData.parentItemId}`);

  const attachment = await Zotero.Attachments.importFromFile({
    file: tempPath,
    parentItemID: taskData.parentItemId || undefined,
    collections: taskData.parentItemId
      ? undefined
      : Zotero.Items.get(taskData.attachmentId).getCollections(),
    libraryID: parentItem?.libraryID,
    title,
    contentType: 'application/pdf',
  });

  attachment.setTags([ATTR_TAG]);

  ztoolkit.log(
    `Attachment created (ID: ${attachment.id}) for ${taskData.attachmentFilename} (${mode})`,
  );

  await attachment.saveTx();

  if (getPref('autoOpenPDF')) {
    Zotero.Reader.open(attachment.id);
  }

  try {
    await IOUtils.remove(tempPath);
    ztoolkit.log(`Removed temporary file: ${tempPath}`);
  } catch (removeError: any) {
    ztoolkit.log(
      `WARNING: Failed to remove temporary file ${tempPath}:`,
      removeError.message || removeError,
    );
  }

  return attachment;
}
