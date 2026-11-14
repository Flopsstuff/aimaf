import { ChatMessage, GamePhase, GameState, MafiaRole, MessageSender } from '../types';
import { buildGameExport, exportFileName, ExportableAgent } from './exportGame';

const agent = (id: string, role: MafiaRole, isDead = false): ExportableAgent => ({
  id,
  name: `Agent-${id}`,
  model: 'test/model',
  color: '#cc1919',
  mafiaRole: role,
  isDead,
  systemPrompt: '',
  fullInstructions: `You are ${role}`,
});

const agents = [
  agent('a', MafiaRole.Mafia),
  agent('b', MafiaRole.Don, true),
  agent('c', MafiaRole.Detective, true),
  agent('d', MafiaRole.Civilian, true),
];

const messages: ChatMessage[] = [
  { id: 'm1', timestamp: 1000, sender: MessageSender.System, content: 'Game has started!' },
  {
    id: 'm2', timestamp: 2000, sender: MessageSender.Agent, agentId: 'a', agentName: 'Agent-a',
    content: 'Kill the detective', mafia: true, executionTime: 1.5, reasoning: 'They are onto us',
    usage: { inputTokens: 1000, cachedTokens: 800, outputTokens: 20, cost: 0.002 },
  },
  // A system note about an agent: has agentId but is not a turn
  { id: 'm3', timestamp: 3000, sender: MessageSender.System, agentId: 'a', agentName: 'Agent-a', content: 'vote noted', pm: true },
  {
    id: 'm4', timestamp: 4000, sender: MessageSender.Agent, agentId: 'a', agentName: 'Agent-a',
    content: 'I am innocent', executionTime: 0.5,
    usage: { inputTokens: 500, cachedTokens: 0, outputTokens: 10, cost: 0.001 },
  },
];

const exported = buildGameExport(agents, messages, GameState.Ended, GamePhase.Voting, new Date('2026-11-14T20:00:00Z'));

test('keeps every message with its visibility flags and reasoning', () => {
  expect(exported.messages).toEqual(messages);
  expect(exported.messages[1].mafia).toBe(true);
  expect(exported.messages[1].reasoning).toBe('They are onto us');
});

test('describes every agent with role, team and full prompt', () => {
  expect(exported.agents.map((a) => a.team)).toEqual(['mafia', 'mafia', 'civilians', 'civilians']);
  expect(exported.agents[0].fullInstructions).toBe('You are mafia');
  expect(exported.agents[1].isDead).toBe(true);
});

test('sums turns, tokens, cost and time per agent and for the game', () => {
  expect(exported.agents[0].totals).toEqual({
    turns: 2, inputTokens: 1500, cachedTokens: 800, outputTokens: 30, cost: 0.003, thinkingSeconds: 2,
  });
  expect(exported.agents[1].totals.turns).toBe(0);
  expect(exported.totals.turns).toBe(2);
});

test('reports the winner only for a finished game', () => {
  expect(exported.game.winner).toBe('mafia');
  expect(exported.game.endedAt).toBe(new Date(4000).toISOString());

  const running = buildGameExport(agents, messages, GameState.Started, GamePhase.Day);
  expect(running.game.winner).toBeNull();
  expect(running.game.endedAt).toBeNull();
});

test('civilians win when no mafia is alive', () => {
  const town = [agent('a', MafiaRole.Mafia, true), agent('d', MafiaRole.Civilian)];
  expect(buildGameExport(town, messages, GameState.Ended, GamePhase.Voting).game.winner).toBe('civilians');
});

test('the export survives a JSON round trip', () => {
  expect(JSON.parse(JSON.stringify(exported))).toEqual(exported);
});

test('file name carries a local timestamp', () => {
  expect(exportFileName(new Date(2026, 10, 14, 9, 5, 7))).toBe('aimaf-game-20261114-090507.json');
});
