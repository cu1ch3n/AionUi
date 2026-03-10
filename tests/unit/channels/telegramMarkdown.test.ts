/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { escapeHtml, markdownToTelegramHtml } from '@/channels/plugins/telegram/TelegramAdapter';

describe('escapeHtml', () => {
  it('should escape &, <, >', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('should return plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('markdownToTelegramHtml', () => {
  // Bold
  it('should convert **bold** to <b>', () => {
    expect(markdownToTelegramHtml('**bold**')).toBe('<b>bold</b>');
  });

  it('should convert __bold__ to <b>', () => {
    expect(markdownToTelegramHtml('__bold__')).toBe('<b>bold</b>');
  });

  // Italic
  it('should convert *italic* to <i>', () => {
    expect(markdownToTelegramHtml('*italic*')).toBe('<i>italic</i>');
  });

  it('should convert _italic_ to <i>', () => {
    expect(markdownToTelegramHtml('_italic_')).toBe('<i>italic</i>');
  });

  // Inline code
  it('should convert `code` to <code>', () => {
    expect(markdownToTelegramHtml('`code`')).toBe('<code>code</code>');
  });

  // Code blocks
  it('should convert fenced code blocks to <pre><code>', () => {
    expect(markdownToTelegramHtml('```\nline1\nline2\n```')).toBe('<pre><code>line1\nline2\n</code></pre>');
  });

  it('should handle code blocks with language tag', () => {
    expect(markdownToTelegramHtml('```ts\nconst x = 1;\n```')).toBe('<pre><code>const x = 1;\n</code></pre>');
  });

  // Links
  it('should convert [text](url) to <a>', () => {
    expect(markdownToTelegramHtml('[click](https://example.com)')).toBe('<a href="https://example.com">click</a>');
  });

  // HTML escaping inside markdown
  it('should escape HTML special chars in text', () => {
    expect(markdownToTelegramHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  // The main bug fix: underscores inside inline code must NOT become italic
  it('should not apply italic inside inline code (underscore)', () => {
    expect(markdownToTelegramHtml('`file_name_test`')).toBe('<code>file_name_test</code>');
  });

  it('should not apply italic inside inline code (asterisk)', () => {
    expect(markdownToTelegramHtml('`glob_*_pattern`')).toBe('<code>glob_*_pattern</code>');
  });

  // Underscores and asterisks inside fenced code blocks must be preserved
  it('should not apply bold/italic inside fenced code blocks', () => {
    const input = '```\nconst file_name = get_value();\nlet *ptr = null;\n```';
    const result = markdownToTelegramHtml(input);
    expect(result).toBe('<pre><code>const file_name = get_value();\nlet *ptr = null;\n</code></pre>');
  });

  // Mixed: code + formatting outside code
  it('should format text outside code while protecting code content', () => {
    const input = 'Use `file_name_test` for **bold** items';
    const result = markdownToTelegramHtml(input);
    expect(result).toBe('Use <code>file_name_test</code> for <b>bold</b> items');
  });

  it('should handle multiple inline code spans with underscores', () => {
    const input = '`a_b` and `c_d`';
    const result = markdownToTelegramHtml(input);
    expect(result).toBe('<code>a_b</code> and <code>c_d</code>');
  });

  // Edge case: code block followed by italic text
  it('should handle code block followed by italic text', () => {
    const input = '```\ncode_here\n```\n_italic_';
    const result = markdownToTelegramHtml(input);
    expect(result).toBe('<pre><code>code_here\n</code></pre>\n<i>italic</i>');
  });
});
