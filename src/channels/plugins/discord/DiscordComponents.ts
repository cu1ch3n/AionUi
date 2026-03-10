/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Discord Components for Personal Assistant
 *
 * Uses Discord.js ActionRowBuilder + ButtonBuilder for interactive buttons.
 * Button customId format: category:action[:params...]
 */

// ==================== Button Builders ====================

/**
 * Main menu buttons shown to authorized users
 */
export function createMainMenuButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('system:session.new').setLabel('New Chat').setStyle(ButtonStyle.Primary).setEmoji('🆕'), new ButtonBuilder().setCustomId('system:agent.show').setLabel('Agent').setStyle(ButtonStyle.Secondary).setEmoji('🔄'), new ButtonBuilder().setCustomId('system:session.status').setLabel('Status').setStyle(ButtonStyle.Secondary).setEmoji('📊'), new ButtonBuilder().setCustomId('system:help.show').setLabel('Help').setStyle(ButtonStyle.Secondary).setEmoji('❓'));
  return [row];
}

/**
 * Response action buttons for AI response messages
 */
export function createResponseActionsButtons(_text?: string): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('action:copy').setLabel('Copy').setStyle(ButtonStyle.Secondary).setEmoji('📋'), new ButtonBuilder().setCustomId('action:regenerate').setLabel('Regenerate').setStyle(ButtonStyle.Secondary).setEmoji('🔄'), new ButtonBuilder().setCustomId('action:continue').setLabel('Continue').setStyle(ButtonStyle.Secondary).setEmoji('💬'));
  return [row];
}

/**
 * Tool confirmation buttons for tool calls
 * @param callId - The tool call ID for tracking
 * @param options - Array of { label, value } options
 */
export function createToolConfirmationButtons(callId: string, options: Array<{ label: string; value: string }>): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  // Discord allows max 5 buttons per row
  for (let i = 0; i < options.length; i += 5) {
    const rowOptions = options.slice(i, i + 5);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...rowOptions.map((opt) =>
        new ButtonBuilder()
          .setCustomId(`confirm:${callId}:${opt.value}`)
          .setLabel(opt.label)
          .setStyle(opt.value === 'cancel' ? ButtonStyle.Danger : ButtonStyle.Success)
      )
    );
    rows.push(row);
  }
  return rows;
}

/**
 * Error recovery buttons
 */
export function createErrorRecoveryButtons(_errorMessage?: string): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('error:retry').setLabel('Retry').setStyle(ButtonStyle.Primary).setEmoji('🔄'), new ButtonBuilder().setCustomId('system:session.new').setLabel('New Session').setStyle(ButtonStyle.Secondary).setEmoji('🆕'));
  return [row];
}

/**
 * Agent selection buttons
 */
export function createAgentSelectionButtons(agents: Array<{ type: string; emoji: string; name: string }>, currentAgent?: string): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < agents.length; i += 5) {
    const rowAgents = agents.slice(i, i + 5);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...rowAgents.map((agent) =>
        new ButtonBuilder()
          .setCustomId(`agent:${agent.type}`)
          .setLabel(currentAgent === agent.type ? `✓ ${agent.name}` : agent.name)
          .setStyle(currentAgent === agent.type ? ButtonStyle.Success : ButtonStyle.Secondary)
      )
    );
    rows.push(row);
  }
  return rows;
}

/**
 * Session control buttons
 */
export function createSessionControlButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('session:new').setLabel('New Session').setStyle(ButtonStyle.Primary).setEmoji('🆕'), new ButtonBuilder().setCustomId('session:status').setLabel('Session Status').setStyle(ButtonStyle.Secondary).setEmoji('📊'));
  return [row];
}

/**
 * Help menu buttons
 */
export function createHelpButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('help:features').setLabel('Features').setStyle(ButtonStyle.Secondary).setEmoji('🤖'), new ButtonBuilder().setCustomId('help:pairing').setLabel('Pairing Guide').setStyle(ButtonStyle.Secondary).setEmoji('🔗'), new ButtonBuilder().setCustomId('help:tips').setLabel('Tips').setStyle(ButtonStyle.Secondary).setEmoji('💬'));
  return [row];
}

// ==================== Pairing Builders ====================

/**
 * Pairing code buttons - shown after displaying a pairing code
 */
export function createPairingCodeButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('pairing:refresh').setLabel('Refresh Code').setStyle(ButtonStyle.Primary).setEmoji('🔄'), new ButtonBuilder().setCustomId('pairing:help').setLabel('Pairing Help').setStyle(ButtonStyle.Secondary).setEmoji('❓'));
  return [row];
}

/**
 * Pairing status buttons - shown while waiting for approval
 */
export function createPairingStatusButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('pairing:check').setLabel('Check Status').setStyle(ButtonStyle.Primary).setEmoji('🔄'), new ButtonBuilder().setCustomId('pairing:refresh').setLabel('Get New Code').setStyle(ButtonStyle.Secondary).setEmoji('🔄'));
  return [row];
}

/**
 * Pairing help buttons - shown on the help page
 */
export function createPairingHelpButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('pairing:refresh').setLabel('Get Pairing Code').setStyle(ButtonStyle.Primary).setEmoji('🔗'), new ButtonBuilder().setCustomId('pairing:check').setLabel('Check Status').setStyle(ButtonStyle.Secondary).setEmoji('🔄'));
  return [row];
}

// ==================== Utility Functions ====================

/**
 * Extract action name from customId
 * e.g., "action:copy" -> "copy"
 */
export function extractAction(customId: string): string {
  const parts = customId.split(':');
  return parts.length > 1 ? parts[1] : customId;
}

/**
 * Extract action category from customId
 * e.g., "action:copy" -> "action"
 */
export function extractCategory(customId: string): string {
  const parts = customId.split(':');
  return parts[0];
}
