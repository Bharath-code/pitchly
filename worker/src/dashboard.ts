// dashboard.ts — HTML template for the Pitchly Manager Dashboard
// Renders a single-page analytics dashboard with charts, stats, and call history.
// All data is fetched client-side from the /api/analytics/* endpoints.

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pitchly — Manager Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a14;
    --surface: #12121f;
    --surface-hover: #1a1a2e;
    --border: rgba(139, 92, 246, 0.15);
    --violet-400: #a78bfa;
    --violet-500: #8b5cf6;
    --violet-600: #7c3aed;
    --success: #34d399;
    --warning: #fbbf24;
    --error: #f87171;
    --text: #f1f5f9;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
  }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrapper { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }

  /* Header */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 32px; flex-wrap: wrap; gap: 16px;
  }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .logo-icon {
    width: 36px; height: 36px;
    background: linear-gradient(135deg, #7c3aed, #8b5cf6);
    border-radius: 10px; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(124,58,237,0.3);
  }
  .logo-icon svg { width: 20px; height: 20px; }
  .logo-text { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .header-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

  /* Stat Cards */
  .stats-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px; margin-bottom: 32px;
  }
  .stat-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; padding: 20px; transition: all 200ms ease;
  }
  .stat-card:hover { border-color: rgba(139,92,246,0.25); background: var(--surface-hover); }
  .stat-label {
    font-size: 11px; color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.08em; font-weight: 600; margin-bottom: 6px;
  }
  .stat-value {
    font-size: 32px; font-weight: 700; letter-spacing: -0.03em;
  }
  .stat-value.violet { color: var(--violet-400); }
  .stat-value.green { color: var(--success); }
  .stat-value.amber { color: var(--warning); }
  .stat-value.red { color: var(--error); }
  .stat-change {
    font-size: 12px; color: var(--text-secondary); margin-top: 4px;
  }

  /* Sentiment Mini Bar */
  .sentiment-bar {
    display: flex; height: 6px; border-radius: 3px; overflow: hidden;
    margin-top: 10px; gap: 2px;
  }
  .sentiment-bar .seg { height: 100%; border-radius: 3px; transition: width 400ms ease; }
  .seg-strong { background: var(--success); }
  .seg-neutral { background: var(--warning); }
  .seg-at_risk { background: var(--error); }

  /* Charts Section */
  .charts-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 16px; margin-bottom: 32px;
  }
  @media (max-width: 768px) { .charts-grid { grid-template-columns: 1fr; } }
  .chart-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; padding: 20px;
  }
  .chart-title {
    font-size: 13px; font-weight: 700; margin-bottom: 16px;
    color: var(--text); letter-spacing: -0.01em;
  }
  .chart-container { position: relative; height: 260px; }

  /* Recent Calls Table */
  .table-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; overflow: hidden; margin-bottom: 32px;
  }
  .table-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 18px 20px; border-bottom: 1px solid var(--border);
  }
  .table-title { font-size: 13px; font-weight: 700; }
  .table-count { font-size: 12px; color: var(--text-muted); }
  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead { background: rgba(255,255,255,0.02); }
  th {
    text-align: left; padding: 10px 20px; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-muted); font-weight: 600;
  }
  td {
    padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.03);
    color: var(--text-secondary); white-space: nowrap;
  }
  tr:hover td { background: rgba(255,255,255,0.02); }
  .truncate {
    max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .sentiment-tag {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600;
  }
  .sentiment-strong { background: rgba(52,211,153,0.1); color: var(--success); }
  .sentiment-neutral { background: rgba(251,191,36,0.1); color: var(--warning); }
  .sentiment-at_risk { background: rgba(248,113,113,0.1); color: var(--error); }
  .call-link {
    color: var(--violet-400); text-decoration: none; font-weight: 600;
    transition: color 150ms ease;
  }
  .call-link:hover { color: var(--violet-500); text-decoration: underline; }
  .objection-count {
    font-weight: 600; font-variant-numeric: tabular-nums;
  }

  /* Empty State */
  .empty-state {
    text-align: center; padding: 60px 20px; color: var(--text-muted);
  }
  .empty-state-icon { font-size: 48px; margin-bottom: 16px; }
  .empty-state-title { font-size: 18px; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px; }
  .empty-state-text { font-size: 14px; line-height: 1.6; max-width: 400px; margin: 0 auto; }

  /* Call Detail View */
  #call-detail { display: none; }
  .back-link {
    display: inline-flex; align-items: center; gap: 6px;
    color: var(--violet-400); text-decoration: none; font-size: 13px; font-weight: 600;
    cursor: pointer; background: none; border: none; font-family: inherit;
    padding: 8px 0; margin-bottom: 16px;
  }
  .back-link:hover { color: var(--violet-500); }
  .detail-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;
  }
  @media (max-width: 768px) { .detail-grid { grid-template-columns: 1fr; } }
  .detail-stat {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 14px 16px;
  }
  .detail-stat-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
  .detail-stat-value { font-size: 15px; font-weight: 700; margin-top: 2px; color: var(--text); }
  .detail-section {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; padding: 20px; margin-bottom: 16px;
  }
  .detail-section-title { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
  .objection-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; background: rgba(255,255,255,0.02); border-radius: 10px;
    margin-bottom: 8px;
  }
  .objection-type {
    text-transform: capitalize; font-weight: 600; font-size: 13px;
  }
  .objection-response {
    font-size: 12px; color: var(--text-secondary); margin-top: 4px;
    line-height: 1.5;
  }
  .transcript-line {
    padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03);
    font-size: 13px; line-height: 1.6;
  }
  .transcript-line:last-child { border-bottom: none; }
  .transcript-speaker {
    font-weight: 700; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.06em; margin-bottom: 2px;
  }
  .speaker-rep { color: var(--violet-400); }
  .speaker-prospect { color: var(--success); }
  .transcript-text { color: var(--text-secondary); }
  .transcript-time { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

  /* Loading & Error */
  .loading {
    text-align: center; padding: 40px; color: var(--text-muted);
  }
  .loading::after {
    content: ''; display: inline-block; width: 20px; height: 20px;
    border: 2px solid var(--border); border-top-color: var(--violet-400);
    border-radius: 50%; animation: spin 0.8s linear infinite;
    margin-left: 8px; vertical-align: middle;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error-state {
    text-align: center; padding: 40px; color: var(--error);
  }

  /* Footer */
  .footer {
    text-align: center; padding: 24px 0 12px;
    font-size: 12px; color: var(--text-muted);
    border-top: 1px solid var(--border); margin-top: 32px;
  }

  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f8f9fc;
      --surface: #ffffff;
      --surface-hover: #f1f3f9;
      --border: rgba(139, 92, 246, 0.12);
      --text: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
    }
    thead { background: rgba(0,0,0,0.02); }
    td { border-top-color: rgba(0,0,0,0.04); }
    tr:hover td { background: rgba(0,0,0,0.01); }
    .objection-item { background: rgba(0,0,0,0.02); }
    .transcript-line { border-bottom-color: rgba(0,0,0,0.04); }
  }

  @media (prefers-reduced-motion: reduce) {
    .stat-card, .sentiment-bar .seg { transition: none; }
  }
