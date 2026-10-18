import { UITool } from 'zotero-plugin-toolkit';
import { getString } from '../utils/locale';
import { showTaskManager } from './translate/task-manager';

export function registerToolbar() {
  const ui = new UITool();
  const document = ztoolkit.getGlobal('document');
  const toolbarIcon = `chrome://${addon.data.config.addonRef}/content/icons/icon.svg`;
  const stylesheet = ui.createElement(document, 'link', {
    id: 'putongdoc-toolbar-style',
    namespace: 'html',
    removeIfExists: true,
    attributes: {
      rel: 'stylesheet',
      href: `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`,
    },
  });
  document.documentElement.append(stylesheet);
  const ariaBtn = ui.createElement(document, 'toolbarbutton', {
    id: 'zotero-tb-imt',
    removeIfExists: true,
    attributes: {
      class: 'zotero-tb-button',
      tooltiptext: getString('menuView-tasks'),
      style: `list-style-image: url(${toolbarIcon})`,
    },
    listeners: [
      {
        type: 'click',
        listener: () => {
          showTaskManager();
        },
      },
    ],
  });
  const toolbarNode = document.getElementById('zotero-tb-note-add');
  if (toolbarNode) {
    toolbarNode.after(ariaBtn);
  }
}
