/** Drawn as vectors so the three lines stay identical at any position and display scaling. */
export function MenuIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 22 16" width="22" height="16" aria-hidden="true">
      <line x1="0" y1="2" x2="22" y2="2" />
      <line x1="0" y1="8" x2="22" y2="8" />
      <line x1="0" y1="14" x2="22" y2="14" />
    </svg>
  );
}