</style>
</head>
<body>
<div class="wrapper" id="app">
  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <div class="logo-icon">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="white"/>
        </svg>
      </div>
      <div>
        <div class="logo-text">Pitchly</div>
        <div class="header-subtitle">Manager Dashboard — Cross-Call Analytics</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <button onclick="location.reload()" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">↻ Refresh</button>
    </div>
  </header>

  <!-- Dashboard Main View -->
  <div id="dashboard-view">
    <!-- Stats Grid -->
    <div class="stats-grid" id="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Calls</div>
        <div class="stat-value violet" id="stat-calls">—</div>
        <div class="stat-change">coached sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Objections Handled</div>
        <div class="stat-value green" id="stat-objections">—</div>
        <div class="stat-change">across all calls</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Talk Ratio</div>
        <div class="stat-value" id="stat-talk-ratio" style="color:#60a5fa;">—</div>
        <div class="stat-change">you vs prospect</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Sentiment</div>
        <div class="stat-value" id="stat-sentiment-text" style="font-size:20px;">—</div>
        <div class="sentiment-bar" id="sentiment-bar"></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Card Helpfulness</div>
        <div class="stat-value" id="stat-helpful" style="color:#34d399;">—</div>
        <div class="stat-change" id="stat-helpful-sub">rep 👍 rate</div>
      </div>
    </div>

    <!-- Charts -->
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">Objection Type Distribution</div>
        <div class="chart-container"><canvas id="distribution-chart"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Objections Over Time (30 days)</div>
        <div class="chart-container"><canvas id="timeline-chart"></canvas></div>
      </div>
    </div>

    <!-- Response Helpfulness by Type (worst-rated first = rewrite candidates) -->
    <div class="table-card" id="helpfulness-card" style="display:none;">
      <div class="table-header">
        <span class="table-title">Response Helpfulness by Type</span>
        <span class="table-count">lowest 👍 rate first — rewrite candidates</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Objection</th>
              <th>Cards</th>
              <th>Rated</th>
              <th>👍 Rate</th>
            </tr>
          </thead>
          <tbody id="helpfulness-table-body"></tbody>
        </table>
      </div>
    </div>

    <!-- Recent Calls Table -->
    <div class="table-card">
      <div class="table-header">
        <span class="table-title">Recent Calls</span>
        <span class="table-count" id="call-count">—</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Rep</th>
              <th>Duration</th>
              <th>Talk Ratio</th>
              <th>Sentiment</th>
              <th>Objections</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="calls-table-body"></tbody>
        </table>
      </div>
      <div class="empty-state" id="calls-empty" style="display:none;">
        <div class="empty-state-icon">📞</div>
        <div class="empty-state-title">No calls yet</div>
        <div class="empty-state-text">Once you start using Pitchly on calls, your data will appear here. Run a test call to see analytics in action.</div>
      </div>
    </div>
  </div>

  <!-- Call Detail View -->
  <div id="call-detail">
    <button class="back-link" onclick="showDashboard()">← Back to Dashboard</button>
    <div id="call-detail-content"></div>
  </div>

  <!-- Footer -->
  <div class="footer">Pitchly — Cross-Call Analytics Engine</div>
