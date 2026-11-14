import { GamePhase } from '../types';
import { isToolAllowed } from './toolPhases';

test('night tools take effect only in the Actions phase', () => {
  for (const tool of ['kill', 'check', 'save']) {
    expect(isToolAllowed(tool, GamePhase.Actions)).toBe(true);
    for (const phase of [GamePhase.Welcome, GamePhase.Night, GamePhase.Day, GamePhase.Voting]) {
      expect(isToolAllowed(tool, phase)).toBe(false);
    }
  }
});

test('votes count only in the Voting phase', () => {
  expect(isToolAllowed('vote', GamePhase.Voting)).toBe(true);
  for (const phase of [GamePhase.Welcome, GamePhase.Night, GamePhase.Actions, GamePhase.Day]) {
    expect(isToolAllowed('vote', phase)).toBe(false);
  }
});

test('an unknown tool is never allowed', () => {
  expect(isToolAllowed('escape', GamePhase.Actions)).toBe(false);
});
