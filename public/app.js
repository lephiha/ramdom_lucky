const API = '/api'

let members         = []
let isSpinning      = false
let spinTimer       = null
let currentWinnerId = null

// ── Khởi động ────────────────────────────────
async function init() {
  await Promise.all([
    loadMembers(),
    loadStats(),
    loadHistory(),
  ])
}

// ── Members ──────────────────────────────────
async function loadMembers() {
  const res  = await fetch(`${API}/members/all`)
  const json = await res.json()
  members    = json.data || []
  renderMembers()
  document.getElementById('memberCount').textContent = members.length
}

function renderMembers() {
  const grid = document.getElementById('memberGrid')

  if (!members.length) {
    grid.innerHTML = `<div class="empty-hint" style="grid-column:1/-1">Chưa có thành viên</div>`
    return
  }

  // Đếm số lần mỗi dept đã được pick (từ active=false)
  const deptPickCount = {}
  members.forEach(m => {
    if (m.active === false) {
      deptPickCount[m.department] = (deptPickCount[m.department] || 0) + 1
    }
  })

  grid.innerHTML = members.map(m => {
    const maxPicks  = m.maxPicks || 1
    const picked    = deptPickCount[m.department] || 0
    const deptDone  = picked >= maxPicks
    const isDimmed  = m.active === false || deptDone

    return `
      <div class="member-card ${isDimmed ? 'picked' : ''}" id="card-${m.id}">
        <div class="avatar" style="background:${m.color}22;color:${m.color};border:1.5px solid ${m.color}44">
          ${m.emoji}
        </div>
        <div style="flex:1;min-width:0">
          <div class="member-name">${m.name}</div>
          <div class="member-role">${isDimmed ? '✓ đã chọn' : (m.department || m.role)}</div>
        </div>
        ${isDimmed
          ? `<span style="font-size:14px">✓</span>`
          : `<button class="btn-del" onclick="deleteMember(${m.id}, event)">×</button>`
        }
      </div>`
  }).join('')

  const remaining           = members.filter(m => m.active !== false).length
  const badge               = document.getElementById('remainingBadge')
  badge.textContent         = remaining < members.length ? `${remaining} còn lại` : ''
  badge.style.color         = 'var(--accent2)'
  badge.style.fontSize      = '9px'
}

async function addMember() {
  const name  = document.getElementById('inputName').value.trim()
  const role  = document.getElementById('inputRole').value.trim()
  const emoji = document.getElementById('inputEmoji').value.trim()
  const color = document.getElementById('inputColor').value

  if (!name || !role) {
    return showToast('Vui lòng nhập họ tên và chức vụ', 'error')
  }

  const res  = await fetch(`${API}/members`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, role, emoji, color }),
  })
  const json = await res.json()

  if (json.success) {
    showToast(`✅ Đã thêm ${name}`, 'success')
    document.getElementById('inputName').value  = ''
    document.getElementById('inputRole').value  = ''
    document.getElementById('inputEmoji').value = ''
    await loadMembers()
  } else {
    showToast(json.message, 'error')
  }
}

async function deleteMember(id, event) {
  event.stopPropagation()

  const member = members.find(m => m.id === id)
  if (!confirm(`Xóa ${member?.name} khỏi phòng ban?`)) return

  const res  = await fetch(`${API}/members/${id}`, { method: 'DELETE' })
  const json = await res.json()

  if (json.success) {
    showToast(json.message, 'success')
    await loadMembers()
  }
}

// ── Stats & History ──────────────────────────
async function loadStats() {
  const res  = await fetch(`${API}/spin/stats`)
  const json = await res.json()

  if (json.success) {
    const TOTAL = 15
    document.getElementById('statTotal').textContent     = json.stats.totalSpins
    document.getElementById('statRemaining').textContent = Math.max(0, TOTAL - json.stats.totalSpins)
    document.getElementById('statUnique').textContent    = json.stats.uniquePicked
  }
}

async function loadHistory() {
  const res  = await fetch(`${API}/spin/history?limit=8`)
  const json = await res.json()
  const list = document.getElementById('historyList')

  if (!json.data?.length) {
    list.innerHTML = `<div class="empty-hint">Chưa có lượt quay nào</div>`
    return
  }

  list.innerHTML = json.data.map(h => `
    <div class="history-item">
      <span class="history-num">#${h.id}</span>
      <div class="mini-avatar" style="background:${h.memberColor}22;color:${h.memberColor};border:1px solid ${h.memberColor}44">
        ${h.memberEmoji}
      </div>
      <span>${h.memberName}</span>
      <span style="margin-left:auto;font-size:9px;color:var(--accent3)">
        ${new Date(h.spinAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  `).join('')
}

