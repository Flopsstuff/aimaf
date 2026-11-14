import { ToolLoopAgent, ModelMessage, ToolSet, tool } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { AgentConfig, Message, MafiaRole, MessageSender, GamePhase, ToolCallData, UsageData } from '../types';
import { MafiaPrompts } from './MafiaPrompts';
import { isMafia, generateId } from '../utils/helpers';
import { z } from 'zod';

// Prompt cache breakpoint. Everything up to and including the marked message is
// cached by the provider. Anthropic models cache only when asked to; providers
// that cache automatically (OpenAI, DeepSeek, Grok) ignore the marker.
const CACHE_BREAKPOINT = {
  openrouter: { cacheControl: { type: 'ephemeral' as const } },
};

export class ChatAgent {
  private config: AgentConfig;
  private agent: ToolLoopAgent<never, ToolSet>;
  private _isDead: boolean = false;
  private currentGamePhase: GamePhase = GamePhase.Welcome;
  private instructions: string;
  // Index of the last message sent on the previous turn; null before the first turn
  private previousBreakpointIndex: number | null = null;

  constructor(config: AgentConfig, apiKey: string) {
    this.config = config;
    this.instructions = MafiaPrompts.getSystemPrompt(this.config.mafiaRole, this.config.systemPrompt);
    const openrouter = createOpenRouter({ apiKey });

    const tools = this.createTools();

    this.agent = new ToolLoopAgent({
      model: openrouter(this.config.model),
      // Breakpoint 1: tool definitions + system prompt, identical on every call
      instructions: {
        role: 'system',
        content: this.instructions,
        providerOptions: CACHE_BREAKPOINT,
      },
      tools,
    });
  }

  private createToolResponse(action: string, playerName: string, allowedPhases: GamePhase[]): string {
    if (!allowedPhases.includes(this.currentGamePhase)) {
      return `[TOOL:${action}] ERROR: You cannot use this action during ${this.currentGamePhase} phase. Wait for the next phase to use this action. This action is only available during: ${allowedPhases.join(', ')}.`;
    }
    return `[TOOL:${action}] Your request to ${action} player @${playerName} has been accepted. The result will be known on the next phase.`;
  }

  private createTools() {
    const tools: Record<string, any> = {};

    // Kill tool for Mafia
    if (isMafia(this.config.mafiaRole)) {
      tools.kill = tool({
        description: 'Kill a player during the night. Only available to Mafia members.',
        inputSchema: z.object({
          playerName: z.string().describe('The name of the player to kill'),
        }),
        execute: async ({ playerName }: { playerName: string }) => {
          return this.createToolResponse('kill', playerName, [GamePhase.Actions]);
        },
      });
    }

    // Check tool for Detective
    if (this.config.mafiaRole === MafiaRole.Detective) {
      tools.check = tool({
        description: 'Check if a player is Mafia during the night. Only available to Detective.',
        inputSchema: z.object({
          playerName: z.string().describe('The name of the player to check'),
        }),
        execute: async ({ playerName }: { playerName: string }) => {
          return this.createToolResponse('check', playerName, [GamePhase.Actions]);
        },
      });
    }

    // Save tool for Doctor
    if (this.config.mafiaRole === MafiaRole.Doctor) {
      tools.save = tool({
        description: 'Save a player from being killed during the night. Only available to Doctor.',
        inputSchema: z.object({
          playerName: z.string().describe('The name of the player to save'),
        }),
        execute: async ({ playerName }: { playerName: string }) => {
          return this.createToolResponse('save', playerName, [GamePhase.Actions]);
        },
      });
    }

    // Vote tool for all players during day
    tools.vote = tool({
      description: 'Vote to eliminate a player during the day. Available to all players after discussion rounds.',
      inputSchema: z.object({
        playerName: z.string().describe('The name of the player to vote for elimination'),
      }),
      execute: async ({ playerName }: { playerName: string }) => {
        return this.createToolResponse('vote', playerName, [GamePhase.Voting]);
      },
    });

    return tools;
  }

  async generate(messages: Message[], allAgentNames: string[], gamePhase: GamePhase): Promise<{ text: string; toolCalls?: ToolCallData[]; usage?: UsageData }> {
    this.currentGamePhase = gamePhase;
    const modelMessages = this.convertMessages(messages);

    // Breakpoint 2: the end of the history. An agent's view of the log only
    // grows, so on its next turn everything up to here is read from the cache.
    const lastIndex = modelMessages.length - 1;
    this.markCacheBreakpoint(modelMessages, lastIndex);

    // Breakpoint 3: where the history ended on this agent's previous turn.
    // Providers look back only a limited number of blocks from a breakpoint
    // (20 for Anthropic), so in a big game the previous cache entry would be
    // missed without marking its exact position again.
    if (this.previousBreakpointIndex !== null && this.previousBreakpointIndex < lastIndex) {
      this.markCacheBreakpoint(modelMessages, this.previousBreakpointIndex);
    }
    this.previousBreakpointIndex = lastIndex;

    const result = await this.agent.generate({ messages: modelMessages });
    
    const toolCalls: ToolCallData[] = [];
    
    // Extract tool calls from the result steps
    if (result.steps) {
      for (const step of result.steps) {
        // Check tool calls in step content
        for (const part of step.content) {
          if (part.type === 'tool-call') {
            toolCalls.push({
              id: part.toolCallId || generateId(),
              tool: part.toolName,
              args: part.input as Record<string, any>,
            });
          }
        }
      }
    }
    
    return {
      text: this.fixNames(result.text, allAgentNames),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: this.collectUsage(result.steps),
    };
  }