</div>

<script>
// ─── State ───────────────────────────────────────────────────────────────────
let distributionChart = null
let timelineChart = null
const OBJECTION_COLORS = {
  price: '#f87171', timing: '#fbbf24', authority: '#a78bfa',
  competitor: '#60a5fa', no_need: '#9ca3af', trust: '#34d399',
  roi: '#38bdf8', complexity: '#c084fc', priority: '#f472b6', ghost: '#94a3b8'
}

// ─── Navigation ──────────────────────────────────────────────────────────────
function showDashboard() {
  document.getElementById('dashboard-view').style.display = 'block'
  document.getElementById('call-detail').style.display = 'none'
  history.replaceState(null, '', '/dashboard')
}

function showCallDetail(callId) {
  document.getElementById('dashboard-view').style.display = 'none'
  document.getElementById('call-detail').style.display = 'block'
  history.replaceState(null, '', '/dashboard?call=' + callId)
  loadCallDetail(callId)
}

// ─── API Helper ──────────────────────────────────────────────────────────────
// The token is collected in-page and kept in sessionStorage — never in the URL
// (URLs leak via history/logs/Referer). Sent as a Bearer header on every call.
function getDashToken() {
  let t = sessionStorage.getItem('pitchly_dash_token')
  if (!t) {
    t = window.prompt('Enter dashboard token:') || ''
    if (t) sessionStorage.setItem('pitchly_dash_token', t)
  }
  return t
}
async function api(path) {
  const res = await fetch(path, {
    headers: { Authorization: 'Bearer ' + getDashToken() },
  })
  if (res.status === 401) {
    sessionStorage.removeItem('pitchly_dash_token')
    throw new Error('Unauthorized — reload and re-enter the dashboard token')
  }
  if (!res.ok) throw new Error('API error: ' + res.status)
  return res.json()
}