async function resetAll() {
  if (!confirm('Reset lại tất cả? Mọi người sẽ có thể được chọn lại.')) return

  // Dừng animation đang chạy nếu có
  if (window._scrambleInterval) clearInterval(window._scrambleInterval)
  if (window._revealTimer)      clearTimeout(window._revealTimer)
  window._scrambleInterval = null
  window._revealTimer      = null
  isSpinning = false

  const res  = await fetch(`${API}/spin/reset`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({}),
  })
  const json = await res.json()

  if (json.success) {
    showToast(json.message, 'success')

    // Reset UI về trạng thái ban đầu
    document.getElementById('statTotal').textContent     = 0
    document.getElementById('statRemaining').textContent = 15
    document.getElementById('statUnique').textContent    = 0
    document.getElementById('historyList').innerHTML     = `<div class="empty-hint">Chưa có lượt quay nào</div>`
    document.getElementById('spinBtn').disabled          = false
    document.getElementById('skipBtn').style.display     = 'none'
    document.getElementById('slotDisplay').classList.remove('spinning')
    document.getElementById('slotDisplay').innerHTML     = `
      <div class="slot-idle">
        <div class="slot-idle-text">Sẵn sàng</div>
      </div>`

    await loadMembers()
  }
}
// ── Spin ─────────────────────────────────────
async function startSpin() {
  if (isSpinning || !members.length) return
  isSpinning = true

  // Lấy winner từ server
  const res  = await fetch(`${API}/spin`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({}),
  })
  const json = await res.json()

  if (!json.success) {
    isSpinning = false
    return showToast(json.message, 'error')
  }

  const winner = json.winner
  document.getElementById('spinBtn').disabled = true
  document.getElementById('slotDisplay').classList.add('spinning')

  // Reset winner cũ
  if (currentWinnerId) {
    document.getElementById(`card-${currentWinnerId}`)?.classList.remove('winner')
  }
  document.querySelectorAll('.member-card').forEach(c => c.classList.remove('winner', 'spinning-active'))

  // Phase 1: flash qua các thành viên
  const totalSteps = Math.floor(Math.random() * 20 + 30)
  let step  = 0
  let idx   = 0
  let delay = 60

  const activeMembers = members.filter(m => m.active !== false)

  function tick() {
    document.querySelectorAll('.member-card').forEach(c => c.classList.remove('spinning-active'))

    const cur = activeMembers[idx % activeMembers.length]
    document.getElementById(`card-${cur.id}`)?.classList.add('spinning-active')
    updateSlotRunning(cur)

    step++
    idx++
    const remaining = totalSteps - step
    if (remaining <= 12) delay = 60 + (12 - remaining) * 45

    if (step >= totalSteps) {
      document.querySelectorAll('.member-card').forEach(c => c.classList.remove('spinning-active'))
      suspenseReveal(winner, json.record)
      return
    }

    spinTimer = setTimeout(tick, delay)
  }

  tick()
}

function updateSlotRunning(member) {
  const d = document.getElementById('slotDisplay')
  d.innerHTML = `
    <div class="slot-content">
      <div class="avatar" style="width:40px;height:40px;background:${member.color}22;color:${member.color};border:2px solid ${member.color}55">
        ${member.emoji}
      </div>
      <div>
        <div class="slot-name">${member.name}</div>
        <div class="slot-role">${member.role}</div>
      </div>
    </div>`
}

