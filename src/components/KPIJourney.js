import { formatMoney, formatPercent } from '../utils/kpiMetrics.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const number = value => Number(value || 0).toLocaleString('en-PH');
const valueText = (value, unit) => unit === 'money' ? formatMoney(value) : formatPercent(value);
const dateText = value => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const statusLabels = { Completed: 'Achieved', OnTrack: 'In progress', NeedsPush: 'Below target', Unavailable: 'No data' };
const badge = (label, tone = 'neutral') => `<span class="kj-badge kj-${tone}">${escape(label)}</span>`;
const statTone = status => ({ Completed: 'green', OnTrack: 'blue', NeedsPush: 'amber', Unavailable: 'neutral' }[status]);

export function renderDailySnapshot(metrics, compact = false) {
  const days = metrics.dailyResults || [];
  const latest = days.at(-1);
  const previous = days.at(-2);
  const known = value => typeof value === 'number' && Number.isFinite(value);
  const delta = (field, unit) => {
    const current = latest?.[field], prior = previous?.[field];
    if (!known(current) || !known(prior) || (unit === '%' && prior <= 0)) return '<strong class="ks-unavailable">Not available</strong>';
    const value = unit === '%' ? (current - prior) / prior * 100 : current - prior;
    const rounded = Math.round(Math.abs(value) * 10) / 10;
    const direction = rounded === 0 ? 'flat' : value > 0 ? 'up' : 'down';
    return `<strong class="ks-${direction}">${direction === 'flat' ? '—' : direction === 'up' ? '↑' : '↓'} ${unit === '₱' ? '₱' : ''}${rounded.toLocaleString('en-US')}${unit === '₱' ? '' : unit === 'pp' ? ' pp' : '%'}</strong>`;
  };
  const partial = latest?.missions.filter(m => m.status === 'OnTrack').length || 0;
  const missing = latest?.missions.filter(m => m.status === 'Unavailable').length || 0;
  if (compact) return `<div class="km-daily-summary">
    <div class="km-summary-line"><span>${latest ? `${latest.completed}/5 achieved · ${partial} partially achieved${missing ? ` · ${missing} unavailable` : ''}` : 'Awaiting imported data'}</span><strong>${latest ? `+${latest.xp} / 350 XP` : '— XP'}</strong></div>
    <div class="km-summary-line km-muted"><span>${metrics.streakDays == null ? 'Streak unavailable' : metrics.streakDays > 0 ? `${metrics.streakDays}-day streak` : 'Complete 4/5 to start a streak'}</span><span>Provisional</span></div>
    <details class="km-comparison"><summary>Compare with ${previous ? escape(dateText(previous.date)) : 'previous recorded day'}</summary><div class="ks-grid ks-deltas"><div><span class="ks-label">Dine In revenue</span>${delta('revenue', '%')}</div><div><span class="ks-label">Average order value</span>${delta('avo', '₱')}</div><div><span class="ks-label">Drink attachment</span>${delta('drink', 'pp')}</div></div></details>
  </div>`;
  return `<section class="kpi-panel ks-snapshot" aria-label="Daily snapshot">
    <div class="ks-heading"><h2>Daily snapshot</h2><div><span>${latest ? escape(dateText(latest.date)) : 'No recorded day'}</span>${latest ? `<button class="kj-link-button" data-kpi-day="${escape(latest.date)}">View day →</button>` : ''}</div></div>
    <div class="ks-grid ks-primary">
      <div><span class="ks-label"><i data-lucide="circle-check-big"></i>Mission results</span><strong>${latest ? `${latest.completed}/5` : '—'} <small>achieved</small></strong><p>${latest ? `${partial} partially achieved${missing ? ` · ${missing} unavailable` : ''}` : 'Awaiting imported data'}</p></div>
      <div><span class="ks-label"><i data-lucide="sparkles"></i>Daily XP <span class="ks-provisional">Provisional</span></span><strong class="ks-purple">${latest ? `+${latest.xp}` : '—'} <small>XP</small></strong><div class="ks-xp-track"><span style="width:${latest ? Math.min(100, latest.xp / 350 * 100) : 0}%"></span></div><p>of 350 available</p></div>
      <div><span class="ks-label"><i data-lucide="flame"></i>Current streak</span><strong>${metrics.streakDays ?? '—'} <small>days</small></strong><p>${!latest ? 'Awaiting imported data' : metrics.streakDays > 0 ? 'Keep completing 4/5 to continue' : 'Complete 4/5 to start'}</p></div>
    </div>
    <div class="ks-comparison"><div class="ks-comparison-heading">Vs previous recorded day${previous ? ` · ${escape(dateText(previous.date))}` : ''}<span>Dine In only</span></div>
      <div class="ks-grid ks-deltas"><div><span class="ks-label">Dine In revenue</span>${delta('revenue', '%')}</div><div><span class="ks-label">Average order value</span>${delta('avo', '₱')}</div><div><span class="ks-label">Drink attachment</span>${delta('drink', 'pp')}</div></div>
    </div>
  </section>`;
}

