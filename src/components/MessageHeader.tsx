import { MafiaRole, Message, MessageSender, UsageData } from '../types';
import { RoleIcon } from './RoleIcon';
import { readableNameColor } from '../utils/colors';
import './MessageHeader.css';

interface MessageHeaderProps {
  message: Message;
  agentColor: string;
  agentModel?: string;
  agentRole?: MafiaRole;
}

// "1.2k in (83% cached) / 45 out, $0.0012"
function formatUsage(usage: UsageData): string {
  const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
  const cached = usage.inputTokens > 0 && usage.cachedTokens > 0
    ? ` (${Math.round((usage.cachedTokens / usage.inputTokens) * 100)}% cached)`
    : '';
  const cost = usage.cost !== undefined ? `, $${usage.cost.toFixed(4)}` : '';
  return `${tokens(usage.inputTokens)} in${cached} / ${tokens(usage.outputTokens)} out${cost}`;
}

export function MessageHeader({ message, agentColor, agentModel, agentRole }: MessageHeaderProps) {
  const isSystem = message.sender === MessageSender.System;
  const isModerator = message.sender === MessageSender.Moderator;
  const isMafia = message.mafia === true;
  const isPrivate = message.pm === true;
  var targetName = 'Public';
  if (isPrivate) {
    targetName = message.agentName || 'Unknown';
  }
  if (isMafia) {
    targetName = 'Mafia Channel';
  }

  return (
    <div className="message-header">
      <div className="message-header-content">
        {isSystem ? (
          <div className="message-sender-name message-sender-name-system">
            {'System -> ' + targetName}
          </div>
        ) : (
          <div
            className="message-sender-name"
            style={{ color: isModerator ? '#1565c0' : readableNameColor(agentColor) }}
          >
            {!isModerator && agentRole && (
              <RoleIcon role={agentRole} color={agentColor} size={20} />
            )}
            <span className="message-sender-label">
              {isModerator ? 'Moderator' : message.agentName}
            </span>
            {!isModerator && agentModel && (
              <span className="message-meta">{agentModel}</span>
            )}
            {message.executionTime !== undefined && (
              <span className="message-meta">
                thought for {message.executionTime.toFixed(1)}s
              </span>
            )}
            {message.usage && (
              <span
                className="message-meta"
                title="Input tokens (share read from the prompt cache) / output tokens, cost"
              >
                {formatUsage(message.usage)}
              </span>
            )}
          </div>
        )}
      </div>
      {message.tool && (
        <div className="message-tool-badge">
          {message.tool}
        </div>
      )}
    </div>
  );
}
