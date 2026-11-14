import { ChatAgent } from '../agents/ChatAgent';
import { RoleIcon } from './RoleIcon';
import { readableNameColor } from '../utils/colors';
import './AgentCard.css';

interface AgentCardProps {
  agent: ChatAgent;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
  onX: () => void;
  onI: () => void;
}

export function AgentCard({ agent, isActive, disabled, onClick, onX, onI }: AgentCardProps) {
  const backgroundColor = '#fff';
  const status = agent.isDead ? 'dead' : (isActive ? 'active' : 'alive');

  return (
    <div
      className={`agent-card ${isActive ? 'active' : ''} ${agent.isDead ? 'dead' : ''}`}
      style={{ borderLeftColor: agent.color, backgroundColor }}
      onClick={() => !disabled && onClick()}
      title={agent.systemPrompt}
    >
      <div className="agent-card-name">
        <RoleIcon role={agent.mafiaRole} color={agent.color} size={24} dead={agent.isDead} />
        <span className="agent-card-name-text" style={{ color: readableNameColor(agent.color) }}>
          {agent.name}
        </span>
        <span className={`agent-status agent-status-${status}`} title={status} />
      </div>
      <div className="agent-card-model">{agent.model}</div>
      <button
        className="agent-card-info"
        onClick={(e) => {
          e.stopPropagation();
          onI();
        }}
      >
        ℹ
      </button>
      <button
        className="agent-card-remove"
        onClick={(e) => {
          e.stopPropagation();
          onX();
        }}
      >
        ×
      </button>
    </div>
  );
}
