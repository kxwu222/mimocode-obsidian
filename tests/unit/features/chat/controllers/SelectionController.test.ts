import { createMockEl } from '@test/helpers/mockElement';

import { SelectionController } from '@/features/chat/controllers/SelectionController';
import { hideSelectionHighlight, showSelectionHighlight } from '@/shared/components/SelectionHighlight';

jest.mock('@/shared/components/SelectionHighlight', () => ({
  showSelectionHighlight: jest.fn(),
  hideSelectionHighlight: jest.fn(),
}));

function createController() {
  const indicatorEl = createMockEl();
  indicatorEl.addClass('claudian-selection-indicator');
  indicatorEl.addClass('claudian-hidden');
  const inputEl = createMockEl();
  const contextRowEl = createMockEl();
  contextRowEl.querySelector = jest.fn((selector: string) => (
    selector === '.claudian-selection-indicator' ? indicatorEl : null
  ));
  const onVisibilityChange = jest.fn();
  const controller = new SelectionController(
    {} as never,
    indicatorEl as never,
    inputEl as never,
    contextRowEl as never,
    onVisibilityChange,
  );
  return { controller, indicatorEl, onVisibilityChange };
}

describe('SelectionController', () => {
  const originalCSS = globalThis.CSS;
  const originalHighlight = globalThis.Highlight;

  beforeEach(() => {
    jest.useFakeTimers();
    (showSelectionHighlight as jest.Mock).mockClear();
    (hideSelectionHighlight as jest.Mock).mockClear();
    (globalThis as unknown as { Highlight: jest.Mock }).Highlight = jest.fn(
      (...ranges: Range[]) => ({ ranges }),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.CSS = originalCSS;
    globalThis.Highlight = originalHighlight;
  });

  it('does not poll or create context from ordinary editor focus and paste', () => {
    const { controller, indicatorEl } = createController();
    controller.start();

    expect(jest.getTimerCount()).toBe(0);
    expect(controller.hasSelection()).toBe(false);
    expect(controller.getContext()).toBeNull();
    expect(indicatorEl.hasClass('claudian-hidden')).toBe(true);
  });

  it('shows only an explicitly attached selection', () => {
    const { controller, indicatorEl } = createController();
    controller.start();
    controller.attachSelection({
      notePath: 'notes/test.md',
      selectedText: 'alpha\nbeta',
      lineCount: 2,
      startLine: 4,
    });

    expect(controller.getContext()).toEqual({
      notePath: 'notes/test.md',
      mode: 'selection',
      selectedText: 'alpha\nbeta',
      lineCount: 2,
      startLine: 4,
    });
    expect(indicatorEl.children[0]?.textContent).toBe('2 lines selected');
    expect(indicatorEl.hasClass('is-included')).toBe(true);
  });

  it('removes the attachment immediately with the dismiss button', () => {
    const { controller, indicatorEl } = createController();
    controller.start();
    controller.attachSelection({
      notePath: 'notes/test.md',
      selectedText: 'selected',
      lineCount: 1,
    });

    const dismissEl = indicatorEl.querySelector('.claudian-selection-dismiss');
    expect(dismissEl?.getAttribute('type')).toBe('button');
    expect(dismissEl?.getAttribute('aria-label')).toBe('Remove selection');
    dismissEl?.click();

    expect(controller.getContext()).toBeNull();
    expect(indicatorEl.hasClass('claudian-hidden')).toBe(true);
  });

  it('replaces an attachment and moves the edit-mode highlight', () => {
    const { controller } = createController();
    const firstView = { id: 'first' };
    const secondView = { id: 'second' };
    controller.start();
    controller.attachSelection({
      notePath: 'first.md',
      selectedText: 'first',
      lineCount: 1,
      from: 1,
      to: 6,
      editorView: firstView as never,
    });
    controller.attachSelection({
      notePath: 'second.md',
      selectedText: 'second',
      lineCount: 1,
      from: 10,
      to: 16,
      editorView: secondView as never,
    });

    expect(hideSelectionHighlight).toHaveBeenCalledWith(firstView);
    expect(showSelectionHighlight).toHaveBeenLastCalledWith(secondView, 10, 16);
    expect(controller.getContext()?.notePath).toBe('second.md');
  });

  it('keeps attachment state while an inactive tab is stopped', () => {
    const { controller, indicatorEl } = createController();
    controller.start();
    controller.attachSelection({
      notePath: 'notes/test.md',
      selectedText: 'selected',
      lineCount: 1,
    });

    controller.stop();
    expect(controller.getContext()?.selectedText).toBe('selected');
    expect(indicatorEl.hasClass('claudian-hidden')).toBe(true);

    controller.start();
    expect(indicatorEl.hasClass('claudian-hidden')).toBe(false);
  });

  it('renders a reading-mode custom highlight and clears it', () => {
    const highlights = {
      set: jest.fn(),
      delete: jest.fn(),
    };
    globalThis.CSS = { highlights } as unknown as typeof CSS;
    const range = {
      startContainer: { isConnected: true },
      cloneRange: jest.fn(),
    } as unknown as Range;
    (range.cloneRange as jest.Mock).mockReturnValue(range);
    const { controller } = createController();
    controller.start();

    controller.attachSelection({
      notePath: 'notes/read.md',
      selectedText: 'reading',
      lineCount: 1,
      domRanges: [range],
    });
    expect(highlights.set).toHaveBeenCalledWith(
      'claudian-selection',
      expect.anything(),
    );

    controller.clear();
    expect(highlights.delete).toHaveBeenCalledWith('claudian-selection');
  });
});
