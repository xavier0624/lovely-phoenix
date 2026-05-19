(function () {
    'use strict';

    // ==================== Storage ====================
    const STORAGE_KEY = 'lovely_phoenix_entries';
    const AI_CONFIG_KEY = 'lovely_phoenix_ai_config';

    const DEFAULT_SYSTEM_PROMPT = '你是一位细腻的日记作家。根据以下一天的时间线记录，帮我写一篇流畅自然的中文日记。要像真人写的一样，有感受有细节，不要像流水账。按时间顺序叙述，并适当加入内心感受和思考。字数400-600字。直接输出日记内容，不需要标题。';

    function loadEntries() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch { return []; }
    }

    function saveEntries() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }

    function loadAIConfig() {
        try {
            return JSON.parse(localStorage.getItem(AI_CONFIG_KEY)) || {};
        } catch { return {}; }
    }

    function saveAIConfig(config) {
        localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
    }

    function getAIConfig() {
        const config = loadAIConfig();
        return {
            endpoint: config.endpoint || 'https://api.deepseek.com/v1',
            apiKey: config.apiKey || '',
            model: config.model || 'deepseek-chat',
            systemPrompt: config.systemPrompt || DEFAULT_SYSTEM_PROMPT
        };
    }

    // ==================== State ====================
    let entries = loadEntries();
    let selectedDate = dateStr(new Date());
    let editingId = null;

    function dateStr(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function parseDate(str) {
        const [y, m, d] = str.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    // ==================== DOM ====================
    const $ = (s) => document.querySelector(s);

    const elCanvas = $('#timeline-canvas');
    const elViewport = $('#viewport');
    const elDateNavLabel = $('#date-nav-label');
    const elDateNavDate = $('#date-nav-date');
    const elTodayBtn = $('#today-btn');
    const elOverlay = $('#overlay');
    const elSheet = $('#sheet');
    const elSheetTitle = $('#sheet-title');
    const elEntryTime = $('#entry-time');
    const elEntryTitle = $('#entry-title');
    const elEntryNote = $('#entry-note');
    const elTitleError = $('#title-error');
    const elFormDeleteBtn = $('#form-delete-btn');

    // Settings
    const elSettingsSheet = $('#settings-sheet');
    const elApiEndpoint = $('#api-endpoint');
    const elApiKey = $('#api-key');
    const elApiModel = $('#api-model');
    const elApiPrompt = $('#api-prompt');

    // Diary
    const elDiaryModal = $('#diary-modal');
    const elDiaryBody = $('#diary-body');
    const elDiaryDate = $('#diary-date');

    // Toast
    const elToast = document.createElement('div');
    elToast.className = 'toast';
    document.body.appendChild(elToast);

    // ==================== Constants ====================
    const HOUR_HEIGHT = 64;       // px per hour on the timeline
    const TOP_PAD = 20;           // top padding inside canvas
    const TIMELINE_LEFT = 56;     // matches CSS --timeline-left

    // ==================== Helpers ====================
    function timeToY(isoStr) {
        const d = new Date(isoStr);
        const hours = d.getHours() + d.getMinutes() / 60;
        return TOP_PAD + hours * HOUR_HEIGHT;
    }

    function formatTime(isoStr) {
        const d = new Date(isoStr);
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    }

    function formatRelative(str) {
        const today = dateStr(new Date());
        const yesterday = dateStr(new Date(Date.now() - 86400000));
        const tomorrow = dateStr(new Date(Date.now() + 86400000));
        if (str === today) return '今天';
        if (str === yesterday) return '昨天';
        if (str === tomorrow) return '明天';
        const d = parseDate(str);
        const wd = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
        return `${d.getMonth() + 1}月${d.getDate()}日 ${wd}`;
    }

    function formatShort(str) {
        const d = parseDate(str);
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function getTimeInputValue(date) {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        return `${dateStr(date)}T${h}:${m}`;
    }

    // ==================== Render ====================
    function renderAll() {
        renderTopBar();
        renderCanvas();
    }

    function renderTopBar() {
        elDateNavLabel.textContent = formatRelative(selectedDate);
        elDateNavDate.textContent = formatShort(selectedDate);
        if (selectedDate === dateStr(new Date())) {
            elTodayBtn.classList.remove('visible');
        } else {
            elTodayBtn.classList.add('visible');
        }
    }

    function renderCanvas() {
        // Build the full canvas: hour grid + entries
        const filtered = entries
            .filter(e => dateStr(new Date(e.timestamp)) === selectedDate)
            .sort((a, b) => {
                const ta = new Date(a.timestamp).getTime();
                const tb = new Date(b.timestamp).getTime();
                if (ta !== tb) return ta - tb;
                return (a.sortIndex || 0) - (b.sortIndex || 0);
            });

        // Map entries by their exact Y position for overlay
        const entryMap = new Map();
        filtered.forEach(e => {
            const y = timeToY(e.timestamp);
            entryMap.set(Math.round(y), e);
        });

        // Gather all timeline points: hour marks + entry nodes
        const points = [];

        // Add hour markers
        for (let h = 0; h < 24; h++) {
            const y = TOP_PAD + h * HOUR_HEIGHT;
            const hourLabel = String(h).padStart(2, '0') + ':00';
            points.push({ type: 'hour', y, hour: h, label: hourLabel, isEven: h % 2 === 0 });
        }

        // Add half-hour markers
        for (let h = 0; h < 24; h++) {
            const y = TOP_PAD + (h + 0.5) * HOUR_HEIGHT;
            points.push({ type: 'half', y, hour: h, isEven: false });
        }

        // Add entries
        filtered.forEach((entry, idx) => {
            const y = timeToY(entry.timestamp);
            points.push({ type: 'entry', y, entry, index: idx });
        });

        // Sort all points by Y
        points.sort((a, b) => a.y - b.y);

        // Build HTML by walking through sorted points
        // We need to track: which entries have been rendered, and handle the timeline line rendering
        // Strategy: render the full grid structure, then position entries absolutely within it

        let gridHtml = '';
        for (let h = 0; h < 24; h++) {
            const y = TOP_PAD + h * HOUR_HEIGHT;
            const hourLabel = String(h).padStart(2, '0') + ':00';
            const isEven = h % 2 === 0;
            const evenClass = isEven ? 'even-hour' : '';

            gridHtml += `
                <div class="hour-marker ${evenClass}" style="position:absolute;top:${y}px;left:0;right:0;">
                    <div class="hour-tick"></div>
                    <span class="hour-label">${hourLabel}</span>
                </div>
            `;
        }

        // Entry HTML - positioned absolutely
        let entriesHtml = '';

        if (filtered.length === 0) {
            entriesHtml = `
                <div class="empty-state">
                    <svg class="empty-icon" width="64" height="64" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4"/>
                        <path d="M32 18V32L40 40" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <p class="empty-title">这一天还没有记录</p>
                    <p class="empty-desc">点击右下角的 + 按钮<br>记录这一刻</p>
                </div>
            `;
        } else {
            // Group entries that are close together (within 30min)
            const grouped = [];
            let group = [filtered[0]];
            for (let i = 1; i < filtered.length; i++) {
                const prevY = timeToY(filtered[i - 1].timestamp);
                const currY = timeToY(filtered[i].timestamp);
                if (currY - prevY < HOUR_HEIGHT * 0.5) {
                    group.push(filtered[i]);
                } else {
                    grouped.push(group);
                    group = [filtered[i]];
                }
            }
            grouped.push(group);

            grouped.forEach((groupEntries) => {
                const firstEntry = groupEntries[0];
                const y = timeToY(firstEntry.timestamp);

                groupEntries.forEach((entry) => {
                    entriesHtml += `
                        <div class="entry-node" style="position:absolute;top:${timeToY(entry.timestamp)}px;left:0;right:0;"
                             data-id="${entry.id}">
                            <div class="entry-dot"></div>
                            <div class="entry-time">${formatTime(entry.timestamp)}</div>
                            <div class="entry-card">
                                <div class="entry-card-title">${escapeHtml(entry.title)}</div>
                                ${entry.note ? `<div class="entry-card-note">${escapeHtml(entry.note)}</div>` : ''}
                            </div>
                        </div>
                    `;
                });
            });
        }

        // Now line (only for today)
        let nowLineHtml = '';
        if (selectedDate === dateStr(new Date())) {
            const now = new Date();
            const nowHours = now.getHours() + now.getMinutes() / 60;
            const nowY = TOP_PAD + nowHours * HOUR_HEIGHT;
            nowLineHtml = `
                <div class="now-line" id="now-line" style="top:${nowY}px;">
                    <div class="now-dot"></div>
                    <span class="now-label">现在</span>
                    <div class="now-line-tail"></div>
                </div>
            `;
        }

        const totalHeight = TOP_PAD + 24 * HOUR_HEIGHT + 160;

        elCanvas.innerHTML = `
            <div class="timeline-line" style="top:${TOP_PAD}px;bottom:${160}px;"></div>
            ${gridHtml}
            ${nowLineHtml}
            ${entriesHtml}
        `;
        elCanvas.style.minHeight = totalHeight + 'px';

        // Attach click handlers to entry dots and cards
        elCanvas.querySelectorAll('.entry-dot, .entry-card').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const node = el.closest('.entry-node');
                const id = node.dataset.id;
                const entry = entries.find(e => e.id === id);
                if (entry) openEditSheet(entry);
            });
        });
    }


    // Now line is rendered inside the canvas for today's date.
    // It refreshes on minute change when the user interacts.
    let nowRefreshTimer = null;

    // ==================== Sheet ====================
    function openAddSheet() {
        editingId = null;
        elSheetTitle.textContent = '新增记录';
        elEntryTime.value = getTimeInputValue(new Date());
        elEntryTitle.value = '';
        elEntryNote.value = '';
        elTitleError.classList.remove('show');
        elFormDeleteBtn.style.display = 'none';
        showSheet();
        setTimeout(() => elEntryTitle.focus(), 350);
    }

    function openEditSheet(entry) {
        editingId = entry.id;
        elSheetTitle.textContent = '编辑记录';
        elEntryTime.value = getTimeInputValue(new Date(entry.timestamp));
        elEntryTitle.value = entry.title;
        elEntryNote.value = entry.note || '';
        elTitleError.classList.remove('show');
        elFormDeleteBtn.style.display = 'block';
        showSheet();
    }

    function showSheet() {
        elOverlay.classList.add('active');
        elSheet.classList.add('active');
    }

    function closeSheet() {
        elOverlay.classList.remove('active');
        elSheet.classList.remove('active');
        editingId = null;
    }

    // ==================== CRUD ====================
    function addEntry(title, note, timestamp) {
        const tsDate = dateStr(new Date(timestamp));
        const count = entries.filter(e => dateStr(new Date(e.timestamp)) === tsDate).length;
        entries.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
            timestamp,
            title,
            note: note || null,
            createdAt: new Date().toISOString(),
            sortIndex: count
        });
        saveEntries();
        renderAll();
    }

    function updateEntry(id, title, note, timestamp) {
        const entry = entries.find(e => e.id === id);
        if (!entry) return;
        entry.title = title;
        entry.note = note || null;
        entry.timestamp = timestamp;
        saveEntries();
        renderAll();
    }

    function deleteEntry(id) {
        entries = entries.filter(e => e.id !== id);
        saveEntries();
        renderAll();
        toast('已删除');
    }

    // ==================== Toast ====================
    let toastTimer;
    function toast(msg) {
        elToast.textContent = msg;
        elToast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => elToast.classList.remove('show'), 1600);
    }

    // ==================== Actions ====================
    function handleSave() {
        const title = elEntryTitle.value.trim();
        if (!title) {
            elTitleError.classList.add('show');
            elEntryTitle.focus();
            return;
        }
        const note = elEntryNote.value.trim() || null;
        const timestamp = new Date(elEntryTime.value).toISOString();

        if (editingId) {
            updateEntry(editingId, title, note, timestamp);
            toast('已更新');
        } else {
            addEntry(title, note, timestamp);
            toast('已添加');
        }
        closeSheet();
    }

    function handleDelete() {
        if (!editingId) return;
        if (!confirm('确定删除这条记录吗？')) return;
        deleteEntry(editingId);
        closeSheet();
    }

    // ==================== Settings ====================
    function openSettingsSheet() {
        const config = getAIConfig();
        elApiEndpoint.value = config.endpoint;
        elApiKey.value = config.apiKey;
        elApiModel.value = config.model;
        elApiPrompt.value = config.systemPrompt === DEFAULT_SYSTEM_PROMPT ? '' : config.systemPrompt;
        elOverlay.classList.add('active');
        elSettingsSheet.classList.add('active');
    }

    function closeSettingsSheet() {
        elOverlay.classList.remove('active');
        elSettingsSheet.classList.remove('active');
    }

    function saveSettings() {
        const config = {
            endpoint: elApiEndpoint.value.trim() || 'https://api.deepseek.com/v1',
            apiKey: elApiKey.value.trim(),
            model: elApiModel.value.trim() || 'deepseek-chat',
            systemPrompt: elApiPrompt.value.trim() || DEFAULT_SYSTEM_PROMPT
        };
        saveAIConfig(config);
        closeSettingsSheet();
        toast('设置已保存');
    }

    // ==================== AI Diary ====================
    function openDiaryModal(dateStr_) {
        elDiaryModal.classList.add('active');
        elDiaryDate.textContent = formatShort(dateStr_);
        generateDiary();
    }

    function closeDiaryModal() {
        elDiaryModal.classList.remove('active');
    }

    async function generateDiary() {
        const config = getAIConfig();
        if (!config.apiKey) {
            elDiaryBody.innerHTML = `
                <div class="diary-error">
                    <p>请先配置 AI API Key</p>
                    <p style="font-size:13px;margin-top:4px;color:var(--text-muted);">点击右上角齿轮图标设置</p>
                </div>`;
            return;
        }

        // Get today's entries
        const filtered = entries
            .filter(e => dateStr(new Date(e.timestamp)) === selectedDate)
            .sort((a, b) => {
                const ta = new Date(a.timestamp).getTime();
                const tb = new Date(b.timestamp).getTime();
                if (ta !== tb) return ta - tb;
                return (a.sortIndex || 0) - (b.sortIndex || 0);
            });

        if (filtered.length === 0) {
            elDiaryBody.innerHTML = `
                <div class="diary-error">
                    <p>今天还没有任何记录</p>
                    <p style="font-size:13px;margin-top:4px;color:var(--text-muted);">先记录一些时间线内容再生成日记</p>
                </div>`;
            return;
        }

        // Build prompt from entries
        const lines = filtered.map(e => {
            const time = formatTime(e.timestamp);
            let line = `- ${time} ${e.title}`;
            if (e.note) line += `\n  备注：${e.note}`;
            return line;
        });
        const userPrompt = `今天的日期：${formatShort(selectedDate)}\n\n时间线记录：\n${lines.join('\n')}`;

        // Show loading
        elDiaryBody.innerHTML = `
            <div class="diary-loading">
                <div class="diary-loading-spinner"></div>
                <p class="diary-loading-text">AI 正在为你写日记...</p>
            </div>`;

        try {
            const response = await fetch(`${config.endpoint}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        { role: 'system', content: config.systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.8,
                    max_tokens: 2048
                })
            });

            if (!response.ok) {
                const err = await response.text();
                let errMsg = `API 请求失败 (${response.status})`;
                try {
                    const errJson = JSON.parse(err);
                    if (errJson.error && errJson.error.message) errMsg = errJson.error.message;
                } catch {}
                throw new Error(errMsg);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;

            elDiaryBody.innerHTML = `<div class="diary-content">${escapeHtml(content)}</div>`;
        } catch (err) {
            elDiaryBody.innerHTML = `
                <div class="diary-error">
                    <p>生成失败</p>
                    <p style="font-size:13px;margin-top:8px;color:var(--text-muted);">${escapeHtml(err.message)}</p>
                </div>`;
        }
    }

    async function copyDiary() {
        const contentEl = elDiaryBody.querySelector('.diary-content');
        if (!contentEl) return;
        try {
            await navigator.clipboard.writeText(contentEl.textContent);
            toast('日记已复制');
        } catch {
            toast('复制失败，请手动选择文字');
        }
    }

    // ==================== Date Nav ====================
    function goPrev() {
        const d = parseDate(selectedDate);
        d.setDate(d.getDate() - 1);
        selectedDate = dateStr(d);
        renderAll();
        elViewport.scrollTop = 0;
    }

    function goNext() {
        const d = parseDate(selectedDate);
        d.setDate(d.getDate() + 1);
        selectedDate = dateStr(d);
        renderAll();
        elViewport.scrollTop = 0;
    }

    function goToday() {
        selectedDate = dateStr(new Date());
        renderAll();
        const now = new Date();
        const hours = now.getHours() + now.getMinutes() / 60;
        const y = TOP_PAD + hours * HOUR_HEIGHT;
        const viewH = elViewport.clientHeight;
        elViewport.scrollTop = Math.max(0, y - viewH / 3);
    }

    // ==================== Event Listeners ====================
    $('#fab-btn').addEventListener('click', openAddSheet);
    $('#prev-day-btn').addEventListener('click', goPrev);
    $('#next-day-btn').addEventListener('click', goNext);
    $('#today-btn').addEventListener('click', goToday);
    $('#overlay').addEventListener('click', () => {
        closeSheet();
        closeSettingsSheet();
        closeDiaryModal();
    });
    $('#sheet-close-btn').addEventListener('click', closeSheet);
    $('#btn-cancel').addEventListener('click', closeSheet);
    $('#btn-save').addEventListener('click', handleSave);
    $('#form-delete-btn').addEventListener('click', handleDelete);

    // Settings
    $('#settings-btn').addEventListener('click', openSettingsSheet);
    $('#settings-close-btn').addEventListener('click', closeSettingsSheet);
    $('#settings-cancel-btn').addEventListener('click', closeSettingsSheet);
    $('#settings-save-btn').addEventListener('click', saveSettings);

    // AI Diary
    $('#ai-diary-btn').addEventListener('click', () => openDiaryModal(selectedDate));
    $('#diary-close-btn').addEventListener('click', closeDiaryModal);
    $('#diary-close-done-btn').addEventListener('click', closeDiaryModal);
    $('#diary-copy-btn').addEventListener('click', copyDiary);
    $('#diary-retry-btn').addEventListener('click', generateDiary);

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (elDiaryModal.classList.contains('active')) closeDiaryModal();
            else if (elSheet.classList.contains('active')) closeSheet();
            else if (elSettingsSheet.classList.contains('active')) closeSettingsSheet();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !elSheet.classList.contains('active')) {
            e.preventDefault();
            openAddSheet();
        }
        if (e.key === 'ArrowLeft' && !elSheet.classList.contains('active') && !elSettingsSheet.classList.contains('active') && !elDiaryModal.classList.contains('active')) goPrev();
        if (e.key === 'ArrowRight' && !elSheet.classList.contains('active') && !elSettingsSheet.classList.contains('active') && !elDiaryModal.classList.contains('active')) goNext();
    });

    // ==================== Init ====================
    function init() {
        renderAll();

        // Refresh now-line position every minute when viewing today
        nowRefreshTimer = setInterval(() => {
            if (selectedDate === dateStr(new Date())) {
                renderCanvas();
            }
        }, 60000);

        // Scroll to current time position on today
        if (selectedDate === dateStr(new Date())) {
            setTimeout(() => {
                const now = new Date();
                const hours = now.getHours() + now.getMinutes() / 60;
                const y = TOP_PAD + hours * HOUR_HEIGHT;
                const viewH = elViewport.clientHeight;
                elViewport.scrollTop = Math.max(0, y - viewH / 3);
            }, 100);
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    }

    init();
})();
