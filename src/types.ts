import type { CreateTranslation } from './api';

export type Status =
  | 'uploading'
  | 'queued'
  | 'translating'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'paused'
  | 'uncertain';
export type Stage = 'queued' | 'processing' | 'success' | 'failed';

export type TranslationTaskData = {
  parentItemId?: number;
  parentItemTitle?: string;
  attachmentId: number;
  attachmentFilename: string;
  attachmentPath: string;
  targetLanguage: string;
  translateMode: string;
  options?: Omit<CreateTranslation, 'key' | 'name' | 'targetLanguage'>;
  pdfId?: string;
  status?: Status;
  stage?: string;
  progress?: number | null;
  error?: string;
  debugInfo?: string;
  submissionPhase?:
    | 'validation'
    | 'quota'
    | 'read-file'
    | 'upload-url'
    | 'upload'
    | 'persist'
    | 'create'
    | 'persist-id'
    | 'monitor';
  submissionPending?: boolean;
  importedKinds?: Partial<Record<'translated' | 'compare', number>>;
  resultAttachmentId?: number;
};
