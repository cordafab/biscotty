// Panels stay mounted so switching sections cannot discard an editor draft.
export function setupSettingsTabs(root = document) {
  const tabs = [...root.querySelectorAll('[role=tab][data-panel]')];
  const previous = root.getElementById('previous-section');
  const next = root.getElementById('next-section');
  let selected = 0;
  function select(key, focus = false) {
    const index = tabs.findIndex(tab => tab.dataset.panel === key);
    if (index < 0) return;
    selected = index;
    tabs.forEach((tab, position) => {
      const active = position === index;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      root.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    });
    previous.disabled = selected === 0;
    next.disabled = selected === tabs.length - 1;
    root.getElementById('section-page').textContent = `${index + 1} / ${tabs.length}`;
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab.dataset.panel));
    tab.addEventListener('keydown', event => {
      const directions = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(event.key in directions) && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const position = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + directions[event.key] + tabs.length) % tabs.length;
      select(tabs[position].dataset.panel, true);
    });
  });
  previous.addEventListener('click', () => select(tabs[Math.max(0, selected - 1)].dataset.panel, true));
  next.addEventListener('click', () => select(tabs[Math.min(tabs.length - 1, selected + 1)].dataset.panel, true));
  root.getElementById('status-indicator').addEventListener('click', () => select('access', true));
  select('cookies');
  return { select };
}