function escapeHtml(str) {
  if (!str) return ''
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// Render helpfulness-by-type, worst 👍 rate first (the rewrite candidates).
function renderHelpfulness(types) {
  const card = document.getElementById('helpfulness-card')
  const body = document.getElementById('helpfulness-table-body')
  const rated = (types || []).filter(function (t) { return t.feedbackCount > 0 })
  if (rated.length === 0) { card.style.display = 'none'; return }
  rated.sort(function (a, b) { return a.helpfulRate - b.helpfulRate })
  body.innerHTML = rated.map(function (t) {
    const color = t.helpfulRate >= 70 ? '#34d399' : t.helpfulRate >= 40 ? '#fbbf24' : '#f87171'
    const label = String(t.type).replace(/_/g, ' ')
    return '<tr>' +
      '<td style="text-transform:capitalize;">' + escapeHtml(label) + '</td>' +
      '<td>' + t.count + '</td>' +
      '<td>' + t.feedbackCount + '</td>' +
      '<td style="color:' + color + ';font-weight:600;">' + t.helpfulRate + '%</td>' +
      '</tr>'
  }).join('')
  card.style.display = 'block'
}

function formatDuration(ms) {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return m + 'm ' + s + 's'
}

function formatDate(ts) {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Load Dashboard Data ─────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [summary, recentCalls, timelineData, objectionsByTypeData] = await Promise.all([
      api('/api/analytics/summary'),
      api('/api/analytics/recent-calls'),
      api('/api/analytics/objections-over-time-by-type'),
      api('/api/analytics/objection-distribution'),
    ])

    // Stats
    document.getElementById('stat-calls').textContent = summary.totalCalls
    document.getElementById('stat-objections').textContent = summary.totalObjections
    document.getElementById('stat-talk-ratio').textContent = summary.avgTalkRatio + '%'

    // Sentiment distribution
    const sent = summary.sentimentDistribution
    const totalSent = (sent.strong || 0) + (sent.neutral || 0) + (sent.at_risk || 0)
    if (totalSent > 0) {
      const pStrong = ((sent.strong || 0) / totalSent * 100).toFixed(0)
      const pNeutral = ((sent.neutral || 0) / totalSent * 100).toFixed(0)
      const pRisk = ((sent.at_risk || 0) / totalSent * 100).toFixed(0)
      document.getElementById('stat-sentiment-text').textContent = '🟢 ' + pStrong + '% · 🟡 ' + pNeutral + '% · 🔴 ' + pRisk + '%'
      document.getElementById('sentiment-bar').innerHTML =
        '<div class="seg seg-strong" style="width:' + pStrong + '%"></div>' +
        '<div class="seg seg-neutral" style="width:' + pNeutral + '%"></div>' +
        '<div class="seg seg-at_risk" style="width:' + pRisk + '%"></div>'
    }

    // Card helpfulness tile
    if (summary.helpfulRate === null || summary.feedbackCount === 0) {
      document.getElementById('stat-helpful').textContent = '—'
      document.getElementById('stat-helpful-sub').textContent = 'no feedback yet'
    } else {
      const hr = summary.helpfulRate
      const el = document.getElementById('stat-helpful')
      el.textContent = hr + '%'
      el.style.color = hr >= 70 ? '#34d399' : hr >= 40 ? '#fbbf24' : '#f87171'
      document.getElementById('stat-helpful-sub').textContent = summary.feedbackCount + ' rated'
    }

    // Response helpfulness by type — worst rate first (rewrite candidates)
    renderHelpfulness(summary.objectionsByType)

    // Objection Distribution Chart
    if (summary.objectionsByType && summary.objectionsByType.length > 0) {
      renderDistributionChart(summary.objectionsByType)
    }

    // Timeline Chart
    if (timelineData && timelineData.length > 0) {
      renderTimelineChart(timelineData)
    }

    // Recent Calls Table
    if (recentCalls && recentCalls.length > 0) {
      document.getElementById('call-count').textContent = recentCalls.length + ' calls'
      renderCallsTable(recentCalls)
    } else {
      document.getElementById('calls-table-body').innerHTML = ''
      document.getElementById('calls-empty').style.display = 'block'
    }

  } catch (err) {
    console.error('Failed to load dashboard:', err)
    document.querySelectorAll('.stat-value').forEach(el => el.textContent = '⚠')
  }
}

