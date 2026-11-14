import { ChatMessage, GamePhase, GameState, MafiaRole, UsageData } from '../types';
import { isMafia } from './helpers';

// What the export needs to know about a player; ChatAgent satisfies it
export interface ExportableAgent {
  id: string;
  name: string;
  model: string;
  color: string;
  mafiaRole: MafiaRole;
  isDead: boolean;
  systemPrompt: string;     // per-agent extra instructions
  fullInstructions: string; // the complete system prompt the model received
}

export interface GameExport {
  format: 'aimaf-game';
  version: 1;
  exportedAt: string; // ISO 8601
  game: {
    state: GameState;
    phase: GamePhase;
    winner: 'mafia' | 'civilians' | null;
    startedAt: string | null;
    endedAt: string | null;
  };
  agents: Array<ExportableAgent & { team: 'mafia' | 'civilians'; totals: AgentTotals }>;
  totals: AgentTotals;
  // The full log in order. Visibility: `mafia: true` was seen only by Mafia
  // and Don, `pm: true` only by the agent in `agentId`, everything else by all.
  messages: ChatMessage[];
}

export interface AgentTotals {
  turns: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  cost: number;
  thinkingSeconds: number;
}

function emptyTotals(): AgentTotals {
  return { turns: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, cost: 0, thinkingSeconds: 0 };
}

function addTurn(totals: AgentTotals, usage: UsageData | undefined, seconds: number | undefined): void {
  totals.turns += 1;
  totals.inputTokens += usage?.inputTokens ?? 0;
  totals.cachedTokens += usage?.cachedTokens ?? 0;
  totals.outputTokens += usage?.outputTokens ?? 0;
  totals.cost += usage?.cost ?? 0;
  totals.thinkingSeconds += seconds ?? 0;
}

function winnerOf(agents: ExportableAgent[], state: GameState): GameExport['game']['winner'] {
  if (state !== GameState.Ended) {
    return null;
  }
  const alive = agents.filter((a) => !a.isDead);
  const mafia = alive.filter((a) => isMafia(a.mafiaRole)).length;
  const civilians = alive.length - mafia;
  if (mafia === 0 && civilians > 0) {
    return 'civilians';
  }
  if (mafia > 0 && mafia >= civilians) {
    return 'mafia';
  }
  return null;
}

export function buildGameExport(
  agents: ExportableAgent[],
  messages: ChatMessage[],
  state: GameState,
  phase: GamePhase,
  now: Date = new Date(),
): GameExport {
  const perAgent = new Map<string, AgentTotals>();
  const total = emptyTotals();

  for (const message of messages) {
    // An agent turn is a message the agent itself produced; system notes about
    // an agent carry its id too, but no timing
    if (message.agentId && message.executionTime !== undefined) {
      if (!perAgent.has(message.agentId)) {
        perAgent.set(message.agentId, emptyTotals());
      }
      addTurn(perAgent.get(message.agentId)!, message.usage, message.executionTime);
      addTurn(total, message.usage, message.executionTime);
    }
  }

  const first = messages[0];
  const last = messages[messages.length - 1];

  return {
    format: 'aimaf-game',
    version: 1,
    exportedAt: now.toISOString(),
    game: {
      state,
      phase,
      winner: winnerOf(agents, state),
      startedAt: first ? new Date(first.timestamp).toISOString() : null,
      endedAt: state === GameState.Ended && last ? new Date(last.timestamp).toISOString() : null,
    },
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      model: a.model,
      color: a.color,
      mafiaRole: a.mafiaRole,
      team: isMafia(a.mafiaRole) ? 'mafia' : 'civilians',
      isDead: a.isDead,
      systemPrompt: a.systemPrompt,
      fullInstructions: a.fullInstructions,
      totals: perAgent.get(a.id) ?? emptyTotals(),
    })),
    totals: total,
    messages,
  };
}

export function exportFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `aimaf-game-${stamp}.json`;
}

// Save the export as a JSON file through the browser
export function downloadGameExport(data: GameExport): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(new Date(data.exportedAt));
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
