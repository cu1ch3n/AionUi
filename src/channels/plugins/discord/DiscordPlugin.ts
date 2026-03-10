/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, GatewayIntentBits, Partials, type ButtonInteraction, type Message, type TextChannel, ChannelType } from 'discord.js';
import type { BotInfo, IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';
import { DISCORD_MESSAGE_LIMIT, splitMessage, toDiscordSendOptions, toUnifiedIncomingMessage, toUnifiedInteraction } from './DiscordAdapter';
import { extractAction, extractCategory } from './DiscordComponents';
import { type IDiscordAccessConfig, shouldProcessMessage, stripBotMention } from './DiscordPreflight';
import { resolveSystemProxy } from './proxyHelper';

/**
 * DiscordPlugin - Discord Bot integration for Personal Assistant
 *
 * Uses discord.js v14 for Discord Bot API
 * Supports gateway connection with automatic reconnection
 */
export class DiscordPlugin extends BasePlugin {
  readonly type: PluginType = 'discord';

  private client: Client | null = null;

  // Track active users for status reporting (capped to prevent unbounded growth)
  private activeUsers: Set<string> = new Set();
  private static readonly MAX_ACTIVE_USERS = 1000;

  // Access control configuration (updated live from settings)
  private accessConfig: IDiscordAccessConfig = {};

  /**
   * Initialize the Discord bot instance
   */
  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const token = config.credentials?.token;
    if (!token) {
      throw new Error('Discord bot token is required');
    }

    // Resolve system proxy for Discord (REST + WebSocket gateway)
    const proxy = await resolveSystemProxy('https://discord.com');

    // Create client instance with required intents
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
      partials: [Partials.Channel], // Required for DM support
      rest: proxy ? { agent: proxy.restAgent } : undefined,
    });

    // Setup handlers
    this.setupHandlers();
  }

  /**
   * Start the Discord bot - login and wait for ready
   */
  protected async onStart(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const token = this.config?.credentials?.token;
    if (!token) {
      throw new Error('Discord bot token is required');
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Discord login timeout after 30s'));
      }, 30000);

      this.client!.once('ready', () => {
        clearTimeout(timeout);
        console.log(`[DiscordPlugin] Bot ready as ${this.client!.user?.tag}`);
        resolve();
      });

      this.client!.login(token).catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Stop the bot and cleanup
   */
  protected async onStop(): Promise<void> {
    if (this.client) {
      void this.client.destroy();
      this.client = null;
    }
    this.activeUsers.clear();
    console.log('[DiscordPlugin] Stopped and cleaned up');
  }

  /**
   * Get active user count
   */
  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  /**
   * Get bot information
   */
  getBotInfo(): BotInfo | null {
    const user = this.client?.user;
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
    };
  }

  /**
   * Update access control configuration (called live from settings)
   */
  updateAccessConfig(config: IDiscordAccessConfig): void {
    this.accessConfig = config;
  }

  /**
   * Get text-based channels grouped by guild.
   * Fetches from Discord API to ensure complete data (cache may be incomplete).
   * Used by Settings UI to let users select allowed channels.
   */
  async getGuildChannels(): Promise<Array<{ guildId: string; guildName: string; channels: Array<{ id: string; name: string }> }>> {
    if (!this.client) return [];

    const result: Array<{ guildId: string; guildName: string; channels: Array<{ id: string; name: string }> }> = [];

    for (const [, guild] of this.client.guilds.cache) {
      try {
        const fetched = await guild.channels.fetch();
        const textChannels: Array<{ id: string; name: string }> = [];
        for (const [, ch] of fetched) {
          if (ch && ch.isTextBased() && !ch.isThread() && ch.type !== ChannelType.GuildCategory) {
            textChannels.push({ id: ch.id, name: ch.name });
          }
        }
        if (textChannels.length > 0) {
          result.push({ guildId: guild.id, guildName: guild.name, channels: textChannels });
        }
      } catch (error) {
        console.warn(`[DiscordPlugin] Failed to fetch channels for guild ${guild.name}:`, error);
      }
    }

    return result;
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const discordChannel = await this.client.channels.fetch(chatId);
    if (!discordChannel || !('send' in discordChannel)) {
      throw new Error(`Channel ${chatId} not found or not a text channel`);
    }

    const textChannel = discordChannel as TextChannel;
    const { content, components } = toDiscordSendOptions(message);

    // Discord rejects empty content (400). Use placeholder if empty.
    const safeContent = content.trim() || '...';

    // Handle long messages by splitting
    const chunks = splitMessage(safeContent, DISCORD_MESSAGE_LIMIT);
    let lastMessageId = '';

    for (let i = 0; i < chunks.length; i++) {
      const isLastChunk = i === chunks.length - 1;

      try {
        const result = await textChannel.send({
          content: chunks[i],
          components: isLastChunk ? components : undefined,
        });
        lastMessageId = result.id;
      } catch (error) {
        console.error(`[DiscordPlugin] Failed to send message chunk ${i + 1}/${chunks.length}:`, error);
        throw error;
      }
    }

    return lastMessageId;
  }

  /**
   * Edit an existing message
   */
  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const discordChannel = await this.client.channels.fetch(chatId);
    if (!discordChannel || !('messages' in discordChannel)) {
      throw new Error(`Channel ${chatId} not found or not a text channel`);
    }

    const textChannel = discordChannel as TextChannel;
    const { content, components } = toDiscordSendOptions(message);

    // Skip edit if content is empty or whitespace-only
    if (!content.trim()) {
      return;
    }

    try {
      const msg = await textChannel.messages.fetch(messageId);

      if (content.length <= DISCORD_MESSAGE_LIMIT) {
        // Fits in one message — just edit
        await msg.edit({ content, components });
      } else {
        // Content exceeds limit: edit first chunk, send overflow as new messages
        const chunks = splitMessage(content, DISCORD_MESSAGE_LIMIT);
        await msg.edit({ content: chunks[0] });

        for (let i = 1; i < chunks.length; i++) {
          const isLastChunk = i === chunks.length - 1;
          await textChannel.send({
            content: chunks[i],
            components: isLastChunk ? components : undefined,
          });
        }
      }
    } catch (error: any) {
      // Ignore "Unknown Message" errors (message may have been deleted)
      if (error.code === 10008) {
        return;
      }
      console.error('[DiscordPlugin] Failed to edit message:', error);
      throw error;
    }
  }

  /**
   * Setup message and interaction handlers
   */
  private setupHandlers(): void {
    if (!this.client) return;

    // Handle new messages
    this.client.on('messageCreate', async (message: Message) => {
      // Ignore bot messages (including self)
      if (message.author.bot) return;

      // Preflight: check access control before processing
      const botUserId = this.client?.user?.id;
      if (!botUserId || !shouldProcessMessage({ message, botUserId, config: this.accessConfig })) {
        return; // Silent drop
      }

      const userId = message.author.id;
      if (this.activeUsers.size < DiscordPlugin.MAX_ACTIVE_USERS) {
        this.activeUsers.add(userId);
      }

      try {
        const unifiedMessage = toUnifiedIncomingMessage(message);
        if (!unifiedMessage || !this.messageHandler) return;

        // Strip bot mention from text content
        if (botUserId && unifiedMessage.content.text) {
          unifiedMessage.content.text = stripBotMention(unifiedMessage.content.text, botUserId);
        }

        // Map /start to command type
        if (message.content?.toLowerCase() === '/start') {
          unifiedMessage.content.type = 'command';
          unifiedMessage.content.text = '/start';
        }

        // IMPORTANT: Don't await - process in background to avoid blocking
        void this.messageHandler(unifiedMessage).catch((error) => {
          console.error(`[DiscordPlugin] Message handler failed for: ${message.content?.slice(0, 20)}...`, error);
        });
      } catch (error) {
        console.error(`[DiscordPlugin] Error handling message:`, error);
      }
    });

    // Handle button interactions
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      const buttonInteraction = interaction as ButtonInteraction;
      const userId = buttonInteraction.user.id;
      if (this.activeUsers.size < DiscordPlugin.MAX_ACTIVE_USERS) {
        this.activeUsers.add(userId);
      }

      // Defer the interaction response to prevent timeout
      try {
        await buttonInteraction.deferUpdate();
      } catch (err) {
        console.warn('[DiscordPlugin] Failed to defer interaction:', err);
      }

      await this.handleButtonInteraction(buttonInteraction);
    });

    // Error handler
    this.client.on('error', (error) => {
      console.error('[DiscordPlugin] Client error:', error.message);
      this.setError(error.message);
    });

    // Warn handler
    this.client.on('warn', (warning) => {
      console.warn('[DiscordPlugin] Client warning:', warning);
    });
  }

  /**
   * Handle button interactions (inline button presses)
   */
  private async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;
    if (!customId) return;

    const category = extractCategory(customId);

    // Handle tool confirmation: confirm:{callId}:{value}
    if (category === 'confirm') {
      const parts = customId.split(':');
      if (parts.length >= 3 && this.confirmHandler) {
        const callId = parts[1];
        const value = parts.slice(2).join(':');
        void this.confirmHandler(interaction.user.id, 'discord', callId, value)
          .then(async () => {
            // Remove buttons after confirmation
            try {
              await interaction.message.edit({ components: [] });
            } catch (editError) {
              console.debug(`[DiscordPlugin] Failed to remove buttons (ignored):`, editError);
            }
          })
          .catch((error) => console.error(`[DiscordPlugin] Error handling confirm callback:`, error));
      }
      return;
    }

    // Handle agent selection: agent:{agentType}
    if (category === 'agent') {
      const agentType = extractAction(customId);
      const unifiedMessage = toUnifiedInteraction(interaction);
      if (unifiedMessage && this.messageHandler) {
        unifiedMessage.content.type = 'action';
        unifiedMessage.content.text = 'agent.select';
        unifiedMessage.action = {
          type: 'system',
          name: 'agent.select',
          params: { agentType },
        };
        void this.messageHandler(unifiedMessage)
          .then(async () => {
            try {
              await interaction.message.edit({ components: [] });
            } catch (editError) {
              console.debug(`[DiscordPlugin] Failed to remove agent selection buttons (ignored):`, editError);
            }
          })
          .catch((error) => console.error(`[DiscordPlugin] Error handling agent selection:`, error));
      }
      return;
    }

    // Handle system actions: system:{actionName}
    if (category === 'system') {
      const actionName = extractAction(customId);
      const unifiedMessage = toUnifiedInteraction(interaction);
      if (unifiedMessage && this.messageHandler) {
        unifiedMessage.content.type = 'action';
        unifiedMessage.content.text = actionName;
        unifiedMessage.action = {
          type: 'system',
          name: actionName,
        };
        void this.messageHandler(unifiedMessage).catch((error) => console.error(`[DiscordPlugin] Error handling system action:`, error));
      }
      return;
    }

    // Other callback types
    const unifiedMessage = toUnifiedInteraction(interaction);
    if (unifiedMessage && this.messageHandler) {
      unifiedMessage.content.type = 'action';
      unifiedMessage.content.text = customId;

      const action = extractAction(customId);
      unifiedMessage.action = {
        type: category === 'pairing' ? 'platform' : category === 'action' || category === 'session' ? 'system' : 'chat',
        name: `${category}.${action}`,
        params: { originalMessageId: interaction.message.id },
      };

      void this.messageHandler(unifiedMessage).catch((error) => console.error(`[DiscordPlugin] Error handling button interaction:`, error));
    }
  }

  /**
   * Test connection with a token
   * Used by Settings UI to validate token before saving
   */
  static async testConnection(token: string): Promise<{ success: boolean; botInfo?: BotInfo; error?: string }> {
    const proxy = await resolveSystemProxy('https://discord.com');

    const client = new Client({
      intents: [GatewayIntentBits.Guilds],
      rest: proxy ? { agent: proxy.restAgent } : undefined,
    });

    try {
      return await new Promise<{ success: boolean; botInfo?: BotInfo; error?: string }>((resolve) => {
        const timeout = setTimeout(() => {
          void client.destroy();
          resolve({ success: false, error: 'Connection timeout' });
        }, 15000);

        client.once('ready', () => {
          clearTimeout(timeout);
          const user = client.user;
          const result = {
            success: true,
            botInfo: user
              ? {
                  id: user.id,
                  username: user.username,
                  displayName: user.displayName || user.username,
                }
              : undefined,
          };
          void client.destroy();
          resolve(result);
        });

        client.login(token).catch((error: any) => {
          clearTimeout(timeout);
          let errorMessage = 'Connection failed';

          if (error.code === 'TokenInvalid' || error.message?.includes('TOKEN_INVALID')) {
            errorMessage = 'Invalid bot token';
          } else if (error.code === 'DisallowedIntents') {
            errorMessage = 'Disallowed intents - enable "Message Content" in Discord Developer Portal';
          } else if (error.message) {
            errorMessage = error.message;
          }

          void client.destroy();
          resolve({ success: false, error: errorMessage });
        });
      });
    } catch (error: any) {
      void client.destroy();
      return { success: false, error: error.message || 'Connection failed' };
    }
  }
}