// ─── Charts ──────────────────────────────────────────────────────────────────
function renderDistributionChart(data) {
  const ctx = document.getElementById('distribution-chart').getContext('2d')
  if (distributionChart) distributionChart.destroy()

  const labels = data.map(d => d.type.charAt(0).toUpperCase() + d.type.slice(1).replace(/_/g, ' '))
  const counts = data.map(d => d.count)
  const colors = data.map(d => OBJECTION_COLORS[d.type] || '#94a3b8')

  distributionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Objections',
        data: counts,
        backgroundColor: colors.map(c => c + '33'),
        borderColor: colors,
        borderWidth: 2,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#64748b', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        x: {
          ticks: { color: '#94a3b8', font: { size: 10 } },
          grid: { display: false }
        }
      }
    }
  })
}

function renderTimelineChart(data) {
  const ctx = document.getElementById('timeline-chart').getContext('2d')
  if (timelineChart) timelineChart.destroy()

  // Group by date and type
  const dateMap = {}
  const typeColors = {}
  data.forEach(d => {
    if (!dateMap[d.date]) dateMap[d.date] = { date: d.date }
    dateMap[d.date][d.type] = (dateMap[d.date][d.type] || 0) + d.count
    typeColors[d.type] = OBJECTION_COLORS[d.type] || '#94a3b8'
  })

  const dates = Object.keys(dateMap).sort()
  const types = [...new Set(data.map(d => d.type))]

  const datasets = types.map(type => ({
    label: type.charAt(0).toUpperCase() + type.slice(1),
    data: dates.map(d => dateMap[d][type] || 0),
    borderColor: typeColors[type],
    backgroundColor: typeColors[type] + '22',
    fill: true,
    tension: 0.3,
    pointRadius: 3,
    pointHoverRadius: 5,
  }))

  timelineChart = new Chart(ctx, {
    type: 'line',
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 12, padding: 8 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#64748b', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        x: {
          ticks: { color: '#94a3b8', font: { size: 10 } },
          grid: { display: false }
        }
      }
    }
  })
}

// ─── Recent Calls Table ──────────────────────────────────────────────────────
function renderCallsTable(calls) {
  const tbody = document.getElementById('calls-table-body')
  tbody.innerHTML = calls.map(c => {
    const sentimentClass = c.finalSentiment === 'strong' ? 'sentiment-strong'
      : c.finalSentiment === 'at_risk' ? 'sentiment-at_risk' : 'sentiment-neutral'
    const sentimentEmoji = c.finalSentiment === 'strong' ? '🟢'
      : c.finalSentiment === 'at_risk' ? '🔴' : '🟡'
    return '<tr>' +
      '<td style="font-weight:500;color:var(--text)">' + formatDate(c.startedAt) + '</td>' +
      '<td class="truncate">' + escapeHtml(c.repEmail || '—') + '</td>' +
      '<td>' + formatDuration(c.durationMs) + '</td>' +
      '<td>' + (c.talkRatioYou != null ? c.talkRatioYou + '% / ' + c.talkRatioThem + '%' : '—') + '</td>' +
      '<td>' + (c.finalSentiment
        ? '<span class="sentiment-tag ' + sentimentClass + '">' + sentimentEmoji + ' ' + c.finalSentiment + '</span>'
        : '—') + '</td>' +
      '<td class="objection-count">' + c.objectionCount + '</td>' +
      '<td><a href="#" class="call-link" onclick="event.preventDefault();showCallDetail(\'' + c.id + '\')">Details →</a></td>' +
      '</tr>'
  }).join('')
  document.getElementById('calls-empty').style.display = 'none'
}