// Phase 2: reveal từng chữ mỗi 5 giây
  function suspenseReveal(winner, record) {
  const d          = document.getElementById('slotDisplay')
  const words      = winner.name.trim().split(' ')
  const totalWords = words.length
  let   locked     = 0  // số từ đã khóa

  d.classList.remove('spinning')
  document.getElementById('skipBtn').style.display = 'inline-block'

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const scrambles = words.map(w => w) // clone

  function randomChar(len) {
    return Array.from({length: len}, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
  }

  function buildDisplay() {
    return words.map((word, i) => {
      if (i < locked) {
        return `<span class="reveal-char" style="color:${winner.color}">${word}</span>`
      } else {
        return `<span style="color:var(--muted);font-family:'Unbounded',sans-serif;letter-spacing:2px">${scrambles[i]}</span>`
      }
    }).join('<span style="display:inline-block;width:10px"></span>')
  }

  function render() {
    const done = locked >= totalWords
    d.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;padding:0 20px">
        <div style="font-family:'Unbounded',sans-serif;font-size:20px;font-weight:900;letter-spacing:2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;min-height:36px">
          ${buildDisplay()}
        </div>
        <div style="font-size:9px;color:var(--muted);letter-spacing:3px;text-transform:uppercase">
          ${done ? winner.department : locked === 0 ? 'Ai được chọn?' : `còn ${totalWords - locked} từ nữa...`}
        </div>
      </div>`
  }

  // Scramble loop — tất cả chữ chưa khóa đều chạy cùng lúc
  const scrambleInterval = setInterval(() => {
    for (let i = locked; i < totalWords; i++) {
      scrambles[i] = randomChar(words[i].length)
    }
    render()
  }, 80)

  window._scrambleInterval = scrambleInterval

  // Mỗi 3s khóa 1 từ
  function lockNext() {
    if (locked >= totalWords) return

    // Khóa từ tiếp theo
    locked++
    render()

    if (locked >= totalWords) {
      // Xong hết — dừng scramble, hiện finalize
      clearInterval(scrambleInterval)
      window._scrambleInterval = null
      window._revealTimer      = null
      document.getElementById('skipBtn').style.display = 'none'
      setTimeout(() => finalize(winner, record), 800)
    } else {
      window._revealTimer = setTimeout(lockNext, 3000)
    }
  }

  // Bắt đầu khóa từ đầu tiên sau 3s
  render()
  window._revealTimer  = setTimeout(lockNext, 3000)
  window._revealWinner = winner
  window._revealRecord = record
}

function skipReveal() {
  if (window._scrambleInterval) clearInterval(window._scrambleInterval)
  if (window._revealTimer)      clearTimeout(window._revealTimer)
  window._revealTimer      = null
  window._scrambleInterval = null
  finalize(window._revealWinner, window._revealRecord)
}

function finalize(winner, record) {
  currentWinnerId = winner.id
  document.getElementById(`card-${winner.id}`)?.classList.add('winner')
  document.getElementById('skipBtn').style.display = 'none'

  // Hiện trophy + tên đầy đủ
  document.getElementById('slotDisplay').innerHTML = `
    <div class="slot-content">
      <div style="font-size:28px">🏆</div>
      <div class="avatar" style="width:52px;height:52px;font-size:14px;background:${winner.color}22;color:${winner.color};border:2px solid ${winner.color};box-shadow:0 0 20px ${winner.color}55">
        ${winner.emoji}
      </div>
      <div>
        <div class="slot-name" style="color:${winner.color};font-size:18px">${winner.name}</div>
        <div class="slot-role">${winner.department}</div>
      </div>
    </div>`

  launchConfetti(winner.color)
  loadStats()
  loadHistory()
  loadMembers()

  setTimeout(() => {
    document.getElementById('spinBtn').disabled = false
    isSpinning = false
  }, 600)
}

// ── Confetti ──────────────────────────────────
function launchConfetti(color) {
  const colors = [color, '#ff3c5f', '#ffb800', '#00e5ff', '#a855f7']
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      const el       = document.createElement('div')
      el.className   = 'confetti-piece'
      el.style.cssText = `
        left: ${Math.random() * 100}vw;
        top: -10px;
        background: ${colors[i % colors.length]};
        transform: rotate(${Math.random() * 360}deg);
        animation-duration: ${Math.random() + 1.2}s;
        animation-delay: ${Math.random() * 0.4}s;
      `
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 2500)
    }, i * 25)
  }
}

// ── Toast ─────────────────────────────────────
let toastTimer

function showToast(msg, type = 'success') {
  // Tạo toast nếu chưa có
  let toast = document.getElementById('toast')
  if (!toast) {
    toast           = document.createElement('div')
    toast.id        = 'toast'
    toast.className = 'toast'
    document.body.appendChild(toast)
  }

  toast.textContent = msg
  toast.className   = `toast ${type} show`

  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000)
}

// ── Start ─────────────────────────────────────
init()