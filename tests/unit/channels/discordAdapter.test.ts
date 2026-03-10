/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { convertHtmlToDiscordMarkdown, splitMessage, DISCORD_MESSAGE_LIMIT } from '@/channels/plugins/discord/DiscordAdapter';

describe('convertHtmlToDiscordMarkdown', () => {
  it('converts bold tags', () => {
    expect(convertHtmlToDiscordMarkdown('<b>hello</b>')).toBe('**hello**');
  });

  it('converts italic tags', () => {
    expect(convertHtmlToDiscordMarkdown('<i>hello</i>')).toBe('*hello*');
  });

  it('converts underline tags', () => {
    expect(convertHtmlToDiscordMarkdown('<u>hello</u>')).toBe('__hello__');
  });

  it('converts strikethrough tags', () => {
    expect(convertHtmlToDiscordMarkdown('<s>hello</s>')).toBe('~~hello~~');
  });

  it('converts inline code tags', () => {
    expect(convertHtmlToDiscordMarkdown('<code>foo</code>')).toBe('`foo`');
  });

  it('converts code blocks', () => {
    expect(convertHtmlToDiscordMarkdown('<pre><code>line1\nline2</code></pre>')).toBe('```\nline1\nline2```');
  });

  it('converts links', () => {
    expect(convertHtmlToDiscordMarkdown('<a href="https://example.com">click</a>')).toBe('[click](https://example.com)');
  });

  it('converts blockquote', () => {
    expect(convertHtmlToDiscordMarkdown('<blockquote>quoted</blockquote>')).toBe('> quoted');
  });

  it('decodes HTML entities', () => {
    expect(convertHtmlToDiscordMarkdown('&amp; &lt; &gt; &quot;')).toBe('& < > "');
  });

  it('handles multiline bold', () => {
    expect(convertHtmlToDiscordMarkdown('<b>line1\nline2</b>')).toBe('**line1\nline2**');
  });

  it('handles nested bold+italic', () => {
    expect(convertHtmlToDiscordMarkdown('<b><i>text</i></b>')).toBe('***text***');
  });

  it('passes plain text through unchanged', () => {
    expect(convertHtmlToDiscordMarkdown('hello world')).toBe('hello world');
  });
});

describe('splitMessage', () => {
  it('returns single chunk for short text', () => {
    expect(splitMessage('hello')).toEqual(['hello']);
  });

  it('returns single chunk for text at limit', () => {
    const text = 'a'.repeat(DISCORD_MESSAGE_LIMIT);
    expect(splitMessage(text)).toEqual([text]);
  });

  it('splits text exceeding limit', () => {
    const text = 'a'.repeat(DISCORD_MESSAGE_LIMIT + 100);
    const chunks = splitMessage(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT);
    }
  });

  it('prefers splitting at newline', () => {
    const line1 = 'a'.repeat(1800);
    const line2 = 'b'.repeat(500);
    const text = `${line1}\n${line2}`;
    const chunks = splitMessage(text);
    expect(chunks[0]).toBe(line1);
    expect(chunks[1]).toBe(line2);
  });

  it('prefers splitting at space when no newline', () => {
    const part1 = 'a'.repeat(1800);
    const part2 = 'b'.repeat(500);
    const text = `${part1} ${part2}`;
    const chunks = splitMessage(text);
    expect(chunks[0]).toBe(part1);
    expect(chunks[1]).toBe(part2);
  });

  it('respects custom maxLength', () => {
    const text = 'hello world test';
    const chunks = splitMessage(text, 10);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10);
    }
  });
});