export function journeyDayStatus(day) {
  if (!day) return { label: 'No import', tone: 'empty', symbol: '—' };
  if (day.missions.some(mission => mission.status === 'Unavailable')) return { label: 'Incomplete data', tone: 'incomplete', symbol: '◌' };
  if (day.completed === 5) return { label: 'Perfect day', tone: 'perfect', symbol: '★' };
  if (day.completed >= 4) return { label: 'Streak day', tone: 'streak', symbol: '✓' };
  return { label: 'Needs improvement', tone: 'improve', symbol: '↗' };
}

function dayDetail(day, selectedDate, year, month) {
  const count = new Date(year, month, 0).getDate();
  const dayNumber = Number(selectedDate.slice(-2));
  const dayKey = day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const status = journeyDayStatus(day);
  const navigation = `<div class="kj-day-navigation"><button class="kj-icon-button" data-kpi-day="${dayKey(dayNumber - 1)}" ${dayNumber === 1 ? 'disabled' : ''} aria-label="Previous day">←</button><span>${escape(dateText(selectedDate))}</span><button class="kj-icon-button" data-kpi-day="${dayKey(dayNumber + 1)}" ${dayNumber === count ? 'disabled' : ''} aria-label="Next day">→</button></div>`;
  if (!day) return `<aside class="kj-panel kj-day-detail"><div class="kj-section-head"><h3>Day details</h3>${navigation}</div><div class="kj-empty-state"><span class="kj-empty-icon">◌</span><h3>No recorded results</h3><p>Import this business date to see its missions and points. Missing data is not a failed day.</p></div></aside>`;
  const candidates = day.missions.filter(m => m.id !== 'incident' && m.actual !== null && m.actual < m.target && m.target > 0)
    .sort((a, b) => b.progress - a.progress);
  const next = candidates[0];
  const coaching = next ? `${next.label}: ${valueText(next.target - next.actual, next.unit)} ${next.unit === 'percent' ? '(percentage-point gap) ' : ''}short of the target on this date.`
    : status.tone === 'incomplete' ? 'Complete the missing data to reveal the full result for this date.'
    : day.completed === 5 ? 'Every mission achieved. A perfect day worth building on.' : 'Review the incident result to identify the next improvement.';
  return `<aside class="kj-panel kj-day-detail">
    <div class="kj-section-head"><div><span class="kj-eyebrow">Your daily review</span><h3>${escape(dateText(selectedDate))} results</h3></div>${navigation}</div>
    <div class="kj-detail-summary">${badge(status.label, status.tone)}<strong>${day.completed}/5 achieved <span>·</span> +${number(day.xp)} XP</strong></div>
    <div class="kj-detail-missions">${day.missions.map(m => `<div class="kj-detail-mission">
      <div class="kj-section-head"><h4>${escape(m.label)}</h4>${badge(statusLabels[m.status], statTone(m.status))}</div>
      <div class="kj-mission-values"><strong>${escape(valueText(m.actual, m.unit))}</strong><span>/ ${m.id === 'incident' ? '≤ ' : ''}${escape(valueText(m.target, m.unit))}</span><b>+${m.xp} XP</b></div>
      <details><summary>How this is calculated</summary><p>${escape(m.formula)}.</p><p>${m.id === 'incident' ? 'At or below the target: 50 XP. Above target: 0 XP.' : 'At least 100% of target: 50 XP. From 80% to below 100%: 25 XP. Below 80%: 0 XP.'} Missing data: no XP.</p></details>
    </div>`).join('')}</div>
    <div class="kj-bonus"><div><strong>Perfect Day bonus</strong><small>All 5 missions achieved</small></div><b>+${day.bonusXp} XP</b></div>
    <div class="kj-coaching"><span class="kj-eyebrow">${next ? 'Closest opportunity' : 'Keep moving forward'}</span><p>${escape(coaching)}</p></div>
    <button class="kj-link-button" data-kpi-points-date="${day.date}">See this day's point breakdown →</button>
  </aside>`;
}

