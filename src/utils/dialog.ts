import { getString } from './locale';

export function showDialog({ title, message }: { title: string; message?: string }) {
  new ztoolkit.Dialog(3, 4)
    .addCell(0, 0, {
      tag: 'h2',
      properties: {
        innerText: title,
      },
      styles: {
        width: '300px',
      },
    })
    .addCell(1, 0, {
      tag: 'label',
      namespace: 'html',
      properties: {
        innerText: message || '',
      },
      styles: {
        width: '300px',
      },
    })
    .addButton(getString('confirm-yes'), 'confirm')
    .open(title);
}
