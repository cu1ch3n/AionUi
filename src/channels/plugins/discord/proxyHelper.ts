/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import https from 'node:https';
import type { RequestOptions, ClientRequest } from 'node:https';
import { session } from 'electron';
import { ProxyAgent } from 'undici';
import { HttpsProxyAgent } from 'https-proxy-agent';

type DiscordProxyResult = {
  restAgent: ProxyAgent;
} | null;

/**
 * Parse Electron's proxy string into a proxy URI.
 */
function parseProxyString(proxyString: string): string | null {
  if (!proxyString || proxyString === 'DIRECT') return null;

  const match = proxyString.match(/^(PROXY|HTTPS|SOCKS5?)\s+(.+)$/i);
  if (!match) return null;

  const [, type, hostPort] = match;
  const scheme = type.toUpperCase().startsWith('SOCKS') ? 'socks5' : 'http';
  return `${scheme}://${hostPort}`;
}

/**
 * Patch https.request to route Discord gateway WebSocket connections through the proxy.
 *
 * The ws package sets its own `createConnection` (tls.connect) in the request options,
 * which bypasses any agent. We intercept https.request and for Discord gateway hosts,
 * remove the custom createConnection so the proxy agent can handle tunneling.
 */
function patchHttpsForDiscordGateway(proxyUri: string): void {
  const proxyAgent = new HttpsProxyAgent(proxyUri);
  const discordHosts = ['gateway.discord.gg', 'discord.com', 'discord.gg'];
  const originalRequest = https.request;

  https.request = function patchedRequest(
    ...args: Parameters<typeof https.request>
  ): ClientRequest {
    const opts = args[0];

    if (typeof opts === 'object' && 'host' in opts) {
      const host = (opts as RequestOptions).host || '';
      if (discordHosts.some((d) => host.endsWith(d))) {
        const patchedOpts = { ...(opts as RequestOptions) };
        // Remove ws's createConnection so the proxy agent can handle it
        delete (patchedOpts as any).createConnection;
        patchedOpts.agent = proxyAgent;
        args[0] = patchedOpts;
      }
    }

    return originalRequest.apply(this, args as any);
  } as typeof https.request;
}

/**
 * Resolve system proxy for Discord using Electron's proxy resolver.
 * Returns an undici ProxyAgent for REST calls, and patches https.request
 * for gateway WebSocket connections.
 */
export async function resolveSystemProxy(url: string): Promise<DiscordProxyResult> {
  try {
    const proxyString = await session.defaultSession.resolveProxy(url);
    const proxyUri = parseProxyString(proxyString);

    if (!proxyUri) return null;

    console.log(`[DiscordProxy] Using system proxy: ${proxyUri}`);

    // Patch https.request for gateway WebSocket proxy support
    patchHttpsForDiscordGateway(proxyUri);

    return {
      restAgent: new ProxyAgent(proxyUri),
    };
  } catch (error) {
    console.warn('[DiscordProxy] Failed to resolve system proxy:', error);
    return null;
  }
}
