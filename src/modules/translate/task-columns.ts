import { getString } from '../../utils/locale';

const taskColumns = [
  { dataKey: 'parentItemTitle', label: 'column-item', width: 320, minWidth: 240, flex: 3 },
  {
    dataKey: 'targetLanguage',
    label: 'column-target-language',
    width: 110,
    minWidth: 100,
    flex: 0,
  },
  { dataKey: 'status', label: 'column-status', width: 150, minWidth: 140, flex: 0 },
  { dataKey: 'stage', label: 'column-stage', width: 130, minWidth: 110, flex: 0 },
  { dataKey: 'progress', label: 'column-progress', width: 90, minWidth: 90, flex: 0 },
  { dataKey: 'error', label: 'column-error', width: 300, minWidth: 240, flex: 3 },
];

export const TASK_TABLE_MIN_WIDTH = taskColumns.reduce(
  (width, column) => width + column.minWidth,
  0,
);

export function getTaskColumns() {
  return taskColumns.map((column) => ({
    ...column,
    label: getString(column.label),
    fixedWidth: false,
  }));
}
