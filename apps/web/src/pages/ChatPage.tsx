import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, MessageSquare, Bot, User, Loader2, LogIn, Download, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChatGoogleAuthUrl, getChatProviders, streamChat } from "@/api/client";
import {
  applyChatEvent,
  clearPersistedMessages,
  loadPersistedMessages,
  persistMessages,
  parseSseChunk,
  shouldAutofocusChatInput,
  toChatHistory,
  type Message,
  type ProviderInfo,
} from "./chatPageUtils";
import {
  clearPendingH2HChatSeed,
  loadPendingH2HChatSeed,
} from "./h2hChatPrompt";

const PROVIDER_KEY = "fpl-chat-provider";

function prettifyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function getToolSql(input: Record<string, unknown>): string | null {
  return typeof input.sql === "string" ? input.sql : null;
}

function downloadMarkdown(content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fpl-chat-export-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Markdown components (dark theme) ─────────────────────────────────────────

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/80">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px] text-accent/90">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-1.5 overflow-x-auto rounded-lg bg-black/30 p-2.5 font-mono text-[11px] text-accent/90">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
      <table className="min-w-full border-collapse text-left text-xs text-white/85">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.06]">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-white/10 last:border-b-0">{children}</tr>,
  th: ({ children }) => (
    <th className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/55">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="whitespace-nowrap px-3 py-2 align-top text-sm text-white/85">{children}</td>
  ),
  ul: ({ children }) => <ul className="mb-1.5 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <h1 className="mb-2 text-base font-bold text-white">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 text-sm font-bold text-white">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold text-white/90">{children}</h3>,
};

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [showQueries, setShowQueries] = useState(false);
  const toolCalls = message.toolCalls ?? [];
  const hasQueries = toolCalls.length > 0;
  const canExportMarkdown = !isUser && Boolean(message.content);
  const queryLabel = toolCalls.length > 1 ? `DB queries (${toolCalls.length})` : "DB query";

  return (
    <div className={cn("flex gap-3 px-4 py-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-gradient-to-br from-primary to-primary/60"
            : "bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/30",
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-white" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-accent" />
        )}
      </div>

      {/* Content */}
      <div className={cn("max-w-[80%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "rounded-tr-sm border border-primary/50 bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg shadow-primary/20"
              : "bg-white/5 border border-white/10 text-white/90 rounded-tl-sm",
          )}
        >
          {isUser && message.content ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : !isUser && message.content ? (
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </Markdown>
          ) : message.streaming ? (
            <span className="flex items-center gap-1.5 text-white/50">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Thinking…</span>
            </span>
          ) : null}

          {/* Inline DB query panel */}
          {!isUser && (hasQueries || canExportMarkdown) && (
            <>
              {showQueries && (
                <div className="mt-2 pt-2 border-t border-white/10 space-y-3">
                  {toolCalls.map((tc) => (
                    <div key={tc.id} className="space-y-1.5">
                      {(() => {
                        const sql = tc.name === "query" ? getToolSql(tc.input) : null;
                        return sql ? (
                        <pre className="overflow-x-auto rounded bg-black/30 p-2 font-mono text-accent/90 whitespace-pre-wrap break-all text-[10px]">
                          {sql}
                        </pre>
                        ) : null;
                      })()}
                      {tc.result ? (
                        <pre className="max-h-40 overflow-y-auto overflow-x-auto rounded bg-black/30 p-2 font-mono text-white/60 text-[10px] whitespace-pre-wrap break-all">
                          {prettifyJson(tc.result)}
                        </pre>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-white/30">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          Running…
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1.5 flex items-center justify-end gap-3">
                {canExportMarkdown ? (
                  <button
                    type="button"
                    onClick={() => downloadMarkdown(message.content)}
                    className="inline-flex items-center gap-1 text-[7px] text-white/30 hover:text-white/55 transition-colors"
                  >
                    <Download className="h-2.5 w-2.5" />
                    Export markdown
                  </button>
                ) : null}
                {hasQueries ? (
                  <button
                    type="button"
                    onClick={() => setShowQueries((v) => !v)}
                    className="inline-flex items-center gap-1 text-[7px] text-white/30 hover:text-white/55 transition-colors"
                  >
                    <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", showQueries ? "rotate-180" : "")} />
                    {queryLabel}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ChatPage ─────────────────────────────────────────────────────────────

export function ChatPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>(loadPersistedMessages);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>(
    () => localStorage.getItem(PROVIDER_KEY) ?? "",
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingSeedPrompt, setPendingSeedPrompt] = useState<string | null>(
    () => loadPendingH2HChatSeed()?.prompt ?? null,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSentSeedRef = useRef<string | null>(null);
  const providerInfo = providers.find((p) => p.id === selectedProvider);
  const needsOAuth = providerInfo?.authType === "oauth" && !providerInfo.oauthConnected;

  // ── Fetch providers ─────────────────────────────────────────────────────────
  const fetchProviders = useCallback(async () => {
    try {
      const data = await getChatProviders();
      setProviders(data);
      // Auto-select first available provider
      setSelectedProvider((prev) => {
        const valid = prev && data.some((p) => p.id === prev);
        const first = data[0]?.id ?? "";
        const saved = localStorage.getItem(PROVIDER_KEY) ?? "";
        const savedValid = saved && data.some((p) => p.id === saved);
        return valid ? prev : savedValid ? saved : first;
      });
    } catch {
      // API not available
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // ── Handle OAuth redirect ────────────────────────────────────────────────────
  useEffect(() => {
    if (searchParams.get("oauth_connected") === "true") {
      setSearchParams({}, { replace: true });
      fetchProviders();
    }
  }, [searchParams, setSearchParams, fetchProviders]);

  // ── Persist state ────────────────────────────────────────────────────────────
  useEffect(() => {
    const persisted = messages.filter((m) => !m.streaming);
    if (persisted.length === 0) {
      clearPersistedMessages();
      return;
    }
    persistMessages(persisted);
  }, [messages]);

  useEffect(() => {
    if (selectedProvider) localStorage.setItem(PROVIDER_KEY, selectedProvider);
  }, [selectedProvider]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  const isFirstScroll = useRef(true);
  useEffect(() => {
    // On mount (first scroll): jump instantly so we start at the bottom, not the top.
    // On subsequent message updates: smooth-scroll to reveal new content.
    const behavior = isFirstScroll.current ? "instant" : "smooth";
    isFirstScroll.current = false;
    bottomRef.current?.scrollIntoView({ behavior: behavior as ScrollBehavior });
  }, [messages]);

  // ── Auto-resize textarea ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (!shouldAutofocusChatInput()) return;
    if (needsOAuth || providers.length === 0 || streaming) return;
    const frame = requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [location.key, needsOAuth, providers.length, streaming]);

  // ── Send message ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const pendingSeed = loadPendingH2HChatSeed();
    if (!pendingSeed) {
      return;
    }

    setPendingSeedPrompt(pendingSeed.prompt);
    setInput((existing) => existing || pendingSeed.prompt);
  }, []);

  const send = useCallback(async (rawText?: string, options?: { replaceHistory?: boolean }) => {
    const text = (rawText ?? input).trim();
    if (!text || streaming || !selectedProvider) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };

    const assistantMsgId = `a-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      toolCalls: [],
      streaming: true,
    };

    setInput("");
    if (options?.replaceHistory) {
      setMessages([userMsg, assistantMsg]);
    } else {
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
    }
    setStreaming(true);

    // Build the history to send (all non-streaming messages + new user msg)
    const history = toChatHistory(options?.replaceHistory ? [] : messages, userMsg);

    try {
      const reader = await streamChat(selectedProvider, history);
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }));
        buffer = parsed.buffer;

        for (const event of parsed.events) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsgId ? applyChatEvent(message, event) : message,
            ),
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `⚠️ ${msg}`, streaming: false }
            : m,
        ),
      );
    }

    setStreaming(false);
  }, [input, streaming, selectedProvider, messages]);

  useEffect(() => {
    if (!pendingSeedPrompt || streaming || providers.length === 0 || !selectedProvider || needsOAuth) {
      return;
    }

    if (autoSentSeedRef.current === pendingSeedPrompt) {
      return;
    }

    autoSentSeedRef.current = pendingSeedPrompt;
    clearPendingH2HChatSeed();
    setPendingSeedPrompt(null);
    void send(pendingSeedPrompt, { replaceHistory: true });
  }, [pendingSeedPrompt, streaming, providers.length, selectedProvider, needsOAuth, send]);

  // ── Keyboard handler ──────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ── Google Sign-in ────────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    if (!providerInfo) return;
    try {
      const url = await getChatGoogleAuthUrl(providerInfo.id);
      window.open(url, "_blank");
    } catch {
      // ignore
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100svh-3.5rem)] lg:h-svh bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-black/20 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/40 to-primary/20 border border-primary/30">
            <MessageSquare className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">AI Chat</h1>
            <p className="text-[10px] text-white/40">Powered by FPL database</p>
          </div>
        </div>

        {/* Provider selector */}
        <div className="flex items-center gap-2">
          {providers.length === 0 ? (
            <span className="text-xs text-white/40">No providers configured</span>
          ) : (
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} className="bg-[hsl(267,70%,8%)]">
                  {p.name}
                  {p.authType === "oauth" && !p.oauthConnected ? " (not signed in)" : ""}
                </option>
              ))}
            </select>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="rounded-lg px-2.5 py-1.5 text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
              <MessageSquare className="h-7 w-7 text-primary/60" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white/80">Ask about FPL</h2>
              <p className="mt-1 text-sm text-white/40 max-w-xs">
                Ask anything about players, fixtures, teams, or stats. The AI will query the live database for you.
              </p>
            </div>
            <div className="grid gap-2 text-xs text-white/50 max-w-sm w-full">
              {[
                "Who are the top 5 players by points this season?",
                "Which midfielders have the best value (points per million)?",
                "Show me players with the most clean sheets",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10 hover:text-white/70 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-2">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* OAuth sign-in prompt */}
      {needsOAuth && (
        <div className="mx-4 mb-2 rounded-xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
          <div className="text-sm text-white/60 flex-1">
            Sign in with Google to use{" "}
            <span className="text-white/80">{providerInfo?.name}</span>
          </div>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-white/90 transition-colors shrink-0"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign in with Google
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-white/10 bg-black/20 backdrop-blur-xl p-3 shrink-0">
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 focus-within:border-primary/40 focus-within:bg-white/8 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              needsOAuth
                ? "Sign in with Google first…"
                : providers.length === 0
                  ? "Configure a provider in llm-providers.json…"
                  : "Ask about the FPL dataset… (Enter to send, Shift+Enter for newline)"
            }
            disabled={streaming || needsOAuth || providers.length === 0}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none disabled:opacity-40 py-0.5 max-h-40"
            style={{ lineHeight: "1.5" }}
          />
          <button
            type="button"
            onClick={() => {
              void send();
            }}
            disabled={streaming || !input.trim() || needsOAuth || providers.length === 0}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all",
              input.trim() && !streaming && !needsOAuth
                ? "bg-primary text-white hover:bg-primary/80"
                : "bg-white/5 text-white/20",
            )}
          >
            {streaming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-white/20">
          AI can make mistakes. Verify important data in the Players or Fixtures pages.
        </p>
      </div>
    </div>
  );
}
