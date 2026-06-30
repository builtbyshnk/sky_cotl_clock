import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/tauri/overlay";
import {
  buildDiscordRpcPresence as buildDiscordRpcPresenceFallback,
  type DiscordRpcBuildInput,
  type DiscordRpcPresencePayload,
} from "@/domain/discordRpc";

export interface DiscordRpcStatus {
  configured: boolean;
  connected: boolean;
  active: boolean;
  lastError?: string;
}

export async function getDiscordRpcStatus(): Promise<DiscordRpcStatus> {
  if (!isTauriRuntime()) {
    return {
      configured: false,
      connected: false,
      active: false,
      lastError: "Discord RPC is available in the desktop app only.",
    };
  }

  return invoke<DiscordRpcStatus>("discord_rpc_status", { clientId: "" });
}

export async function getDiscordRpcStatusForClient(
  clientId: string,
): Promise<DiscordRpcStatus> {
  if (!isTauriRuntime()) {
    return {
      configured: false,
      connected: false,
      active: false,
      lastError: "Discord RPC is available in the desktop app only.",
    };
  }

  return invoke<DiscordRpcStatus>("discord_rpc_status", { clientId });
}

export async function updateDiscordRpc(
  payload: DiscordRpcPresencePayload,
  clientId: string,
) {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke<DiscordRpcStatus>("discord_rpc_update", { payload, clientId });
}

export async function clearDiscordRpc() {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke<DiscordRpcStatus>("discord_rpc_clear");
}

export async function buildDiscordRpcPresenceFromTauri(
  input: DiscordRpcBuildInput,
): Promise<DiscordRpcPresencePayload | null> {
  if (!isTauriRuntime()) {
    return buildDiscordRpcPresenceFallback(input);
  }

  return invoke<DiscordRpcPresencePayload | null>("build_discord_rpc_presence", {
    payload: input,
  });
}
