import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

class ScrollElement {
  tagName = 'DIV';
  scrollTop = 50;
  scrollHeight = 300;
  clientHeight = 100;
  scrollLeft = 50;
  scrollWidth = 300;
  clientWidth = 100;
  parentNode: ScrollElement | null = null;
  styles = { direction: 'ltr', overflowX: 'auto', overflowY: 'auto' };
  contains(node: unknown) { return node === this; }
}

async function loadInstalledScrollHandler() {
  const require = createRequire(import.meta.url);
  const dialogRequire = createRequire(require.resolve('@radix-ui/react-dialog'));
  const source = await readFile(dialogRequire.resolve('react-remove-scroll/dist/es5/handleScroll.js'), 'utf8');
  let computedStyleCalls = 0;
  const exports: {
    handleScroll?: (axis: string, boundary: unknown, event: { target: ScrollElement }, delta: number, noOverscroll: boolean) => boolean;
  } = {};
  const body = new ScrollElement();
  runInNewContext(source, {
    exports,
    Element: ScrollElement,
    Node: { DOCUMENT_FRAGMENT_NODE: 11 },
    document: { body },
    window: {
      getComputedStyle(element: unknown) {
        computedStyleCalls += 1;
        assert.ok(element instanceof ScrollElement, 'getComputedStyle requires an Element');
        return element.styles;
      },
    },
  });
  assert.ok(exports.handleScroll);
  return { handleScroll: exports.handleScroll, body, styleCalls: () => computedStyleCalls };
}

test('dialog scroll lock safely blocks scroll when its boundary ref is cleared', async () => {
  const { handleScroll, styleCalls } = await loadInstalledScrollHandler();
  const target = new ScrollElement();
  for (const boundary of [null, undefined, { nodeType: 9 }]) {
    assert.equal(handleScroll('v', boundary, { target }, 20, true), true);
  }
  assert.equal(styleCalls(), 0, 'A cleared/non-element ref must never reach getComputedStyle.');
});

test('dialog scroll lock still allows in-bound scrolling and blocks overscroll', async () => {
  const { handleScroll, body, styleCalls } = await loadInstalledScrollHandler();
  const target = new ScrollElement();
  target.parentNode = body;
  assert.equal(handleScroll('v', target, { target }, 20, true), false);
  target.scrollTop = 200;
  assert.equal(handleScroll('v', target, { target }, 20, true), true);
  target.scrollTop = 0;
  assert.equal(handleScroll('v', target, { target }, -20, true), true);
  assert.ok(styleCalls() > 0, 'Normal scrolling must still use the element’s styles.');
});
