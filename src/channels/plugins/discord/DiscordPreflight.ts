/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Message } from 'discord.js';

/**
 * Discord access control configuration.
 * Simplified flat config suitable for personal desktop assistant (not per-guild).
 */
export type IDiscordAccessConfig = {
  requireMention?: boolean; // Default: true (for guild channels)
  dmPolicy?: 'pairing' | 'reject'; // Default: 'pairing'
  allowedUserIds?: string[]; // Required — guild messages rejected when empty
  allowedGuildId?: string; // Required — guild messages rejected when not set
  channelPolicy?: 'all' | 'selected'; // Default: 'all'
  allowedChannelIds?: string[]; // Only used when channelPolicy === 'selected'
};

/**
 * Determine whether a Discord message should be processed by the bot.
 *
 * Gate sequence:
 * 1. DM check — if DM and dmPolicy is 'reject', drop; otherwise DMs pass
 * 2. Guild check — required, reject if not configured or guild doesn't match
 * 3. User allowlist — required, reject if empty or user not in list
 * 4. Channel filter — if channelPolicy is 'selected', reject if channel not in list
 * 5. Mention requirement — if requireMention is true, check explicit/implicit mention
 */
export function shouldProcessMessage(params: { message: Message; botUserId: string; config: IDiscordAccessConfig }): boolean {
  const { message, botUserId, config } = params;

  // 1. DM check
  if (message.channel.isDMBased()) {
    // Reject DMs when policy is 'reject'
    return config.dmPolicy !== 'reject';
  }

  // 2. Guild check — must be configured, reject when not set
  const allowedGuild = config.allowedGuildId;
  if (!allowedGuild) {
    return false;
  }
  const guildId = message.guildId;
  if (!guildId || guildId !== allowedGuild) {
    return false;
  }

  // 3. User allowlist — must be configured, reject when empty
  const userList = config.allowedUserIds;
  if (!userList || userList.length === 0) {
    return false;
  }
  if (!userList.includes(message.author.id)) {
    return false;
  }

  // 4. Channel filter — if channelPolicy is 'selected', reject if channel not in list
  if (config.channelPolicy === 'selected') {
    const channelList = config.allowedChannelIds;
    if (!channelList || channelList.length === 0) {
      return false;
    }
    if (!channelList.includes(message.channelId)) {
      return false;
    }
  }

  // 5. Mention requirement (default: true for guild channels)
  const requireMention = config.requireMention !== false;
  if (requireMention) {
    // Explicit mention: message.mentions.has(botUserId)
    const explicitMention = message.mentions.has(botUserId);

    // Implicit mention: replying to a bot message
    let implicitMention = false;
    if (message.reference?.messageId) {
      try {
        const referencedMsg = message.channel.messages.cache.get(message.reference.messageId);
        if (referencedMsg?.author.id === botUserId) {
          implicitMention = true;
        }
      } catch {
        // Cache miss — can't determine, treat as no implicit mention
      }
    }

    if (!explicitMention && !implicitMention) {
      return false;
    }
  }

  return true;
}

/**
 * Remove bot mention from message text and trim.
 * Strips both `<@botId>` and `<@!botId>` (nickname mention) patterns.
 */
export function stripBotMention(text: string, botUserId: string): string {
  return text.replace(new RegExp(`<@!?${botUserId}>`, 'g'), '').trim();
}
