import { request } from './request';

// Transitional contracts for the existing UI; no network calls are made.
// Replace these contracts when implementing the PutongDoc /api/v1 adapter.
type UploadUrlResponse = {
  result: {
    objectKey: string;
    preSignedURL: string;
  };
};

type CreateTranslateTaskRequest = {
  objectKey: string;
  pdfOptions: { conversion_formats: { html: boolean } };
  fileName: string;
  targetLanguage: string;
  requestModel: string;
  enhance_compatibility: boolean;
  OCRWorkaround: boolean;
  autoEnableOcrWorkAround: boolean;
  autoExtractGlossary: boolean;
  disable_rich_text_translate: boolean;
  primaryFontFamily: string;
  dual_mode: string;
  customSystemPrompt: string | null;
  layout_model_id: string;
};

type TranslateStatusResponse = {
  overall_progress: number;
  currentStageName: string;
  status: string;
  message: string;
};

type TranslateResultResponse = {
  translationOnlyPdfOssUrl: string;
  translationDualPdfOssUrl: string;
};

export function checkAuthKey(_params: { apiKey: string }): Promise<boolean> {
  return request();
}

export function getPdfUploadUrl(): Promise<UploadUrlResponse> {
  return request();
}

export function uploadPdf(_data: { uploadUrl: string; file: File }): Promise<ArrayBuffer> {
  return request();
}

export function downloadPdf(_url: string): Promise<ArrayBuffer> {
  return request();
}

export function createTranslateTask(_data: CreateTranslateTaskRequest): Promise<string> {
  return request();
}

export function getTranslateStatus(_data: { pdfId: string }): Promise<TranslateStatusResponse> {
  return request();
}

export function getTranslatePdfResult(_data: { pdfId: string }): Promise<TranslateResultResponse> {
  return request();
}

export default {
  checkAuthKey,
  getPdfUploadUrl,
  createTranslateTask,
  getTranslateStatus,
  getTranslatePdfResult,
  uploadPdf,
  downloadPdf,
};
