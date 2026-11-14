import { GamePhase } from '../types';

// The phases in which each tool takes effect
export const TOOL_PHASES: Record<string, GamePhase[]> = {
  kill: [GamePhase.Actions],
  check: [GamePhase.Actions],
  save: [GamePhase.Actions],
  vote: [GamePhase.Voting],
};

export function isToolAllowed(toolName: string, phase: GamePhase): boolean {
  return TOOL_PHASES[toolName]?.includes(phase) ?? false;
}
