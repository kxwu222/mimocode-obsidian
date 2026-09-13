import { type App, type EventRef, MarkdownView, setIcon } from 'obsidian';

import {
  type CapturedEditorSelection,
  captureMarkdownSelection,
} from '../../../utils/editor';

type AttachSelection = (selection: CapturedEditorSelection) => Promise<void>;

/**
 * Renders an explicit editor-side Chat action for the active note selection.
 * Selection is captured before focus moves, avoiding composer handoff timers.
 */
export class EditorSelectionChatAction {
  private buttonEl: HTMLButtonElement | null = null;
  private pendingSelection: CapturedEditorSelection | null = null;
  private dismissedKey: string | null = null;
  private refreshFrame: number | null = null;
  private ownerDocument: Document | null = null;
  private activeLeafEvent: EventRef | null = null;

  constructor(
    private readonly app: App,
    private readonly attachSelection: AttachSelection,
  ) {}

  start(): void {
    if (this.activeLeafEvent) return;
    this.activeLeafEvent = this.app.workspace.on('active-leaf-change', this.onActiveLeafChange);
    this.bindDocument(this.getActiveMarkdownDocument());
  }

  dispose(): void {
    if (this.activeLeafEvent) {
      this.app.workspace.offref(this.activeLeafEvent);
      this.activeLeafEvent = null;
    }
    this.bindDocument(null);
    if (this.refreshFrame !== null) {
      window.cancelAnimationFrame(this.refreshFrame);
      this.refreshFrame = null;
    }
    this.buttonEl?.remove();
    this.buttonEl = null;
    this.pendingSelection = null;
  }

  refresh(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      this.hide();
      return;
    }

    const selection = captureMarkdownSelection(view);
    if (!selection) {
      this.dismissedKey = null;
      this.hide();
      return;
    }
    if (view.getMode() !== 'preview' && !this.isFocusInsideView(view)) {
      this.hide();
      return;
    }

    const key = this.selectionKey(selection);
    if (key === this.dismissedKey) {
      this.hide();
      return;
    }

    this.pendingSelection = selection;
    this.show(selection);
  }

  private readonly scheduleRefresh = (): void => {
    if (this.refreshFrame !== null) return;
    this.refreshFrame = window.requestAnimationFrame(() => {
      this.refreshFrame = null;
      this.refresh();
    });
  };

  private readonly onActiveLeafChange = (): void => {
    this.bindDocument(this.getActiveMarkdownDocument());
    this.scheduleRefresh();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') return;
    this.scheduleRefresh();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (this.pendingSelection) {
      this.dismissedKey = this.selectionKey(this.pendingSelection);
    }
    this.hide();
  };

  private readonly onScroll = (): void => {
    this.hide();
  };

  private getActiveMarkdownDocument(): Document | null {
    return this.app.workspace.getActiveViewOfType(MarkdownView)?.containerEl.ownerDocument ?? null;
  }

  private bindDocument(ownerDocument: Document | null): void {
    if (ownerDocument === this.ownerDocument) return;

    if (this.ownerDocument) {
      this.ownerDocument.removeEventListener('selectionchange', this.scheduleRefresh);
      this.ownerDocument.removeEventListener('pointerup', this.scheduleRefresh);
      this.ownerDocument.removeEventListener('keyup', this.onKeyUp);
      this.ownerDocument.removeEventListener('keydown', this.onKeyDown);
      this.ownerDocument.removeEventListener('scroll', this.onScroll, true);
    }
    this.hide();
    this.ownerDocument = ownerDocument;

    if (ownerDocument) {
      ownerDocument.addEventListener('selectionchange', this.scheduleRefresh);
      ownerDocument.addEventListener('pointerup', this.scheduleRefresh);
      ownerDocument.addEventListener('keyup', this.onKeyUp);
      ownerDocument.addEventListener('keydown', this.onKeyDown);
      ownerDocument.addEventListener('scroll', this.onScroll, true);
    }
  }

  private isFocusInsideView(view: MarkdownView): boolean {
    const activeElement = view.containerEl.ownerDocument.activeElement;
    return activeElement !== null && view.containerEl.contains(activeElement);
  }

  private show(selection: CapturedEditorSelection): void {
    const ownerDocument = this.ownerDocument;
    if (!ownerDocument) return;

    if (!this.buttonEl || this.buttonEl.ownerDocument !== ownerDocument) {
      this.buttonEl?.remove();
      this.buttonEl = ownerDocument.body.createEl('button', {
        cls: 'claudian-editor-selection-chat-btn',
        attr: {
          type: 'button',
          'aria-label': 'Add selection to chat',
          title: 'Add selection to chat',
        },
      });
      const iconEl = this.buttonEl.createSpan({ cls: 'claudian-editor-selection-chat-icon' });
      setIcon(iconEl, 'bot');
      this.buttonEl.createSpan({ text: 'Chat' });
      this.buttonEl.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      this.buttonEl.addEventListener('click', () => {
        void this.commitPendingSelection();
      });
    }

    const ownerWindow = ownerDocument.defaultView ?? window;
    const left = Math.max(8, Math.min(selection.anchorRect.right + 8, ownerWindow.innerWidth - 88));
    const top = Math.max(8, Math.min(selection.anchorRect.bottom + 6, ownerWindow.innerHeight - 40));
    this.buttonEl.style.left = `${left}px`;
    this.buttonEl.style.top = `${top}px`;
    this.buttonEl.removeClass('claudian-hidden');
  }

  private async commitPendingSelection(): Promise<void> {
    const selection = this.pendingSelection;
    if (!selection) return;

    this.dismissedKey = this.selectionKey(selection);
    this.hide();
    await this.attachSelection(selection);
  }

  private hide(): void {
    this.buttonEl?.addClass('claudian-hidden');
    this.pendingSelection = null;
  }

  private selectionKey(selection: CapturedEditorSelection): string {
    return [
      selection.notePath,
      selection.from ?? '',
      selection.to ?? '',
      selection.selectedText,
    ].join(':');
  }
}
