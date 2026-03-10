/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChannelType } from 'discord.js';
import { DiscordPlugin } from '@/channels/plugins/discord/DiscordPlugin';
import type { IChannelPluginConfig } from '@/channels/types';

/**
 * Create a mock Discord channel object
 */
function createMockChannel(id: string, name: string, type: ChannelType, isTextBased = true, isThread = false) {
  return {
    id,
    name,
    type,
    isTextBased: () => isTextBased,
    isThread: () => isThread,
  };
}

/**
 * Build a mock Discord.js Client with guilds and channels
 */
function createMockClient(guilds: Array<{ id: string; name: string; channels: ReturnType<typeof createMockChannel>[] }>) {
  const guildCache = new Map<string, any>();
  for (const g of guilds) {
    const channelMap = new Map(g.channels.map((ch) => [ch.id, ch]));
    guildCache.set(g.id, {
      id: g.id,
      name: g.name,
      channels: {
        fetch: vi.fn().mockResolvedValue(channelMap),
      },
    });
  }
  return { guilds: { cache: guildCache } };
}

describe('DiscordPlugin.getGuildChannels', () => {
  let plugin: DiscordPlugin;

  beforeEach(() => {
    plugin = new DiscordPlugin();
  });

  it('returns empty array when client is null (not started)', async () => {
    const result = await plugin.getGuildChannels();
    expect(result).toEqual([]);
  });

  it('returns text channels grouped by guild', async () => {
    const mockClient = createMockClient([
      {
        id: 'guild1',
        name: 'Test Server',
        channels: [
          createMockChannel('ch1', 'general', ChannelType.GuildText),
          createMockChannel('ch2', 'announcements', ChannelType.GuildAnnouncement),
          createMockChannel('ch3', 'voice-room', ChannelType.GuildVoice, false),
          createMockChannel('ch4', 'category', ChannelType.GuildCategory, true),
          createMockChannel('ch5', 'thread-1', ChannelType.PublicThread, true, true),
        ],
      },
    ]);

    // Inject mock client via private field
    (plugin as any).client = mockClient;

    const result = await plugin.getGuildChannels();

    expect(result).toHaveLength(1);
    expect(result[0].guildId).toBe('guild1');
    expect(result[0].guildName).toBe('Test Server');
    // Should include text-based channels but exclude voice, category, and threads
    const channelIds = result[0].channels.map((c) => c.id);
    expect(channelIds).toContain('ch1'); // text
    expect(channelIds).toContain('ch2'); // announcement (text-based)
    expect(channelIds).not.toContain('ch3'); // voice (not text-based)
    expect(channelIds).not.toContain('ch4'); // category (excluded explicitly)
    expect(channelIds).not.toContain('ch5'); // thread (excluded)
  });

  it('returns multiple guilds', async () => {
    const mockClient = createMockClient([
      {
        id: 'guild1',
        name: 'Server A',
        channels: [createMockChannel('ch1', 'general', ChannelType.GuildText)],
      },
      {
        id: 'guild2',
        name: 'Server B',
        channels: [createMockChannel('ch2', 'chat', ChannelType.GuildText)],
      },
    ]);

    (plugin as any).client = mockClient;

    const result = await plugin.getGuildChannels();

    expect(result).toHaveLength(2);
    expect(result[0].guildName).toBe('Server A');
    expect(result[1].guildName).toBe('Server B');
  });

  it('skips guilds with no text channels', async () => {
    const mockClient = createMockClient([
      {
        id: 'guild1',
        name: 'Voice Only Server',
        channels: [createMockChannel('ch1', 'voice', ChannelType.GuildVoice, false)],
      },
    ]);

    (plugin as any).client = mockClient;

    const result = await plugin.getGuildChannels();

    expect(result).toHaveLength(0);
  });

  it('handles guild.channels.fetch() failure gracefully', async () => {
    const guildCache = new Map();
    guildCache.set('guild1', {
      id: 'guild1',
      name: 'Broken Server',
      channels: {
        fetch: vi.fn().mockRejectedValue(new Error('Missing Access')),
      },
    });

    (plugin as any).client = { guilds: { cache: guildCache } };

    const result = await plugin.getGuildChannels();

    // Should not throw, just return empty
    expect(result).toEqual([]);
  });

  it('handles mixed success and failure across guilds', async () => {
    const guildCache = new Map();
    // Guild 1: fetch fails
    guildCache.set('guild1', {
      id: 'guild1',
      name: 'Broken',
      channels: {
        fetch: vi.fn().mockRejectedValue(new Error('Forbidden')),
      },
    });
    // Guild 2: fetch succeeds
    const ch = createMockChannel('ch1', 'general', ChannelType.GuildText);
    guildCache.set('guild2', {
      id: 'guild2',
      name: 'Working',
      channels: {
        fetch: vi.fn().mockResolvedValue(new Map([['ch1', ch]])),
      },
    });

    (plugin as any).client = { guilds: { cache: guildCache } };

    const result = await plugin.getGuildChannels();

    expect(result).toHaveLength(1);
    expect(result[0].guildName).toBe('Working');
  });
});
