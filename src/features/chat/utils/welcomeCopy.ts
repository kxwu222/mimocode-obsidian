export interface WelcomeCopy {
  greeting: string;
  hint: string;
}

export const WELCOME_HINT = '@ to attach another note';
export const WELCOME_FALLBACK_GREETING = 'Ask about this note';

export function noteFileName(path: string | null | undefined): string | null {
  if (!path) return null;
  const name = path.replace(/\\/g, '/').split('/').pop()?.trim();
  return name || null;
}

export function getWelcomeCopy(notePath: string | null | undefined): WelcomeCopy {
  const name = noteFileName(notePath);
  return {
    greeting: name ? `Ask about ${name}` : WELCOME_FALLBACK_GREETING,
    hint: WELCOME_HINT,
  };
}

function getOrCreateDiv(parent: HTMLElement, cls: string): HTMLElement {
  const existing = parent.querySelector(`.${cls}`);
  if (existing) {
    return existing as HTMLElement;
  }
  return parent.createDiv({ cls });
}

export function paintWelcome(welcomeEl: HTMLElement, copy: WelcomeCopy): void {
  const greetingEl = getOrCreateDiv(welcomeEl, 'claudian-welcome-greeting');
  greetingEl.setText(copy.greeting);

  const hintEl = getOrCreateDiv(welcomeEl, 'claudian-welcome-hint');
  hintEl.setText(copy.hint);
}
