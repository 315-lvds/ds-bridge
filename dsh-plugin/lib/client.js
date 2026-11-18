/**
 * Browser half of dsbridge-import.
 *
 * This file is a hand-written DSH client bundle loaded through
 * window.__ModuleLoader__. It accepts both dsbridge v1/v2 linear JSON and the
 * official DeepSeek export zip (manifest.json + chat_session_index.json +
 * chat_sessions/<id>.json). Conversations are selected locally, converted to
 * the official v3 archive format, and uploaded in batches of at most 1000
 * sessions through the official owner import route.
 */
window.__ModuleLoader__.load({
  id: 'dsbridge-import',
  factory: function (require) {
    'use strict'

    var React = require('react')
    var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    var Button = primitives.Button
    var Modal = primitives.Modal
    var Input = primitives.Input
    var Checkbox = primitives.Checkbox
    var SegmentedControl = primitives.SegmentedControl
    var h = React.createElement
    var NS = 'dsbridgeImport'
    var MAX_BATCH_SESSIONS = 1000
    var MAX_BATCH_BYTES = 320 * 1024 * 1024
    var SCAN_CONCURRENCY = 4
    var RENDER_STEP = 250
    var CONFIRM_SELECTION = 50

    var zh = {
      'action.label': '导入 DeepSeek 会话',
      'action.short': '导入',
      'dialog.title': '导入 DeepSeek 会话',
      'dialog.description': '支持深桥导出的 JSON / ZIP，也支持官方 deepseek_data-*.zip；筛选后写入工作区，超过 1000 个会自动分批。',
      'dialog.drop': '拖入 JSON / ZIP，或选择文件',
      'dialog.formats': '深桥 export.json、单链 JSON、导出 ZIP，或官方 deepseek_data-*.zip',
      'dialog.chooseFile': '选择文件',
      'dialog.workspace': '导入到工作区',
      'dialog.chooseWorkspace': '选择工作区',
      'dialog.import': '导入选中会话',
      'dialog.cancel': '取消',
      'dialog.close': '关闭',
      'dialog.done': '完成',
      'dialog.empty': '没有找到可导入的会话。',
      'dialog.none': '尚未选择文件。',
      'dialog.selected': '已选 {count} 个会话 · {messages} 条消息',
      'dialog.visible': '当前结果 {count} 个',
      'dialog.files': '{files} 个文件 · {entries} 个会话',
      'dialog.bad': '{count} 个会话无法解析，已隐藏',
      'dialog.batches': '已选 {count} 个会话，将分 {batches} 批导入。',
      'filter.search': '搜索标题、ID 或文件名',
      'filter.turns': '排除短会话（按用户轮次）',
      'filter.recent': '更新时间',
      'recent.all': '不限',
      'recent.days': '{count} 天',
      'recent.custom': '自定义',
      'recent.customLabel': '最近天数',
      'filter.reasoning': '只看含思考过程',
      'filter.sort': '排序',
      'turns.all': '全部',
      'turns.min': '≥ {count} 轮',
      'turns.custom': '自定义',
      'turns.customLabel': '最少轮次',
      'sort.updated': '最近更新',
      'sort.messages': '消息数',
      'sort.title': '标题',
      'list.all': '全选当前结果',
      'list.none': '清空',
      'list.invert': '反选当前结果',
      'list.confirmAll': '当前结果共有 {count} 个会话，全选会导入大量会话。',
      'list.empty': '没有匹配的会话。',
      'list.more': '显示更多（还剩 {count} 个）',
      'row.turns': '{count} 轮',
      'row.messages': '{count} 条',
      'row.branch': '分支 {index}/{total}',
      'badge.official': '官方',
      'badge.dsbridge': '深桥',
      'progress.parsing': '正在读取文件...',
      'progress.scanning': '正在解析官方导出 {done}/{total}...',
      'progress.building': '正在组装第 {batch}/{batches} 批...',
      'progress.uploading': '第 {batch}/{batches} 批上传中 {percent}%',
      'progress.reading': '服务器读取中...',
      'progress.importing': '第 {batch}/{batches} 批写入 {done}/{total}',
      'error.prefix': '导入失败：{message}',
      'error.noRoute': '找不到官方 DeepSeek 会话导入器的上传接口。请先在 Plugins > 更多 > 实验性插件中启用“DeepSeek 会话导入”，再重试。',
      'error.http': '服务器返回 HTTP {status}：{message}',
      'error.transport': '上传连接中断：{message}',
      'error.invalid': '服务器返回了无法识别的进度数据。',
      'error.noWorkspace': '请选择一个工作区。',
      'result.ok': '已导入 {count} 个会话到「{workspace}」。',
      'result.batches': '共分 {count} 批完成。',
      'result.skipped': '其中 {count} 个被跳过。',
      'result.omitted': '另有 {count} 个因导入器上限未写入。',
      'result.failed': '{count} 个会话没有可导入的消息，已跳过。',
      'result.partial': '中途停止，已完成的批次保留。',
      'dialog.confirmLarge': '已选择 {count} 个会话，将分 {batches} 批写入工作区。',
      'dialog.confirmTitle': '确认批量导入',
      'dialog.confirmSelectTitle': '选择较多会话',
      'dialog.confirmImport': '继续导入',
      'dialog.confirmSelect': '继续选择',
      'dialog.back': '返回选择',
    }

    var en = {
      'action.label': 'Import DeepSeek sessions',
      'action.short': 'Import',
      'dialog.title': 'Import DeepSeek sessions',
      'dialog.description': 'Choose dsbridge JSON / ZIP files or an official deepseek_data-*.zip. Filter locally, then write into a Workspace; more than 1000 sessions are uploaded in batches.',
      'dialog.drop': 'Drop JSON / ZIP here, or choose files',
      'dialog.formats': 'dsbridge export.json, single-chain JSON, an export ZIP, or an official deepseek_data-*.zip',
      'dialog.chooseFile': 'Choose files',
      'dialog.workspace': 'Import into Workspace',
      'dialog.chooseWorkspace': 'Choose a Workspace',
      'dialog.import': 'Import selected',
      'dialog.cancel': 'Cancel',
      'dialog.close': 'Close',
      'dialog.done': 'Done',
      'dialog.empty': 'No importable conversations were found.',
      'dialog.none': 'No files chosen yet.',
      'dialog.selected': '{count} selected · {messages} messages',
      'dialog.visible': '{count} in the current result',
      'dialog.files': '{files} files · {entries} conversations',
      'dialog.bad': '{count} conversations could not be parsed and are hidden',
      'dialog.batches': '{count} selected; importing in {batches} batches.',
      'filter.search': 'Search title, id, or file name',
      'filter.turns': 'Exclude short chats (user turns)',
      'filter.recent': 'Updated',
      'recent.all': 'Any time',
      'recent.days': '{count} days',
      'recent.custom': 'Custom',
      'recent.customLabel': 'Days',
      'filter.reasoning': 'Has reasoning',
      'filter.sort': 'Sort',
      'turns.all': 'All',
      'turns.min': '≥ {count} turns',
      'turns.custom': 'Custom',
      'turns.customLabel': 'Minimum turns',
      'sort.updated': 'Recently updated',
      'sort.messages': 'Message count',
      'sort.title': 'Title',
      'list.all': 'Select visible',
      'list.none': 'Clear',
      'list.invert': 'Invert visible',
      'list.confirmAll': 'The current result has {count} conversations. Selecting all of them will import a large number.',
      'list.empty': 'No matching conversations.',
      'list.more': 'Show more ({count} left)',
      'row.turns': '{count} turns',
      'row.messages': '{count} messages',
      'row.branch': 'branch {index}/{total}',
      'badge.official': 'Official',
      'badge.dsbridge': 'dsbridge',
      'progress.parsing': 'Reading files...',
      'progress.scanning': 'Scanning official export {done}/{total}...',
      'progress.building': 'Building batch {batch}/{batches}...',
      'progress.uploading': 'Uploading batch {batch}/{batches} ({percent}%)',
      'progress.reading': 'The server is reading...',
      'progress.importing': 'Writing batch {batch}/{batches}: {done}/{total}',
      'error.prefix': 'Import failed: {message}',
      'error.noRoute': 'The DeepSeek chat importer route was not found. Enable the experimental "DeepSeek chat import" plugin under Plugins > More first, then retry.',
      'error.http': 'The server answered HTTP {status}: {message}',
      'error.transport': 'The upload connection failed: {message}',
      'error.invalid': 'The server sent unrecognized progress data.',
      'error.noWorkspace': 'Choose a Workspace first.',
      'result.ok': 'Imported {count} sessions into "{workspace}".',
      'result.batches': 'Completed in {count} batches.',
      'result.skipped': '{count} were skipped.',
      'result.omitted': '{count} were omitted by the importer limit.',
      'result.failed': '{count} conversations had no importable messages and were skipped.',
      'result.partial': 'Stopped early; completed batches were kept.',
      'dialog.confirmLarge': 'You selected {count} conversations; they will be written in {batches} batches.',
      'dialog.confirmTitle': 'Confirm bulk import',
      'dialog.confirmSelectTitle': 'Many conversations selected',
      'dialog.confirmImport': 'Import anyway',
      'dialog.confirmSelect': 'Select anyway',
      'dialog.back': 'Back',
    }

    var textEncoder = new TextEncoder()
    var textDecoder = new TextDecoder()

    function messageOf(error) {
      if (error && typeof error.message === 'string') return error.message
      return String(error)
    }

    function timeOf(value) {
      if (typeof value !== 'string' || value.length === 0) return null
      var ms = Date.parse(value)
      if (!Number.isFinite(ms) || ms < 0) return null
      return new Date(ms).toISOString()
    }

    function fallbackTime() {
      return new Date(0).toISOString()
    }

    function truncateTitle(value) {
      var clean = String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim()
      if (clean.length === 0) clean = '未命名会话'
      var out = ''
      var used = 0
      for (var ch of clean) {
        var size = textEncoder.encode(ch).length
        if (used + size > 80) break
        out += ch
        used += size
      }
      return out.length > 0 ? out : 'untitled'
    }

    function fnv1a(value) {
      var hash = 0x811c9dc5
      var text = String(value)
      for (var i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
      }
      return (hash >>> 0).toString(16)
    }

    function crcTable() {
      var table = new Uint32Array(256)
      for (var n = 0; n < 256; n++) {
        var c = n
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
      }
      return table
    }

    var CRC_TABLE = crcTable()

    function crc32(data) {
      var c = 0xffffffff
      for (var i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
      return (c ^ 0xffffffff) >>> 0
    }

    function dosDateTime(date) {
      var year = Math.max(1980, date.getFullYear())
      return {
        date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      }
    }

    function buildZip(files, now) {
      var stamp = dosDateTime(now || new Date())
      var chunks = []
      var central = []
      var offset = 0
      for (var i = 0; i < files.length; i++) {
        var file = files[i]
        var nameBytes = textEncoder.encode(file.name)
        var data = typeof file.data === 'string' ? textEncoder.encode(file.data) : file.data
        var crc = crc32(data)
        var local = new Uint8Array(30 + nameBytes.length)
        var dv = new DataView(local.buffer)
        dv.setUint32(0, 0x04034b50, true)
        dv.setUint16(4, 20, true)
        dv.setUint16(6, 0x0800, true)
        dv.setUint16(8, 0, true)
        dv.setUint16(10, stamp.time, true)
        dv.setUint16(12, stamp.date, true)
        dv.setUint32(14, crc, true)
        dv.setUint32(18, data.length, true)
        dv.setUint32(22, data.length, true)
        dv.setUint16(26, nameBytes.length, true)
        dv.setUint16(28, 0, true)
        local.set(nameBytes, 30)
        chunks.push(local, data)
        central.push({ nameBytes: nameBytes, crc: crc, size: data.length, offset: offset })
        offset += local.length + data.length
      }
      var cdStart = offset
      var cdSize = 0
      for (var j = 0; j < central.length; j++) {
        var entry = central[j]
        var header = new Uint8Array(46 + entry.nameBytes.length)
        var hv = new DataView(header.buffer)
        hv.setUint32(0, 0x02014b50, true)
        hv.setUint16(4, 20, true)
        hv.setUint16(6, 20, true)
        hv.setUint16(8, 0x0800, true)
        hv.setUint16(10, 0, true)
        hv.setUint16(12, stamp.time, true)
        hv.setUint16(14, stamp.date, true)
        hv.setUint32(16, entry.crc, true)
        hv.setUint32(20, entry.size, true)
        hv.setUint32(24, entry.size, true)
        hv.setUint16(28, entry.nameBytes.length, true)
        hv.setUint16(30, 0, true)
        hv.setUint16(32, 0, true)
        hv.setUint16(34, 0, true)
        hv.setUint16(36, 0, true)
        hv.setUint32(38, 0, true)
        hv.setUint32(42, entry.offset, true)
        header.set(entry.nameBytes, 46)
        chunks.push(header)
        cdSize += header.length
      }
      var eocd = new Uint8Array(22)
      var ev = new DataView(eocd.buffer)
      ev.setUint32(0, 0x06054b50, true)
      ev.setUint16(4, 0, true)
      ev.setUint16(6, 0, true)
      ev.setUint16(8, central.length, true)
      ev.setUint16(10, central.length, true)
      ev.setUint32(12, cdSize, true)
      ev.setUint32(16, cdStart, true)
      ev.setUint16(20, 0, true)
      chunks.push(eocd)
      var total = 0
      for (var k = 0; k < chunks.length; k++) total += chunks[k].length
      var out = new Uint8Array(total)
      var p = 0
      for (var m = 0; m < chunks.length; m++) {
        out.set(chunks[m], p)
        p += chunks[m].length
      }
      return out
    }

    async function inflateRaw(raw) {
      if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot decompress deflated zip entries')
      var stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      var buffer = await new Response(stream).arrayBuffer()
      return new Uint8Array(buffer)
    }

    function u16(bytes, offset) {
      return bytes[offset] | (bytes[offset + 1] << 8)
    }

    function u32(bytes, offset) {
      return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
    }

    async function sliceBytes(blob, start, end) {
      var buffer = await blob.slice(start, end).arrayBuffer()
      return new Uint8Array(buffer)
    }

    async function openZip(file) {
      if (!file || typeof file.slice !== 'function' || !Number.isFinite(file.size)) throw new Error('not a file')
      if (file.size < 22) throw new Error('not a zip archive')
      var tailLength = Math.min(file.size, 65557 + 22)
      var tailStart = file.size - tailLength
      var tail = await sliceBytes(file, tailStart, file.size)
      var eocd = -1
      for (var i = tail.length - 22; i >= 0; i--) {
        if (u32(tail, i) === 0x06054b50) { eocd = i; break }
      }
      if (eocd < 0) throw new Error('not a zip archive')
      var count = u16(tail, eocd + 10)
      var cdSize = u32(tail, eocd + 12)
      var cdOffset = u32(tail, eocd + 16)
      if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error('zip64 is not supported')
      if (cdOffset + cdSize > file.size) throw new Error('bad zip central directory')
      var cd = await sliceBytes(file, cdOffset, cdOffset + cdSize)
      var entries = []
      var byName = new Map()
      var p = 0
      for (var n = 0; n < count; n++) {
        if (p + 46 > cd.length || u32(cd, p) !== 0x02014b50) throw new Error('bad zip central directory')
        var method = u16(cd, p + 10)
        var csize = u32(cd, p + 20)
        var usize = u32(cd, p + 24)
        var nameLen = u16(cd, p + 28)
        var extraLen = u16(cd, p + 30)
        var commentLen = u16(cd, p + 32)
        var localOffset = u32(cd, p + 42)
        var name = textDecoder.decode(cd.subarray(p + 46, p + 46 + nameLen))
        var entry = { name: name, method: method, csize: csize, usize: usize, localOffset: localOffset }
        entries.push(entry)
        byName.set(name, entry)
        p += 46 + nameLen + extraLen + commentLen
      }
      return { file: file, name: file.name || 'archive.zip', size: file.size, entries: entries, byName: byName }
    }

    async function readEntry(zip, entry) {
      if (!entry) throw new Error('zip entry is missing')
      if (entry.localOffset + 30 > zip.size) throw new Error('bad zip local header')
      var head = await sliceBytes(zip.file, entry.localOffset, entry.localOffset + 30)
      if (u32(head, 0) !== 0x04034b50) throw new Error('bad zip local header')
      var nameLen = u16(head, 26)
      var extraLen = u16(head, 28)
      var start = entry.localOffset + 30 + nameLen + extraLen
      if (start + entry.csize > zip.size) throw new Error('zip entry is outside the file')
      var raw = await sliceBytes(zip.file, start, start + entry.csize)
      var data
      if (entry.method === 0) data = raw
      else if (entry.method === 8) data = await inflateRaw(raw)
      else throw new Error('unsupported zip compression method ' + entry.method)
      if (entry.usize > 0 && data.length !== entry.usize) throw new Error('zip entry size mismatch')
      return data
    }

    async function readJsonEntry(zip, entry) {
      return JSON.parse(textDecoder.decode(await readEntry(zip, entry)))
    }

    function validMessage(message) {
      return message !== null && message !== undefined && (message.role === 'user' || message.role === 'assistant')
    }

    function entriesFromDoc(doc, sourceName, meta) {
      if (doc === null || doc === undefined || typeof doc !== 'object') throw new Error('not a JSON object')
      if (!Array.isArray(doc.conversations) || doc.conversations.length === 0) throw new Error('no conversations')
      if (doc.schema !== 'dsbridge.export/v2' && doc.schema !== 'dsbridge.export/v1') throw new Error('not a dsbridge export')
      var out = []
      for (var i = 0; i < doc.conversations.length; i++) {
        var conv = doc.conversations[i]
        if (conv === null || conv === undefined || !Array.isArray(conv.messages)) throw new Error('conversation ' + (i + 1) + ' has no messages')
        var messages = conv.messages.filter(validMessage)
        if (messages.length === 0) continue
        var userTurns = 0
        var hasReasoning = false
        for (var j = 0; j < messages.length; j++) {
          var m = messages[j]
          if (m.role === 'user') userTurns++
          if (Array.isArray(m.reasoning) && m.reasoning.length > 0) hasReasoning = true
        }
        var title = String(conv.title || conv.source_title || '未命名会话')
        var sourceTitle = String(conv.source_title || conv.title || '')
        out.push({
          key: sourceName + '#' + i + '#' + String(conv.id || ''),
          kind: 'dsbridge',
          fileLabel: sourceName,
          conv: conv,
          id: String(conv.id || sourceName + '#' + i),
          title: title,
          source_title: sourceTitle,
          branch: conv.branch && typeof conv.branch === 'object' ? conv.branch : null,
          mode: doc.branch_mode || 'active',
          message_count: messages.length,
          user_turns: userTurns,
          has_reasoning: hasReasoning,
          updated_at: timeOf(conv.updated_at) || timeOf(conv.created_at) || fallbackTime(),
          created_at: timeOf(conv.created_at) || fallbackTime(),
          source_size: meta && Number.isFinite(meta.source_size) ? meta.source_size : 0,
          bad: null,
        })
      }
      if (out.length === 0) throw new Error('no non-empty conversations')
      return out
    }

    function officialChain(doc) {
      var messages = doc && Array.isArray(doc.messages) ? doc.messages : []
      var byId = new Map()
      var max = messages.length > 0 ? messages[messages.length - 1] : null
      var maxKey = -Infinity
      for (var i = 0; i < messages.length; i++) {
        var message = messages[i]
        if (!message || typeof message !== 'object' || message.id === undefined || message.id === null) continue
        var key = String(message.id)
        byId.set(key, message)
        var numeric = Number(message.id)
        if (Number.isFinite(numeric) && numeric > maxKey) {
          maxKey = numeric
          max = message
        }
      }
      if (doc && doc.current_message_id !== undefined && doc.current_message_id !== null) {
        var current = byId.get(String(doc.current_message_id))
        if (current) max = current
      }
      var chain = []
      var seen = new Set()
      var cursor = max
      while (cursor && typeof cursor === 'object') {
        var cursorKey = String(cursor.id)
        if (seen.has(cursorKey)) break
        seen.add(cursorKey)
        chain.push(cursor)
        if (cursor.parent_id === null || cursor.parent_id === undefined) break
        cursor = byId.get(String(cursor.parent_id))
      }
      chain.reverse()
      return chain
    }

    function officialStats(chain) {
      var turns = 0
      var reasoning = false
      for (var i = 0; i < chain.length; i++) {
        var message = chain[i]
        if (String(message.role || '').toUpperCase() === 'USER') turns++
        if (Array.isArray(message.fragments)) {
          for (var j = 0; j < message.fragments.length; j++) {
            var fragment = message.fragments[j]
            if (fragment && fragment.type === 'THINK') { reasoning = true; break }
          }
        }
      }
      return { turns: turns, reasoning: reasoning }
    }

    function officialEntryFromDoc(doc, sourceName, meta) {
      var chain = officialChain(doc)
      var stats = officialStats(chain)
      var id = String((doc && doc.id) || (meta && meta.id) || (meta && meta.path) || sourceName)
      var created = timeOf(doc && doc.inserted_at) || (meta && timeOf(meta.inserted_at)) || fallbackTime()
      var updated = timeOf(doc && doc.updated_at) || (meta && timeOf(meta.updated_at)) || created
      return {
        key: sourceName + '#official#' + id,
        kind: 'official',
        fileLabel: sourceName,
        id: id,
        title: String((doc && doc.title) || (meta && meta.title) || '未命名会话'),
        source_title: String((doc && doc.title) || (meta && meta.title) || ''),
        branch: null,
        message_count: chain.length || (meta && Number.isFinite(meta.message_count) ? meta.message_count : 0),
        user_turns: stats.turns,
        has_reasoning: stats.reasoning,
        updated_at: updated,
        created_at: created,
        source_size: meta && Number.isFinite(meta.source_size) ? meta.source_size : 0,
        zip: meta ? meta.zip : null,
        path: meta ? meta.path : null,
        doc: meta && meta.keepDoc ? doc : null,
        bad: chain.length === 0 ? 'no messages' : null,
      }
    }

    function entriesFromAnyDoc(doc, sourceName, meta) {
      if (doc && Array.isArray(doc.conversations) && (doc.schema === 'dsbridge.export/v2' || doc.schema === 'dsbridge.export/v1')) {
        return entriesFromDoc(doc, sourceName, meta)
      }
      if (doc && Array.isArray(doc.messages)) return [officialEntryFromDoc(doc, sourceName, meta)]
      throw new Error('not a dsbridge export or an official DeepSeek session')
    }

    function officialPlaceholder(item, file, zip, prefix) {
      var id = String(item.id)
      return {
        key: file.name + '#official#' + id,
        kind: 'official',
        fileLabel: file.name + ' / 官方导出',
        id: id,
        title: String(item.title || '未命名会话'),
        source_title: String(item.title || ''),
        branch: null,
        message_count: Number.isFinite(Number(item.message_count)) ? Number(item.message_count) : 0,
        user_turns: 0,
        has_reasoning: false,
        updated_at: timeOf(item.updated_at) || timeOf(item.inserted_at) || fallbackTime(),
        created_at: timeOf(item.inserted_at) || fallbackTime(),
        source_size: (zip.byName.get(prefix + 'chat_sessions/' + id + '.json') || {}).usize || 0,
        zip: zip,
        path: prefix + 'chat_sessions/' + id + '.json',
        doc: null,
        bad: null,
      }
    }

    async function poolMap(items, limit, worker, onDone) {
      var next = 0
      var done = 0
      async function runner() {
        while (true) {
          var index = next
          next++
          if (index >= items.length) return
          try {
            await worker(items[index], index)
          } finally {
            done++
            if (onDone) onDone(done, items.length, index)
          }
        }
      }
      var runners = []
      var count = Math.min(limit, items.length)
      for (var i = 0; i < count; i++) runners.push(runner())
      await Promise.all(runners)
    }

    async function scanOfficialZip(file, zip, prefix, indexEntry, onProgress) {
      var indexDoc = await readJsonEntry(zip, indexEntry)
      if (!Array.isArray(indexDoc)) throw new Error('chat_session_index.json is not an array')
      var items = indexDoc.filter(function (item) { return item && item.id !== undefined && item.id !== null })
      var entries = items.map(function (item) { return officialPlaceholder(item, file, zip, prefix) })
      if (onProgress) onProgress(0, items.length)
      await poolMap(items, SCAN_CONCURRENCY, async function (item, index) {
        var placeholder = entries[index]
        try {
          var entry = zip.byName.get(placeholder.path)
          if (!entry) throw new Error('chat session file is missing')
          var doc = await readJsonEntry(zip, entry)
          entries[index] = officialEntryFromDoc(doc, placeholder.fileLabel, {
            id: item.id,
            title: item.title,
            inserted_at: item.inserted_at,
            updated_at: item.updated_at,
            message_count: item.message_count,
            source_size: entry.usize,
            zip: zip,
            path: placeholder.path,
          })
        } catch (error) {
          entries[index] = Object.assign({}, placeholder, { bad: messageOf(error), user_turns: 0, has_reasoning: false })
        }
      }, function (done, total) {
        if (onProgress && (done === total || done % 10 === 0)) onProgress(done, total)
      })
      return entries
    }

    function officialRoot(zip) {
      var indexEntry = null
      for (var i = 0; i < zip.entries.length; i++) {
        if (/(^|\/)chat_session_index\.json$/i.test(zip.entries[i].name)) { indexEntry = zip.entries[i]; break }
      }
      if (!indexEntry) return null
      var prefix = indexEntry.name.slice(0, indexEntry.name.length - 'chat_session_index.json'.length)
      for (var j = 0; j < zip.entries.length; j++) {
        if (zip.entries[j].name.indexOf(prefix + 'chat_sessions/') === 0) return { indexEntry: indexEntry, prefix: prefix }
      }
      return null
    }

    async function collectEntries(fileList, onProgress) {
      var entries = []
      var errors = []
      var names = []
      var files = Array.from(fileList)
      for (var i = 0; i < files.length; i++) {
        var file = files[i]
        names.push(file.name)
        var lower = file.name.toLowerCase()
        try {
          if (lower.endsWith('.zip') || file.type === 'application/zip') {
            var zip = await openZip(file)
            var root = officialRoot(zip)
            if (root) {
              var scanned = await scanOfficialZip(file, zip, root.prefix, root.indexEntry, function (done, total) {
                if (onProgress) onProgress({ file: file.name, fileIndex: i, files: files.length, done: done, total: total })
              })
              entries = entries.concat(scanned)
              continue
            }
            for (var z = 0; z < zip.entries.length; z++) {
              var zipEntry = zip.entries[z]
              if (!zipEntry.name.toLowerCase().endsWith('.json')) continue
              if (/(^|\/)manifest\.json$/i.test(zipEntry.name)) continue
              var zipLabel = file.name + ' / ' + zipEntry.name
              try {
                var zipDoc = await readJsonEntry(zip, zipEntry)
                entries = entries.concat(entriesFromAnyDoc(zipDoc, zipLabel, { source_size: zipEntry.usize, keepDoc: true }))
              } catch (zipError) {
                errors.push(zipLabel + ': ' + messageOf(zipError))
              }
            }
          } else if (lower.endsWith('.json') || file.type === 'application/json') {
            try {
              var doc = JSON.parse(textDecoder.decode(new Uint8Array(await file.arrayBuffer())))
              entries = entries.concat(entriesFromAnyDoc(doc, file.name, { source_size: file.size, keepDoc: true }))
            } catch (jsonError) {
              errors.push(file.name + ': ' + messageOf(jsonError))
            }
          } else {
            errors.push(file.name + ': only .json and .zip are supported')
          }
        } catch (error) {
          errors.push(file.name + ': ' + messageOf(error))
        }
      }
      return { entries: entries, errors: errors, names: names }
    }

    function cleanOfficialFragments(fragments) {
      if (!Array.isArray(fragments)) return []
      var out = []
      for (var i = 0; i < fragments.length; i++) {
        var fragment = fragments[i]
        if (!fragment || typeof fragment !== 'object' || typeof fragment.type !== 'string' || fragment.type.length === 0) continue
        var copy
        try { copy = JSON.parse(JSON.stringify(fragment)) } catch (error) { continue }
        if (copy.type === 'FILE' && Array.isArray(copy.files)) {
          for (var j = 0; j < copy.files.length; j++) {
            if (copy.files[j] && typeof copy.files[j] === 'object') copy.files[j].export_path = null
          }
        }
        out.push(copy)
      }
      return out
    }

    async function readOfficialDoc(entry) {
      if (entry.doc) return entry.doc
      if (!entry.zip || !entry.path) throw new Error('the official session source is missing')
      var zipEntry = entry.zip.byName.get(entry.path)
      if (!zipEntry) throw new Error('the official session file is missing')
      return readJsonEntry(entry.zip, zipEntry)
    }

    async function officialSession(entry, exportTime) {
      var doc = await readOfficialDoc(entry)
      var chain = officialChain(doc)
      var created = timeOf(doc.inserted_at) || timeOf(entry.created_at) || exportTime
      var updated = timeOf(doc.updated_at) || timeOf(entry.updated_at) || created
      var messages = []
      for (var i = 0; i < chain.length; i++) {
        var source = chain[i]
        var role = String(source.role || '').toUpperCase()
        if (role !== 'USER' && role !== 'ASSISTANT') continue
        var fragments = cleanOfficialFragments(source.fragments)
        if (fragments.length === 0) continue
        messages.push({
          id: messages.length + 1,
          parent_id: messages.length === 0 ? null : messages.length,
          role: role,
          status: typeof source.status === 'string' && source.status.length > 0 ? source.status : 'FINISHED',
          inserted_at: timeOf(source.inserted_at) || created,
          fragments: fragments,
        })
      }
      if (messages.length === 0) return null
      return {
        title: String(doc.title || entry.title || '未命名会话'),
        created_at: created,
        updated_at: updated,
        messages: messages,
      }
    }

    function convSession(entry, exportTime) {
      var conv = entry.conv
      var sessionCreated = timeOf(conv.created_at) || timeOf(conv.updated_at) || exportTime
      var sessionUpdated = timeOf(conv.updated_at) || timeOf(conv.created_at) || sessionCreated
      var messages = []
      for (var j = 0; j < conv.messages.length; j++) {
        var m = conv.messages[j]
        if (!validMessage(m)) continue
        var msgTime = timeOf(m.created_at) || sessionCreated
        var fragments = []
        if (m.role === 'assistant' && Array.isArray(m.reasoning)) {
          for (var r = 0; r < m.reasoning.length; r++) {
            var reasoning = m.reasoning[r]
            if (reasoning === null || reasoning === undefined) continue
            var thinking = typeof reasoning.text === 'string' ? reasoning.text : ''
            if (thinking.trim().length === 0) continue
            var thinkFragment = { type: 'THINK', content: thinking }
            var elapsed = Number(reasoning.elapsed_secs)
            if (Number.isFinite(elapsed) && elapsed >= 0) thinkFragment.elapsed_secs = elapsed
            fragments.push(thinkFragment)
          }
        }
        if (typeof m.text === 'string' && m.text.length > 0) {
          fragments.push({ type: m.role === 'user' ? 'REQUEST' : 'RESPONSE', content: m.text })
        }
        if (Array.isArray(m.attachments) && m.attachments.length > 0) {
          var attachments = []
          for (var a = 0; a < m.attachments.length; a++) {
            var attachment = m.attachments[a] || {}
            var size = Number(attachment.size)
            attachments.push({
              id: 'dsb-att-' + (j + 1) + '-' + (a + 1),
              file_name: String(attachment.name || 'file'),
              file_size: Number.isFinite(size) && size >= 0 ? Math.trunc(size) : 0,
              is_image: !!attachment.is_image,
              export_path: null,
            })
          }
          fragments.push({ type: 'FILE', files: attachments })
        }
        if (fragments.length === 0) continue
        messages.push({
          id: messages.length + 1,
          parent_id: messages.length === 0 ? null : messages.length,
          role: m.role === 'user' ? 'USER' : 'ASSISTANT',
          status: 'FINISHED',
          inserted_at: msgTime,
          fragments: fragments,
        })
      }
      if (messages.length === 0) return null
      return {
        title: String(conv.title || conv.source_title || entry.title || '未命名会话'),
        created_at: sessionCreated,
        updated_at: sessionUpdated,
        messages: messages,
      }
    }

    async function buildV3(selected, now) {
      var exportTime = (now || new Date()).toISOString()
      var manifest = { export_format_version: 3, exported_at: exportTime, generator: 'dsbridge-dsh-plugin/0.2.2' }
      var index = []
      var files = []
      var failed = []
      var indexNumber = 0
      for (var i = 0; i < selected.length; i++) {
        var entry = selected[i]
        var session
        try {
          session = entry.kind === 'official' ? await officialSession(entry, exportTime) : convSession(entry, exportTime)
        } catch (error) {
          failed.push({ key: entry.key, title: entry.title || '', message: messageOf(error) })
          continue
        }
        if (!session) {
          failed.push({ key: entry.key, title: entry.title || '', message: 'no importable messages' })
          continue
        }
        indexNumber++
        var sessionId = 'dsb-' + fnv1a(entry.key + '#' + i + '#' + indexNumber) + '-' + indexNumber
        index.push({ id: sessionId, inserted_at: session.created_at, updated_at: session.updated_at })
        files.push({
          name: 'chat_sessions/' + sessionId + '.json',
          data: JSON.stringify({
            id: sessionId,
            title: truncateTitle(session.title),
            current_message_id: session.messages[session.messages.length - 1].id,
            inserted_at: session.created_at,
            messages: session.messages,
          }),
        })
      }
      if (files.length === 0) throw new Error('no messages to import')
      var output = [
        { name: 'manifest.json', data: JSON.stringify(manifest) },
        { name: 'chat_session_index.json', data: JSON.stringify(index) },
      ].concat(files)
      return { files: output, index: index, zip: buildZip(output, now || new Date()), failed: failed }
    }

    function planBatches(selected) {
      var batches = []
      var current = []
      var bytes = 0
      function flush() {
        if (current.length > 0) batches.push(current)
        current = []
        bytes = 0
      }
      for (var i = 0; i < selected.length; i++) {
        var entry = selected[i]
        var size = Number(entry.source_size)
        if (!Number.isFinite(size) || size < 0) size = 0
        if (current.length >= MAX_BATCH_SESSIONS || (current.length > 0 && bytes + size > MAX_BATCH_BYTES)) flush()
        current.push(entry)
        bytes += size
      }
      flush()
      return batches
    }

    function uploadArchive(blob, workspaceId, onProgress) {
      return new Promise(function (resolve) {
        var url = new URL(
          'api/deepseek-chat-import/archive?' + new URLSearchParams({ workspaceId: workspaceId }).toString(),
          document.baseURI,
        )
        var xhr = new XMLHttpRequest()
        var text = ''
        var consumed = 0
        var outcome = null
        var invalid = false
        var settled = false
        function settle(value) {
          if (settled) return
          settled = true
          resolve(value)
        }
        function handleLine(line) {
          if (line.length === 0) return
          var value
          try { value = JSON.parse(line) } catch (error) { invalid = true; return }
          if (value && value.type === 'progress' && typeof value.done === 'number' && typeof value.total === 'number') {
            onProgress({ phase: 'importing', done: value.done, total: value.total })
          } else if (value && value.type === 'outcome' && value.outcome) {
            outcome = value.outcome
          } else {
            invalid = true
          }
        }
        function take(final) {
          while (true) {
            var end = text.indexOf('\n', consumed)
            if (end < 0) break
            handleLine(text.slice(consumed, end))
            consumed = end + 1
          }
          if (final && consumed < text.length) {
            handleLine(text.slice(consumed))
            consumed = text.length
          }
        }
        xhr.open('POST', url.href)
        xhr.setRequestHeader('content-type', 'application/octet-stream')
        xhr.upload.onprogress = function (event) {
          if (event.lengthComputable && event.total > 0) onProgress({ phase: 'uploading', fraction: event.loaded / event.total })
        }
        xhr.upload.onload = function () { onProgress({ phase: 'reading' }) }
        xhr.onprogress = function () {
          if (xhr.status !== 200) return
          text = xhr.responseText
          take(false)
        }
        xhr.onload = function () {
          if (xhr.status !== 200) {
            var body = xhr.responseText || ''
            var reason = xhr.status === 404 ? 'no-route' : 'http'
            settle({ ok: false, reason: reason, status: xhr.status, message: body.slice(0, 400) })
            return
          }
          text = xhr.responseText
          take(true)
          if (invalid) { settle({ ok: false, reason: 'invalid', message: 'invalid progress line' }); return }
          if (outcome === null) { settle({ ok: false, reason: 'transport', message: 'the answer ended without an outcome' }); return }
          settle({ ok: outcome.ok === true, outcome: outcome })
        }
        xhr.onerror = function () { settle({ ok: false, reason: 'transport', message: 'xhr error' }) }
        xhr.onabort = function () { settle({ ok: false, reason: 'transport', message: 'the upload was cancelled' }) }
        xhr.send(blob)
      })
    }

    var CSS = [
      '.dsbi-modal{width:min(880px,100%);max-height:calc(100vh - 48px)}',
      '.dsbi-content{min-height:0;overflow-y:auto}',
      '.dsbi-wrap{display:flex;flex-direction:column;gap:14px;min-width:0}',
      '.dsbi-trigger{margin-left:4px}',
      '.dsbi-drop{display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 16px;border:1px dashed var(--dsw-alias-border-secondary,rgba(127,127,127,.4));border-radius:12px;text-align:center;background:var(--dsw-alias-bg-layer-1,transparent);transition:border-color .15s,background .15s}',
      '.dsbi-drop.is-active{border-color:var(--dsw-alias-state-accent-primary,#4d6bfe);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}',
      '.dsbi-drop-title{font-size:14px;line-height:20px;font-weight:500}',
      '.dsbi-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,inherit);opacity:.8}',
      '.dsbi-stats{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit)}',
      '.dsbi-selected{margin-left:auto;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}',
      '.dsbi-warn{color:var(--dsw-alias-state-warn-primary,#9a6700)}',
      '.dsbi-workspace{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.22));border-radius:10px;background:var(--dsw-alias-bg-layer-1,transparent)}',
      '.dsbi-section-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit)}',
      '.dsbi-workspace-row{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}',
      '.dsbi-path{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-tertiary,inherit);flex:1}',
      '.dsbi-batch-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,inherit)}',
      '.dsbi-filter{border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.22));border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px}',
      '.dsbi-filter-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:12px;align-items:start}',
      '.dsbi-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dsbi-seg{width:100%}',
      '.dsbi-input{width:100%}',
      '.dsbi-number{width:130px;margin-top:6px}',
      '.dsbi-checks{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center}',
      '.dsbi-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '.dsbi-toolbar .dsbi-count{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}',
      '.dsbi-list{border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.22));border-radius:10px;max-height:360px;overflow:auto;background:var(--dsw-alias-bg-layer-1,transparent)}',
      '.dsbi-row{display:flex;gap:10px;align-items:flex-start;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.14));cursor:pointer}',
      '.dsbi-row:last-child{border-bottom:0}',
      '.dsbi-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}',
      '.dsbi-row.is-selected{background:var(--dsw-alias-interactive-bg-selected,rgba(77,107,254,.08))}',
      '.dsbi-check{flex:none;margin-top:3px;width:16px;height:16px;accent-color:var(--dsw-alias-state-accent-primary,#4d6bfe);cursor:pointer}',
      '.dsbi-row-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}',
      '.dsbi-row-top{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dsbi-row-title{font-size:13px;line-height:19px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.dsbi-badge{flex:none;font-size:10px;line-height:16px;padding:0 5px;border-radius:5px;border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.3));color:var(--dsw-alias-label-secondary,inherit)}',
      '.dsbi-row-meta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,inherit);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsbi-row-file{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,inherit);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.8}',
      '.dsbi-empty{padding:26px 16px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary,inherit)}',
      '.dsbi-more{display:flex;justify-content:center;padding:8px}',
      '.dsbi-error{padding:9px 11px;border-radius:8px;background:rgba(220,60,60,.12);color:var(--dsw-alias-state-error-primary,#c33);font-size:12px;line-height:18px;white-space:pre-wrap}',
      '.dsbi-progress{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit)}',
      '.dsbi-result{display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:20px}',
      '.dsbi-confirm-modal{width:min(460px,100%)}',
      '.dsbi-confirm-text{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,inherit);white-space:pre-wrap}',
      '@media(max-width:640px){.dsbi-modal{width:100%}.dsbi-filter-grid{grid-template-columns:1fr}.dsbi-selected{margin-left:0}.dsbi-path{flex-basis:100%}}',
    ].join('\n')

    function installStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsbridge-import-style')) return
      var style = document.createElement('style')
      style.id = 'dsbridge-import-style'
      style.textContent = CSS
      document.head.appendChild(style)
    }

    function Action(props) {
      var t = props.t
      var [open, setOpen] = React.useState(false)
      installStyles()
      var label = t('action.label')
      return h(React.Fragment, null,
        props.children,
        h(Button, {
          variant: 'ghost',
          size: 'sm',
          className: 'dsbi-trigger',
          'aria-label': label,
          title: label,
          onClick: function () { setOpen(true) },
        }, props.wide ? t('action.short') : '⇩'),
        open ? h(ImportDialog, Object.assign({}, props, { onClose: function () { setOpen(false) } })) : null,
      )
    }

    function ImportDialog(props) {
      var t = props.t
      var workspaces = props.useWorkspaces(function (state) { return state.items })
      var currentSessionId = props.useSessions(function (state) {
        var byId = state && state.byId ? state.byId : {}
        var list = Object.values(byId)
        for (var i = 0; i < list.length; i++) {
          var session = list[i]
          if (session && session.retainedBy && (session.retainedBy.mainView || 0) > 0) return session.id
        }
        return undefined
      })
      var workspaceList = Array.isArray(workspaces) ? workspaces : []
      var initialWorkspace = workspaceList.find(function (workspace) {
        return currentSessionId !== undefined && Array.isArray(workspace.sessionIds) && workspace.sessionIds.indexOf(currentSessionId) >= 0
      }) || workspaceList[0]
      var [workspaceId, setWorkspaceId] = React.useState(initialWorkspace ? initialWorkspace.workspaceId : undefined)
      var [pickerOpen, setPickerOpen] = React.useState(false)
      var [entries, setEntries] = React.useState([])
      var [fileNames, setFileNames] = React.useState([])
      var [selected, setSelected] = React.useState(function () { return new Set() })
      var [query, setQuery] = React.useState('')
      var [turnFilter, setTurnFilter] = React.useState('2')
      var [customTurns, setCustomTurns] = React.useState('7')
      var [recentFilter, setRecentFilter] = React.useState('all')
      var [customRecent, setCustomRecent] = React.useState('7')
      var [withReasoning, setWithReasoning] = React.useState(false)
      var [sortBy, setSortBy] = React.useState('updated')
      var [phase, setPhase] = React.useState({ kind: 'idle' })
      var [error, setError] = React.useState(null)
      var [dragging, setDragging] = React.useState(false)
      var [listLimit, setListLimit] = React.useState(RENDER_STEP)
      var [bulkAck, setBulkAck] = React.useState(0)
      var [bulkPrompt, setBulkPrompt] = React.useState(null)
      var inputRef = React.useRef(null)
      var workspaceAnchor = React.useRef(null)
      var activeWorkspace = workspaceList.find(function (workspace) { return workspace.workspaceId === workspaceId }) || workspaceList[0]
      var running = phase.kind === 'parsing' || phase.kind === 'scanning' || phase.kind === 'building' || phase.kind === 'uploading' || phase.kind === 'reading' || phase.kind === 'importing'

      var visible = React.useMemo(function () {
        var q = query.trim().toLowerCase()
        var minTurns = 0
        if (turnFilter === 'custom') {
          minTurns = parseInt(customTurns, 10)
        } else if (turnFilter !== 'all') {
          minTurns = parseInt(turnFilter, 10)
        }
        if (!Number.isFinite(minTurns) || minTurns < 0) minTurns = 0
        var cutoff = null
        if (recentFilter !== 'all') {
          var days = recentFilter === 'custom' ? parseInt(customRecent, 10) : parseInt(recentFilter, 10)
          if (Number.isFinite(days) && days > 0) cutoff = Date.now() - days * 24 * 60 * 60 * 1000
        }
        var list = entries.filter(function (entry) {
          if (entry.bad) return false
          if (entry.user_turns < minTurns) return false
          if (withReasoning && !entry.has_reasoning) return false
          if (cutoff !== null) {
            var time = Date.parse(entry.updated_at)
            if (!Number.isFinite(time) || time < cutoff) return false
          }
          if (q.length > 0) {
            var hay = (entry.title + ' ' + entry.source_title + ' ' + entry.id + ' ' + entry.fileLabel).toLowerCase()
            if (hay.indexOf(q) < 0) return false
          }
          return true
        })
        if (sortBy === 'messages') list.sort(function (a, b) { return b.message_count - a.message_count })
        else if (sortBy === 'title') list.sort(function (a, b) { return a.title.localeCompare(b.title) })
        else list.sort(function (a, b) { return Date.parse(b.updated_at) - Date.parse(a.updated_at) })
        return list
      }, [entries, query, turnFilter, customTurns, recentFilter, customRecent, withReasoning, sortBy])

      React.useEffect(function () { setListLimit(RENDER_STEP) }, [query, turnFilter, customTurns, recentFilter, customRecent, withReasoning, sortBy, entries])
      React.useEffect(function () {
        for (var i = 0; i < entries.length; i++) {
          if (selected.has(entries[i].key) && entries[i].bad) {
            var next = new Set(selected)
            next.delete(entries[i].key)
            setSelected(next)
            return
          }
        }
      }, [entries])

      var chosen = React.useMemo(function () {
        return entries.filter(function (entry) { return selected.has(entry.key) })
      }, [entries, selected])
      var selectedMessages = React.useMemo(function () {
        var total = 0
        for (var i = 0; i < chosen.length; i++) total += chosen[i].message_count
        return total
      }, [chosen])
      var batches = React.useMemo(function () { return planBatches(chosen) }, [chosen])

      async function ingest(fileList) {
        if (!fileList || fileList.length === 0) return
        setPhase({ kind: 'parsing' })
        setError(null)
        setEntries([])
        setSelected(new Set())
        setBulkAck(0)
        setBulkPrompt(null)
        setFileNames(Array.from(fileList).map(function (file) { return file.name }))
        try {
          var collected = await collectEntries(fileList, function (progress) {
            setPhase({ kind: 'scanning', done: progress.done, total: progress.total, file: progress.file })
          })
          setFileNames(collected.names)
          setEntries(collected.entries)
          setSelected(new Set())
          setBulkAck(0)
          setPhase({ kind: 'idle' })
          if (collected.errors.length > 0) setError(collected.errors.slice(0, 6).join('\n'))
          if (collected.entries.length === 0 && collected.errors.length === 0) setError(t('dialog.empty'))
        } catch (error) {
          setPhase({ kind: 'idle' })
          setError(t('error.prefix', { message: messageOf(error) }))
        }
      }

      function requestBulk(kind, message, next) {
        setBulkPrompt({ kind: kind, message: message, next: next || null })
      }

      function toggle(key) {
        var next = new Set(selected)
        if (next.has(key)) next.delete(key)
        else {
          var entry = entries.find(function (item) { return item.key === key })
          if (entry && entry.bad) return
          next.add(key)
        }
        setBulkAck(0)
        setSelected(next)
      }

      function selectVisible() {
        var next = new Set(selected)
        for (var i = 0; i < visible.length; i++) next.add(visible[i].key)
        if (next.size > selected.size && next.size > CONFIRM_SELECTION) {
          requestBulk('select', t('list.confirmAll', { count: String(next.size) }), next)
          return
        }
        setBulkAck(0)
        setSelected(next)
      }

      function invertVisible() {
        var next = new Set(selected)
        for (var i = 0; i < visible.length; i++) {
          if (next.has(visible[i].key)) next.delete(visible[i].key)
          else next.add(visible[i].key)
        }
        if (next.size > selected.size && next.size > CONFIRM_SELECTION) {
          requestBulk('select', t('list.confirmAll', { count: String(next.size) }), next)
          return
        }
        setBulkAck(0)
        setSelected(next)
      }

      function confirmBulk() {
        var prompt = bulkPrompt
        setBulkPrompt(null)
        if (!prompt) return
        if (prompt.kind === 'select' && prompt.next) {
          setBulkAck(prompt.next.size)
          setSelected(prompt.next)
          return
        }
        setBulkAck(chosen.length)
        void runImport(planBatches(chosen))
      }

      function uploadError(answer) {
        if (answer.reason === 'no-route') return t('error.noRoute')
        if (answer.reason === 'http') return t('error.http', { status: String(answer.status), message: answer.message })
        if (answer.reason === 'invalid') return t('error.invalid')
        if (answer.reason === 'transport') return t('error.transport', { message: answer.message })
        return t('error.prefix', { message: answer.message || JSON.stringify(answer.outcome) })
      }

      function submit() {
        if (chosen.length === 0) return
        if (!activeWorkspace) { setError(t('error.noWorkspace')); return }
        var planned = planBatches(chosen)
        if (planned.length === 0) return
        if (chosen.length > CONFIRM_SELECTION && bulkAck !== chosen.length) {
          requestBulk('submit', t('dialog.confirmLarge', { count: String(chosen.length), batches: String(planned.length) }), null)
          return
        }
        void runImport(planned)
      }

      async function runImport(planned) {
        setError(null)
        var aggregate = { sessionIds: [], skipped: [], omittedByLimit: 0, failed: [] }
        var completed = 0
        var failure = null
        for (var b = 0; b < planned.length; b++) {
          setPhase({ kind: 'building', batch: b + 1, batches: planned.length })
          try {
            var built = await buildV3(planned[b], new Date())
            var blob = new Blob([built.zip], { type: 'application/zip' })
            setPhase({ kind: 'uploading', fraction: 0, batch: b + 1, batches: planned.length })
            var answer = await uploadArchive(blob, activeWorkspace.workspaceId, function (progress) {
              if (progress.phase === 'uploading') setPhase({ kind: 'uploading', fraction: progress.fraction, batch: b + 1, batches: planned.length })
              else if (progress.phase === 'reading') setPhase({ kind: 'reading', batch: b + 1, batches: planned.length })
              else if (progress.phase === 'importing') setPhase({ kind: 'importing', done: progress.done, total: progress.total, batch: b + 1, batches: planned.length })
            })
            if (!answer.ok) {
              failure = uploadError(answer)
              break
            }
            aggregate.failed = aggregate.failed.concat(built.failed || [])
            var value = answer.outcome && answer.outcome.value ? answer.outcome.value : {}
            if (Array.isArray(value.sessionIds)) aggregate.sessionIds = aggregate.sessionIds.concat(value.sessionIds)
            if (Array.isArray(value.skipped)) aggregate.skipped = aggregate.skipped.concat(value.skipped)
            else if (typeof value.skipped === 'number') aggregate.skipped = aggregate.skipped.concat(new Array(value.skipped).fill('skipped'))
            if (Number.isFinite(value.omittedByLimit)) aggregate.omittedByLimit += value.omittedByLimit
            completed++
          } catch (buildError) {
            failure = t('error.prefix', { message: messageOf(buildError) })
            break
          }
        }
        if (completed === 0) {
          setPhase({ kind: 'idle' })
          setError(failure || t('error.prefix', { message: 'no batch completed' }))
          return
        }
        if (failure) setError(failure)
        else setError(null)
        setPhase({
          kind: 'done',
          result: {
            sessionIds: aggregate.sessionIds,
            skipped: aggregate.skipped,
            omittedByLimit: aggregate.omittedByLimit,
            failed: aggregate.failed,
            batches: completed,
            plannedBatches: planned.length,
            workspace: activeWorkspace.title || activeWorkspace.path || '',
            partial: failure !== null,
          },
        })
        setSelected(new Set())
        setBulkAck(0)
        if (props.refreshSessions) {
          try { await props.refreshSessions() } catch (refreshError) { /* session refresh is best effort */ }
        }
      }

      function onDrop(event) {
        event.preventDefault()
        setDragging(false)
        if (running) return
        var files = event.dataTransfer && event.dataTransfer.files
        if (files && files.length > 0) void ingest(files)
      }

      function progressText() {
        if (phase.kind === 'parsing') return t('progress.parsing')
        if (phase.kind === 'scanning') return t('progress.scanning', { done: String(phase.done), total: String(phase.total) })
        if (phase.kind === 'building') return t('progress.building', { batch: String(phase.batch), batches: String(phase.batches) })
        if (phase.kind === 'uploading') return t('progress.uploading', { batch: String(phase.batch), batches: String(phase.batches), percent: String(Math.round((phase.fraction || 0) * 100)) })
        if (phase.kind === 'reading') return t('progress.reading')
        if (phase.kind === 'importing') return t('progress.importing', { batch: String(phase.batch), batches: String(phase.batches), done: String(phase.done), total: String(phase.total) })
        return t('dialog.import')
      }

      var workspacePicker = typeof props.renderFactorySlot === 'function'
        ? props.renderFactorySlot('workspace.picker', {
          open: pickerOpen,
          anchorRef: workspaceAnchor,
          selectedId: activeWorkspace ? activeWorkspace.workspaceId : undefined,
          onPick: function (id) { setWorkspaceId(id); setPickerOpen(false) },
          onClose: function () { setPickerOpen(false) },
        })
        : null

      if (phase.kind === 'done') {
        var result = phase.result
        var workspaceName = result.workspace || (activeWorkspace ? (activeWorkspace.title || activeWorkspace.path) : '')
        return h(Modal, {
          open: true,
          onClose: props.onClose,
          closeLabel: t('dialog.close'),
          title: t('dialog.title'),
          className: 'dsbi-modal',
          contentClassName: 'dsbi-content',
          footer: h(Button, { variant: 'primary', onClick: props.onClose }, t('dialog.done')),
        }, h('div', { className: 'dsbi-result', role: 'status' },
          h('div', null, t('result.ok', { count: String(result.sessionIds.length), workspace: workspaceName })),
          result.batches > 1 ? h('div', null, t('result.batches', { count: String(result.batches) })) : null,
          result.skipped && result.skipped.length > 0 ? h('div', null, t('result.skipped', { count: String(result.skipped.length) })) : null,
          result.omittedByLimit > 0 ? h('div', null, t('result.omitted', { count: String(result.omittedByLimit) })) : null,
          result.failed && result.failed.length > 0 ? h('div', { className: 'dsbi-warn' }, t('result.failed', { count: String(result.failed.length) })) : null,
          result.partial ? h('div', { className: 'dsbi-warn' }, t('result.partial')) : null,
          error !== null ? h('div', { className: 'dsbi-error', role: 'alert' }, error) : null,
        ))
      }

      var turnOptions = [
        { value: 'all', label: t('turns.all') },
        { value: '2', label: t('turns.min', { count: '2' }) },
        { value: '3', label: t('turns.min', { count: '3' }) },
        { value: '4', label: t('turns.min', { count: '4' }) },
        { value: '5', label: t('turns.min', { count: '5' }) },
        { value: '6', label: t('turns.min', { count: '6' }) },
        { value: 'custom', label: t('turns.custom') },
      ]
      var sortOptions = [
        { value: 'updated', label: t('sort.updated') },
        { value: 'messages', label: t('sort.messages') },
        { value: 'title', label: t('sort.title') },
      ]
      var recentOptions = [
        { value: 'all', label: t('recent.all') },
        { value: '3', label: t('recent.days', { count: '3' }) },
        { value: '7', label: t('recent.days', { count: '7' }) },
        { value: '14', label: t('recent.days', { count: '14' }) },
        { value: '30', label: t('recent.days', { count: '30' }) },
        { value: 'custom', label: t('recent.custom') },
      ]
      var badCount = entries.filter(function (entry) { return !!entry.bad }).length
      var rows = visible.slice(0, listLimit)
      var footer = h(React.Fragment, null,
        h(Button, { variant: 'outline', onClick: function () { if (!running) props.onClose() }, disabled: running }, t('dialog.cancel')),
        h(Button, {
          variant: 'primary',
          disabled: running || chosen.length === 0 || !activeWorkspace,
          onClick: function () { void submit() },
        }, progressText()),
      )

      var listNodes = rows.length > 0
        ? rows.map(function (entry) {
          var meta = [
            t('row.turns', { count: String(entry.user_turns) }),
            t('row.messages', { count: String(entry.message_count) }),
            entry.branch ? t('row.branch', { index: String(entry.branch.index), total: String(entry.branch.total) }) : '',
            entry.updated_at ? entry.updated_at.slice(0, 10) : '',
          ].filter(function (value) { return value.length > 0 }).join(' · ')
          var badge = entry.kind === 'official' ? t('badge.official') : t('badge.dsbridge')
          return h('label', {
            key: entry.key,
            className: 'dsbi-row' + (selected.has(entry.key) ? ' is-selected' : ''),
            title: entry.title + '\n' + meta + '\n' + entry.fileLabel,
          },
            h('input', {
              className: 'dsbi-check',
              type: 'checkbox',
              checked: selected.has(entry.key),
              disabled: running || !!entry.bad,
              onChange: function () { toggle(entry.key) },
            }),
            h('div', { className: 'dsbi-row-main' },
              h('div', { className: 'dsbi-row-top' },
                h('div', { className: 'dsbi-row-title' }, entry.title),
                h('span', { className: 'dsbi-badge' }, badge),
              ),
              h('div', { className: 'dsbi-row-meta' }, meta),
              h('div', { className: 'dsbi-row-file' }, entry.fileLabel),
            ),
          )
        })
        : h('div', { className: 'dsbi-empty' }, entries.length === 0 ? t('dialog.none') : t('list.empty'))

      var workspaceControl = typeof props.renderFactorySlot === 'function'
        ? h('div', { className: 'dsbi-workspace-row' },
          h(Button, {
            ref: workspaceAnchor,
            variant: 'outline',
            disabled: running || workspaceList.length === 0,
            onClick: function () { setPickerOpen(!pickerOpen) },
          }, activeWorkspace ? (activeWorkspace.title || activeWorkspace.path || t('dialog.chooseWorkspace')) : t('dialog.chooseWorkspace')),
          activeWorkspace && activeWorkspace.path ? h('span', { className: 'dsbi-path', title: activeWorkspace.path }, activeWorkspace.path) : null,
        )
        : h('select', {
          className: 'dsbi-input',
          value: activeWorkspace ? activeWorkspace.workspaceId : '',
          disabled: running,
          onChange: function (event) { setWorkspaceId(event.target.value) },
        },
          workspaceList.length === 0 ? h('option', { value: '' }, t('dialog.chooseWorkspace')) : null,
          workspaceList.map(function (workspace) {
            return h('option', { key: workspace.workspaceId, value: workspace.workspaceId }, workspace.title || workspace.path)
          }),
        )

      return h(Modal, {
        open: true,
        onClose: function () { if (!running) props.onClose() },
        closeLabel: t('dialog.close'),
        title: t('dialog.title'),
        description: t('dialog.description'),
        className: 'dsbi-modal',
        contentClassName: 'dsbi-content',
        footer: footer,
      }, h('div', { className: 'dsbi-wrap' },
        h('div', {
          className: 'dsbi-drop' + (dragging ? ' is-active' : ''),
          onDragOver: function (event) { event.preventDefault(); if (!running) setDragging(true) },
          onDragLeave: function (event) { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) },
          onDrop: onDrop,
        },
          h('div', { className: 'dsbi-drop-title' }, t('dialog.drop')),
          h('div', { className: 'dsbi-hint' }, t('dialog.formats')),
          h(Button, {
            variant: 'outline',
            size: 'sm',
            disabled: running,
            onClick: function () { if (inputRef.current) inputRef.current.click() },
          }, t('dialog.chooseFile')),
          h('input', {
            ref: inputRef,
            type: 'file',
            multiple: true,
            accept: '.json,.zip,application/json,application/zip',
            style: { display: 'none' },
            onChange: function (event) {
              var files = event.target.files
              if (files && files.length > 0) void ingest(files)
              event.target.value = ''
            },
          }),
        ),
        h('div', { className: 'dsbi-stats' },
          h('span', null, entries.length > 0 ? t('dialog.files', { files: String(fileNames.length), entries: String(entries.length) }) : t('dialog.none')),
          entries.length > 0 ? h('span', null, t('dialog.visible', { count: String(visible.length) })) : null,
          badCount > 0 ? h('span', { className: 'dsbi-warn' }, t('dialog.bad', { count: String(badCount) })) : null,
          chosen.length > 0 ? h('span', { className: 'dsbi-selected' }, t('dialog.selected', { count: String(chosen.length), messages: String(selectedMessages) })) : null,
        ),
        h('div', { className: 'dsbi-workspace' },
          h('div', { className: 'dsbi-section-label' }, t('dialog.workspace')),
          workspaceControl,
          workspacePicker,
          chosen.length > 0 && batches.length > 1 ? h('div', { className: 'dsbi-batch-hint' }, t('dialog.batches', { count: String(chosen.length), batches: String(batches.length) })) : null,
        ),
        entries.length > 0 ? h('div', { className: 'dsbi-filter' },
          h(Input, {
            className: 'dsbi-input',
            type: 'search',
            value: query,
            disabled: running,
            onChange: function (event) { setQuery(event.target.value) },
            placeholder: t('filter.search'),
            'aria-label': t('filter.search'),
          }),
          h('div', { className: 'dsbi-filter-grid' },
            h('div', { className: 'dsbi-field' },
              h('span', { className: 'dsbi-section-label' }, t('filter.turns')),
              h(SegmentedControl, {
                id: 'dsbi-turns',
                className: 'dsbi-seg',
                value: turnFilter,
                options: turnOptions,
                onChange: function (next) { setTurnFilter(next) },
                label: t('filter.turns'),
                disabled: running,
              }),
              turnFilter === 'custom' ? h(Input, {
                className: 'dsbi-number',
                type: 'number',
                min: 1,
                value: customTurns,
                disabled: running,
                'aria-label': t('turns.customLabel'),
                onChange: function (event) { setCustomTurns(event.target.value) },
              }) : null,
            ),
            h('div', { className: 'dsbi-field' },
              h('span', { className: 'dsbi-section-label' }, t('filter.sort')),
              h(SegmentedControl, {
                id: 'dsbi-sort',
                className: 'dsbi-seg',
                value: sortBy,
                options: sortOptions,
                onChange: function (next) { setSortBy(next) },
                label: t('filter.sort'),
                disabled: running,
              }),
            ),
          ),
          h('div', { className: 'dsbi-field' },
            h('span', { className: 'dsbi-section-label' }, t('filter.recent')),
            h(SegmentedControl, {
              id: 'dsbi-recent',
              className: 'dsbi-seg',
              value: recentFilter,
              options: recentOptions,
              onChange: function (next) { setRecentFilter(next) },
              label: t('filter.recent'),
              disabled: running,
            }),
            recentFilter === 'custom' ? h(Input, {
              className: 'dsbi-number',
              type: 'number',
              min: 1,
              value: customRecent,
              disabled: running,
              'aria-label': t('recent.customLabel'),
              onChange: function (event) { setCustomRecent(event.target.value) },
            }) : null,
          ),
          h('div', { className: 'dsbi-checks' },
            h(Checkbox, {
              checked: withReasoning,
              onChange: function (next) { setWithReasoning(next) },
              label: t('filter.reasoning'),
              disabled: running,
            }),
          ),
        ) : null,
        h('div', { className: 'dsbi-toolbar' },
          h(Button, { variant: 'outline', size: 'sm', disabled: visible.length === 0 || running, onClick: selectVisible }, t('list.all')),
          h(Button, { variant: 'outline', size: 'sm', disabled: visible.length === 0 || running, onClick: invertVisible }, t('list.invert')),
          h(Button, { variant: 'outline', size: 'sm', disabled: chosen.length === 0 || running, onClick: function () { setSelected(new Set()); setBulkAck(0) } }, t('list.none')),
          h('span', { className: 'dsbi-count' }, t('dialog.selected', { count: String(chosen.length), messages: String(selectedMessages) })),
        ),
        h('div', { className: 'dsbi-list' }, listNodes),
        visible.length > rows.length ? h('div', { className: 'dsbi-more' },
          h(Button, { variant: 'outline', size: 'sm', disabled: running, onClick: function () { setListLimit(listLimit + RENDER_STEP) } },
            t('list.more', { count: String(visible.length - rows.length) })),
        ) : null,
        error !== null ? h('div', { className: 'dsbi-error', role: 'alert' }, error) : null,
        running ? h('div', { className: 'dsbi-progress', role: 'status' }, progressText()) : null,
        bulkPrompt ? h(Modal, {
          open: true,
          onClose: function () { setBulkPrompt(null) },
          closeLabel: t('dialog.close'),
          title: bulkPrompt.kind === 'select' ? t('dialog.confirmSelectTitle') : t('dialog.confirmTitle'),
          className: 'dsbi-confirm-modal',
          contentClassName: 'dsbi-confirm-content',
          footer: h(React.Fragment, null,
            h(Button, { variant: 'outline', onClick: function () { setBulkPrompt(null) } }, t('dialog.back')),
            h(Button, { variant: 'primary', onClick: confirmBulk }, bulkPrompt.kind === 'select' ? t('dialog.confirmSelect') : t('dialog.confirmImport')),
          ),
        }, h('div', { className: 'dsbi-confirm-text' }, bulkPrompt.message)) : null,
      ))
    }

    function apply(ctx) {
      installStyles()
      ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }) }, 'dsbridge-import: dictionaries')
      ctx.slots.inject('sidebar.session.action', function () {
        return ctx.slots.register({
          name: 'sidebar.session.action',
          id: 'dsbridge-import',
          locale: NS,
          inject: function () {
            return {
              refreshSessions: function () {
                return ctx.sessions.refresh().catch(function (error) {
                  if (ctx.logger) ctx.logger.warn('dsbridge-import: session refresh failed', error)
                })
              },
            }
          },
        }, Action)
      })
    }

    return {
      inject: ['slots', 'locale', 'sessions'],
      apply: apply,
      __test: {
        openZip: openZip,
        readEntry: readEntry,
        buildZip: buildZip,
        entriesFromDoc: entriesFromDoc,
        officialChain: officialChain,
        entriesFromAnyDoc: entriesFromAnyDoc,
        collectEntries: collectEntries,
        buildV3: buildV3,
        planBatches: planBatches,
      },
    }
  },
})