// ─── Call Detail ─────────────────────────────────────────────────────────────
async function loadCallDetail(callId) {
  const content = document.getElementById('call-detail-content')
  content.innerHTML = '<div class="loading">Loading call details</div>'

  try {
    const detail = await api('/api/analytics/call/' + encodeURIComponent(callId))

    if (!detail || detail.error) {
      content.innerHTML = '<div class="error-state">Call not found</div>'
      return
    }

    const sentimentEmoji = detail.finalSentiment === 'strong' ? '🟢'
      : detail.finalSentiment === 'at_risk' ? '🔴' : '🟡'
    const sentimentClass = detail.finalSentiment === 'strong' ? 'sentiment-strong'
      : detail.finalSentiment === 'at_risk' ? 'sentiment-at_risk' : 'sentiment-neutral'

    // Stats grid
    let html = '<div class="detail-grid">'
    html += '<div class="detail-stat"><div class="detail-stat-label">Rep</div><div class="detail-stat-value">' + escapeHtml(detail.repEmail || 'Unknown') + '</div></div>'
    html += '<div class="detail-stat"><div class="detail-stat-label">Duration</div><div class="detail-stat-value">' + formatDuration(detail.durationMs) + '</div></div>'
    html += '<div class="detail-stat"><div class="detail-stat-label">Talk Ratio</div><div class="detail-stat-value">' + (detail.talkRatioYou != null ? detail.talkRatioYou + '% You / ' + detail.talkRatioThem + '% Prospect' : '—') + '</div></div>'
    html += '<div class="detail-stat"><div class="detail-stat-label">Sentiment</div><div class="detail-stat-value"><span class="sentiment-tag ' + sentimentClass + '">' + sentimentEmoji + ' ' + (detail.finalSentiment || 'unknown') + '</span></div></div>'
    html += '<div class="detail-stat"><div class="detail-stat-label">Date</div><div class="detail-stat-value">' + formatDate(detail.startedAt) + '</div></div>'
    html += '<div class="detail-stat"><div class="detail-stat-label">Manager CC</div><div class="detail-stat-value">' + escapeHtml(detail.managerEmail || 'None') + '</div></div>'
    html += '</div>'

    // Summary
    if (detail.summary) {
      html += '<div class="detail-section"><div class="detail-section-title">Call Summary</div>'
      html += '<p style="font-size:13px;color:var(--text-secondary);line-height:1.6;">' + escapeHtml(detail.summary) + '</p></div>'
    }

    // Objections
    if (detail.objections && detail.objections.length > 0) {
      html += '<div class="detail-section"><div class="detail-section-title">Objections (' + detail.objections.length + ')</div>'
      detail.objections.forEach(o => {
        const color = OBJECTION_COLORS[o.type] || '#94a3b8'
        html += '<div class="objection-item" style="border-left:3px solid ' + color + ';">' +
          '<div><div class="objection-type" style="color:' + color + '">' + o.type.replace(/_/g, ' ') + '</div>' +
          '<div class="objection-response">' + escapeHtml(o.response) + '</div></div>' +
          '<span style="font-size:12px;color:var(--text-muted);font-weight:600;white-space:nowrap;margin-left:12px;">' + Math.round(o.confidence * 100) + '%</span>' +
          '</div>'
      })
      html += '</div>'
    } else {
      html += '<div class="detail-section"><div class="detail-section-title">Objections</div><p style="color:var(--text-muted);font-size:13px;">No objections detected on this call.</p></div>'
    }

    // Follow-up Draft
    if (detail.followUpDraft) {
      html += '<div class="detail-section"><div class="detail-section-title">Follow-Up Draft</div>'
      html += '<pre style="font-family:inherit;font-size:13px;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;background:rgba(139,92,246,0.04);border-left:3px solid #7c3aed;padding:12px 14px;border-radius:0 10px 10px 0;">' + escapeHtml(detail.followUpDraft) + '</pre></div>'
    }

    // Transcript
    if (detail.transcriptSegments && detail.transcriptSegments.length > 0) {
      html += '<div class="detail-section"><div class="detail-section-title">Transcript</div>'
      detail.transcriptSegments.forEach(s => {
        const speakerClass = s.speaker === 'rep' ? 'speaker-rep' : 'speaker-prospect'
        const time = new Date(s.timestamp * 1000).toLocaleTimeString('en-US', { minute: '2-digit', second: '2-digit' })
        html += '<div class="transcript-line">' +
          '<div class="transcript-speaker ' + speakerClass + '">' + s.speaker + '</div>' +
          '<div class="transcript-text">' + escapeHtml(s.text) + '</div>' +
          '<div class="transcript-time">' + time + '</div>' +
          '</div>'
      })
      html += '</div>'
    }

    content.innerHTML = html
  } catch (err) {
    console.error('Failed to load call detail:', err)
    content.innerHTML = '<div class="error-state">Failed to load call details. The call may have been deleted.</div>'
  }
}

// ─── Check for call detail in URL ────────────────────────────────────────────
function checkUrl() {
  const params = new URLSearchParams(window.location.search)
  const callId = params.get('call')
  if (callId) {
    showCallDetail(callId)
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────
loadDashboard()
checkUrl()
</script>
</body>
</html>`
