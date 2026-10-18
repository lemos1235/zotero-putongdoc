import { getString } from '../utils/locale';

export const translateModes = [
  { label: 'translateMode-all', value: 'all' },
  { label: 'translateMode-dua', value: 'dual' },
  { label: 'translateMode-translation', value: 'translation' },
];
export const extractBackends = [
  { label: 'extract-native', value: 'native' },
  { label: 'extract-mineru', value: 'mineru' },
  { label: 'extract-zhipu', value: 'zhipu' },
];
export function getTranslateModeLabel(mode: string) {
  const label = translateModes.find((item) => item.value === mode)?.label;
  return label ? getString(label) : mode;
}
export function getExtractBackendLabel(backend?: string) {
  const label = extractBackends.find((item) => item.value === backend)?.label;
  return label ? getString(label) : backend || '-';
}