export function renderKPIJourney(metrics, { year, month, selectedDate, today } = {}) {
  const days = metrics.dailyResults || [];
  const byDate = new Map(days.map(day => [day.date, day]));
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const selected = selectedDate || metrics.latestBusinessDate || `${prefix}-01`;
  const todayKey = today || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const dayCount = new Date(year, month, 0).getDate();
  const perfect = days.filter(day => journeyDayStatus(day).tone === 'perfect').length;
  const incomplete = days.filter(day => journeyDayStatus(day).tone === 'incomplete').length;
  const best = days.reduce((value, day) => Math.max(value, day.xp), 0);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `<div class="kj-view">
    <header class="kj-view-heading"><div><span class="kj-eyebrow">Small wins. Visible progress.</span><h2>Your journey</h2><p>Every business day tells part of your story. Select a day to explore it.</p></div>${badge('Recalculated · Provisional', 'purple')}</header>
    <div class="kj-summary-grid">${[['Recorded days', days.length, 'Business dates imported'], ['Perfect days', perfect, 'All five missions achieved'], ['Best daily XP', best, 'Your best recorded result'], ['Incomplete days', incomplete, 'Data to complete, not failures']].map(([label, value, note]) => `<div class="kj-summary-card"><span>${label}</span><strong>${number(value)}</strong><small>${note}</small></div>`).join('')}</div>
    <div class="kj-journey-grid"><section class="kj-panel kj-calendar-panel"><div class="kj-section-head"><h3>${escape(monthLabel)}</h3><span class="kj-muted">Select any day</span></div>
      <div class="kj-calendar-week">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `<span>${day}</span>`).join('')}</div>
      <div class="kj-calendar">${'<span class="kj-calendar-blank" aria-hidden="true"></span>'.repeat(offset)}${Array.from({ length: dayCount }, (_, i) => {
        const date = `${prefix}-${String(i + 1).padStart(2, '0')}`;
        const day = byDate.get(date);
        const status = journeyDayStatus(day);
        const upcoming = !day && date > todayKey;
        const label = upcoming ? 'Upcoming' : status.label;
        return `<button class="kj-calendar-day kj-day-${status.tone} ${date === selected ? 'is-selected' : ''}" data-kpi-day="${date}" aria-pressed="${date === selected}" aria-label="${escape(`${date}: ${label}${day ? `, ${day.completed} of 5 missions achieved, ${day.xp} provisional XP` : ''}`)}">
          <span class="kj-cell-top"><strong>${i + 1}</strong><span>${upcoming ? '·' : status.symbol}</span></span>
          <span class="kj-cell-result">${day ? `${day.completed}/5` : '—'}</span><small>${day ? `${day.xp} XP` : label}</small>
        </button>`;
      }).join('')}</div>
      <div class="kj-legend"><span>★ Perfect day</span><span>✓ Streak day</span><span>↗ Needs improvement</span><span>◌ Incomplete data</span><span>— No import</span></div>
      <p class="kj-footnote">Past results use today's saved targets and source data. This is a performance review, not a locked award history.</p>
    </section>${dayDetail(byDate.get(selected), selected, year, month)}</div>
  </div>`;
}

export function pointRows(metrics) {
  const rows = (metrics.dailyResults || []).flatMap(day => [
    ...day.missions.map(m => ({ ...m, date: day.date, kind: 'daily', result: `${valueText(m.actual, m.unit)} / ${m.id === 'incident' ? '≤ ' : ''}${valueText(m.target, m.unit)}` })),
    { id: 'dailyBonus', label: 'Perfect Day bonus', date: day.date, kind: 'daily', xp: day.bonusXp, status: day.completed === 5 ? 'Completed' : day.missions.some(m => m.status === 'Unavailable') ? 'Unavailable' : 'NeedsPush', result: `${day.completed}/5 missions achieved` }
  ]).sort((a, b) => b.date.localeCompare(a.date));
  rows.push(...(metrics.monthlyRewards || []).map(m => ({ ...m, date: null, kind: 'monthly', result: `${valueText(m.actual, m.unit)} / ${m.id === 'incident' ? '≤ ' : ''}${valueText(m.target, m.unit)}` })));
  if (metrics.monthlyRewards?.length) rows.push({ id: 'monthlyBonus', label: 'Perfect Month bonus', date: null, kind: 'monthly', xp: metrics.monthlyBonusXp, status: metrics.monthlyBonusXp > 0 ? 'Completed' : metrics.monthlyRewards.some(m => m.status === 'Unavailable') ? 'Unavailable' : 'NeedsPush', result: `${metrics.monthlyRewards.filter(m => m.status === 'Completed').length}/5 monthly milestones` });
  return rows;
}

