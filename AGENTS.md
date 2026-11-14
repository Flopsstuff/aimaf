# AGENTS.md

Guidance for AI coding agents working in this repository.
`CLAUDE.md` and `GEMINI.md` are symlinks to this file.

## Commands

Node.js `>=22.23.4` (`engines` in `package.json`; CI builds on Node 24). Yarn 4 via Corepack (`corepack enable`; the version is pinned in `packageManager`).

- `yarn` - install dependencies
- `yarn start` - dev server at localhost:3000
- `yarn build` - production build to `build/`
- `yarn test` - Jest (via `react-scripts`) in watch mode
- `CI=true yarn test` - run tests once, no watch
- `CI=true yarn test src/App.test.tsx -t "name"` - single file / single test
- `yarn serve` - build and serve production locally
- `yarn preview` - build and serve through `wrangler dev`
- `yarn deploy` - build and deploy to Cloudflare

There is no lint script: CRA's ESLint (`react-app`, `react-app/jest`) runs inside `start` and `build`.

`src/utils/colors.test.ts` passes. `src/App.test.tsx` is the untouched CRA template and fails: Jest cannot resolve `react-router-dom` v7, and the assertion looks for "learn react" text that no longer exists. That one failure is not caused by your change.

## Deployment

The site is hosted on Cloudflare as a Worker with static assets (`wrangler.jsonc`): Worker `aimaf`, assets from `build/`, custom domain https://aimaf.flopbut.pl. The `workers.dev` address is disabled.

Every push to `main` builds and runs `yarn wrangler deploy` (`.github/workflows/deploy.yml`), which needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. The build runs with `DISABLE_ESLINT_PLUGIN=true`, so lint errors do not block the deploy. `yarn deploy` does the same from a machine logged in with `wrangler login`.

The site lives at the domain root; the public path comes from `homepage` in `package.json`. Routing uses `HashRouter`, so no SPA fallback is configured for assets.

`aimaf.mov` is stored in Git LFS (`.gitattributes`).

## Architecture

Client-only React 19 SPA (Create React App, TypeScript) that runs a Mafia social deduction game between LLM players. There is no backend: the browser calls OpenRouter directly through the `ai` SDK and `@openrouter/ai-sdk-provider`.

Direct `fetch` calls to OpenRouter (in `Settings`) use `OPENROUTER_API_BASE_URL` from `src/constants.ts`; do not hardcode the URL.

Routes (`src/App.tsx`): `/` is `Home` (the game), `/settings` is `Settings` (API key, model list, prompt editing).

### Game engine: `src/hooks/useChat.ts`

One hook owns all game state and is the only orchestrator; `Home` just wires its return value into components.

- `GameState` is `Initial → Started → Ended`. `GamePhase` cycles `Welcome → Night → Actions → Day → Voting → Night …`.
- `nextPhase()` advances the phase and runs the matching `runNight` / `runActions` / `runDay` / `runVoting`. The first call (from `Welcome`) also starts the game. Auto-play is an effect that calls `nextPhase()` one second after `isLoading` drops.
- Agents are called strictly sequentially. `messagesRef` mirrors the `messages` state and is updated synchronously in `addMessage`, so each agent sees what the previous one just said within the same phase run. Read history from the ref, not from state, inside phase runners.
- The phase runners pass the phase to `callAgentInternal` explicitly (`phaseOverride`), because the `gamePhase` state captured by the callback is still the old one when they run.
- `ChatAgent` instances are mutated in place (`agent.isDead = true`) and then `setAgents([...agents])` forces the re-render.
- Agents exist only in memory; a page reload loses them and the game.

### Agents: `src/agents/`

`ChatAgent` wraps a `ToolLoopAgent` from the `ai` SDK, one per player.

- **Tools are registered by role** (`kill` for Mafia/Don, `check` for Detective, `save` for Doctor, `vote` for everyone) and all take `{ playerName }`. Their `execute` only returns an acknowledgement string, or an error if the current phase does not allow the tool. The real effect happens in `useChat`: tool calls are extracted from the result steps, passed to `handleToolCall`, and queued in `NightActions` / `DayActions`.
- Tool calls made during the Night discussion are deliberately ignored; only Actions and Voting apply them.
- **Message visibility** is decided in `ChatAgent.convertMessages`, which builds each agent's own view of the shared log: `mafia: true` messages are visible only to Mafia/Don, `pm: true` only to the agent in `agentId`. The agent's own messages become `assistant` turns, everything else becomes `user` turns prefixed with `[SYSTEM]: `, `[MODERATOR]: ` or `[@Name]: `. Any new kind of secret information must be flagged with `mafia` or `pm`, otherwise every player sees it.
- `fixNames` post-processes model output: strips the agent's own name from the start and puts `@` before every player name.
- **Prompt caching**: `generate` marks up to three cache breakpoints (`providerOptions.openrouter.cacheControl`): the system prompt, the last message of the history, and the message the history ended on at this agent's previous turn. It relies on each agent's view of the log being append-only, so anything that reorders or rewrites earlier messages in `convertMessages` breaks the cache. Anthropic models cache only with these markers; providers with automatic caching ignore them.
- **Usage**: `collectUsage` sums OpenRouter's per-step usage (`providerMetadata.openrouter.usage`) into `UsageData`; it travels on the message next to `executionTime` and is rendered by `MessageHeader`.
- `MafiaPrompts` builds the system prompt as `root + generalRules + role prompt + optional per-agent instructions`. Defaults live in `DEFAULT_PROMPTS`; a `mafia_prompts` entry in localStorage overrides them entirely. The prompt is built once in the `ChatAgent` constructor, so prompt edits affect only agents created afterwards.

### Agent colors and role icons

- `RoleIcon` draws the role glyph on a round badge in the agent's color; it is shown before the name in agent cards and in message headers. Do not use emoji for roles or statuses.
- Never use an agent's raw color for text. `utils/colors.ts` computes WCAG contrast: `readableNameColor` darkens a color until it reaches 4.5:1 on the darkest message background, `inkOn` picks dark or light ink for content drawn on top of the color. `colors.test.ts` checks the whole form palette against every bubble background, so update it when adding colors or backgrounds.

### Rules resolution: `src/utils/`

- `NightActions.processActions` - the kill target is the one with the most kill actions, a matching `save` cancels the kill, and a Detective check reports mafia only for the `Mafia` role, so the Don reads as not mafia.
- `DayActions.processVotes` - one vote per voter (a later vote replaces the earlier one); a tie eliminates nobody.
- `gameStatus.ts` - win conditions: mafia wins when alive mafia >= alive non-mafia, civilians win when no mafia are alive. Not evaluated until someone has died.

The Doctor prompt says the same player cannot be saved two nights in a row, but the code does not enforce it.

The UI requires at least 5 agents before the game can start (`Home.tsx`); the expected setup is Mafia, Don, Detective, Doctor, Civilian.

### localStorage keys

- `openrouter_api_key` - OpenRouter API key
- `selected_models` - models offered in the agent creation form
- `mafia_prompts` - edited prompt templates

The key names are duplicated as constants in the files that use them (`useChat.ts`, `Settings.tsx`, `AgentForm.tsx`, `AgentPanel.tsx`, `MafiaPrompts.ts`); renaming one means updating all of them.
