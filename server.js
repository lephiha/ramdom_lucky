const http = require('http')
const fs   = require('fs')
const path = require('path')
const url  = require('url')

const PORT         = process.env.PORT || 3000
const PUBLIC       = path.join(__dirname, 'public')
const MEMBERS_FILE = path.join(__dirname, 'data', 'members.json')
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', chunk => raw += chunk)
    req.on('end', () => {
      try { resolve(JSON.parse(raw)) }
      catch { resolve({}) }
    })
  })
}

function decorateRes(res) {
  res.json = (data, status = 200) => {
    const body = JSON.stringify(data)
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(body)
  }
  res.error = (status, message) => {
    res.json({ success: false, message }, status)
  }
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      return res.end('Not found')
    }
    const ext  = path.extname(filePath)
    const mime = MIME[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime })
    res.end(data)
  })
}

const server = http.createServer(async (req, res) => {
  decorateRes(res)

  const parsed   = url.parse(req.url, true)
  const pathname = parsed.pathname
  const method   = req.method.toUpperCase()

  console.log(`[${method}] ${pathname}`)

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    return res.end()
  }

  if (pathname.startsWith('/api/')) {
    req.body  = await parseBody(req)
    req.query = parsed.query

    // GET /api/members
    if (method === 'GET' && pathname === '/api/members') {
      const members = readJSON(MEMBERS_FILE)
      return res.json({ success: true, data: members, total: members.length })
    }

    // GET /api/members/all
    if (method === 'GET' && pathname === '/api/members/all') {
      const members = readJSON(MEMBERS_FILE)
      return res.json({ success: true, data: members, total: members.length })
    }

    // POST /api/members
    if (method === 'POST' && pathname === '/api/members') {
      const { name, role, emoji, color } = req.body
      if (!name || !role) return res.error(400, 'name và role là bắt buộc')

      const members = readJSON(MEMBERS_FILE)
      const newId   = members.length > 0
        ? Math.max(...members.map(m => m.id)) + 1
        : 1

      const newMember = {
        id:         newId,
        name:       name.trim(),
        role:       role.trim(),
        emoji:      emoji?.trim() || name.slice(0, 2).toUpperCase(),
        color:      color || '#6b7280',
        department: req.body.department || '',
        maxPicks:   req.body.maxPicks   || 1,
        active:     true,
      }

      members.push(newMember)
      writeJSON(MEMBERS_FILE, members)
      return res.json({ success: true, data: newMember }, 201)
    }

    // PUT /api/members/:id
    if (method === 'PUT' && pathname.startsWith('/api/members/')) {
      const id      = parseInt(pathname.split('/')[3])
      const members = readJSON(MEMBERS_FILE)
      const idx     = members.findIndex(m => m.id === id)

      if (idx === -1) return res.error(404, 'Không tìm thấy thành viên')

      const { name, role, emoji, color, active } = req.body
      if (name   !== undefined) members[idx].name   = name.trim()
      if (role   !== undefined) members[idx].role   = role.trim()
      if (emoji  !== undefined) members[idx].emoji  = emoji
      if (color  !== undefined) members[idx].color  = color
      if (active !== undefined) members[idx].active = Boolean(active)

      writeJSON(MEMBERS_FILE, members)
      return res.json({ success: true, data: members[idx] })
    }

    // DELETE /api/members/:id
    if (method === 'DELETE' && pathname.startsWith('/api/members/')) {
      const id      = parseInt(pathname.split('/')[3])
      const members = readJSON(MEMBERS_FILE)
      const idx     = members.findIndex(m => m.id === id)

      if (idx === -1) return res.error(404, 'Không tìm thấy thành viên')

      const [deleted] = members.splice(idx, 1)
      writeJSON(MEMBERS_FILE, members)
      return res.json({ success: true, message: `Đã xóa ${deleted.name}` })
    }

    // POST /api/spin — logic theo department
    if (method === 'POST' && pathname === '/api/spin') {
      const allMembers = readJSON(MEMBERS_FILE)

      // Gom người còn active theo department
      const deptMap = {}
      allMembers.forEach(m => {
        if (m.active === false) return
        if (!deptMap[m.department]) deptMap[m.department] = []
        deptMap[m.department].push(m)
      })

      // Đếm số lần mỗi dept đã được chọn từ history
      const history   = readJSON(HISTORY_FILE)
      const deptCount = {}
      history.forEach(h => {
        if (h.department) deptCount[h.department] = (deptCount[h.department] || 0) + 1
      })

      // Lọc dept còn được phép chọn (chưa đạt maxPicks)
      const availableDepts = Object.keys(deptMap).filter(dept => {
        const maxPicks = deptMap[dept][0]?.maxPicks || 1
        const picked   = deptCount[dept] || 0
        return picked < maxPicks
      })

      if (availableDepts.length === 0) {
        return res.error(400, 'Tất cả phòng ban đã được chọn đủ! Hãy reset.')
      }

      // Random dept → random người trong dept đó
      const chosenDept  = availableDepts[Math.floor(Math.random() * availableDepts.length)]
      const pool        = deptMap[chosenDept]
      const winner      = pool[Math.floor(Math.random() * pool.length)]

      // Kiểm tra đây có phải lần pick cuối của dept không
      const maxPicks    = winner.maxPicks || 1
      const pickedSoFar = deptCount[chosenDept] || 0
      const isLastPick  = pickedSoFar + 1 >= maxPicks

      if (isLastPick) {
        // Xóa hết cả phòng
        allMembers.forEach(m => {
          if (m.department === chosenDept) m.active = false
        })
      } else {
        // Chỉ xóa người được chọn
        const widx = allMembers.findIndex(m => m.id === winner.id)
        if (widx !== -1) allMembers[widx].active = false
      }

      writeJSON(MEMBERS_FILE, allMembers)

      // Lưu lịch sử
      const record = {
        id:          history.length > 0 ? history[0].id + 1 : 1,
        memberId:    winner.id,
        memberName:  winner.name,
        memberRole:  winner.role,
        memberEmoji: winner.emoji,
        memberColor: winner.color,
        department:  winner.department,
        spinAt:      new Date().toISOString(),
      }
      history.unshift(record)
      if (history.length > 100) history.splice(100)
      writeJSON(HISTORY_FILE, history)

      // Đếm dept còn lại
      const remaining = [...new Set(
        allMembers.filter(m => m.active !== false).map(m => m.department)
      )].length

      return res.json({
        success:    true,
        winner,
        record,
        remaining,
        totalSpins: history.length,
        message:    `🎯 ${winner.name} (${winner.department}) được chọn!`
      })
    }

    // GET /api/spin/history
    if (method === 'GET' && pathname === '/api/spin/history') {
      const history = readJSON(HISTORY_FILE)
      const limit   = parseInt(req.query.limit || 20)
      const page    = parseInt(req.query.page  || 1)
      const offset  = (page - 1) * limit

      return res.json({
        success:    true,
        data:       history.slice(offset, offset + limit),
        total:      history.length,
        page,
        limit,
        totalPages: Math.ceil(history.length / limit),
      })
    }

    // GET /api/spin/stats
    if (method === 'GET' && pathname === '/api/spin/stats') {
      const history  = readJSON(HISTORY_FILE)
      const members  = readJSON(MEMBERS_FILE)
      const countMap = {}
      history.forEach(h => {
        countMap[h.memberId] = (countMap[h.memberId] || 0) + 1
      })

      const TOTAL_SPINS = 15
      const remaining   = TOTAL_SPINS - history.length

      return res.json({
        success: true,
        stats: {
          totalSpins:   history.length,
          uniquePicked: Object.keys(countMap).length,
          totalMembers: members.length,
          remaining:    remaining < 0 ? 0 : remaining,
        }
      })
    }

    // POST /api/spin/reset
    if (method === 'POST' && pathname === '/api/spin/reset') {
      const members = readJSON(MEMBERS_FILE)
      members.forEach(m => m.active = true)
      writeJSON(MEMBERS_FILE, members)
      writeJSON(HISTORY_FILE, [])

      return res.json({
        success: true,
        total:   members.length,
        message: `Reset xong — sẵn sàng quay lại!`
      })
    }

    return res.error(404, `Không tìm thấy route ${method} ${pathname}`)
  }

  // Static files
  let filePath = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC, 'index.html')
  }
  serveStatic(res, filePath)
})

server.listen(PORT, () => {
  console.log(`\n  Random Lucky Spinner is running on port ${PORT}`)
  console.log(`  ─────────────────────────────`)
  console.log(`  http://localhost:${PORT}`)
  console.log(`  ─────────────────────────────\n`)
})