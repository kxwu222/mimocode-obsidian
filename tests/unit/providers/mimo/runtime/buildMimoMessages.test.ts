import type { ChatMessage, ImageAttachment } from '@/core/types';
import {
  buildMimoMessages,
  mimoCurrentTurnHasImages,
  mimoTurnHasImages,
} from '@/providers/mimo/runtime/buildMimoMessages';

function image(overrides: Partial<ImageAttachment> = {}): ImageAttachment {
  return {
    id: 'img-1',
    name: 'shot.png',
    mediaType: 'image/png',
    data: 'iVBORw0KGgo',
    size: 12,
    source: 'paste',
    ...overrides,
  };
}

function turn(text: string, images?: ImageAttachment[]) {
  return {
    isCompact: false,
    mcpMentions: new Set<string>(),
    persistedContent: text,
    prompt: text,
    request: { text, images, attachedFilePaths: [] },
  };
}

describe('buildMimoMessages', () => {
  it('sends the current screenshot as an image_url part, not as raw text', () => {
    const messages = buildMimoMessages(turn('what is this', [image()]), [], 'sys');

    expect(messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo' } },
        { type: 'text', text: 'what is this' },
      ],
    });
  });

  it('keeps earlier screenshots as image_url parts so follow-ups can still see them', () => {
    const history: ChatMessage[] = [{
      id: 'u1',
      role: 'user',
      content: 'first look',
      timestamp: 1,
      images: [image()],
    }, {
      id: 'a1',
      role: 'assistant',
      content: 'a cat',
      timestamp: 2,
    }];

    const messages = buildMimoMessages(turn('and now?'), history, 'sys');

    expect(messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo' } },
        { type: 'text', text: 'first look' },
      ],
    });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'a cat' });
    expect(messages[3]).toEqual({ role: 'user', content: 'and now?' });
  });

  it('uses a fallback prompt when the user sends only an image', () => {
    const messages = buildMimoMessages(turn('', [image()]), [], 'sys');
    const content = messages[1].content;

    expect(Array.isArray(content)).toBe(true);
    expect(content).toEqual(expect.arrayContaining([
      { type: 'text', text: 'Please look at the attached image.' },
    ]));
  });

  it('skips malformed persisted images instead of constructing unsafe data URLs', () => {
    const malformed = image({
      mediaType: 'image/svg+xml' as ImageAttachment['mediaType'],
      data: '<svg onload="alert(1)">',
    });
    const messages = buildMimoMessages(turn('describe', [malformed]), [], 'sys');

    expect(messages[1]).toEqual({ role: 'user', content: 'describe' });
    expect(mimoCurrentTurnHasImages(turn('describe', [malformed]))).toBe(false);
  });

  it('ignores empty image payloads for current and historical vision routing', () => {
    const empty = image({ data: '' });
    const history: ChatMessage[] = [{
      id: 'u1',
      role: 'user',
      content: 'empty image',
      timestamp: 1,
      images: [empty],
    }];

    expect(mimoCurrentTurnHasImages(turn('current', [empty]))).toBe(false);
    expect(mimoTurnHasImages(turn('follow-up'), history)).toBe(false);
  });
});
