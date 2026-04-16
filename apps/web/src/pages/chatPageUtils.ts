export type ProviderInfo = {
  id: string;
  name: string;
  provider: "anthropic" | "openai" | "google";
  model: string;
  authType: "apiKey" | "oauth";
  oauthConnected: boolean;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  streaming?: boolean;
};

export type ChatMessage = Pick<Message, "role" | "content">;

const MESSAGES_KEY = "fpl-chat-messages";

export type ChatEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_start"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; content: string }
  | { type: "error"; message: string }
  | { type: "done" };

export function shouldAutofocusChatInput(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
}

export function loadPersistedMessages(): Message[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

export function persistMessages(messages: Message[]): void {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
}

export function clearPersistedMessages(): void {
  localStorage.removeItem(MESSAGES_KEY);
}

export function toChatHistory(messages: Message[], nextMessage: Message): ChatMessage[] {
  return [...messages, nextMessage].map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function parseSseChunk(
  buffer: string,
  chunk: string,
): { buffer: string; events: ChatEvent[] } {
  const nextBuffer = buffer + chunk;
  const parts = nextBuffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const events: ChatEvent[] = [];

  for (const part of parts) {
    for (const line of part.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        events.push(JSON.parse(line.slice(6)) as ChatEvent);
      } catch {
        // Ignore malformed event payloads and continue streaming.
      }
    }
  }

  return { buffer: remainder, events };
}

export function applyChatEvent(message: Message, event: ChatEvent): Message {
  if (event.type === "text_delta") {
    return { ...message, content: message.content + event.content };
  }

  if (event.type === "tool_start") {
    return {
      ...message,
      toolCalls: [
        ...(message.toolCalls ?? []),
        { id: event.id, name: event.name, input: event.input },
      ],
    };
  }

  if (event.type === "tool_result") {
    return {
      ...message,
      toolCalls: (message.toolCalls ?? []).map((toolCall) =>
        toolCall.id === event.id ? { ...toolCall, result: event.content } : toolCall,
      ),
    };
  }

  if (event.type === "error") {
    return {
      ...message,
      content: message.content ? `${message.content}\n\n⚠️ ${event.message}` : `⚠️ ${event.message}`,
      streaming: false,
    };
  }

  return { ...message, streaming: false };
}
