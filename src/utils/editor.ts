/**
 * Claudian - Editor Context Utilities
 *
 * Editor cursor and selection context for inline editing.
 */

import type { EditorView } from '@codemirror/view';
import type { Editor, MarkdownView } from 'obsidian';

/**
 * Gets the CodeMirror EditorView from an Obsidian Editor.
 * Obsidian's Editor type doesn't expose the internal `.cm` property.
 */
export function getEditorView(editor: Editor): EditorView | undefined {
  return (editor as unknown as { cm?: EditorView }).cm;
}

export interface CursorContext {
  beforeCursor: string;
  afterCursor: string;
  isInbetween: boolean;
  line: number;
  column: number;
}

export interface EditorSelectionContext {
  notePath: string;
  mode: 'selection' | 'cursor' | 'none';
  selectedText?: string;
  cursorContext?: CursorContext;
  lineCount?: number; // Number of lines in selection (for UI indicator)
  startLine?: number; // 1-indexed starting line number
}

export interface EditorSelectionAnchorRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A selection captured before focus moves from the note into chat. */
export interface CapturedEditorSelection {
  notePath: string;
  selectedText: string;
  lineCount: number;
  startLine?: number;
  from?: number;
  to?: number;
  editorView?: EditorView;
  domRanges?: Range[];
  anchorRect: EditorSelectionAnchorRect;
}

export function captureMarkdownSelection(view: MarkdownView): CapturedEditorSelection | null {
  const notePath = view.file?.path;
  if (!notePath) return null;

  if (view.getMode() === 'preview') {
    return captureReadingModeSelection(view, notePath);
  }

  const selectedText = view.editor.getSelection();
  if (!selectedText.trim()) return null;

  const fromPos = view.editor.getCursor('from');
  const toPos = view.editor.getCursor('to');
  const from = view.editor.posToOffset(fromPos);
  const to = view.editor.posToOffset(toPos);
  const editorView = getEditorView(view.editor);
  const coords = editorView?.coordsAtPos(to) ?? view.containerEl.getBoundingClientRect();

  return {
    notePath,
    selectedText,
    lineCount: selectedText.split(/\r?\n/).length,
    startLine: fromPos.line + 1,
    from,
    to,
    editorView,
    anchorRect: toAnchorRect(coords),
  };
}

function captureReadingModeSelection(
  view: MarkdownView,
  notePath: string,
): CapturedEditorSelection | null {
  const ownerDocument = view.containerEl.ownerDocument;
  const selection = ownerDocument.getSelection();
  const selectedText = selection?.toString() ?? '';
  if (!selection || !selectedText.trim() || selection.rangeCount === 0) return null;

  const anchorInside = selection.anchorNode && view.containerEl.contains(selection.anchorNode);
  const focusInside = selection.focusNode && view.containerEl.contains(selection.focusNode);
  if (!anchorInside && !focusInside) return null;

  const domRanges: Range[] = [];
  for (let index = 0; index < selection.rangeCount; index++) {
    domRanges.push(selection.getRangeAt(index).cloneRange());
  }
  const lastRange = selection.getRangeAt(selection.rangeCount - 1);

  return {
    notePath,
    selectedText,
    lineCount: selectedText.split(/\r?\n/).length,
    domRanges,
    anchorRect: toAnchorRect(lastRange.getBoundingClientRect()),
  };
}

function toAnchorRect(rect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>): EditorSelectionAnchorRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

export function findNearestNonEmptyLine(
  getLine: (line: number) => string,
  lineCount: number,
  startLine: number,
  direction: 'before' | 'after'
): string {
  const step = direction === 'before' ? -1 : 1;
  for (let i = startLine + step; i >= 0 && i < lineCount; i += step) {
    const content = getLine(i);
    if (content.trim().length > 0) {
      return content;
    }
  }
  return '';
}

/** All line/column params are 0-indexed. */
export function buildCursorContext(
  getLine: (line: number) => string,
  lineCount: number,
  line: number,
  column: number
): CursorContext {
  const lineContent = getLine(line);
  const beforeCursor = lineContent.substring(0, column);
  const afterCursor = lineContent.substring(column);

  const lineIsEmpty = lineContent.trim().length === 0;
  const nothingBefore = beforeCursor.trim().length === 0;
  const nothingAfter = afterCursor.trim().length === 0;
  const isInbetween = lineIsEmpty || (nothingBefore && nothingAfter);

  let contextBefore = beforeCursor;
  let contextAfter = afterCursor;

  if (isInbetween) {
    contextBefore = findNearestNonEmptyLine(getLine, lineCount, line, 'before');
    contextAfter = findNearestNonEmptyLine(getLine, lineCount, line, 'after');
  }

  return { beforeCursor: contextBefore, afterCursor: contextAfter, isInbetween, line, column };
}

export function formatEditorContext(context: EditorSelectionContext): string {
  if (context.mode === 'selection' && context.selectedText) {
    const lineAttr = context.startLine && context.lineCount
      ? ` lines="${context.startLine}-${context.startLine + context.lineCount - 1}"`
      : '';
    return `<editor_selection path="${context.notePath}"${lineAttr}>\n${context.selectedText}\n</editor_selection>`;
  } else if (context.mode === 'cursor' && context.cursorContext) {
    const ctx = context.cursorContext;
    let content: string;
    if (ctx.isInbetween) {
      const parts = [];
      if (ctx.beforeCursor) parts.push(ctx.beforeCursor);
      parts.push('| #inbetween');
      if (ctx.afterCursor) parts.push(ctx.afterCursor);
      content = parts.join('\n');
    } else {
      content = `${ctx.beforeCursor}|${ctx.afterCursor} #inline`;
    }
    return `<editor_cursor path="${context.notePath}">\n${content}\n</editor_cursor>`;
  }
  return '';
}

export function appendEditorContext(prompt: string, context: EditorSelectionContext): string {
  const formatted = formatEditorContext(context);
  return formatted ? `${prompt}\n\n${formatted}` : prompt;
}
