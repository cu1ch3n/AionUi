/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionRowBuilder, type ButtonInteraction, type Message, type User as DiscordUser } from 'discord.js';
import type { IUnifiedIncomingMessage, IUnifiedMessageContent, IUnifiedOutgoingMessage, IUnifiedUser } from '../../types';

/**
 * DiscordAdapter - Converts between Discord and Unified message formats
 *
 * Handles:
 * - Discord Message → UnifiedIncomingMessage
 * - Discord ButtonInteraction → UnifiedIncomingMessage (action)
 * - UnifiedOutgoingMessage → Discord send options
 * - User info extraction
 * - Message splitting for 2000 char limit
 */

// ==================== Incoming Message Conversion ====================

/**
 * Discord message length limit
 */
export const DISCORD_MESSAGE_LIMIT = 2000;

/**
 * Convert Discord message to unified incoming message
 */
export function toUnifiedIncomingMessage(message: Message): IUnifiedIncomingMessage | null {
  const user = toUnifiedUser(message.author);
  if (!user) return null;

  const content = extractMessageContent(message);

  return {
    id: message.id,
    platform: 'discord',
    chatId: message.channelId,
    user,
    content,
    timestamp: message.createdTimestamp,
    replyToMessageId: message.reference?.messageId ?? undefined,
    isDirect: message.channel.isDMBased(),
    raw: message,
  };
}

/**
 * Convert Discord ButtonInteraction to unified incoming message
 */
export function toUnifiedInteraction(interaction: ButtonInteraction): IUnifiedIncomingMessage | null {
  const user = toUnifiedUser(interaction.user);
  if (!user) return null;

  return {
    id: interaction.id,
    platform: 'discord',
    chatId: interaction.channelId,
    user,
    content: {
      type: 'action',
      text: interaction.customId,
    },
    timestamp: interaction.createdTimestamp,
    raw: interaction,
  };
}

/**
 * Convert Discord user to unified user format
 */
export function toUnifiedUser(discordUser: DiscordUser | undefined): IUnifiedUser | null {
  if (!discordUser) return null;

  return {
    id: discordUser.id,
    username: discordUser.username,
    displayName: discordUser.displayName || discordUser.username,
    avatarUrl: discordUser.displayAvatarURL() || undefined,
  };
}

/**
 * Extract message content from Discord message
 */
function extractMessageContent(message: Message): IUnifiedMessageContent {
  // Check for attachments
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first()!;
    const mimeType = attachment.contentType || undefined;

    if (mimeType?.startsWith('image/')) {
      return {
        type: 'photo',
        text: message.content || '',
        attachments: [
          {
            type: 'photo',
            fileId: attachment.id,
            fileName: attachment.name || undefined,
            mimeType,
            size: attachment.size || undefined,
          },
        ],
      };
    }

    if (mimeType?.startsWith('audio/')) {
      return {
        type: 'audio',
        text: message.content || '',
        attachments: [
          {
            type: 'audio',
            fileId: attachment.id,
            fileName: attachment.name || undefined,
            mimeType,
            size: attachment.size || undefined,
          },
        ],
      };
    }

    if (mimeType?.startsWith('video/')) {
      return {
        type: 'video',
        text: message.content || '',
        attachments: [
          {
            type: 'video',
            fileId: attachment.id,
            fileName: attachment.name || undefined,
            mimeType,
            size: attachment.size || undefined,
          },
        ],
      };
    }

    // Default to document
    return {
      type: 'document',
      text: message.content || '',
      attachments: [
        {
          type: 'document',
          fileId: attachment.id,
          fileName: attachment.name || undefined,
          mimeType,
          size: attachment.size || undefined,
        },
      ],
    };
  }

  // Text message
  return {
    type: 'text',
    text: message.content || '',
  };
}

// ==================== Text Conversion ====================

/**
 * Convert HTML markup (used in system messages) to Discord Markdown
 */
