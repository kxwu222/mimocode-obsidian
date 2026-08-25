import { createMockEl } from '@test/helpers/mockElement';

import {
  getWelcomeCopy,
  noteFileName,
  paintWelcome,
  WELCOME_FALLBACK_GREETING,
  WELCOME_HINT,
} from '@/features/chat/utils/welcomeCopy';

describe('welcomeCopy', () => {
  describe('noteFileName', () => {
    it('returns the basename of a vault path', () => {
      expect(noteFileName('notes/Daily.md')).toBe('Daily.md');
      expect(noteFileName('folder\\nested\\Weekly.md')).toBe('Weekly.md');
    });

    it('returns null when no path is open', () => {
      expect(noteFileName(null)).toBeNull();
      expect(noteFileName(undefined)).toBeNull();
      expect(noteFileName('')).toBeNull();
    });
  });

  describe('getWelcomeCopy', () => {
    it('names the open note in the greeting', () => {
      expect(getWelcomeCopy('notes/Daily.md')).toEqual({
        greeting: 'Ask about Daily.md',
        hint: WELCOME_HINT,
      });
    });

    it('falls back when no note is open', () => {
      expect(getWelcomeCopy(null)).toEqual({
        greeting: WELCOME_FALLBACK_GREETING,
        hint: WELCOME_HINT,
      });
    });
  });

  describe('paintWelcome', () => {
    it('creates greeting and hint, then updates them in place', () => {
      const welcomeEl = createMockEl();
      paintWelcome(welcomeEl as unknown as HTMLElement, getWelcomeCopy(null));

      expect(welcomeEl.querySelector('.claudian-welcome-greeting')?.textContent)
        .toBe(WELCOME_FALLBACK_GREETING);
      expect(welcomeEl.querySelector('.claudian-welcome-hint')?.textContent)
        .toBe(WELCOME_HINT);

      paintWelcome(welcomeEl as unknown as HTMLElement, getWelcomeCopy('notes/Daily.md'));

      expect(welcomeEl.querySelectorAll('.claudian-welcome-greeting')).toHaveLength(1);
      expect(welcomeEl.querySelector('.claudian-welcome-greeting')?.textContent)
        .toBe('Ask about Daily.md');
    });
  });
});
