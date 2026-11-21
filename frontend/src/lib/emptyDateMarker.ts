const SELECTOR = 'input[type="date"]';

function mark(input: HTMLInputElement) {
  input.toggleAttribute('data-empty', input.value === '');
}

function markAll(root: ParentNode) {
  root.querySelectorAll<HTMLInputElement>(SELECTOR).forEach(mark);
}

export function installEmptyDateMarker(doc: Document = document): () => void {
  markAll(doc);
  const onInput = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'date') mark(target);
  };
  doc.addEventListener('input', onInput, true);
  doc.addEventListener('change', onInput, true);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target instanceof HTMLInputElement && record.target.type === 'date') mark(record.target);
      } else {
        record.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches(SELECTOR)) mark(node as HTMLInputElement);
          markAll(node);
        });
      }
    }
  });
  observer.observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] });
  return () => {
    doc.removeEventListener('input', onInput, true);
    doc.removeEventListener('change', onInput, true);
    observer.disconnect();
  };
}