export function convertHtmlToDiscordMarkdown(text: string): string {
  return text
    .replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, '```\n$1```')
    .replace(/<b>([\s\S]*?)<\/b>/g, '**$1**')
    .replace(/<i>([\s\S]*?)<\/i>/g, '*$1*')
    .replace(/<u>([\s\S]*?)<\/u>/g, '__$1__')
    .replace(/<s>([\s\S]*?)<\/s>/g, '~~$1~~')
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    .replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_, content: string) =>
      content
        .split('\n')
        .map((line: string) => `> ${line}`)
        .join('\n')
    )
    .replace(/<a href="(.*?)">([\s\S]*?)<\/a>/g, '[$2]($1)')
    // Strip any remaining HTML tags (e.g. <p>, <br>, <div>) before entity decoding
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Collapse 3+ consecutive newlines — Discord renders \n\n with extra visual spacing
    .replace(/\n{3,}/g, '\n\n');
}

// ==================== Outgoing Message Conversion ====================

/**
 * Discord send options
 */
export interface DiscordSendOptions {
  content: string;
  components?: any[];
}

/**
 * Convert unified outgoing message to Discord send options
 * Discord natively supports Markdown, so parseMode is ignored.
 */
export function toDiscordSendOptions(message: IUnifiedOutgoingMessage): DiscordSendOptions {
  const options: DiscordSendOptions = {
    content: message.text || '',
  };

  if (message.replyMarkup) {
    // Only pass Discord-native ActionRowBuilder components.
    // Telegram Keyboard/InlineKeyboard objects must be filtered out to avoid 400 errors.
    // Use both instanceof and structural check because instanceof can fail across module
    // boundaries in bundled Electron apps. Discord ActionRowBuilder has a `components` array
    // and a `data` property with `type: 1` (ComponentType.ActionRow).
    const items = Array.isArray(message.replyMarkup) ? message.replyMarkup : [message.replyMarkup];
    const isDiscordComponent = (item: any) => item instanceof ActionRowBuilder || (item && typeof item === 'object' && Array.isArray(item.components) && item.data?.type === 1);
    const discordComponents = items.filter(isDiscordComponent);
    if (discordComponents.length > 0) {
      options.components = discordComponents;
    }
  }

  return options;
}

// ==================== Message Length Utilities ====================

/**
 * Split long text into chunks that fit Discord's message limit.
 * Avoids splitting inside triple-backtick code blocks — if the candidate
 * split point falls inside a fenced block, the split is moved to just
 * before the opening fence (or just after the closing fence).
 */
export function splitMessage(text: string, maxLength: number = DISCORD_MESSAGE_LIMIT): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find a good split point (prefer newline, then space)
    let splitIndex = maxLength;

    // Look for newline within the last 20% of the chunk
    const newlineSearchStart = Math.floor(maxLength * 0.8);
    const lastNewline = remaining.lastIndexOf('\n', maxLength);
    if (lastNewline > newlineSearchStart) {
      splitIndex = lastNewline + 1;
    } else {
      // Look for space
      const lastSpace = remaining.lastIndexOf(' ', maxLength);
      if (lastSpace > newlineSearchStart) {
        splitIndex = lastSpace + 1;
      }
    }

    // Check if splitIndex falls inside an unclosed code block.
    // Count ``` occurrences before the split point — odd means we're inside a block.
    const beforeSplit = remaining.slice(0, splitIndex);
    const fenceCount = (beforeSplit.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
      // Inside a code block — move split to before the opening fence
      const lastFenceStart = beforeSplit.lastIndexOf('```');
      // Find the start of the line containing the opening fence
      const lineStart = beforeSplit.lastIndexOf('\n', lastFenceStart);
      if (lineStart > 0) {
        splitIndex = lineStart;
      } else {
        // Code block starts at the beginning — try splitting after the closing fence instead
        const closingFence = remaining.indexOf('```', lastFenceStart + 3);
        if (closingFence !== -1) {
          const afterClosing = remaining.indexOf('\n', closingFence + 3);
          splitIndex = afterClosing !== -1 ? afterClosing + 1 : closingFence + 3;
        }
        // If no closing fence found, fall through with the original splitIndex
      }
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}
