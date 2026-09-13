import type { App } from 'obsidian';

import { hideSelectionHighlight, showSelectionHighlight } from '../../../shared/components/SelectionHighlight';
import type { EditorSelectionContext } from '../../../utils/editor';
import type { StoredSelection } from '../state/types';
import { updateContextRowHasContent } from './contextRowVisibility';

const HIGHLIGHT_KEY = 'claudian-selection';

type CustomHighlightRegistry = {
  delete: (name: string) => boolean;
  set: (name: string, highlight: unknown) => void;
};
type CustomHighlightConstructor = new (...ranges: Range[]) => unknown;
type FocusScopeInput = HTMLElement | HTMLElement[];

/**
 * Owns only selections explicitly attached from the editor-side Chat action.
 * It deliberately does not observe editor selection or focus, so copy/paste
 * cannot create prompt context.
 */
export class SelectionController {
  private storedSelection: StoredSelection | null = null;
  private active = false;

  constructor(
    _app: App,
    private readonly indicatorEl: HTMLElement,
    private readonly inputEl: HTMLElement,
    private readonly contextRowEl: HTMLElement,
    private readonly onVisibilityChange: (() => void) | null = null,
    _focusScopeEl?: FocusScopeInput,
  ) {}

  start(): void {
    this.active = true;
    this.updateIndicator();
    this.showHighlight();
  }

  stop(): void {
    this.active = false;
    this.clearHighlight();
    this.updateIndicator();
  }

  dispose(): void {
    this.clear();
    this.active = false;
  }

  attachSelection(selection: StoredSelection): void {
    if (!selection.selectedText.trim()) return;

    this.clearHighlight();
    this.storedSelection = {
      ...selection,
      domRanges: selection.domRanges?.map((range) => range.cloneRange()),
    };
    this.updateIndicator();
    this.showHighlight();
  }

  showHighlight(): void {
    if (!this.active) return;
    const selection = this.storedSelection;
    if (!selection) return;

    if (
      selection.editorView
      && selection.from !== undefined
      && selection.to !== undefined
    ) {
      showSelectionHighlight(selection.editorView, selection.from, selection.to);
      return;
    }

    const validRanges = selection.domRanges?.filter((range) => range.startContainer.isConnected) ?? [];
    const HighlightCtor = this.highlightConstructor;
    if (validRanges.length > 0 && HighlightCtor) {
      this.cssHighlights?.set(HIGHLIGHT_KEY, new HighlightCtor(...validRanges));
    }
  }

  private clearHighlight(): void {
    if (this.storedSelection?.editorView) {
      hideSelectionHighlight(this.storedSelection.editorView);
    }
    this.cssHighlights?.delete(HIGHLIGHT_KEY);
  }

  private get cssHighlights(): CustomHighlightRegistry | null {
    const css = typeof CSS === 'undefined'
      ? null
      : CSS as unknown as { highlights?: CustomHighlightRegistry };
    return css?.highlights ?? null;
  }

  private get highlightConstructor(): CustomHighlightConstructor | null {
    const ownerWindow = this.inputEl.ownerDocument.defaultView as unknown as {
      Highlight?: CustomHighlightConstructor;
    } | null;
    const rendererWindow = typeof window === 'undefined'
      ? null
      : window as unknown as { Highlight?: CustomHighlightConstructor };
    return ownerWindow?.Highlight ?? rendererWindow?.Highlight ?? null;
  }

  private dismissSelection(): void {
    this.clear();
  }

  private updateIndicator(): void {
    this.indicatorEl.empty();

    if (!this.active || !this.storedSelection) {
      this.indicatorEl.addClass('claudian-hidden');
      this.indicatorEl.removeClass('is-offer');
      this.indicatorEl.removeClass('is-included');
      this.updateContextRowVisibility();
      return;
    }

    const lineText = this.storedSelection.lineCount === 1 ? 'line' : 'lines';
    const label = `${this.storedSelection.lineCount} ${lineText} selected`;
    this.indicatorEl.removeClass('claudian-hidden');
    this.indicatorEl.removeClass('is-offer');
    this.indicatorEl.addClass('is-included');
    this.indicatorEl.setAttribute('aria-label', label);
    this.indicatorEl.createSpan({ text: label });

    const dismissEl = this.indicatorEl.createEl('button', {
      cls: 'claudian-selection-dismiss',
      attr: {
        type: 'button',
        'aria-label': 'Remove selection',
        title: 'Remove selection',
      },
      text: '\u00D7',
    });
    dismissEl.addEventListener('click', (event) => {
      event.stopPropagation();
      this.dismissSelection();
    });
    this.updateContextRowVisibility();
  }

  updateContextRowVisibility(): void {
    updateContextRowHasContent(this.contextRowEl);
    this.onVisibilityChange?.();
  }

  getContext(): EditorSelectionContext | null {
    if (!this.storedSelection) return null;
    return {
      notePath: this.storedSelection.notePath,
      mode: 'selection',
      selectedText: this.storedSelection.selectedText,
      lineCount: this.storedSelection.lineCount,
      ...(this.storedSelection.startLine !== undefined && { startLine: this.storedSelection.startLine }),
    };
  }

  hasSelection(): boolean {
    return this.storedSelection !== null;
  }

  clear(): void {
    this.clearHighlight();
    this.storedSelection = null;
    this.updateIndicator();
  }
}
