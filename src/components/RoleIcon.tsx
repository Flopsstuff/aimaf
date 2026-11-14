import { MafiaRole } from '../types';
import { inkOn } from '../utils/colors';
import './RoleIcon.css';

interface RoleIconProps {
  role: MafiaRole;
  color: string; // agent color, used as the badge background
  size?: number;
  dead?: boolean;
}

const ROLE_LABEL: Record<MafiaRole, string> = {
  [MafiaRole.Civilian]: 'Civilian',
  [MafiaRole.Mafia]: 'Mafia',
  [MafiaRole.Don]: 'Don',
  [MafiaRole.Detective]: 'Detective',
  [MafiaRole.Doctor]: 'Doctor',
};

// Glyphs are drawn on a 24x24 grid in the current ink color
function Glyph({ role }: { role: MafiaRole }) {
  switch (role) {
    case MafiaRole.Civilian: // person
      return (
        <>
          <circle cx="12" cy="8.2" r="3.9" />
          <path d="M4.3 20.2c0-4.2 3.4-7 7.7-7s7.7 2.8 7.7 7z" />
        </>
      );
    case MafiaRole.Mafia: // fedora and sunglasses
      return (
        <>
          <path d="M7 11.6 8.2 5.4Q10 4 12 5.1 14 4 15.8 5.4L17 11.6z" />
          <rect x="3" y="10.8" width="18" height="2.8" rx="1.4" />
          <rect x="5.6" y="15.2" width="5.4" height="3.6" rx="1.7" />
          <rect x="13" y="15.2" width="5.4" height="3.6" rx="1.7" />
          <rect x="10.4" y="15.8" width="3.2" height="1.2" />
        </>
      );
    case MafiaRole.Don: // crown
      return (
        <>
          <path d="M4.6 16.6 3.6 7.4 8.4 11.2 12 5 15.6 11.2 20.4 7.4 19.4 16.6z" />
          <rect x="4.6" y="17.8" width="14.8" height="2.2" rx="1.1" />
        </>
      );
    case MafiaRole.Detective: // magnifying glass
      return (
        <>
          <circle cx="10.4" cy="10.4" r="5.4" fill="none" stroke="currentColor" strokeWidth="2.6" />
          <path d="M14.6 14.6 19.6 19.6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case MafiaRole.Doctor: // medical cross
      return <path d="M9.4 4h5.2v5.4H20v5.2h-5.4V20H9.4v-5.4H4V9.4h5.4z" />;
  }
}

// Round badge in the agent's color with the role glyph inside
export function RoleIcon({ role, color, size = 20, dead = false }: RoleIconProps) {
  return (
    <svg
      className={`role-icon ${dead ? 'role-icon-dead' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={ROLE_LABEL[role]}
    >
      <title>{ROLE_LABEL[role]}</title>
      <circle cx="12" cy="12" r="12" fill={color} />
      <g transform="translate(4.2 4.2) scale(0.65)" fill="currentColor" style={{ color: inkOn(color) }}>
        <Glyph role={role} />
      </g>
    </svg>
  );
}
