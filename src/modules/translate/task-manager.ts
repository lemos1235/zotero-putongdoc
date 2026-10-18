import { isWindowAlive } from '../../utils/window';
import { config } from '../../../package.json';
import { getString } from '../../utils/locale';
import { saveTranslationData } from './persistence';
import { Status, TranslationTaskData } from '../../types';
import { Language } from '../language/types';
import { getLanguageName } from '../language';
import { showDialog } from '../../utils/dialog';
import { startQueueProcessing } from './task';
import { TranslationTaskMonitor, toLocalStatus } from './task-monitor';
import { ApiError } from '../../api/request';
import { ISSUES_URL } from '../../utils/const';
import { getTaskColumns, TASK_TABLE_MIN_WIDTH } from './task-columns';

/**
 * 显示翻译任务列表的弹窗
 */
export async function showTaskManager() {
  // 创建对话框
  if (isWindowAlive(addon.data.task.window)) {
    addon.data.task.window?.focus();
    refresh();
  } else {
    const windowArgs = {
      _initPromise: Zotero.Promise.defer(),
    };
    const win = Zotero.getMainWindow().openDialog(
      `chrome://${config.addonRef}/content/taskManager.xhtml`,
      `${config.addonRef}-taskManager`,
      `chrome,centerscreen,resizable,status,dialog=no,width=1200,height=640`,
      windowArgs,
    )!;
    await windowArgs._initPromise.promise;
    addon.data.task.window = win;
    const tableContainer = win.document.getElementById('table-container') as HTMLElement;
    tableContainer.style.setProperty('--task-table-min-width', `${TASK_TABLE_MIN_WIDTH}px`);
    tableContainer.addEventListener('mouseover', (event) => {
      const cell = (event.target as Element | null)?.closest?.('.cell, [role="gridcell"]');
      if (cell) cell.setAttribute('title', cell.textContent || '');
    });
    addon.data.task.tableHelper = new ztoolkit.VirtualizedTable(win!)
      .setContainerId('table-container')
      .setProp({
        id: 'manager-table',
        // Do not use setLocale, as it modifies the Zotero.Intl.strings
        // Set locales directly to columns
        columns: getTaskColumns(),
        containerWidth: Math.max(TASK_TABLE_MIN_WIDTH, tableContainer.clientWidth),
        showHeader: true,
        multiSelect: false,
        staticColumns: false,
        disableFontSizeScaling: true,
      })
      .setProp('getRowCount', () => addon.data.task.translationTaskList.length)
      .setProp('getRowData', (index) => {
        const task = addon.data.task.translationTaskList[index];
        return {
          progress: task.progress == null ? '-' : `${task.progress}%`,
          parentItemTitle: task.parentItemTitle || '-',
          targetLanguage: getLanguageName(task.targetLanguage, Zotero.locale as Language) || '',
          stage: getTaskStageText(task),
          error: task.error || '-',
          resultAttachmentId: task.resultAttachmentId?.toString() || '',
        };
      })
      .setProp('onActivate', () => {
        const tasks = getSelectedTasks();
        if (tasks.length > 0) {
          const task = tasks[0];
          if (task.pdfId) {
            new ztoolkit.Clipboard().addText(task.pdfId, 'text/unicode').copy();
            showDialog({
              title: getString('task-copy-success'),
            });
          }
        }
        return true;
      })
      .setProp(
        'getRowString',
        (index) => addon.data.task.translationTaskList[index].parentItemTitle || '',
      )
      .render();
    const refreshButton = win.document.querySelector('#refresh') as HTMLButtonElement;
    const copyPdfIdButton = win.document.querySelector('#copy-pdf-id') as HTMLButtonElement;
    const copyDebugInfoButton = win.document.querySelector('#copy-debug-info') as HTMLButtonElement;
    const cancelButton = win.document.querySelector('#cancel') as HTMLButtonElement;
    const viewPdfButton = win.document.querySelector('#view-pdf') as HTMLButtonElement;
    const retryButton = win.document.querySelector('#retry') as HTMLButtonElement;
    const feedbackButton = win.document.querySelector('#feedback') as HTMLButtonElement;
    const clearButton = win.document.querySelector('#clearQueue') as HTMLButtonElement;
    copyDebugInfoButton.addEventListener('click', () => {
      const task = getSelectedTasks()[0];
      if (!task) {
        showDialog({ title: getString('task-select-tip') });
        return;
      }
      if (!task.debugInfo) {
        showDialog({ title: getString('task-debug-empty') });
        return;
      }
      new ztoolkit.Clipboard().addText(task.debugInfo, 'text/unicode').copy();
      showDialog({ title: getString('task-debug-copied'), message: task.debugInfo });
    });
    clearButton.addEventListener('click', (ev) => {
      addon.data.task.translationGlobalQueue = [];
      addon.data.task.translationTaskList = [];
      saveTranslationData();
      refresh();
    });
    viewPdfButton.addEventListener('click', (ev) => {
      const tasks = getSelectedTasks();
      if (tasks.length > 0) {
        const task = tasks[0];
        if (task.resultAttachmentId) {
          const resultAttachment = Zotero.Items.get(task.resultAttachmentId);
          if (resultAttachment) {
            Zotero.Reader.open(resultAttachment.id);
          }
        } else {
          showDialog({
            title: getString('task-uncomplete'),
          });
        }
      } else {
        showDialog({
          title: getString('task-select-tip'),
        });
      }
    });

    retryButton.addEventListener('click', async (ev) => {
      const tasks = getSelectedTasks();
      if (tasks.length === 0) {
        showDialog({
          title: getString('task-select-tip'),
        });
        return;
      }
      const task = tasks[0];
      if (task.status === 'uncertain' || (!task.pdfId && task.submissionPending)) {
        showDialog({ title: getString('api-submission-uncertain') });
        return;
      }
      // 已失败且已提交到服务端的任务走重试接口，而不是重新上传创建任务。
      if (task.status === 'failed' && task.pdfId) {
        const parentItem = task.parentItemId ? Zotero.Items.get(task.parentItemId) : undefined;
        const latest =
          addon.data.task.translationTaskList.find(
            (item) => item.attachmentId === task.attachmentId,
          ) || task;
        try {
          const remote = await addon.api.retryTranslateTask({ pdfId: task.pdfId });
          updateTaskInList(task.attachmentId, {
            status: toLocalStatus(remote.status),
            stage: remote.status,
            progress: remote.progress,
            error: '',
            debugInfo: '',
          });
          TranslationTaskMonitor.addTask(task.pdfId, latest, parentItem);
          refresh();
          showDialog({
            title: getString('task-retry-success'),
          });
        } catch (error) {
          // 超时或断连时重试可能已经生效：重新查询状态，避免误报失败。
          const uncertain =
            error instanceof ApiError && (error.status === 0 || error.status >= 500);
          if (uncertain) TranslationTaskMonitor.addTask(task.pdfId!, latest, parentItem);
          showDialog({
            title: getString(uncertain ? 'task-retry-uncertain' : 'task-retry-failed'),
            message: error instanceof Error ? error.message : undefined,
          });
        }
        return;
      }
      if (task.status === 'failed' || task.status === 'paused') {
        // Update task status to queued
        updateTaskInList(task.attachmentId, {
          status: 'queued',
          error: '',
          debugInfo: '',
        });

        // Add back to the global queue if not already there
        if (
          !addon.data.task.translationGlobalQueue.some((t) => t.attachmentId === task.attachmentId)
        ) {
          addon.data.task.translationGlobalQueue.unshift(task);
        }

        startQueueProcessing();
        refresh();

        showDialog({
          title: getString('task-retry-success'),
        });
      } else {
        showDialog({
          title: getString('task-retry-tip'),
        });
      }
    });

    feedbackButton.addEventListener('click', (ev) => {
      const tasks = getSelectedTasks();
      if (tasks.length > 0) {
        Zotero.launchURL(ISSUES_URL);
      } else {
        showDialog({
          title: getString('task-select-tip'),
        });
      }
    });

    refreshButton.addEventListener('click', (ev) => {
      refresh();
    });
    copyPdfIdButton.addEventListener('click', (ev) => {
      const tasks = getSelectedTasks();
      if (tasks.length > 0) {
        const task = tasks[0];
        if (task.pdfId) {
          new ztoolkit.Clipboard().addText(task.pdfId, 'text/unicode').copy();
          showDialog({
            title: getString('task-copy-success'),
          });
        }
      } else {
        showDialog({
          title: getString('task-select-tip'),
        });
      }
    });
    cancelButton.addEventListener('click', async (ev) => {
      const tasks = getSelectedTasks();
      if (tasks.length === 0) {
        showDialog({
          title: getString('task-select-tip'),
        });
        return;
      }
      const task = tasks[0];
      // 服务端仅在 preparing/queued 阶段允许取消；本地尚未提交的任务直接取消。
      const cancelable = task.pdfId
        ? task.stage === 'preparing' || task.stage === 'queued'
        : task.status === 'queued';
      if (!cancelable) {
        showDialog({
          title: getString('task-cancel-tip'),
        });
        return;
      }
      try {
        if (task.pdfId) await addon.api.cancelTranslateTask({ pdfId: task.pdfId });
        cancelTask(task);
        refresh();
        showDialog({
          title: getString('task-cancel-success'),
        });
      } catch (error) {
        const running = error instanceof ApiError && error.key === 'error_delete_running';
        showDialog({
          title: getString(running ? 'task-cancel-running' : 'task-cancel-failed'),
          message: error instanceof Error ? error.message : undefined,
        });
      }
    });
    createWindowBoundInterval(
      () => {
        refresh();
      },
      500,
      win,
    );
  }
}

