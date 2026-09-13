import { createMockEl } from '@test/helpers/mockElement';

import { EditorSelectionChatAction } from '@/features/chat/controllers/EditorSelectionChatAction';

describe('EditorSelectionChatAction', () => {
  const originalDocument = globalThis.document;
  let ownerDocument: any;
  let body: ReturnType<typeof createMockEl>;
  let view: any;

  const createApp = () => ({
    workspace: {
      getActiveViewOfType: jest.fn(() => view),
      on: jest.fn(() => ({ id: 'active-leaf-change' })),
      offref: jest.fn(),
    },
  });

  beforeEach(() => {
    jest.useFakeTimers();
    body = createMockEl('body');
    const activeElement = {};
    ownerDocument = {
      activeElement,
      body,
      defaultView: { innerWidth: 1000, innerHeight: 800 },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      getSelection: jest.fn(),
    };
    const containerEl = createMockEl();
    containerEl.ownerDocument = ownerDocument;
    containerEl.contains = jest.fn((node) => node === activeElement);
    containerEl.getBoundingClientRect = jest.fn(() => ({
      top: 10,
      right: 40,
      bottom: 30,
      left: 20,
    }));
    view = {
      file: { path: 'notes/test.md' },
      getMode: () => 'source',
      containerEl,
      editor: {
        getSelection: jest.fn(() => 'selected text'),
        getCursor: jest.fn((which: 'from' | 'to') => (
          which === 'from' ? { line: 0, ch: 0 } : { line: 0, ch: 13 }
        )),
        posToOffset: jest.fn((position: { ch: number }) => position.ch),
        cm: {
          coordsAtPos: jest.fn(() => ({
            top: 10,
            right: 40,
            bottom: 30,
            left: 20,
          })),
        },
      },
    };
    globalThis.document = ownerDocument;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    jest.useRealTimers();
  });

  it('shows a native Chat button and explicitly attaches the captured selection', async () => {
    const attachSelection = jest.fn().mockResolvedValue(undefined);
    const action = new EditorSelectionChatAction(
      createApp() as never,
      attachSelection,
    );
    action.start();
    action.refresh();

    const button = body.querySelector('.claudian-editor-selection-chat-btn');
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('aria-label')).toBe('Add selection to chat');

    button?.click();
    await Promise.resolve();

    expect(attachSelection).toHaveBeenCalledWith(expect.objectContaining({
      notePath: 'notes/test.md',
      selectedText: 'selected text',
      lineCount: 1,
    }));
    expect(button?.hasClass('claudian-hidden')).toBe(true);
    action.dispose();
  });

  it('does not show for stale editor selections when focus is outside the note', () => {
    view.containerEl.contains = jest.fn(() => false);
    const action = new EditorSelectionChatAction(
      createApp() as never,
      jest.fn(),
    );
    action.start();
    action.refresh();

    expect(body.querySelector('.claudian-editor-selection-chat-btn')).toBeNull();
    action.dispose();
  });

  it('shows for a reading-mode range inside the note even when body has focus', () => {
    const range = {
      cloneRange: jest.fn(),
      getBoundingClientRect: () => ({ top: 10, right: 40, bottom: 30, left: 20 }),
    };
    range.cloneRange.mockReturnValue(range);
    const textNode = {};
    view.getMode = () => 'preview';
    view.containerEl.contains = jest.fn((node) => node === textNode);
    ownerDocument.activeElement = body;
    ownerDocument.getSelection.mockReturnValue({
      toString: () => 'reading selection',
      rangeCount: 1,
      anchorNode: textNode,
      focusNode: textNode,
      getRangeAt: () => range,
    });
    const action = new EditorSelectionChatAction(createApp() as never, jest.fn());
    action.start();
    action.refresh();

    expect(body.querySelector('.claudian-editor-selection-chat-btn')).not.toBeNull();
    action.dispose();
  });

  it('registers and removes selection lifecycle listeners', () => {
    const app = createApp();
    const action = new EditorSelectionChatAction(
      app as never,
      jest.fn(),
    );
    action.start();
    expect(ownerDocument.addEventListener).toHaveBeenCalledWith(
      'selectionchange',
      expect.any(Function),
    );

    action.dispose();
    expect(app.workspace.offref).toHaveBeenCalled();
    expect(ownerDocument.removeEventListener).toHaveBeenCalledWith(
      'selectionchange',
      expect.any(Function),
    );
  });
});
