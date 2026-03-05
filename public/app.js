const API = '/api'

let members         = []
let isSpinning      = false
let spinTimer       = null
let currentWinnerId = null

let totalSpins = parseInt(localStorage.getItem('totalSpins') || 15)

// ── Khởi động ────────────────────────────────
async function init() {
  await Promise.all([loadMembers(), loadStats(), loadHistory()])

  document.getElementById('totalSpinsDisplay').textContent = totalSpins
  
  if (localStorage.getItem('theme') !== 'dark') {
    document.body.classList.add('light')
    document.getElementById('themeToggle').classList.add('on')
  }
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
    document.getElementById('statTotal').textContent     = json.stats.totalSpins
    document.getElementById('statRemaining').textContent = Math.max(0, totalSpins - json.stats.totalSpins)
    document.getElementById('statUnique').textContent    = json.stats.uniquePicked
  }
}

async function loadHistory() {
  const res  = await fetch(`${API}/spin/history?limit=15`)
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
      <span style="font-size:18px;font-family:'Unbounded',sans-serif;font-weight:700">${h.memberName}</span>
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

  const res  = await fetch(`${API}/spin`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ maxSpins: totalSpins }),
  })
  const json = await res.json()

  if (!json.success) {
    isSpinning = false
    if (json.done) showToast('🎉 Đã hết lượt quay!', 'success')
    else if (json.message) showToast(json.message, 'error')
    return
  }

  document.getElementById('spinBtn').disabled = true
  document.getElementById('slotDisplay').classList.add('spinning')

  if (currentWinnerId) {
    document.getElementById(`card-${currentWinnerId}`)?.classList.remove('winner')
  }
  document.querySelectorAll('.member-card').forEach(c => c.classList.remove('winner'))

  
  suspenseReveal(json.winner, json.record)
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
  let   locked     = 0

  d.classList.remove('spinning')
  document.getElementById('skipBtn').style.display = 'inline-block'

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const scrambles = words.map(w => w)

  function randomChar(len) {
    return Array.from({length: len}, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
  }

  function buildDisplay() {
    return words.map((word, i) => {
      if (i < locked) {
        return `<span class="reveal-char" style="color:${winner.color};font-size:clamp(24px,4vw,52px);font-weight:900">${word}</span>`
      } else {
        return `<span style="color:var(--muted);font-family:'Unbounded',sans-serif;font-size:clamp(24px,4vw,52px);font-weight:900;letter-spacing:2px">${scrambles[i]}</span>`
      }
    }).join('<span style="display:inline-block;width:12px"></span>')
  }

  function render() {
    const done = locked >= totalWords
    d.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;width:100%;height:100%;padding:0 32px">
        <div style="font-family:'Unbounded',sans-serif;font-weight:900;letter-spacing:2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center">
          ${buildDisplay()}
        </div>
        <div style="font-size:10px;color:var(--muted);letter-spacing:3px;text-transform:uppercase">
          ${done ? winner.department : locked === 0 ? 'Ai được chọn?' : `còn ${totalWords - locked} từ nữa...`}
        </div>
      </div>`
  }

  const scrambleInterval = setInterval(() => {
    for (let i = locked; i < totalWords; i++) {
      scrambles[i] = randomChar(words[i].length)
    }
    render()
  }, 80)

  window._scrambleInterval = scrambleInterval

  function lockNext() {
    if (locked >= totalWords) return
    locked++
    render()

    if (locked >= totalWords) {
      clearInterval(scrambleInterval)
      window._scrambleInterval = null
      window._revealTimer      = null
      document.getElementById('skipBtn').style.display = 'none'
      setTimeout(() => finalize(winner, record), 800)
    } else {
      window._revealTimer = setTimeout(lockNext, 3000)
    }
  }

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

  document.getElementById('slotDisplay').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:48px;width:100%;height:100%;padding:0 80px;box-sizing:border-box">
      <div style="font-size:40px;flex-shrink:0">🏆</div>
      <div class="avatar" style="width:64px;height:64px;font-size:16px;flex-shrink:0;background:${winner.color}22;color:${winner.color};border:2px solid ${winner.color};box-shadow:0 0 24px ${winner.color}55">
        ${winner.emoji}
      </div>
      <div style="min-width:0;flex:1">
        <div style="font-family:'Unbounded',sans-serif;font-weight:900;color:${winner.color};font-size:clamp(32px,5vw,72px);line-height:1.2">${winner.name}</div>
        <div style="font-size:18px;color:var(--muted);margin-top:10px;letter-spacing:3px;font-family:'Unbounded',sans-serif;font-weight:700">${winner.department}</div>
      </div>
    </div>`

  launchConfetti(winner.color)
  showWinnerPopup(winner)  

  loadStats()
  loadHistory()
  loadMembers()

  setTimeout(() => {
    document.getElementById('spinBtn').disabled = false
    isSpinning = false
  }, 600)
}

function showWinnerPopup(winner) {
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,.7);
    z-index: 998;
    cursor: pointer;
  `

  const popup = document.createElement('div')
  popup.style.cssText = `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) scale(0);
    background: #12121a;
    border: 2px solid ${winner.color};
    box-shadow: 0 0 60px ${winner.color}66;
    border-radius: 24px;
    padding: 60px 80px;
    z-index: 999;
    text-align: center;
    transition: transform .4s cubic-bezier(.34,1.56,.64,1);
    min-width: 60vw;
  `

  popup.innerHTML = `
    <div style="font-size:60px;margin-bottom:24px">🏆</div>
    <div style="font-family:'Unbounded',sans-serif;font-weight:900;color:${winner.color};font-size:clamp(36px,6vw,90px);line-height:1.2;margin-bottom:16px">
      ${winner.name}
    </div>
    <div style="font-size:22px;color:#fff;letter-spacing:6px;text-transform:uppercase;margin-top:16px;font-family:'Unbounded',sans-serif;font-weight:700">
      ${winner.department} · ${winner.role}
    </div>
    <div style="margin-top:32px;font-size:12px;color:var(--muted);opacity:.6">
      click để đóng
    </div>
  `

  document.body.appendChild(overlay)
  document.body.appendChild(popup)

  requestAnimationFrame(() => {
    popup.style.transform = 'translate(-50%, -50%) scale(1)'
    launchFireworks()
  })

  const close = () => {
    popup.style.transform = 'translate(-50%, -50%) scale(0)'
    overlay.style.opacity = '0'
    setTimeout(() => { popup.remove(); overlay.remove() }, 400)
  }

  overlay.onclick = close
  popup.onclick   = close
}

function showCinema() {
  const memes = [
    '/image.png',
  ]
  const img = memes[Math.floor(Math.random() * memes.length)]

  const popup = document.createElement('div')
  popup.style.cssText = `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) scale(0);
    background: #000;
    border: 3px solid #fff;
    border-radius: 16px;
    padding: 24px 32px;
    z-index: 999;
    text-align: center;
    transition: transform .3s cubic-bezier(.34,1.56,.64,1);
    max-width: 340px;
    width: 90%;
  `
  popup.innerHTML = `
    <div style="font-family:'Unbounded',sans-serif;font-size:22px;font-weight:900;color:#fff;letter-spacing:2px;margin-bottom:12px">
      ABSOLUTE CINEMA
    </div>
    <img src="${img}" style="width:100%;border-radius:10px;display:block" onerror="this.src='https://i.imgur.com/2jlNmvV.jpeg'"/>
  `

  // Overlay mờ
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,.6);
    z-index: 998;
    transition: opacity .3s;
  `

  document.body.appendChild(overlay)
  document.body.appendChild(popup)

  requestAnimationFrame(() => {
    popup.style.transform = 'translate(-50%, -50%) scale(1)'
  })

  // Tự biến mất sau 2.5s
  setTimeout(() => {
    popup.style.transform  = 'translate(-50%, -50%) scale(0)'
    overlay.style.opacity  = '0'
    setTimeout(() => {
      popup.remove()
      overlay.remove()
    }, 300)
  }, 2500)
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

