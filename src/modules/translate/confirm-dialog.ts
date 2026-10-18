import { extractBackends, translateModes } from '../../config';
import { getString } from '../../utils/locale';
import { getPref, setPref } from '../../utils/prefs';
import { getLanguageOptions, getLanguages } from '../language';
import type { Language } from '../language/types';

export type ConfirmationArticleInfo = {
  count: number;
  title?: string;
  metadata?: string;
};

export async function showConfirmationDialog(articleInfo?: ConfirmationArticleInfo): Promise<{
  action: 'confirm' | 'cancel';
  data?: {
    targetLanguage: Language;
    translateMode: string;
    extractBackend: string;
  };
}> {
  const languages = getLanguages();
  const preferred = getPref('targetLanguage');
  const dialogData: { [key: string | number]: any } = {
    targetLanguage: languages.some((code) => code === preferred) ? preferred : languages[0],
    translateMode: getPref('translateMode'),
    extractBackend: getPref('extractBackend'),
  };
  const real_extractBackends = extractBackends;

  const articleTitle = articleInfo?.title || getString('confirm-article-unknown');
  const articleMetadata = articleInfo?.metadata || getString('confirm-article-metadata-unknown');
  const articleSummary =
    articleInfo && articleInfo.count > 1
      ? getString('confirm-article-multiple', {
          args: { count: articleInfo.count },
        })
      : getString('confirm-article-single');

  const dialogHelper = new ztoolkit.Dialog(12, 4)
    .addCell(0, 0, {
      tag: 'h2',
      properties: {
        innerHTML: getString('confirm-options'),
      },
      styles: {
        width: '300px',
      },
    })
    .addCell(1, 0, {
      tag: 'div',
      namespace: 'html',
      styles: {
        width: '360px',
        maxWidth: '360px',
        border: '1px solid var(--fill-quinary)',
        borderRadius: '6px',
        padding: '8px',
        margin: '4px 0 10px 0',
      },
      children: [
        {
          tag: 'div',
          namespace: 'html',
          properties: {
            innerText: articleSummary,
          },
          styles: {
            fontSize: '12px',
            color: 'var(--fill-secondary)',
            marginBottom: '4px',
          },
        },
        {
          tag: 'div',
          namespace: 'html',
          attributes: {
            title: articleTitle,
          },
          properties: {
            innerText: articleTitle,
          },
          styles: {
            maxWidth: '340px',
            maxHeight: '2.8em',
            overflow: 'hidden',
            lineHeight: '1.4',
            fontWeight: '600',
          },
        },
        {
          tag: 'div',
          namespace: 'html',
          properties: {
            innerText: articleMetadata,
          },
          styles: {
            maxWidth: '340px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginTop: '4px',
            color: 'var(--fill-secondary)',
          },
        },
      ],
    })
    .addCell(2, 0, {
      tag: 'label',
      namespace: 'html',
      properties: {
        innerHTML: getString('confirm-target-language'),
      },
      styles: {
        width: '200px',
      },
    })
    .addCell(
      3,
      0,
      {
        tag: 'select',
        id: 'targetLanguage',
        attributes: {
          'data-bind': 'targetLanguage',
          'data-prop': 'value',
        },
        children: getLanguageOptions(Zotero.locale as Language).map(
          (lang: { value: string; label: string }) => ({
            tag: 'option',
            properties: {
              value: lang.value,
              innerText: lang.label,
            },
          }),
        ),
        styles: {
          width: '200px',
          height: '30px',
          margin: '3px 0',
        },
      },
      false,
    )
    .addCell(4, 0, {
      tag: 'label',
      namespace: 'html',
      properties: {
        innerHTML: getString('confirm-translate-mode'),
      },
      styles: {
        width: '200px',
      },
    })
    .addCell(
      5,
      0,
      {
        tag: 'select',
        id: 'translateMode',
        attributes: {
          'data-bind': 'translateMode',
          'data-prop': 'value',
        },
        children: translateModes.map((mode: { value: string; label: string }) => ({
          tag: 'option',
          properties: {
            value: mode.value,
            innerHTML: getString(mode.label),
          },
        })),
        styles: {
          width: '200px',
          height: '30px',
          margin: '3px 0',
        },
      },
      false,
    )
    .addCell(6, 0, {
      tag: 'label',
      namespace: 'html',
      properties: {
        innerHTML: getString('confirm-extract-backend'),
      },
      styles: {
        width: '200px',
      },
    })
    .addCell(
      7,
      0,
      {
        tag: 'select',
        id: 'extractBackend',
        attributes: {
          'data-bind': 'extractBackend',
          'data-prop': 'value',
        },
        children: real_extractBackends.map((model: { value: string; label: string }) => ({
          tag: 'option',
          properties: {
            value: model.value,
            innerHTML: getString(model.label),
          },
        })),
        styles: {
          width: '200px',
          height: '30px',
          margin: '3px 0',
        },
      },
      false,
    )
    .addButton(getString('confirm-yes'), 'confirm')
    .addButton(getString('confirm-cancel'), 'cancel')
    .setDialogData(dialogData)
    .open(getString('confirm-title'));

  addon.data.dialog = dialogHelper;
  await dialogData.unloadLock.promise;
  addon.data.dialog = undefined;
  if (addon.data.alive) {
    if (dialogData._lastButtonId === 'confirm') {
      if (!languages.some((code) => code === dialogData.targetLanguage)) {
        throw new Error(getString('api-language-invalid'));
      }
      setPref('targetLanguage', dialogData.targetLanguage);
      setPref('translateMode', dialogData.translateMode);
      setPref('extractBackend', dialogData.extractBackend);
      return {
        action: 'confirm',
        data: dialogData as {
          targetLanguage: Language;
          translateMode: string;
          extractBackend: string;
        },
      };
    } else {
      return {
        action: 'cancel',
      };
    }
  }
  return {
    action: 'cancel',
  };
}