  private markCacheBreakpoint(messages: ModelMessage[], index: number): void {
    messages[index] = {
      ...messages[index],
      providerOptions: CACHE_BREAKPOINT,
    } as ModelMessage;
  }

  // Sum the usage OpenRouter reports for every step of the tool loop
  private collectUsage(steps: ReadonlyArray<{ providerMetadata?: Record<string, any> }> | undefined): UsageData | undefined {
    if (!steps) {
      return undefined;
    }

    const total: UsageData = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
    let reported = false;

    for (const step of steps) {
      const usage = step.providerMetadata?.openrouter?.usage;
      if (!usage) {
        continue;
      }
      reported = true;
      total.inputTokens += usage.promptTokens ?? 0;
      total.cachedTokens += usage.promptTokensDetails?.cachedTokens ?? 0;
      total.outputTokens += usage.completionTokens ?? 0;
      if (typeof usage.cost === 'number') {
        total.cost = (total.cost ?? 0) + usage.cost;
      }
    }

    return reported ? total : undefined;
  }

  private fixNames(text: string, allAgentNames: string[]): string {
    // Step 1: Remove own name at the start of the message if any
    // Remove "@Name", "Name:", "[Name]", "@[Name]", "@[Name]:", "[@Name]:" etc at the start
    const namePattern = new RegExp(`^(?:@?\\[?@?${this.name}\\]?\\s*:?\\s*)`, 'i');
    let filtered = text.replace(namePattern, '');

    // Step 2: Add @ before all agent names that don't have it
    for (const name of allAgentNames) {
      // Match name that is NOT preceded by @ and is a whole word
      // Use word boundaries to avoid partial matches
      const namePattern = new RegExp(`(?<!@)\\b(${name})\\b`, 'gi');
      filtered = filtered.replace(namePattern, '@$1');
    }

    return filtered.trim();
  }

  getVisibleMessages(messages: Message[]): ModelMessage[] {
    return this.convertMessages(messages);
  }

  private convertMessages(messages: Message[]): ModelMessage[] {
    const result: ModelMessage[] = [
      {
        role: 'user',
        content: `[SYSTEM]: Welcome to the Mafia game!`,
      },
      {
        role: 'assistant',
        content: `My name is @${this.name} and my role is ${this.mafiaRole}.`,
      },
    ];

    for (const m of messages) {
      // Filter mafia messages: only mafia members can see them
      if (m.mafia && !isMafia(this.mafiaRole)) {
        continue;
      }
      // Filter private messages: only the recipient can see them
      if (m.pm && m.agentId !== this.id) {
        continue;
      }

      const isOwnMessage = m.sender === MessageSender.Agent && m.agentId === this.id;

      // Handle tool result messages - convert to 'tool' role message
      if (m.toolResultFor && m.agentId === this.id) {
        result.push({
          role: 'tool',
          content: [{
            type: 'tool-result',
            toolCallId: m.toolResultFor.callId,
            toolName: m.toolResultFor.toolName,
            output: { type: 'text', value: m.content },
          }],
        });
        continue;
      }

      // Handle own messages with tool calls - use structured format
      // (check this BEFORE skipping empty messages, since tool calls may have empty content)
      if (isOwnMessage && m.toolCalls && m.toolCalls.length > 0) {
        const contentParts: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }> = [];
        
        if (m.content.trim()) {
          contentParts.push({ type: 'text', text: m.content });
        }
        
        for (const tc of m.toolCalls) {
          contentParts.push({
            type: 'tool-call',
            toolCallId: tc.id,
            toolName: tc.tool,
            input: tc.args,
          });
        }
        
        result.push({
          role: 'assistant',
          content: contentParts,
        });
        continue;
      }

      // Skip empty messages (but tool calls and tool results are handled above)
      if (m.content.trim() === '') {
        continue;
      }

      const role = isOwnMessage ? 'assistant' : 'user';

      let senderName: string;
      if (m.sender === MessageSender.System) {
        senderName = '[SYSTEM]: ';
      } else if (m.sender === MessageSender.Moderator) {
        senderName = '[MODERATOR]: ';
      } else if (isOwnMessage){
        senderName = ``; // do not add name to own messages
      } else {
        senderName = m.agentName ? `[@${m.agentName}]: ` : '[UNKNOWN]: ';
      }

      result.push({
        role,
        content: `${senderName}${m.content}`,
      });
    }

    return result;
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get color(): string {
    return this.config.color;
  }

  get model(): string {
    return this.config.model;
  }

  get systemPrompt(): string {
    return this.config.systemPrompt;
  }

  get fullInstructions(): string {
    return this.instructions;
  }

  get mafiaRole(): MafiaRole {
    return this.config.mafiaRole;
  }

  get isDead(): boolean {
    return this._isDead;
  }

  set isDead(value: boolean) {
    this._isDead = value;
  }

  toJSON(): AgentConfig {
    return { ...this.config };
  }

  static fromJSON(config: AgentConfig, apiKey: string): ChatAgent {
    return new ChatAgent(config, apiKey);
  }
}
