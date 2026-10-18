import type { TranslationTaskData } from '../../types';
import { ApiError, formatErrorDiagnostic } from '../../api/request';
import { getString } from '../../utils/locale';

/** Only plugin-generated local messages are safe; platform messages can contain signed URLs. */
function safeMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  const message = (error as Error | null)?.message;
  const known = [
    'api-token-required',
    'api-untrusted-url',
    'api-language-invalid',
    'api-options-invalid',
    'api-pdf-invalid',
    'api-file-size',
    'api-file-changed',
    'api-quota-exhausted',
    'api-submission-uncertain',
    'api-persistence-failed',
  ].map((key) => getString(key));
  return message && known.includes(message) ? message : getString('api-request-failed');
}

export function getSubmissionFailure(
  task: TranslationTaskData,
  error: unknown,
): Pick<TranslationTaskData, 'status' | 'error' | 'debugInfo'> {
  const phases = [
    'validation',
    'quota',
    'read-file',
    'upload-url',
    'upload',
    'persist',
    'create',
    'persist-id',
    'monitor',
  ];
  const phase = phases.includes(task.submissionPhase || '') ? task.submissionPhase : 'unknown';
  const reason = safeMessage(error);
  return {
    status: task.pdfId ? 'paused' : task.submissionPending ? 'uncertain' : 'failed',
    error: task.submissionPending ? `${getString('api-submission-uncertain')}\n${reason}` : reason,
    debugInfo: JSON.stringify(
      {
        phase,
        submissionPending: Boolean(task.submissionPending),
        hasTaskId: Boolean(task.pdfId),
        ...JSON.parse(formatErrorDiagnostic(error)),
      },
      null,
      2,
    ),
  };
}
