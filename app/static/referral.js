// Non-emergency referral flow. DEMO DATA ONLY. All user-facing text goes through t() (static/i18n.js).
// Step 1: pick hospital → call result → what the hospital said → confirm sent → patient details.

const REF_SETS = {};          // card-set key → ranked hospitals shown in that answer
let refSetCounter = 0;

const REF_LOCALE = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN' };
function refLoc() { return REF_LOCALE[currentLang] || 'en-IN'; }
function refFmt(utc) {
  if (!utc) return '';
  return new Date(utc).toLocaleString(refLoc(), { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric',
    month: 'short', hour: 'numeric', minute: '2-digit' });
}

function refGuessService(text) {
  return /dialys|kidney|renal/i.test(text || '') ? 'dialysis' : 'mri';
}

async function refApi(path, body) {
  const res = await fetch('/api/ref' + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// Called from renderCards: registers the hospitals and returns the button HTML for one card.
function refRegisterSet(hospitals) {
  const key = 'cs' + (++refSetCounter);
  REF_SETS[key] = hospitals;
  return key;
}
let REF_ACTIVE = null;   // case being worked on: Contact is locked on every other card until it ends
function refContactButton(key, i) {
  return `<button class="call-btn contact-btn" ${REF_ACTIVE ? 'disabled' : ''}
            onclick="refChoose('${key}', ${i})">📞 ${escHtml(t('contact'))}</button>`;
}
function refLock(caseId) {
  REF_ACTIVE = caseId;
  document.querySelectorAll('.contact-btn').forEach(b => {
    if (b.tagName === 'A') b.classList.toggle('disabled', !!caseId); else b.disabled = !!caseId;
  });
}

function refCard(st) { return st ? document.getElementById(`hc-${st.key}-${st.idx}`) : null; }

function refPanel(caseId) {
  let p = document.getElementById('ref-' + caseId);
  if (!p) {
    const card = refCard(REF[caseId]);
    p = document.createElement('div');
    p.id = 'ref-' + caseId;
    if (card) {                         // open the steps inside the hospital's own card
      p.className = 'ref-panel ref-inline';
      const btn = card.querySelector('.contact-btn');
      if (btn) btn.style.display = 'none';
      card.appendChild(p);
    } else {
      p.className = 'ref-panel';
      document.getElementById('answers').appendChild(p);
    }
  }
  return p;
}
function refClosePanel(caseId) {
  const p = document.getElementById('ref-' + caseId);
  const card = p && p.closest('.hcard');
  if (p) p.remove();
  if (card) { const btn = card.querySelector('.contact-btn'); if (btn) btn.style.display = ''; }
}
function refShow(p, html) {
  p.innerHTML = html;
  p.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function refError(p, e) {
  const el = p.querySelector('.ref-error');
  if (el) el.textContent = t('ref_err_save', { msg: e.message });
  p.querySelectorAll('button').forEach(b => b.disabled = false);
}
function refBusy(p) { p.querySelectorAll('button').forEach(b => b.disabled = true); }

const REF = {};   // caseId → { hospital, candidates, service, need }

async function refChoose(key, i) {
  const hospitals = REF_SETS[key] || [];
  const h = hospitals[i];
  if (!h || REF_ACTIVE) return;
  const need = (caseCtx && caseCtx.need) || '';
  const service = refGuessService(need + ' ' + document.getElementById('question-box').value);
  refLock('starting');
  try {
    const r = await refApi('/start', {
      hospital: h, candidates: hospitals, service_code: service, need, emergency: !!isEmergency,
      address: caseCtx && caseCtx.address, frequency: caseCtx && caseCtx.freq, conversation_id: conversationId });
    REF[r.case_id] = { hospital: h, candidates: hospitals, service, need, key, idx: i };
    refLock(r.case_id);
    document.getElementById('followup-area').style.display = 'none';
    refCall(r.case_id);
  } catch (e) {
    refLock(null);
    alert(t('ref_err_start') + ' ' + e.message);
  }
}

function refBackToChat(caseId) {
  refClosePanel(caseId);
  refLock(null);
  document.getElementById('followup-area').style.display = 'block';
}

// ── Screen 1: call the hospital, one tap for the result ────────────────────────
function refCall(caseId) {
  const st = REF[caseId], h = st.hospital, p = refPanel(caseId);
  st.screen = ['refCall', [caseId]];
  // Show the number as text (no tel: link): the coordinator calls from their own phone, then taps an option.
  const call = h.phone
    ? `<div class="phone-line">📞 <strong>${escHtml(h.phone)}</strong></div>`
    : `<div class="phone-line muted">📞 ${t('ref_no_number')}</div>`;
  const inline = p.classList.contains('ref-inline');
  refShow(p, `
    ${inline ? '' : `<h2>${escHtml(h.name)}</h2>`}
    ${call}
    <div class="ref-q">${t('ref_what_said')}</div>
    <div class="ref-grid three">
      <button class="ref-btn ok" onclick="refAccepted('${caseId}', 'accepted_slot')">✅ ${t('ref_gave_date')}</button>
      <button class="ref-btn bad" onclick="refTurnedAway('${caseId}')">❌ ${t('ref_turned_away')}</button>
      <button class="ref-btn" onclick="refNoAnswer('${caseId}')">📵 ${t('ref_no_answer')}</button>
    </div>
    <div class="ref-error"></div>
    <button class="linkbtn" onclick="refBackToChat('${caseId}')">← ${t('ref_back')}</button>`);
}

// ── Turned away: reason → log → next-best hospital ─────────────────────────────
function refTurnedAway(caseId) {
  const p = refPanel(caseId);
  REF[caseId].screen = ['refTurnedAway', [caseId]];
  const reasons = [['no_machine', '🩻'], ['no_doctor', '🩺'], ['no_bed', '🛏'], ['too_expensive', '💰'], ['other', '❓']]
    .map(([k, icon]) => [k, `${icon} ${t('reason_' + k)}`]);
  refShow(p, `
    <h2>${t('ref_why_no')}</h2>
    <div class="ref-grid">${reasons.map(([k, l]) =>
      `<button class="ref-btn" onclick="refLogRefusal('${caseId}', '${k}')">${l}</button>`).join('')}</div>
    <div class="ref-error"></div>
    <button class="linkbtn" onclick="refCall('${caseId}')">← ${t('ref_back')}</button>`);
}

async function refLogRefusal(caseId, reason) {
  const p = refPanel(caseId);
  refBusy(p);
  try {
    const r = await refApi(`/case/${caseId}/call`, { result: 'turned_away', refusal_reason: reason });
    const n = r.next;
    if (!n) {
      refShow(p, `<h2>${t('ref_no_other')}</h2>
        <div class="lead">${t('ref_search_again')}</div>
        <button class="ref-btn" onclick="refBackToChat('${caseId}')">← ${t('ref_back_chat')}</button>`);
      return;
    }
    refShow(p, `
      <h2>${escHtml(n.name)}</h2>
      <div class="meta">${[n.km != null ? t('km_away', { km: n.km }) : '', n.address || ''].filter(Boolean).map(escHtml).join(' · ')}</div>
      <button class="ref-btn ok" onclick="refSwitch('${caseId}')">📞 ${t('ref_contact_this')}</button>
      <div class="ref-error"></div>
      <button class="linkbtn" onclick="refBackToChat('${caseId}')">← ${t('ref_back_list')}</button>`);
    REF[caseId].next = n;
  } catch (e) { refError(p, e); }
}

async function refSwitch(caseId) {
  const p = refPanel(caseId), st = REF[caseId];
  refBusy(p);
  try {
    await refApi(`/case/${caseId}/hospital`, { hospital: st.next });
    const j = (REF_SETS[st.key] || []).findIndex(x => x.id && x.id === st.next.id);
    if (j >= 0) { refClosePanel(caseId); st.idx = j; }
    st.hospital = st.next;
    refCall(caseId);
  } catch (e) { refError(p, e); }
}

// ── No answer: log, then simple alternatives ───────────────────────────────────
async function refNoAnswer(caseId) {
  const p = refPanel(caseId), h = REF[caseId].hospital;
  refBusy(p);
  try {
    await refApi(`/case/${caseId}/call`, { result: 'no_answer' });
    const wa = String(h.phone_raw || '').replace(/\D/g, '');
    refShow(p, `
      <h2>${t('ref_no_pickup')}</h2>
      <div class="ref-grid">
        <button class="ref-btn ok" onclick="refCall('${caseId}')">📞 ${t('ref_try_again')}</button>
        ${wa ? `<a class="ref-btn" target="_blank" rel="noopener" href="https://wa.me/${wa}">💬 ${t('ref_whatsapp')}</a>` : ''}
        <a class="ref-btn" target="_blank" rel="noopener"
           href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.name + ' ' + (h.address || ''))}">🚶 ${t('ref_in_person')}</a>
      </div>
      <button class="linkbtn" onclick="refBackToChat('${caseId}')">← ${t('ref_back_list')}</button>`);
  } catch (e) { refError(p, e); }
}

// ── Screen 2: what the hospital said (date + what to bring required) ──────────
function refAccepted(caseId, result) {
  const st = REF[caseId], p = refPanel(caseId);
  st.result = result;
  st.screen = ['refAccepted', [caseId, result]];
  const chips = ['chip_aadhaar', 'chip_reports', 'chip_letter', 'chip_scheme'].map(k => t(k));
  refShow(p, `
    <label for="ref-date-${caseId}">${t('ref_date')} *</label>
    <input type="datetime-local" id="ref-date-${caseId}">
    <label for="ref-bring-${caseId}">${t('ref_bring')} *</label>
    <div class="chips">${chips.map(c => `<button class="chip" onclick="refChip('${caseId}', this)">${escHtml(c)}</button>`).join('')}</div>
    ${refMic(`ref-bring-${caseId}`, `<textarea id="ref-bring-${caseId}" rows="2" placeholder="${t('ref_bring_ph')}"></textarea>`)}
    <label for="ref-prep-${caseId}">${t('ref_prep')}</label>
    ${refMic(`ref-prep-${caseId}`, `<textarea id="ref-prep-${caseId}" rows="2"></textarea>`)}
    <label for="ref-who-${caseId}">${t('ref_who')}</label>
    ${refMic(`ref-who-${caseId}`, `<input id="ref-who-${caseId}" autocomplete="off">`)}
    <label for="ref-cost-${caseId}">${t('ref_cost')}</label>
    ${refMic(`ref-cost-${caseId}`, `<input id="ref-cost-${caseId}" autocomplete="off" placeholder="${t('ref_cost_ph')}">`)}
    <div class="ref-error"></div>
    <button class="ref-btn ok wide" onclick="refSaveAccepted('${caseId}')">${t('ref_save_continue')}</button>
    <button class="linkbtn" onclick="refCall('${caseId}')">← ${t('ref_back')}</button>`);
}
function refMic(id, field) {
  return `<div class="intake-row">${field}<button type="button" class="field-mic" title="${t('speak')}"
            onclick="startListening('${id}', this)">🎤</button></div>`;
}
function refSvc(caseId, svc, btn) {
  REF[caseId].service = svc;
  btn.parentElement.querySelectorAll('.svc').forEach(b => b.classList.toggle('sel', b === btn));
}
function refChip(caseId, btn) {
  const ta = document.getElementById('ref-bring-' + caseId);
  const items = ta.value.split(',').map(s => s.trim()).filter(Boolean);
  if (!items.includes(btn.textContent)) items.push(btn.textContent);
  ta.value = items.join(', ');
  btn.classList.add('sel');
}

async function refSaveAccepted(caseId) {
  const st = REF[caseId], p = refPanel(caseId);
  const v = id => (document.getElementById(id + caseId).value || '').trim();
  const err = p.querySelector('.ref-error');
  if (!v('ref-date-') || !v('ref-bring-')) { err.textContent = t('ref_err_date_bring'); return; }
  refBusy(p);
  try {
    await refApi(`/case/${caseId}/call`, {
      result: st.result, service_code: st.service, appointment_at: v('ref-date-'), what_to_bring: v('ref-bring-'),
      prep_steps: v('ref-prep-'), spoke_to: v('ref-who-'), cost_or_scheme: v('ref-cost-') });
    st.when = v('ref-date-');
    st.bring = v('ref-bring-');
    refConfirm(caseId);
  } catch (e) { refError(p, e); }
}

// ── Screen 3: confirm sent → minimal patient details ──────────────────────────
function refConfirm(caseId) {
  const st = REF[caseId], p = refPanel(caseId);
  st.screen = ['refConfirm', [caseId]];
  const when = new Date(st.when).toLocaleString(refLoc(), { weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit' });
  refShow(p, `
    <div class="lead">📅 ${escHtml(when)}<br>🎒 ${t('ref_bring_label')}: ${escHtml(st.bring)}</div>
    <div class="demo-banner">⚠️ ${t('demo_only')}</div>
    <label for="ref-name-${caseId}">${t('ref_name')} *</label>
    ${refMic(`ref-name-${caseId}`, `<input id="ref-name-${caseId}" autocomplete="off" placeholder="e.g. DEMO-101">`)}
    <label for="ref-age-${caseId}">${t('ref_age')}</label>
    ${refMic(`ref-age-${caseId}`, `<input id="ref-age-${caseId}" type="number" min="0" max="120" inputmode="numeric">`)}
    <label for="ref-phone-${caseId}">${t('ref_phone')} *</label>
    ${refMic(`ref-phone-${caseId}`, `<input id="ref-phone-${caseId}" type="tel" autocomplete="off" placeholder="+91 …">`)}
    <label for="ref-cond-${caseId}">${t('ref_condition')}</label>
    ${refMic(`ref-cond-${caseId}`, `<input id="ref-cond-${caseId}" autocomplete="off" value="${escHtml(st.need || '')}">`)}
    <label>${t('ref_consent')}</label>
    <div class="ref-grid two">
      <button class="ref-btn consent ${st.consent ? 'sel' : ''}" onclick="refConsent('${caseId}', true, this)">👍 ${t('yes')}</button>
      <button class="ref-btn consent ${st.consent ? '' : 'sel'}" onclick="refConsent('${caseId}', false, this)">👎 ${t('no')}</button>
    </div>
    <div class="ref-error"></div>
    <button class="ref-btn ok wide" onclick="refSaveConfirm('${caseId}')">✅ ${t('ref_confirm_sent')}</button>
    <button class="linkbtn" onclick="refAccepted('${caseId}', '${st.result}')">← ${t('ref_back')}</button>`);
  st.consent = !!st.consent;
}
function refConsent(caseId, yes, btn) {
  REF[caseId].consent = yes;
  btn.parentElement.querySelectorAll('.consent').forEach(b => b.classList.toggle('sel', b === btn));
}

async function refSaveConfirm(caseId) {
  const st = REF[caseId], p = refPanel(caseId);
  const v = id => (document.getElementById(id + caseId).value || '').trim();
  const err = p.querySelector('.ref-error');
  if (!v('ref-name-') || !v('ref-phone-')) { err.textContent = t('ref_err_name_phone'); return; }
  refBusy(p);
  try {
    const d = await refApi(`/case/${caseId}/confirm`, {
      name_or_code: v('ref-name-'), age_years: v('ref-age-'), phone: v('ref-phone-'),
      condition: v('ref-cond-'), consent: !!st.consent });
    refDone(caseId, d);
  } catch (e) { refError(p, e); }
}

function refDone(caseId, d) {
  refLock(null);   // finished: other hospitals can be contacted again
  const p = refPanel(caseId);
  const a = (d.appointments || [])[0];
  if (REF[caseId]) REF[caseId].screen = ['refDone', [caseId, d]];
  refShow(p, `
    <h2>✅ ${escHtml(t('ref_referred', { name: d.patient_name, hospital: d.hospital_name }))}</h2>
    <div class="lead">📅 ${escHtml(a ? refFmt(a.scheduled_at) : '')}</div>
    ${REF[caseId] && REF[caseId].bring ? `<div class="lead">🎒 ${t('ref_bring_label')}: ${escHtml(REF[caseId].bring)}</div>` : ''}
    <div class="ref-grid two">
      <button class="ref-btn ok" onclick="refLock(null); setMode('tracker')">📋 ${t('ref_open_tracker')}</button>
      <button class="ref-btn" onclick="newChat()">➕ ${t('new_patient').replace(/^\+\s*/, '')}</button>
    </div>`);
}

// Referrals are not added to the chat history (their status lives in the Referral Tracker),
// so older saved chats that contain a referral entry simply skip it.
function refRestoreNote(m) {}

// ── Referral Tracker: upcoming appointments + patients ──
let REF_TRACKER = { appointments: [], cases: [] };
const REF_STATUS = {
  calling: ['📞 Still calling', ''], turned_away: ['❌ Turned away', 'bad'], accepted: ['📋 Needs confirming', ''],
  booked: ['✅ Booked', 'ok'], closed: ['Closed', ''], cancelled: ['Cancelled', ''],
};

async function refLoadTracker() {
  const box = document.getElementById('ref-tracker');
  box.innerHTML = `<div class="search-none">${t('loading')}</div>`;
  try {
    REF_TRACKER = await refApi('/tracker');
    refRenderTracker();
  } catch (e) {
    box.innerHTML = `<div class="search-none">${t('err_load')} ${escHtml(e.message)}
      <button class="linkbtn" onclick="refLoadTracker()">${t('try_again')}</button></div>`;
  }
}

// ── Referral Tracker: calendar of appointments + patients table ──
let REF_CAL = { month: null, day: null };          // month: 'YYYY-MM', day: 'YYYY-MM-DD' (India time)

function refDayKey(utc) {                            // UTC timestamp → India-time date 'YYYY-MM-DD'
  return new Date(utc).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function refTime(utc) {
  return new Date(utc).toLocaleTimeString(refLoc(), { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
}
function refTodayKey() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }

function refRenderTracker() {
  const box = document.getElementById('ref-tracker');
  if (!box) return;
  const { appointments, cases } = REF_TRACKER;
  const byDay = {};
  for (const a of appointments) (byDay[refDayKey(a.scheduled_at)] = byDay[refDayKey(a.scheduled_at)] || []).push(a);
  const today = refTodayKey();
  if (!REF_CAL.day) {                                // default: today, else the next day with appointments
    REF_CAL.day = byDay[today] ? today : (Object.keys(byDay).sort().find(d => d >= today) || today);
  }
  if (!REF_CAL.month) REF_CAL.month = REF_CAL.day.slice(0, 7);

  // month grid (weeks start on Monday)
  const [y, m] = REF_CAL.month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const monthName = first.toLocaleDateString(refLoc(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dows = [...Array(7)].map((_, i) => new Date(Date.UTC(2024, 0, 1 + i))       // 1 Jan 2024 was a Monday
    .toLocaleDateString(refLoc(), { weekday: 'short', timeZone: 'UTC' }));
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysIn; d++) {
    const key = `${REF_CAL.month}-${String(d).padStart(2, '0')}`;
    const n = (byDay[key] || []).length;
    cells += `<button class="cal-cell ${key === today ? 'today' : ''} ${key === REF_CAL.day ? 'sel' : ''} ${n ? 'has' : ''}"
                onclick="refPickDay('${key}')"><span>${d}</span>${n ? `<i>${n}</i>` : ''}</button>`;
  }

  // selected day
  const list = (byDay[REF_CAL.day] || []).sort((p, q) => p.scheduled_at < q.scheduled_at ? -1 : 1);
  const dayTitle = new Date(REF_CAL.day + 'T00:00:00Z').toLocaleDateString(refLoc(),
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const items = list.length ? list.map(a => `
    <div class="day-item">
      <div class="day-time">${escHtml(refTime(a.scheduled_at))}</div>
      <div class="day-info">
        <div class="l1">${escHtml(a.patient_name || '—')}</div>
        <div class="l2">${escHtml(a.condition || '—')}</div>
        <div class="l3">🏥 ${escHtml(a.hospital_name || '—')}</div>
      </div>
      <div class="day-act">${a.reminder_call_done_at
        ? `<span class="sent-tag">✓ ${t('tr_sent')}</span>`
        : `<button class="ref-btn small" ${a.consent_to_reminders ? '' : `disabled title="${t('tr_no_consent')}"`}
             onclick="refRemind('${a.appointment_id}', this)">🔔 ${t('tr_remind')}</button>`}</div>
    </div>`).join('') : `<div class="day-empty">${t('tr_no_appts_day')}</div>`;

  // patients table
  const chats = loadChats();
  const rows = cases.map(c => {
    const tel = String(c.patient_phone || '').replace(/[^0-9+]/g, '');
    const chat = c.genie_conversation_id && chats.find(x => x.conversationId === c.genie_conversation_id);
    return `<tr>
      <td><strong>${escHtml(c.patient_name)}</strong></td>
      <td>${c.age_years != null ? escHtml(c.age_years) : '—'}</td>
      <td style="white-space:nowrap">${tel ? `<a href="tel:${escHtml(tel)}" class="tel">${escHtml(c.patient_phone)}</a>` : '—'}</td>
      <td class="clip"><div title="${escHtml(c.address || '')}">${escHtml(c.address || '—')}</div></td>
      <td class="clip"><div title="${escHtml(c.condition || '')}">${escHtml(c.condition || '—')}</div></td>
      <td class="clip"><div title="${escHtml(c.care_program || '')}">${escHtml(c.care_program || '—')}</div></td>
      <td class="clip"><div title="${escHtml(c.secondary_contacts || '')}">${escHtml(c.secondary_contacts || '—')}</div></td>
      <td class="clip"><div title="${escHtml(c.hospital_name || '')}">${escHtml(c.hospital_name || '—')}</div></td>
      <td style="white-space:nowrap">${c.next_visit ? escHtml(refFmt(c.next_visit)) : '—'}</td>
      <td style="white-space:nowrap">${chat ? `<a href="#" class="chat-link" onclick="event.preventDefault(); openChat('${chat.id}')">💬 ${t('open_chat')}</a>`
        : `<span class="muted" title="${t(c.genie_conversation_id ? 'tr_chat_missing' : 'tr_added_by_hand')}">—</span>`}</td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <div class="tr-row"><h2 class="tr-h">📅 ${t('tr_appts')}</h2>
      <button class="ref-btn small add-btn" onclick="refAddAppointment()">＋ ${t('tr_add_appt')}</button></div>
    <div class="cal-wrap">
      <div class="cal">
        <div class="cal-head">
          <button class="cal-nav" onclick="refMonth(-1)" title="${t('tr_prev_month')}">‹</button>
          <div class="cal-month">${escHtml(monthName)}</div>
          <button class="cal-nav" onclick="refMonth(1)" title="${t('tr_next_month')}">›</button>
        </div>
        <div class="cal-grid">${dows.map(d => `<div class="cal-dow">${escHtml(d)}</div>`).join('')}${cells}</div>
      </div>
      <div class="day-panel">
        <div class="day-title">${escHtml(dayTitle)}</div>
        ${items}
      </div>
    </div>
    <div class="tr-row"><h2 class="tr-h">🧑 ${t('tr_patients')}</h2>
      <button class="ref-btn small add-btn" onclick="refAddPatient()">＋ ${t('tr_add_patient')}</button></div>
    ${cases.length ? `<div style="overflow-x:auto"><table class="ttable pat-table">
      <thead><tr>${['col_name', 'col_age', 'col_phone', 'col_address', 'col_condition', 'col_program', 'col_secondary',
        'col_hospital', 'col_next', 'col_chat'].map(k => `<th>${t(k)}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>`
      : `<div class="search-none">${t('tr_no_patients')}</div>`}`;
}

function refPickDay(key) { REF_CAL.day = key; refRenderTracker(); }
function refMonth(delta) {
  const [y, m] = REF_CAL.month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  REF_CAL.month = d.toISOString().slice(0, 7);
  refRenderTracker();
}

async function refRemind(apptId, btn) {
  btn.disabled = true;
  try {
    await refApi(`/appt/${apptId}/remind`, {});
    const a = REF_TRACKER.appointments.find(x => x.appointment_id === apptId);
    if (a) a.reminder_call_done_at = new Date().toISOString();
    refRenderTracker();
  } catch (e) { btn.disabled = false; alert(e.message); }
}
// ── Manual add: patient / appointment ──
function refModal(title, body, onSave) {
  let m = document.getElementById('ref-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'ref-modal';
    m.onclick = e => { if (e.target === m) refCloseModal(); };
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="modal-box ref-panel">
      <h2>${escHtml(title)}</h2>${body}
      <div class="ref-error"></div>
      <div class="ref-grid two">
        <button class="ref-btn" onclick="refCloseModal()">${t('cancel')}</button>
        <button class="ref-btn ok" id="ref-modal-save">${t('save')}</button>
      </div></div>`;
  m.classList.add('open');
  document.getElementById('ref-modal-save').onclick = async () => {
    const btn = document.getElementById('ref-modal-save'), errEl = m.querySelector('.ref-error');
    btn.disabled = true;
    try { await onSave(id => (document.getElementById(id).value || '').trim()); refCloseModal(); refLoadTracker(); }
    catch (e) { errEl.textContent = e.message; btn.disabled = false; }
  };
  const f = m.querySelector('input, select, textarea'); if (f) f.focus();
}
function refCloseModal() { const m = document.getElementById('ref-modal'); if (m) m.classList.remove('open'); }

function refAddPatient() {
  refModal(t('tr_add_patient'), `
    <div class="muted small">${t('demo_only')}</div>
    <label for="mp-name">${t('ref_name')} *</label>${refMic('mp-name', '<input id="mp-name" autocomplete="off">')}
    <label for="mp-age">${t('ref_age')}</label>${refMic('mp-age', '<input id="mp-age" type="number" min="0" max="120">')}
    <label for="mp-phone">${t('ref_phone')} *</label>${refMic('mp-phone', '<input id="mp-phone" type="tel" placeholder="+91 …">')}
    <label for="mp-address">${t('col_address')}</label>${refMic('mp-address', '<input id="mp-address" autocomplete="off">')}
    <label for="mp-cond">${t('ref_condition')}</label>${refMic('mp-cond', '<input id="mp-cond" autocomplete="off">')}
    <label for="mp-prog">${t('col_program')}</label>${refMic('mp-prog', '<input id="mp-prog" list="mp-programs" autocomplete="off" placeholder="e.g. PM-JAY">')}
    <datalist id="mp-programs"><option>PM-JAY (Ayushman Bharat)</option><option>Janani Suraksha Yojana (JSY)</option>
      <option>PM National Dialysis Programme</option><option>State health insurance scheme</option><option>None</option></datalist>
    <label for="mp-sec">${t('col_secondary')}</label>${refMic('mp-sec', `<input id="mp-sec" autocomplete="off" placeholder="${t('sec_ph')}">`)}
    <label for="mp-hosp">${t('col_hospital')}</label>${refMic('mp-hosp', '<input id="mp-hosp" autocomplete="off">')}
    <label for="mp-consent">${t('ref_consent')}</label>
    <select id="mp-consent"><option value="">${t('no')}</option><option value="1">${t('yes')}</option></select>`,
    async v => {
      if (!v('mp-name') || !v('mp-phone')) throw new Error(t('ref_err_name_phone'));
      await refApi('/patients', { name: v('mp-name'), age_years: v('mp-age'), phone: v('mp-phone'), address: v('mp-address'),
        condition: v('mp-cond'), care_program: v('mp-prog'), secondary_contacts: v('mp-sec'), hospital: v('mp-hosp'),
        consent: !!v('mp-consent') });
    });
}

function refAddAppointment() {
  const pats = REF_TRACKER.cases || [];
  if (!pats.length) { refAddPatient(); return; }
  const day = REF_CAL.day || refTodayKey();
  refModal(t('tr_add_appt'), `
    <label for="ma-pat">${t('th_patient')} *</label>
    <select id="ma-pat" onchange="document.getElementById('ma-hosp').value = this.selectedOptions[0].dataset.h || ''">
      ${pats.map(c => `<option value="${escHtml(c.case_id)}" data-h="${escHtml(c.hospital_name || '')}">${escHtml(c.patient_name)}${c.age_years ? ' · ' + c.age_years + ' ' + t('yrs') : ''}</option>`).join('')}
    </select>
    <label for="ma-when">${t('ref_date')} *</label><input id="ma-when" type="datetime-local" value="${day}T10:00">
    <label for="ma-hosp">${t('col_hospital')} *</label>${refMic('ma-hosp', `<input id="ma-hosp" autocomplete="off" value="${escHtml(pats[0].hospital_name || '')}">`)}`,
    async v => {
      if (!v('ma-when') || !v('ma-hosp')) throw new Error(t('tr_err_date_hosp'));
      await refApi('/appointments', { case_id: v('ma-pat'), appointment_at: v('ma-when'), hospital: v('ma-hosp') });
      REF_CAL.day = v('ma-when').slice(0, 10); REF_CAL.month = REF_CAL.day.slice(0, 7);
    });
}
// Redraw the open referral step in the new language, keeping what the coordinator typed.
function refRedrawActive() {
  let redrawn = false;
  for (const [caseId, st] of Object.entries(REF)) {
    const p = document.getElementById('ref-' + caseId);
    if (!p || !st.screen) continue;
    const vals = {};
    p.querySelectorAll('input[id], textarea[id]').forEach(el => vals[el.id] = el.value);
    window[st.screen[0]](...st.screen[1]);
    for (const [id, v] of Object.entries(vals)) { const el = document.getElementById(id); if (el) el.value = v; }
    redrawn = true;
  }
  return redrawn;
}
// ── end tracker ──
