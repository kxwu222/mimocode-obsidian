import {
  appendEditorContext,
  buildCursorContext,
  captureMarkdownSelection,
  type EditorSelectionContext,
  findNearestNonEmptyLine,
  formatEditorContext,
} from '@/utils/editor';

describe('captureMarkdownSelection', () => {
  it('captures source-mode text, line metadata, offsets, and anchor position', () => {
    const view = {
      file: { path: 'notes/source.md' },
      getMode: () => 'source',
      containerEl: {
        getBoundingClientRect: () => ({ top: 1, right: 2, bottom: 3, left: 4 }),
      },
      editor: {
        getSelection: () => 'alpha\nbeta',
        getCursor: (which: 'from' | 'to') => (
          which === 'from' ? { line: 2, ch: 1 } : { line: 3, ch: 4 }
        ),
        posToOffset: (position: { line: number; ch: number }) => position.line * 100 + position.ch,
        cm: {
          coordsAtPos: () => ({ top: 10, right: 40, bottom: 30, left: 20 }),
        },
      },
    };

    expect(captureMarkdownSelection(view as never)).toEqual(expect.objectContaining({
      notePath: 'notes/source.md',
      selectedText: 'alpha\nbeta',
      lineCount: 2,
      startLine: 3,
      from: 201,
      to: 304,
      anchorRect: { top: 10, right: 40, bottom: 30, left: 20 },
    }));
  });

  it('captures reading-mode text only when its range is inside the note', () => {
    const anchorNode = {};
    const range = {
      cloneRange: jest.fn(),
      getBoundingClientRect: () => ({ top: 11, right: 41, bottom: 31, left: 21 }),
    };
    range.cloneRange.mockReturnValue(range);
    const selection = {
      toString: () => 'reading text',
      rangeCount: 1,
      anchorNode,
      focusNode: anchorNode,
      getRangeAt: () => range,
    };
    const view = {
      file: { path: 'notes/reading.md' },
      getMode: () => 'preview',
      containerEl: {
        contains: (node: unknown) => node === anchorNode,
        ownerDocument: { getSelection: () => selection },
      },
    };

    expect(captureMarkdownSelection(view as never)).toEqual(expect.objectContaining({
      notePath: 'notes/reading.md',
      selectedText: 'reading text',
      lineCount: 1,
      domRanges: [range],
      anchorRect: { top: 11, right: 41, bottom: 31, left: 21 },
    }));
  });

  it('ignores empty and outside-note selections', () => {
    const sourceView = {
      file: { path: 'notes/source.md' },
      getMode: () => 'source',
      editor: { getSelection: () => '   ' },
    };
    expect(captureMarkdownSelection(sourceView as never)).toBeNull();

    const outsideNode = {};
    const previewView = {
      file: { path: 'notes/reading.md' },
      getMode: () => 'preview',
      containerEl: {
        contains: () => false,
        ownerDocument: {
          getSelection: () => ({
            toString: () => 'outside',
            rangeCount: 1,
            anchorNode: outsideNode,
            focusNode: outsideNode,
          }),
        },
      },
    };
    expect(captureMarkdownSelection(previewView as never)).toBeNull();
  });
});

function makeGetLine(lines: string[]): (line: number) => string {
  return (line: number) => lines[line] ?? '';
}

describe('findNearestNonEmptyLine', () => {
  const lines = ['first', '', 'third', '', 'fifth'];
  const getLine = makeGetLine(lines);

  it('finds nearest non-empty line before', () => {
    expect(findNearestNonEmptyLine(getLine, lines.length, 1, 'before')).toBe('first');
  });

  it('finds nearest non-empty line after', () => {
    expect(findNearestNonEmptyLine(getLine, lines.length, 1, 'after')).toBe('third');
  });

  it('skips multiple empty lines before', () => {
    expect(findNearestNonEmptyLine(getLine, lines.length, 3, 'before')).toBe('third');
  });

  it('skips multiple empty lines after', () => {
    expect(findNearestNonEmptyLine(getLine, lines.length, 3, 'after')).toBe('fifth');
  });

  it('returns empty string when no non-empty line exists before', () => {
    const emptyLines = ['', '', 'content'];
    expect(findNearestNonEmptyLine(makeGetLine(emptyLines), emptyLines.length, 0, 'before')).toBe('');
  });

  it('returns empty string when no non-empty line exists after', () => {
    const emptyLines = ['content', '', ''];
    expect(findNearestNonEmptyLine(makeGetLine(emptyLines), emptyLines.length, 2, 'after')).toBe('');
  });

  it('skips whitespace-only lines', () => {
    const lines = ['content', '   ', '  \t  ', 'found'];
    expect(findNearestNonEmptyLine(makeGetLine(lines), lines.length, 0, 'after')).toBe('found');
  });
});