export function renderKPIPoints(metrics, filters = {}) {
  const rows = pointRows(metrics).filter(row => (!filters.date || row.date === filters.date)
    && (!filters.kind || row.kind === filters.kind)
    && (!filters.status || (filters.status === 'withXp' ? row.xp > 0 : row.status === 'Unavailable')));
  const pageCount = Math.max(1, Math.ceil(rows.length / 15));
  const page = Math.min(filters.page || 0, pageCount - 1);
  const daily = metrics.dailyResults || [];
  const bonuses = daily.reduce((sum, day) => sum + day.bonusXp, 0);
  const noData = metrics.userXp === null;
  const dates = [...daily].reverse().map(day => day.date);
  return `<div class="kj-view">
    <header class="kj-view-heading"><div><span class="kj-eyebrow">Every point, explained.</span><h2>Your points</h2><p>Trace the missions and bonuses behind your monthly total.</p></div>${badge('Provisional · Not posted', 'purple')}</header>
    <div class="kj-points-equation">${[['Daily missions', (metrics.dailyXp || 0) - bonuses], ['Daily bonuses', bonuses], ['Monthly rewards', metrics.monthlyXp || 0], ['Total XP', metrics.userXp || 0]].map(([label, value], i) => `${i ? `<span class="kj-operator">${i === 3 ? '=' : '+'}</span>` : ''}<div class="${i === 3 ? 'kj-total' : ''}"><span>${label}</span><strong>${noData ? '—' : number(value)}</strong><small>XP</small></div>`).join('')}</div>
    <section class="kj-panel"><div class="kj-section-head"><h3>Point breakdown</h3><span class="kj-muted">${rows.length} results</span></div>
      <div class="kj-filters"><label>Business date<select data-kpi-point-filter="date"><option value="">All dates</option>${dates.map(date => `<option value="${date}" ${filters.date === date ? 'selected' : ''}>${escape(dateText(date))}</option>`).join('')}</select></label>
      <label>Activity<select data-kpi-point-filter="kind"><option value="">All activities</option><option value="daily" ${filters.kind === 'daily' ? 'selected' : ''}>Daily missions & bonuses</option><option value="monthly" ${filters.kind === 'monthly' ? 'selected' : ''}>Monthly rewards</option></select></label>
      <label>Result<select data-kpi-point-filter="status"><option value="">All results</option><option value="withXp" ${filters.status === 'withXp' ? 'selected' : ''}>With provisional XP</option><option value="missing" ${filters.status === 'missing' ? 'selected' : ''}>Missing data</option></select></label>
      <button class="kj-link-button" data-kpi-points-reset>Reset filters</button></div>
      <div class="kj-table-scroll"><table class="kj-points-table"><thead><tr><th>Date / period</th><th>Activity</th><th>Actual / target</th><th>Result</th><th>XP</th></tr></thead><tbody>${rows.slice(page * 15, page * 15 + 15).map(row => `<tr><td>${row.date ? `<button class="kj-link-button" data-kpi-day="${row.date}">${escape(dateText(row.date))} ↗</button>` : 'Selected month'}</td><td><strong>${escape(row.label)}</strong><small>${row.kind === 'daily' ? 'Daily activity' : 'Monthly milestone'}</small></td><td>${escape(row.result)}</td><td>${badge(row.status === 'Unavailable' ? 'Pending data' : row.status === 'NeedsPush' ? 'Not achieved' : statusLabels[row.status], statTone(row.status))}</td><td class="kj-xp-cell">${row.xp > 0 ? '+' : ''}${row.xp}</td></tr>`).join('') || '<tr><td colspan="5" class="kj-table-empty">No results match these filters.</td></tr>'}</tbody></table></div>
      <div class="kj-pagination"><span>Page ${page + 1} of ${pageCount}</span><div><button class="kj-icon-button" data-kpi-points-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>Previous</button><button class="kj-icon-button" data-kpi-points-page="${page + 1}" ${page === pageCount - 1 ? 'disabled' : ''}>Next</button></div></div>
    </section>
    <details class="kj-panel kj-rules"><summary>How points work</summary><p>Daily sales, AVO and drink missions: 50 XP at 100% of target, 25 XP at 80–99.99%, otherwise 0. Incident: 50 XP at or below the limit. Requires recorded Grab sales with a known positive order count in the evaluated day or month. With sales and no recorded incidents, 0% passes. Without sales, no incident XP is awarded. Other missing KPI data earns no XP.</p><p>Perfect Day: +100 XP for 5/5 missions. Monthly rewards: revenue 500, hit rate 300, AVO 200, drink 200, incident 300. Perfect Month: +500 XP. Incomplete drink coverage does not unlock the monthly reward.</p><p>All values are recalculated from imported data using current targets. There are no confirmed award transactions or adjustment records yet. Changes to source data or targets can change past results.</p></details>
  </div>`;
}
