import { describe, expect, it } from "vitest";
import { applyChatEvent, parseSseChunk, toChatHistory, type Message } from "./chatPageUtils";

describe("chatPageUtils", () => {
  it("parses SSE chunks while preserving incomplete event buffers", () => {
    const firstPass = parseSseChunk("", 'data: {"type":"text_delta","content":"Hi"}\n\ndata: {"type":"done"}');
    expect(firstPass.events).toEqual([{ type: "text_delta", content: "Hi" }]);
    expect(firstPass.buffer).toBe('data: {"type":"done"}');

    const secondPass = parseSseChunk(firstPass.buffer, "\n\n");
    expect(secondPass.events).toEqual([{ type: "done" }]);
    expect(secondPass.buffer).toBe("");
  });

  it("applies tool and error events to a streaming assistant message", () => {
    const message: Message = {
      id: "a-1",
      role: "assistant",
      content: "Base",
      toolCalls: [],
      streaming: true,
    };

    const withTool = applyChatEvent(message, {
      type: "tool_start",
      id: "tool-1",
      name: "query",
      input: { sql: "select 1" },
    });
    const withResult = applyChatEvent(withTool, {
      type: "tool_result",
      id: "tool-1",
      content: '{"rows":[1]}',
    });
    const withError = applyChatEvent(withResult, {
      type: "error",
      message: "Oops",
    });

    expect(withResult.toolCalls?.[0]?.result).toBe('{"rows":[1]}');
    expect(withError.content).toContain("Oops");
    expect(withError.streaming).toBe(false);
  });

  it("converts persisted messages to chat history payloads", () => {
    const history = toChatHistory(
      [{ id: "u-1", role: "user", content: "Hello" }],
      { id: "u-2", role: "user", content: "How many points?" },
    );

    expect(history).toEqual([
      { role: "user", content: "Hello" },
      { role: "user", content: "How many points?" },
    ]);
  });
});