async function updateTable() {
  const keys = addon.data.task.tableHelper?.treeInstance.selection.selected?.keys() || [];
  let id = undefined;
  for (const key of keys) {
    id = key;
  }
  return new Promise<void>((resolve) => {
    addon.data.task.tableHelper?.render(id, (_: any) => {
      resolve();
    });
  });
}

async function refresh() {
  await updateTable();
}

// Helper function to update a task in the translationTaskList
export function updateTaskInList(attachmentId: number, updates: Partial<TranslationTaskData>) {
  if (!addon.data.task.translationTaskList) return;

  // Find the task from the end of the array (most recent task) - simple approach
  let taskIndex = -1;
  for (let i = addon.data.task.translationTaskList.length - 1; i >= 0; i--) {
    if (addon.data.task.translationTaskList[i].attachmentId === attachmentId) {
      taskIndex = i;
      break;
    }
  }

  if (taskIndex !== -1) {
    addon.data.task.translationTaskList[taskIndex] = {
      ...addon.data.task.translationTaskList[taskIndex],
      ...updates,
    };
  }

  // Call saveTranslationData after updating the task list
  saveTranslationData();
}

function getSelectedTasks() {
  const keys = addon.data.task.tableHelper?.treeInstance.selection.selected?.keys() || [];
  const datas = [];
  for (const key of keys) {
    const data = addon.data.task.translationTaskList[key];
    datas.push(data);
  }
  return datas;
}

