/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { shouldProcessMessage, stripBotMention } from '@/channels/plugins/discord/DiscordPreflight';
import type { IDiscordAccessConfig } from '@/channels/plugins/discord/DiscordPreflight';
import type { Collection, Message } from 'discord.js';

/**
 * Helper to build a minimal mock Discord Message for testing.
 * Only the fields used by shouldProcessMessage are mocked.
 */
function createMockMessage(overrides: { isDM?: boolean; authorId?: string; mentionsBot?: boolean; mentionsOthers?: boolean; replyToBotMessage?: boolean; botUserId?: string; guildId?: string | null; channelId?: string }): Message {
  const { isDM = false, authorId = 'user123', mentionsBot = false, mentionsOthers = false, replyToBotMessage = false, botUserId = 'bot456', guildId = isDM ? null : 'guild001', channelId = 'channel001' } = overrides;

  // Build mentions.users collection mock
  const mentionedUsers: Array<{ id: string }> = [];
  if (mentionsBot) mentionedUsers.push({ id: botUserId });
  if (mentionsOthers) mentionedUsers.push({ id: 'otherUser789' });

  const mentionsHas = vi.fn((id: string) => mentionedUsers.some((u) => u.id === id));
  const mentionsUsersSome = vi.fn((fn: (user: { id: string }) => boolean) => mentionedUsers.some(fn));

  // Build channel messages cache for reply detection
  const referencedMessage = replyToBotMessage ? { author: { id: botUserId } } : { author: { id: 'someoneElse' } };
  const messagesCache = {
    get: vi.fn((_msgId: string) => (replyToBotMessage !== undefined ? referencedMessage : undefined)),
  };

  return {
    channel: {
      isDMBased: () => isDM,
      messages: { cache: messagesCache },
    },
    author: { id: authorId },
    guildId,
    channelId,
    mentions: {
      has: mentionsHas,
      users: { some: mentionsUsersSome } as unknown as Collection<string, { id: string }>,
    },
    reference: replyToBotMessage ? { messageId: 'ref123' } : null,
  } as unknown as Message;
}

const BOT_ID = 'bot456';

// Base config with required fields populated for guild message tests
const BASE_CONFIG: IDiscordAccessConfig = {
  allowedGuildId: 'guild001',
  allowedUserIds: ['user123'],
};

describe('shouldProcessMessage', () => {
  it('DM message always passes regardless of requireMention', () => {
    const msg = createMockMessage({ isDM: true });
    const config: IDiscordAccessConfig = { requireMention: true };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });

  it('guild msg, no mention, requireMention: true → dropped', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: false });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, requireMention: true };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(false);
  });

  it('guild msg, @mention, requireMention: true → passes', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: true });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, requireMention: true };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });

  it('guild msg, reply to bot, requireMention: true → passes (implicit mention)', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: false, replyToBotMessage: true });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, requireMention: true };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });

  it('guild msg, requireMention: false → passes without mention', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: false });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, requireMention: false };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });

  it('guild msg from user in allowedUserIds → passes', () => {
    const msg = createMockMessage({ isDM: false, authorId: 'user123', mentionsBot: true });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, allowedUserIds: ['user123'] };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });

  it('guild msg from user not in allowedUserIds → dropped', () => {
    const msg = createMockMessage({ isDM: false, authorId: 'stranger', mentionsBot: true });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, allowedUserIds: ['user123'] };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(false);
  });

  it('empty allowedUserIds → dropped (allowlist required)', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: true });
    const config: IDiscordAccessConfig = { allowedGuildId: 'guild001', allowedUserIds: [] };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(false);
  });

  it('undefined allowedUserIds → dropped (allowlist required)', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: true });
    const config: IDiscordAccessConfig = { allowedGuildId: 'guild001' };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(false);
  });

  it('default config (empty) → dropped (no allowlists configured)', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: false });
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config: {} })).toBe(false);
  });

  it('DM message with dmPolicy: reject → dropped', () => {
    const msg = createMockMessage({ isDM: true });
    const config: IDiscordAccessConfig = { dmPolicy: 'reject' };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(false);
  });

  it('DM message with dmPolicy: pairing → passes (pairing handled downstream)', () => {
    const msg = createMockMessage({ isDM: true });
    const config: IDiscordAccessConfig = { dmPolicy: 'pairing' };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });

  it('guild msg from allowed guild → passes', () => {
    const msg = createMockMessage({ isDM: false, guildId: 'guild001', mentionsBot: true });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, allowedGuildId: 'guild001' };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });

  it('guild msg from disallowed guild → dropped', () => {
    const msg = createMockMessage({ isDM: false, guildId: 'guild999', mentionsBot: true });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, allowedGuildId: 'guild001' };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(false);
  });

  it('empty allowedGuildId → dropped (guild required)', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: true });
    const config: IDiscordAccessConfig = { allowedUserIds: ['user123'], allowedGuildId: '' };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(false);
  });

  it('undefined allowedGuildId → dropped (guild required)', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: true });
    const config: IDiscordAccessConfig = { allowedUserIds: ['user123'] };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(false);
  });

  it('DM bypasses guild and allowlist requirements', () => {
    const msg = createMockMessage({ isDM: true });
    const config: IDiscordAccessConfig = { allowedUserIds: [], allowedGuildId: '' };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });

  // ==================== Channel Policy Tests ====================

  it('channelPolicy: all → passes (default behavior)', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: true, channelId: 'ch999' });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, channelPolicy: 'all' };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });

  it('channelPolicy: selected, channelId in list → passes', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: true, channelId: 'ch001' });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, channelPolicy: 'selected', allowedChannelIds: ['ch001', 'ch002'] };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });

  it('channelPolicy: selected, channelId not in list → dropped', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: true, channelId: 'ch999' });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, channelPolicy: 'selected', allowedChannelIds: ['ch001', 'ch002'] };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(false);
  });

  it('channelPolicy: selected, empty allowedChannelIds → dropped', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: true, channelId: 'ch001' });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG, channelPolicy: 'selected', allowedChannelIds: [] };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(false);
  });

  it('channelPolicy not set → default all, passes regardless of channel', () => {
    const msg = createMockMessage({ isDM: false, mentionsBot: true, channelId: 'ch999' });
    const config: IDiscordAccessConfig = { ...BASE_CONFIG };
    expect(shouldProcessMessage({ message: msg, botUserId: BOT_ID, config })).toBe(true);
  });
});

describe('stripBotMention', () => {
  it('strips <@botId> from text', () => {
    expect(stripBotMention(`<@${BOT_ID}> hello world`, BOT_ID)).toBe('hello world');
  });

  it('strips <@!botId> (nickname mention) from text', () => {
    expect(stripBotMention(`<@!${BOT_ID}> hello world`, BOT_ID)).toBe('hello world');
  });

  it('trims leading whitespace after stripping', () => {
    expect(stripBotMention(`  <@${BOT_ID}>   hello  `, BOT_ID)).toBe('hello');
  });

  it('strips multiple mentions', () => {
    expect(stripBotMention(`<@${BOT_ID}> hey <@${BOT_ID}>`, BOT_ID)).toBe('hey');
  });

  it('returns original text when no mention present', () => {
    expect(stripBotMention('hello world', BOT_ID)).toBe('hello world');
  });

  it('returns empty string when text is only a mention', () => {
    expect(stripBotMention(`<@${BOT_ID}>`, BOT_ID)).toBe('');
  });
});
