/**
 * api.ts – Thin wrapper around the openworker-spring-ai REST + SSE API.
 */

import axios from "axios";

export const BASE_URL = process.env.OPENWORKER_URL ?? "http://localhost:8765";

// ──────────────────────────────────────────────────────────────────────────────
// Types (mirroring the Java models)
// ──────────────────────────────────────────────────────────────────────────────

export type AgentMode = "DISCUSS" | "PLAN" | "FULL";

export interface SessionSummary {
  id: string;
  title: string;
  agentMode: AgentMode;
  createdAt: string;
  updatedAt: string;
}

export interface MessageResponse {
  id: number;
  sessionId: string;
  messageType: string;
  content: string;
  createdAt: string;
}

export interface SessionDetail extends SessionSummary {
  messages: MessageResponse[];
}

export type AgentEventType =
  | "STARTED"
  | "NARRATION"
  | "TOOL_CALL"
  | "TOOL_RESULT"
  | "PERMISSION_REQUIRED"
  | "COMPLETED"
  | "ERROR";

export interface AgentEvent {
  type: AgentEventType;
  content: string | null;
  toolName: string | null;
  toolCallId: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Session CRUD
// ──────────────────────────────────────────────────────────────────────────────

const http = axios.create({ baseURL: BASE_URL });

export async function createSession(
  title?: string,
  initialMode?: AgentMode
): Promise<SessionSummary> {
  const { data } = await http.post<SessionSummary>("/api/sessions", {
    title,
    initialMode,
  });
  return data;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const { data } = await http.get<SessionSummary[]>("/api/sessions");
  return data;
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  const { data } = await http.get<SessionDetail>(`/api/sessions/${sessionId}`);
  return data;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await http.delete(`/api/sessions/${sessionId}`);
}

export async function updateMode(
  sessionId: string,
  mode: AgentMode
): Promise<SessionSummary> {
  const { data } = await http.patch<SessionSummary>(
    `/api/sessions/${sessionId}/mode`,
    { mode }
  );
  return data;
}

export async function submitPermissionDecision(
  sessionId: string,
  toolCallId: string,
  approved: boolean
): Promise<void> {
  await http.post(`/api/sessions/${sessionId}/permissions/${toolCallId}`, {
    approved,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Turn streaming (SSE via native fetch)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Stream a turn and yield each AgentEvent as an async generator.
 */
export async function* streamTurn(
  sessionId: string,
  prompt: string,
  mode?: AgentMode
): AsyncGenerator<AgentEvent> {
  const url = `${BASE_URL}/api/sessions/${sessionId}/turns`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ prompt, mode }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data:")) {
        const raw = line.slice(5).trim();
        if (raw) {
          try {
            yield JSON.parse(raw) as AgentEvent;
          } catch {
            // ignore malformed frames
          }
        }
      }
    }
  }
}