function cancelTask(task: TranslationTaskData) {
  updateTaskInList(task.attachmentId, {
    status: 'canceled',
  });
  const queuedIndex = addon.data.task.translationGlobalQueue.findIndex(
    (t) => t.attachmentId === task.attachmentId,
  );
  if (queuedIndex !== -1) addon.data.task.translationGlobalQueue.splice(queuedIndex, 1);
  // 已提交到服务端的任务：停止轮询，避免状态被下一次轮询覆盖回 translating。
  if (task.pdfId) TranslationTaskMonitor.removeTask(task.pdfId);
  saveTranslationData();
}

/**
 * Creates a recurring interval that automatically cleans up when the window is closed
 * @param callback Function to execute at each interval
 * @param delay Time in milliseconds between executions
 * @param window Window to attach the interval to
 * @returns Interval ID that can be used with clearInterval if needed
 */
export function createWindowBoundInterval(
  callback: () => void,
  delay: number,
  window: Window,
): ReturnType<typeof setInterval> {
  const intervalId = setInterval(callback, delay);

  // Add unload listener to clean up the interval when the window closes
  window.addEventListener(
    'unload',
    () => {
      clearInterval(intervalId);
    },
    { once: true },
  );

  return intervalId;
}

function getStatusText(status?: string) {
  const statusMap: Record<string, string> = {
    queued: getString('task-status-queued'),
    uploading: getString('task-status-uploading'),
    translating: getString('task-status-translating'),
    success: getString('task-status-success'),
    failed: getString('task-status-failed'),
    paused: getString('task-status-paused'),
    uncertain: getString('task-status-uncertain'),
    canceled: getString('task-status-canceled'),
  };

  if (!status) return '';

  return statusMap[status];
}

function getStageText(stage?: string) {
  if (!stage) return '';
  const translationMap: { [key: string]: string } = {
    queued: getString('task-stage-queued'),
    preparing: getString('task-stage-preparing'),
    extracting: getString('task-stage-extracting'),
    translating: getString('task-stage-translating'),
    rendering: getString('task-stage-rendering'),
    archiving: getString('task-stage-archiving'),
    uploading: getString('task-stage-uploading'),
    downloading: getString('task-stage-downloading'),
    completed: getString('task-stage-completed'),
    'Parse PDF and Create Intermediate Representation': getString('task-stage-parse-pdf'),
    DetectScannedFile: getString('task-stage-DetectScannedFile'),
    'Parse Page Layout': getString('task-stage-ParseLayout'),
    'Parse Paragraphs': getString('task-stage-ParseParagraphs'),
    'Parse Formulas and Styles': getString('task-stage-ParseFormulasAndStyles'),
    'Remove Char Descent': getString('task-stage-RemoveCharDescent'),
    'Translate Paragraphs': getString('task-stage-TranslateParagraphs'),
    Typesetting: getString('task-stage-Typesetting'),
    'Add Fonts': getString('task-stage-AddFonts'),
    'Generate drawing instructions': getString('task-stage-GenerateDrawingInstructions'),
    'Subset font': getString('task-stage-SubsetFont'),
    'Save PDF': getString('task-stage-SavePDF'),
    'prepare file download': getString('task-stage-prepareFileDownload'),
    'Prepare File Download': getString('task-stage-SavePDF'),
    'Parse Table': getString('task-stage-ParseTable'),
    'Waiting in line': getString('task-stage-WaitingInLine'),
    'Create Task': getString('task-stage-CreateTask'),
  };

  return translationMap[stage] || stage;
}

/**
 * 「当前阶段」列展示文本：本地终态/异常态优先，其余展示服务端阶段，
 * 都没有时回退到本地任务状态（如尚未提交的排队任务）。
 */
function getTaskStageText(task: TranslationTaskData) {
  const localStates: Status[] = ['failed', 'paused', 'uncertain', 'canceled'];
  if (task.status && localStates.includes(task.status)) {
    return getStatusText(task.status);
  }
  return getStageText(task.stage) || getStatusText(task.status) || '';
}
