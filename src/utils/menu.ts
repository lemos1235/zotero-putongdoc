export const MENU_IDS = {
  itemTranslate: 'zotero-itemmenu-putongdoc-translate',
  viewSeparator: 'zotero-menuview-putongdoc-translate-separator',
  viewTasks: 'zotero-menuview-putongdoc-translate-menuitem',
} as const;

export function removeMenuElement(doc: Document, id: string): void {
  doc.getElementById(id)?.remove();
}

export function removeKnownMenuElements(doc: Document): void {
  [...Object.values(MENU_IDS), 'zotero-tb-imt', 'putongdoc-toolbar-style'].forEach((id) =>
    removeMenuElement(doc, id),
  );
}