function changeTotalSpins(delta) {
  totalSpins = Math.max(1, totalSpins + delta)
  localStorage.setItem('totalSpins', totalSpins)
  document.getElementById('totalSpinsDisplay').textContent = totalSpins
  document.getElementById('statRemaining').textContent     = Math.max(0, totalSpins - parseInt(document.getElementById('statTotal').textContent))
  // Cập nhật label
  document.querySelector('#statRemaining').closest('.stat').querySelector('.stat-label').textContent = `Còn lại / ${totalSpins}`
}

function toggleTheme() {
  const toggle = document.getElementById('themeToggle')
  const isOn   = toggle.classList.toggle('on')
  document.body.classList.toggle('light', isOn)
  localStorage.setItem('theme', isOn ? 'light' : 'dark')
}

function toggleList() {
  const panel = document.getElementById('panelMembers')
  const btn   = document.getElementById('toggleListBtn')
  const container = document.querySelector('.container')
  const isHidden  = panel.style.display === 'none'

  if (isHidden) {
    panel.style.display = ''
    container.style.gridTemplateColumns = '380px 1fr'
    btn.innerHTML = '☰ ẨN DS'
  } else {
    panel.style.display = 'none'
    container.style.gridTemplateColumns = '1fr'
    btn.innerHTML = '☰ HIỆN DS'
  }
}

function launchFireworks() {
  const colors = ['#ff3c5f', '#ffb800', '#00e5ff', '#a855f7', '#10b981', '#ff6b35', '#ff85a1']
  const delays = [0, 600, 1200]
  
  delays.forEach(delay => {
    setTimeout(() => {
      for (let i = 0; i < 60; i++) {
        setTimeout(() => {
          const el    = document.createElement('div')
          const angle = (Math.random() * 160 + 10) * Math.PI / 180
          const speed = Math.random() * 140 + 80
          const vx    = Math.cos(angle) * speed
          const vy    = -Math.sin(angle) * speed
          const size  = Math.random() * 7 + 3
          const color = colors[Math.floor(Math.random() * colors.length)]

          el.style.cssText = `
            position: fixed;
            width: ${size}px; height: ${size}px;
            border-radius: ${Math.random() > .5 ? '50%' : '2px'};
            background: ${color};
            left: ${20 + Math.random() * 60}vw;
            bottom: 0;
            pointer-events: none;
            z-index: 9999;
          `
          document.body.appendChild(el)

          let x = 0, y = 0, vy2 = vy, tick = 0
          const anim = setInterval(() => {
            tick++
            vy2 += 2.5
            x += vx * 0.3
            y += vy2 * 0.3
            el.style.transform = `translate(${x}px, ${y}px) rotate(${tick * 8}deg)`
            el.style.opacity   = Math.max(0, 1 - tick / 65)
            if (tick > 65) { clearInterval(anim); el.remove() }
          }, 16)
        }, i * 15)
      }
    }, delay)
  })
}
// ── Start ─────────────────────────────────────
init()
document.addEventListener('DOMContentLoaded', () => {
  toggleList()
})