describe('buildCursorContext', () => {
  it('splits line at cursor position', () => {
    const lines = ['hello world'];
    const result = buildCursorContext(makeGetLine(lines), lines.length, 0, 5);
    expect(result.beforeCursor).toBe('hello');
    expect(result.afterCursor).toBe(' world');
    expect(result.isInbetween).toBe(false);
    expect(result.line).toBe(0);
    expect(result.column).toBe(5);
  });

  it('cursor at start of line', () => {
    const lines = ['', 'next line'];
    const result = buildCursorContext(makeGetLine(lines), lines.length, 0, 0);
    expect(result.isInbetween).toBe(true);
    expect(result.beforeCursor).toBe('');
    expect(result.afterCursor).toBe('next line');
  });

  it('cursor on empty line between content', () => {
    const lines = ['above', '', 'below'];
    const result = buildCursorContext(makeGetLine(lines), lines.length, 1, 0);
    expect(result.isInbetween).toBe(true);
    expect(result.beforeCursor).toBe('above');
    expect(result.afterCursor).toBe('below');
  });

  it('cursor on whitespace-only line', () => {
    const lines = ['above', '   ', 'below'];
    const result = buildCursorContext(makeGetLine(lines), lines.length, 1, 1);
    expect(result.isInbetween).toBe(true);
    expect(result.beforeCursor).toBe('above');
    expect(result.afterCursor).toBe('below');
  });

  it('cursor at end of non-empty line is not inbetween', () => {
    const lines = ['hello'];
    const result = buildCursorContext(makeGetLine(lines), lines.length, 0, 5);
    expect(result.isInbetween).toBe(false);
    expect(result.beforeCursor).toBe('hello');
    expect(result.afterCursor).toBe('');
  });

  it('cursor in middle of word', () => {
    const lines = ['function test() {}'];
    const result = buildCursorContext(makeGetLine(lines), lines.length, 0, 8);
    expect(result.beforeCursor).toBe('function');
    expect(result.afterCursor).toBe(' test() {}');
    expect(result.isInbetween).toBe(false);
  });
});

describe('formatEditorContext', () => {
  it('formats selection context', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'selection',
      selectedText: 'selected content',
      startLine: 5,
      lineCount: 3,
    };
    const result = formatEditorContext(context);
    expect(result).toBe('<editor_selection path="test.md" lines="5-7">\nselected content\n</editor_selection>');
  });

  it('formats selection without line info', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'selection',
      selectedText: 'selected',
    };
    const result = formatEditorContext(context);
    expect(result).toBe('<editor_selection path="test.md">\nselected\n</editor_selection>');
  });

  it('formats inline cursor context', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'cursor',
      cursorContext: {
        beforeCursor: 'hello',
        afterCursor: ' world',
        isInbetween: false,
        line: 0,
        column: 5,
      },
    };
    const result = formatEditorContext(context);
    expect(result).toBe('<editor_cursor path="test.md">\nhello| world #inline\n</editor_cursor>');
  });

  it('formats inbetween cursor context', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'cursor',
      cursorContext: {
        beforeCursor: 'above',
        afterCursor: 'below',
        isInbetween: true,
        line: 1,
        column: 0,
      },
    };
    const result = formatEditorContext(context);
    expect(result).toBe('<editor_cursor path="test.md">\nabove\n| #inbetween\nbelow\n</editor_cursor>');
  });

  it('formats inbetween cursor with no before content', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'cursor',
      cursorContext: {
        beforeCursor: '',
        afterCursor: 'below',
        isInbetween: true,
        line: 0,
        column: 0,
      },
    };
    const result = formatEditorContext(context);
    expect(result).toBe('<editor_cursor path="test.md">\n| #inbetween\nbelow\n</editor_cursor>');
  });

  it('formats inbetween cursor with no after content', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'cursor',
      cursorContext: {
        beforeCursor: 'above',
        afterCursor: '',
        isInbetween: true,
        line: 5,
        column: 0,
      },
    };
    const result = formatEditorContext(context);
    expect(result).toBe('<editor_cursor path="test.md">\nabove\n| #inbetween\n</editor_cursor>');
  });

  it('formats inbetween cursor with no before and no after content', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'cursor',
      cursorContext: {
        beforeCursor: '',
        afterCursor: '',
        isInbetween: true,
        line: 0,
        column: 0,
      },
    };
    const result = formatEditorContext(context);
    expect(result).toBe('<editor_cursor path="test.md">\n| #inbetween\n</editor_cursor>');
  });

  it('returns empty string for none mode', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'none',
    };
    expect(formatEditorContext(context)).toBe('');
  });

  it('returns empty string for selection mode without selectedText', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'selection',
    };
    expect(formatEditorContext(context)).toBe('');
  });

  it('returns empty string for cursor mode without cursorContext', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'cursor',
    };
    expect(formatEditorContext(context)).toBe('');
  });
});

describe('appendEditorContext', () => {
  it('appends formatted context to prompt', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'selection',
      selectedText: 'text',
      startLine: 1,
      lineCount: 1,
    };
    const result = appendEditorContext('Fix this', context);
    expect(result).toBe('Fix this\n\n<editor_selection path="test.md" lines="1-1">\ntext\n</editor_selection>');
  });

  it('returns prompt unchanged when context is none', () => {
    const context: EditorSelectionContext = {
      notePath: 'test.md',
      mode: 'none',
    };
    expect(appendEditorContext('Fix this', context)).toBe('Fix this');
  });
});
