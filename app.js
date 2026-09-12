const LS = 'teamcombat_v13';
const PREVIOUS_V12 = 'teamcombat_v12';
const PREVIOUS_V11 = 'teamcombat_v11';
const PREVIOUS_V10 = 'teamcombat_v9';
const PREVIOUS_V8 = 'teamcombat_v8';
const PREVIOUS_V7 = 'teamcombat_v7';
const PREVIOUS_LS = 'teamcombat_v6';
const LEGACY_LS = 'teamcombat_v3';
const FIGHT_TYPES = ['Jiu-Jitsu', 'Muay Thai', 'Boxe', 'Kick Box'];
const BOOKING_GRACE_MINUTES = 15;
const ABSENCE_AFTER_MINUTES = 30;

const todayISO = () => { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; };
const fmtDate = d => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(d + 'T12:00:00'));
const fmtDateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const clone = obj => JSON.parse(JSON.stringify(obj));

const defaults = {
  students: [
    { id: 's1', name: 'João Pedro', phone: '(47) 99911-2233', plan: 'Mensal', fight: 'Muay Thai', status: 'Ativo' },
    { id: 's2', name: 'Carlos Henrique', phone: '(47) 98832-7712', plan: 'Mensal', fight: 'Jiu-Jitsu', status: 'Ativo' },
    { id: 's3', name: 'Matheus Lima', phone: '(47) 99772-1450', plan: 'Trimestral', fight: 'Boxe', status: 'Ativo' },
    { id: 's4', name: 'Lucas Martins', phone: '(47) 99104-3801', plan: 'Mensal', fight: 'Kick Box', status: 'Ativo' },
    { id: 's5', name: 'Ana Souza', phone: '(47) 98444-0228', plan: 'Mensal', fight: 'Muay Thai', status: 'Ativo' }
  ],
  classes: [
    { id: 'c1', name: 'Grupo A', modalities: ['Muay Thai'], days: [1, 3, 5], time: '18:00', capacity: 10, coach: 'Professor Alberto' },
    { id: 'c2', name: 'Grupo B', modalities: ['Jiu-Jitsu'], days: [2, 4], time: '19:00', capacity: 12, coach: 'Professor Alberto' },
    { id: 'c3', name: 'Grupo C', modalities: ['Boxe'], days: [2, 4], time: '20:00', capacity: 10, coach: 'Professor Alberto' },
    { id: 'c4', name: 'Grupo Sábado', modalities: ['Kick Box'], days: [6], time: '10:00', capacity: 10, coach: 'Professor Alberto' }
  ],
  enrollments: [],
  bookings: [],
  attendance: {},
  commissionPayments: []
};

function normalizeState(raw) {
  const data = raw && typeof raw === 'object' ? raw : clone(defaults);
  data.students = Array.isArray(data.students) ? data.students : [];
  data.classes = Array.isArray(data.classes) ? data.classes : [];
  data.enrollments = Array.isArray(data.enrollments) ? data.enrollments : [];
  data.bookings = Array.isArray(data.bookings) ? data.bookings : [];
  data.attendance = data.attendance && typeof data.attendance === 'object' ? data.attendance : {};
  data.commissionPayments = Array.isArray(data.commissionPayments) ? data.commissionPayments : [];
  data.students.forEach(s => {
    if (!s.fight) s.fight = 'Muay Thai';
    if (!s.status) s.status = 'Ativo';
    if (s.monthlyFee === undefined || s.monthlyFee === null || isNaN(Number(s.monthlyFee))) s.monthlyFee = 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.nextDueDate || ''))) {
      const d = new Date();
      s.nextDueDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(Math.min(d.getDate(),28)).padStart(2,'0')}`;
    }
  });
  data.classes.forEach((c, index) => {
    // Compatibilidade com versões anteriores: o antigo campo name era a modalidade.
    if (!Array.isArray(c.modalities) || !c.modalities.length) {
      c.modalities = c.name ? [c.name] : ['Muay Thai'];
      c.name = `Grupo ${index + 1}`;
    }
    c.modalities = c.modalities.map(m => String(m).trim()).filter(Boolean);
    if (!c.name) c.name = `Grupo ${index + 1}`;
    // Normaliza os dias antigos (string/numero/campo day) para evitar grupos invisíveis na agenda.
    let days = Array.isArray(c.days) ? c.days : (c.day !== undefined && c.day !== null ? [c.day] : []);
    c.days = [...new Set(days.map(normalizeDayValue).filter(d => d !== null))];
    c.capacity = 10;
  });
  // Migra agendamentos pendentes antigos para vínculos recorrentes por horário.
  data.bookings.filter(b => b.status === 'Confirmado').forEach(b => {
    if (!data.enrollments.some(e => e.studentId === b.studentId && e.classId === b.classId && e.active !== false)) {
      data.enrollments.push({ id: uid(), studentId: b.studentId, classId: b.classId, active: true, createdAt: b.createdAt || new Date().toISOString() });
    }
  });
  data.enrollments.forEach(e => { if (e.active === undefined) e.active = true; });
  // Cada aluno pode ter apenas uma sala fixa ativa. Em dados antigos, mantém o vínculo mais recente.
  const byStudent = new Map();
  data.enrollments.filter(e => e.active !== false).forEach(e => {
    const prev = byStudent.get(e.studentId);
    if (!prev || String(e.createdAt || '') >= String(prev.createdAt || '')) byStudent.set(e.studentId, e);
  });
  data.enrollments.forEach(e => {
    const keep = byStudent.get(e.studentId);
    if (e.active !== false && keep && e.id !== keep.id) e.active = false;
  });
  data.bookings.forEach(b => {
    if (!b.status) b.status = 'Confirmado';
  });
  return data;
}

let state;
try {
  const stored = localStorage.getItem(LS);
  const previousV12 = localStorage.getItem(PREVIOUS_V12);
  const previousV11 = localStorage.getItem(PREVIOUS_V11);
  const previousV10 = localStorage.getItem(PREVIOUS_V10);
  const previousV8 = localStorage.getItem(PREVIOUS_V8);
  const previousV7 = localStorage.getItem(PREVIOUS_V7);
  const previous = localStorage.getItem(PREVIOUS_LS);
  const legacy = localStorage.getItem(LEGACY_LS);
  state = normalizeState(stored ? JSON.parse(stored) : previousV11 ? JSON.parse(previousV11) : previousV10 ? JSON.parse(previousV10) : previousV8 ? JSON.parse(previousV8) : previousV7 ? JSON.parse(previousV7) : previous ? JSON.parse(previous) : legacy ? JSON.parse(legacy) : clone(defaults));
} catch (e) {
  state = clone(defaults);
}

const save = () => {
  try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {}
};

function seedToday() {
  // Não cria mais agendamentos avulsos. Os alunos ficam vinculados aos horários recorrentes.
  if (state.enrollments.length) return;
  [['s1','c1'],['s2','c1'],['s3','c3'],['s4','c4'],['s5','c1']].forEach(([studentId,classId]) => {
    if (getStudent(studentId) && getClass(classId)) state.enrollments.push({ id: uid(), studentId, classId, active: true, createdAt: new Date().toISOString() });
  });
  save();
}
seedToday();

function toast(msg) {
  const t = document.querySelector('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

const initials = n => (n || '?').split(' ').slice(0, 2).map(x => x[0]).join('').toUpperCase();
const dayName = d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d];
const dayFullName = d => ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][d];
function whatsappPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
function openWhatsApp(phone, message) {
  const target = whatsappPhone(phone);
  if (!target || target.length < 12) return toast('Telefone inválido para abrir o WhatsApp.');
  const url = `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
function scheduleWhatsAppMessage(studentId) {
  const s = getStudent(studentId);
  const enrollment = state.enrollments.find(e => e.studentId === studentId && e.active !== false);
  const c = enrollment ? getClass(enrollment.classId) : null;
  if (!s || !c) return null;
  const days = (c.days || []).slice().sort((a,b)=>a-b).map(dayFullName).join(', ');
  return `Olá, ${s.name}! 🥊\n\nSeu horário fixo na *Team Combat* ficou confirmado:\n\n🥋 Turma: ${c.name}\n🥊 Modalidade: ${classModalities(c)}\n📅 Dias: ${days}\n⏰ Horário: ${c.time}\n👊 Professor: ${c.coach}\n\nVocê ficará cadastrado automaticamente nesses dias e horário todas as semanas. Nos vemos no treino! 💪`;
}
function delinquencyWhatsAppMessage(studentId) {
  const s = getStudent(studentId);
  if (!s) return null;
  const due = s.nextDueDate ? new Intl.DateTimeFormat('pt-BR').format(new Date(s.nextDueDate + 'T12:00:00')) : 'não informado';
  return `Olá, ${s.name}! Tudo bem?\n\nPassando para lembrar que sua mensalidade da *Team Combat*, no valor de *${money(s.monthlyFee)}*, está em atraso desde *${due}*.\n\nEnquanto a mensalidade estiver pendente, seu acesso às aulas fica bloqueado no sistema. Assim que o pagamento for confirmado, o professor poderá marcar como pago e sua participação nas aulas será liberada novamente.\n\nObrigado! 🥊`;
}
window.sendScheduleWhatsApp = studentId => {
  const s = getStudent(studentId), msg = scheduleWhatsAppMessage(studentId);
  if (!s || !msg) return toast('Defina uma sala para o aluno antes de enviar o horário.');
  openWhatsApp(s.phone, msg);
};
window.sendCollectionWhatsApp = studentId => {
  const s = getStudent(studentId), msg = delinquencyWhatsAppMessage(studentId);
  if (!s || !msg) return;
  openWhatsApp(s.phone, msg);
};
const dayAliases = {
  '0':0,'dom':0,'domingo':0,
  '1':1,'seg':1,'segunda':1,'segunda-feira':1,
  '2':2,'ter':2,'terça':2,'terca':2,'terça-feira':2,'terca-feira':2,
  '3':3,'qua':3,'quarta':3,'quarta-feira':3,
  '4':4,'qui':4,'quinta':4,'quinta-feira':4,
  '5':5,'sex':5,'sexta':5,'sexta-feira':5,
  '6':6,'sab':6,'sáb':6,'sabado':6,'sábado':6
};
function normalizeDayValue(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return (v >= 0 && v <= 6) ? v : null;
  const key = String(v ?? '').trim().toLowerCase();
  if (key in dayAliases) return dayAliases[key];
  const n = Number(key);
  if (Number.isInteger(n) && n >= 0 && n <= 6) return n;
  return null;
}
function getClassForDate(c, date) {
  const targetDay = new Date(date + 'T12:00:00').getDay();
  const days = Array.isArray(c?.days) ? c.days.map(normalizeDayValue).filter(v => v !== null) : [];
  return days.includes(targetDay);
}
function bookingsFor(date, classId) { return state.bookings.filter(b => b.date === date && b.classId === classId); }
function activeBookingsFor(date, classId) { return bookingsFor(date, classId).filter(b => b.status === 'Confirmado'); }
function getStudent(id) { return state.students.find(s => s.id === id); }
function getClass(id) { return state.classes.find(c => c.id === id); }
function activeEnrollmentsForClass(classId) { return state.enrollments.filter(e => e.classId === classId && e.active !== false); }
function getEnrollment(studentId, classId) { return state.enrollments.find(e => e.studentId === studentId && e.classId === classId && e.active !== false); }
function monthKeyFromDate(date) { return String(date || '').slice(0, 7); }
function isStudentPaidForMonth(studentId, month) {
  return state.commissionPayments.some(x => x.studentId === studentId && x.month === month);
}
function dateOnly(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : todayISO(); }
function isStudentDelinquent(studentOrId, date = todayISO()) {
  const s = typeof studentOrId === 'string' ? getStudent(studentOrId) : studentOrId;
  if (!s || !s.nextDueDate) return false;
  return dateOnly(date) > dateOnly(s.nextDueDate);
}
function isStudentFinanciallyReleased(studentId, date = todayISO()) {
  const s = getStudent(studentId);
  return !!s && s.status === 'Ativo' && !isStudentDelinquent(s, date);
}
function isStudentPaidForDate(studentId, date) { return isStudentFinanciallyReleased(studentId, date); }
function isStudentPaidCurrentMonth(studentId) { return isStudentFinanciallyReleased(studentId, todayISO()); }
function planMonths(plan) {
  if (plan === 'Trimestral') return 3;
  if (plan === 'Semestral') return 6;
  return 1;
}
function addMonthsToDate(dateStr, months = 1) {
  const [y,m,d] = dateOnly(dateStr).split('-').map(Number);
  const target = new Date(y, (m - 1) + Number(months || 1), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
  return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(Math.min(d,lastDay)).padStart(2,'0')}`;
}
function paymentStatusForStudent(s) {
  if (!s?.nextDueDate) return {label:'Sem vencimento', cls:'warn'};
  const today=todayISO();
  if (today > s.nextDueDate) return {label:`Inadimplente • venceu ${new Intl.DateTimeFormat('pt-BR').format(new Date(s.nextDueDate+'T12:00:00'))}`, cls:'danger'};
  if (today === s.nextDueDate) return {label:'Vence hoje', cls:'warn'};
  return {label:`Em dia • vence ${new Intl.DateTimeFormat('pt-BR').format(new Date(s.nextDueDate+'T12:00:00'))}`, cls:'ok'};
}

function ensureBookingsForDate(date) {
  const day = new Date(date + 'T12:00:00').getDay();
  state.enrollments.filter(e => e.active !== false).forEach(e => {
    const c = getClass(e.classId);
    if (!c || !c.days.includes(day)) return;
    // Regra financeira: aluno inadimplente mantém sua sala fixa, mas não entra na agenda/presença.
    if (!isStudentPaidForDate(e.studentId, date)) return;
    const exists = state.bookings.some(b => b.date === date && b.classId === e.classId && b.studentId === e.studentId);
    if (!exists) state.bookings.push({ id: uid(), studentId: e.studentId, classId: e.classId, date, status: 'Confirmado', recurring: true, createdAt: new Date().toISOString() });
  });
}
function purgeUnpaidActiveBookings() {
  state.bookings = state.bookings.filter(b => {
    if (b.status !== 'Confirmado') return true;
    return isStudentPaidForDate(b.studentId, b.date);
  });
}

function removeEnrollment(studentId, classId) {
  state.enrollments.forEach(e => { if (e.studentId === studentId && e.classId === classId && e.active !== false) e.active = false; });
  const today = todayISO();
  state.bookings = state.bookings.filter(b => !(b.studentId === studentId && b.classId === classId && b.status === 'Confirmado' && b.date >= today));
  save(); renderAll(); toast('Aluno removido da sala. Ele continua cadastrado, agora sem horário fixo.');
}
function fightOptions(selected = '') { return FIGHT_TYPES.map(f => `<option value="${f}" ${selected === f ? 'selected' : ''}>${f}</option>`).join(''); }
function classModalities(c) { return (c?.modalities || []).join(' + ') || 'Sem modalidade'; }
function classTitle(c) { return `${c?.name || 'Grupo'} • ${classModalities(c)}`; }
function scheduledDateTime(b) {
  const c = getClass(b.classId);
  if (!c) return null;
  return new Date(`${b.date}T${c.time}:00`);
}

function classDateTime(c, date) {
  if (!c || !date || !c.time) return null;
  return new Date(`${date}T${c.time}:00`);
}

function bookingCutoff(c, date) {
  const start = classDateTime(c, date);
  return start ? new Date(start.getTime() + BOOKING_GRACE_MINUTES * 60 * 1000) : null;
}

function canBookClass(c, date, now = new Date()) {
  if (!c) return false;
  const cutoff = bookingCutoff(c, date);
  return !!cutoff && now <= cutoff;
}

function classesForDate(date) {
  return state.classes
    .filter(c => getClassForDate(c, date))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function bookableClassesForDate(date) {
  return classesForDate(date).filter(c => canBookClass(c, date));
}

function bookingClassOptions(date, selectedId = '') {
  const classes = state.classes.slice().sort((a,b)=>a.time.localeCompare(b.time));
  if (!classes.length) return '<option value="" disabled selected>Nenhum grupo cadastrado</option>';
  const now = new Date();
  return classes.map(c => {
    const cutoff = bookingCutoff(c, date);
    const open = canBookClass(c, date, now);
    const limit = cutoff ? cutoff.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const label = open ? `agendar até ${limit}` : `encerrado às ${limit}`;
    const scheduledDays = (c.days||[]).map(dayName).join(', ');
    return `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''} ${open ? '' : 'disabled'}>${c.time} • ${c.name} • ${classModalities(c)} • ${label}${scheduledDays ? ` • padrão: ${scheduledDays}` : ''}</option>`;
  }).join('');
}

// Regra Team Combat: o agendamento pode ser feito até 15 minutos após o início.
// Se o aluno continuar pendente 30 minutos após o início, vira falta automática.
function processAutomaticAbsences(showToast = false) {
  ensureBookingsForDate(todayISO());
  const now = new Date();
  let changed = 0;
  state.bookings.forEach(b => {
    if (b.status !== 'Confirmado') return;
    const scheduled = scheduledDateTime(b);
    if (!scheduled) return;
    const deadline = new Date(scheduled.getTime() + ABSENCE_AFTER_MINUTES * 60 * 1000);
    if (now >= deadline) {
      const s = getStudent(b.studentId), c = getClass(b.classId);
      b.studentName = s?.name || b.studentName || '';
      b.className = c ? classTitle(c) : (b.className || '');
      b.status = 'Finalizado';
      b.finishedAt = now.toISOString();
      b.autoAbsence = true;
      state.attendance[b.id] = 'Falta';
      changed++;
    }
  });
  if (changed) {
    save();
    if (showToast) toast(`${changed} falta${changed > 1 ? 's' : ''} automática${changed > 1 ? 's' : ''} registrada${changed > 1 ? 's' : ''}.`);
  }
  return changed;
}

function go(view) {
  processAutomaticAbsences();
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active-view', v.id === view));
  document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelector('.sidebar').classList.remove('open');
  renderAll();
}

function renderDashboard() {
  const d = todayISO();
  ensureBookingsForDate(d);
  const todayClassIds = new Set(state.bookings.filter(b => b.date === d && b.status === 'Confirmado').map(b => b.classId));
  const todayClasses = state.classes.filter(c => getClassForDate(c, d) || todayClassIds.has(c.id));
  const todayB = state.bookings.filter(b => b.date === d && b.status === 'Confirmado');
  const todayAbsences = state.bookings.filter(b => b.date === d && state.attendance[b.id] === 'Falta').length;
  document.querySelector('#statsGrid').innerHTML = [
    ['Alunos ativos', state.students.filter(s => s.status === 'Ativo').length],
    ['Agendados hoje', todayB.length],
    ['Turmas hoje', todayClasses.length],
    ['Faltas hoje', todayAbsences]
  ].map(([l, n]) => `<div class="stat"><span>${l}</span><div class="num">${n}</div></div>`).join('');

  document.querySelector('#todayClasses').innerHTML = todayClasses.length ? todayClasses.sort((a, b) => a.time.localeCompare(b.time)).map(c => {
    const n = activeBookingsFor(d, c.id).length, p = Math.min(100, n / c.capacity * 100);
    return `<div class="class-row"><div class="time">${c.time}</div><div><strong>${c.name}</strong><div class="meta">${classModalities(c)} • ${c.coach}</div></div><div><div class="badge ${n >= c.capacity ? 'danger' : n / c.capacity > .7 ? 'warn' : 'ok'}">${n}/${c.capacity}</div><div class="progress"><i style="width:${p}%"></i></div></div></div>`;
  }).join('') : '<p class="meta">Nenhum treino configurado para hoje.</p>';

  const next = todayB.sort((a, b) => getClass(a.classId).time.localeCompare(getClass(b.classId).time)).slice(0, 5);
  document.querySelector('#nextStudents').innerHTML = next.length ? next.map(b => {
    const s = getStudent(b.studentId), c = getClass(b.classId);
    return `<div class="mini-item"><div class="person"><div class="person-avatar">${initials(s?.name)}</div><div><strong>${s?.name || 'Aluno removido'}</strong><small>${c ? classTitle(c) : 'Turma removida'}</small></div></div><div class="time">${c?.time || '--:--'}</div></div>`;
  }).join('') : '<p class="meta">Sem agendamentos pendentes hoje.</p>';
}

function renderAgenda() {
  const date = document.querySelector('#agendaDate').value || todayISO();
  ensureBookingsForDate(date);
  document.querySelector('#agendaDate').value = date;
  const q = (document.querySelector('#agendaSearch').value || '').toLowerCase();
  const bookedClassIds = new Set(state.bookings.filter(b => b.date === date && b.status === 'Confirmado').map(b => b.classId));
  const classes = state.classes.filter(c => getClassForDate(c, date) || bookedClassIds.has(c.id)).sort((a, b) => a.time.localeCompare(b.time));
  document.querySelector('#agendaBoard').innerHTML = classes.length ? classes.map(c => {
    const all = activeBookingsFor(date, c.id);
    const bs = all.filter(b => getStudent(b.studentId)?.name.toLowerCase().includes(q));
    return `<div class="agenda-card"><div class="agenda-card-head"><div><h3>${c.time} • ${c.name}</h3><div class="meta">${classModalities(c)} • ${c.coach}</div></div><span class="badge ${all.length >= c.capacity ? 'danger' : 'ok'}">${all.length}/${c.capacity} vagas</span></div><div class="booking-list">${bs.length ? bs.map(b => {
      const s = getStudent(b.studentId);
      return `<div class="booking"><div class="person"><div class="person-avatar">${initials(s?.name)}</div><div><strong>${s?.name || 'Aluno removido'}</strong><small>${s?.phone || ''} • ${classModalities(c)}</small></div></div><div class="booking-actions"><button class="mini-btn" onclick="markQuick('${b.id}','Presente')">✓ Presente</button><button class="mini-btn danger" onclick="removeStudentFromClass('${b.studentId}','${b.classId}')">Remover do horário</button></div></div>`;
    }).join('') : '<div class="booking"><span class="meta">Nenhum aluno agendado neste horário.</span></div>'}</div></div>`;
  }).join('') : '<div class="panel"><p class="meta">Não há turmas configuradas para esta data.</p></div>';
}

function money(v) { return Number(v || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
function currentMonthKey() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function pendingCommissionForStudent(studentId) { return state.commissionPayments.filter(x => x.studentId===studentId && !x.settledAt).reduce((a,x)=>a+Number(x.commission||0),0); }
function renderCommissions() {
  const pending = state.commissionPayments.filter(x => !x.settledAt);
  const settled = state.commissionPayments.filter(x => x.settledAt);
  const totalPending = pending.reduce((a,x)=>a+Number(x.commission||0),0);
  const totalSettled = settled.reduce((a,x)=>a+Number(x.commission||0),0);
  const stats=document.querySelector('#commissionStats');
  if (stats) stats.innerHTML = [
    ['Comissão a receber', money(totalPending)],
    ['Pagamentos pendentes', pending.length],
    ['Comissões já zeradas', money(totalSettled)],
    ['Alunos com comissão', new Set(pending.map(x=>x.studentId)).size]
  ].map(([l,n])=>`<div class="stat"><span>${l}</span><div class="num">${n}</div></div>`).join('');
  const tbody=document.querySelector('#commissionTable');
  if (!tbody) return;
  const rows=state.commissionPayments.slice().sort((a,b)=>String(b.paidAt).localeCompare(String(a.paidAt)));
  tbody.innerHTML = rows.length ? rows.map(x=>{
    const s=getStudent(x.studentId);
    const settled=!!x.settledAt;
    const months = Number(x.planMonths || 1);
    const periodValue = Number(x.periodValue ?? (Number(x.monthlyValue || 0) * months));
    const planLabel = x.plan || (months===3?'Trimestral':months===6?'Semestral':'Mensal');
    return `<tr><td><strong>${s?.name || x.studentName || 'Aluno removido'}</strong><div class="meta">${planLabel} • ${months} ${months===1?'mês':'meses'}</div></td><td>${money(periodValue)}</td><td><strong>${money(x.commission)}</strong></td><td>${x.month || '—'}</td><td>${fmtDateTime(x.paidAt)}</td><td><span class="badge ${settled?'ok':'warn'}">${settled?'Zerada':'Pendente'}</span></td><td>${settled?'—':`<button class="mini-btn danger" onclick="settleCommission('${x.id}')">Zerar</button>`}</td></tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-cell">Nenhuma comissão registrada.</td></tr>';
}
window.registerMonthlyPayment = studentId => {
  const s=getStudent(studentId); if(!s) return;
  const monthlyValue=Number(s.monthlyFee||0);
  if(monthlyValue<=0) return toast('Cadastre o valor mensal deste aluno primeiro.');
  const months=planMonths(s.plan);
  const periodValue=Number((monthlyValue*months).toFixed(2));
  const commission=Number((periodValue*0.10).toFixed(2));
  const dueDate=dateOnly(s.nextDueDate);
  const month=dueDate.slice(0,7);
  const cycleKey=dueDate;
  if(state.commissionPayments.some(x=>x.studentId===studentId && (x.cycleKey===cycleKey || (!x.cycleKey && x.month===month)))) return;
  state.commissionPayments.push({id:uid(),studentId,studentName:s.name,plan:s.plan,planMonths:months,monthlyValue,periodValue,commission,month,cycleKey,dueDate,paidAt:new Date().toISOString(),settledAt:null});
  s.nextDueDate=addMonthsToDate(dueDate, months);
  save(); renderAll();
};
window.settleCommission = id => {
  if(window.currentRole!=='admin') return toast('Somente o login administrativo pode zerar comissões.');
  const x=state.commissionPayments.find(p=>p.id===id); if(!x || x.settledAt) return;
  if(!confirm(`Zerar esta comissão de ${money(x.commission)}?`)) return;
  x.settledAt=new Date().toISOString(); save(); renderCommissions(); toast('Comissão zerada.');
};

function renderStudents() {
  const q = (document.querySelector('#studentSearch').value || '').toLowerCase();
  document.querySelector('#studentsTable').innerHTML = state.students.filter(s => (s.name + s.phone + s.fight).toLowerCase().includes(q)).map(s => {
    const total = state.bookings.filter(b => b.studentId === s.id).length;
    const absences = state.bookings.filter(b => b.studentId === s.id && state.attendance[b.id] === 'Falta').length;
    const enrollment = state.enrollments.find(e => e.studentId === s.id && e.active !== false);
    const c = enrollment ? getClass(enrollment.classId) : null;
    const fixed = c ? `<strong>${c.time}</strong><div class="meta">${c.name} • ${c.days.map(dayName).join(', ')}</div>` : '<span class="badge warn">Sem horário</span>';
    const fin = paymentStatusForStudent(s);
    const financial = `<span class="badge ${fin.cls}">${fin.label}</span>`;
    const payAction = `<button class="mini-btn" onclick="registerMonthlyPayment('${s.id}')">Marcar pago</button>`;
    const chargeAction = isStudentDelinquent(s) ? `<button class="mini-btn whatsapp-btn" onclick="sendCollectionWhatsApp('${s.id}')">WhatsApp cobrança</button>` : '';
    const scheduleAction = c ? `<button class="mini-btn whatsapp-btn" onclick="sendScheduleWhatsApp('${s.id}')">WhatsApp horário</button>` : '';
    return `<tr><td><div class="person"><div class="person-avatar">${initials(s.name)}</div><strong>${s.name}</strong></div></td><td>${s.phone}</td><td>${s.fight}</td><td>${fixed}</td><td>${s.plan}</td><td>${money(s.monthlyFee)}</td><td><div class="payment-cell">${financial}${payAction}${chargeAction}</div></td><td><span class="badge ${s.status === 'Ativo' ? 'ok' : 'danger'}">${s.status}</span></td><td>${total}</td><td>${absences}</td><td><div class="row-actions"><button class="mini-btn" onclick="showStudentHistory('${s.id}')">Histórico</button><button class="mini-btn" onclick="editStudent('${s.id}')">Editar</button>${scheduleAction}</div></td></tr>`;
  }).join('');
}

function renderClasses() {
  document.querySelector('#classesGrid').innerHTML = state.classes.map(c => {
    const enrollments = activeEnrollmentsForClass(c.id);
    const roster = enrollments.length ? enrollments.map(e => {
      const s = getStudent(e.studentId);
      if (!s) return '';
      const fin = paymentStatusForStudent(s);
      const blocked = isStudentDelinquent(s);
      return `<div class="att-row"><div class="person"><div class="person-avatar">${initials(s.name)}</div><div><strong>${s.name}</strong><div class="meta">${s.fight} • <span class="badge ${blocked ? 'danger' : fin.cls}">${blocked ? 'Inadimplente • bloqueado' : fin.label}</span></div></div></div><button class="mini-btn danger" onclick="removeStudentFromClass('${s.id}','${c.id}')">Remover</button></div>`;
    }).join('') : '<p class="meta">Nenhum aluno fixo nesta sala.</p>';
    return `<div class="class-card"><div class="eyebrow">${c.name.toUpperCase()}</div><h3>${c.time}</h3><div class="meta"><strong>${classModalities(c)}</strong><br>${c.coach}<br><span class="badge ${enrollments.length >= 10 ? 'danger' : 'ok'}">${enrollments.length}/10 alunos fixos</span> • ${c.days.map(dayName).join(', ')}</div><div style="margin-top:16px"><div class="field-label">Alunos da sala</div>${roster}</div><div class="card-actions"><button class="mini-btn" onclick="editClass('${c.id}')">Editar grupo</button><button class="mini-btn danger" onclick="deleteClass('${c.id}')">Excluir grupo</button></div></div>`;
  }).join('');
}

function renderAttendance() {
  const date = document.querySelector('#attendanceDate').value || todayISO();
  ensureBookingsForDate(date);
  document.querySelector('#attendanceDate').value = date;
  const bookedClassIds = new Set(state.bookings.filter(b => b.date === date && b.status === 'Confirmado').map(b => b.classId));
  const classes = state.classes.filter(c => getClassForDate(c, date) || bookedClassIds.has(c.id)).sort((a, b) => a.time.localeCompare(b.time));
  document.querySelector('#attendanceList').innerHTML = classes.map(c => {
    const bs = activeBookingsFor(date, c.id);
    return `<div class="att-class"><h3>${c.time} • ${c.name}</h3><div class="meta">${classModalities(c)} • ${c.coach}</div>${bs.length ? bs.map(b => {
      const s = getStudent(b.studentId), val = state.attendance[b.id] || '';
      return `<div class="att-row"><div><strong>${s?.name || 'Aluno removido'}</strong><div class="meta">${classModalities(c)}</div></div><div class="att-actions"><button class="att-btn present ${val === 'Presente' ? 'active' : ''}" onclick="setAttendance('${b.id}','Presente')">Presente</button><button class="att-btn absent ${val === 'Falta' ? 'active' : ''}" onclick="setAttendance('${b.id}','Falta')">Falta</button><button class="att-btn cancelled ${val === 'Cancelado' ? 'active' : ''}" onclick="setAttendance('${b.id}','Cancelado')">Cancelou</button></div></div>`;
    }).join('') : '<p class="meta">Sem alunos pendentes neste horário.</p>'}</div>`;
  }).join('') || '<div class="panel"><p class="meta">Nenhuma turma nesta data.</p></div>';
}

function historyRecords() {
  return state.bookings.filter(b => b.status !== 'Confirmado' || state.attendance[b.id]).map(b => {
    const s = getStudent(b.studentId), c = getClass(b.classId);
    return {
      ...b,
      studentName: s?.name || b.studentName || 'Aluno removido',
      phone: s?.phone || '',
      fight: c ? classModalities(c) : (s?.fight || '—'),
      time: c?.time || '—',
      result: state.attendance[b.id] || (b.status === 'Cancelado' ? 'Cancelado' : 'Finalizado')
    };
  }).sort((a, b) => (`${b.date} ${b.time}`).localeCompare(`${a.date} ${a.time}`));
}

function renderHistory() {
  const q = (document.querySelector('#historySearch').value || '').trim().toLowerCase();
  const studentId = document.querySelector('#historyStudent').value || '';
  const select = document.querySelector('#historyStudent');
  const current = select.value;
  select.innerHTML = '<option value="">Todos os alunos</option>' + state.students.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  select.value = current || studentId;

  const records = historyRecords().filter(r => {
    const matchText = (r.studentName + ' ' + r.fight + ' ' + r.result).toLowerCase().includes(q);
    const matchStudent = !select.value || r.studentId === select.value;
    return matchText && matchStudent;
  });

  const present = records.filter(r => r.result === 'Presente').length;
  const absent = records.filter(r => r.result === 'Falta').length;
  const cancelled = records.filter(r => r.result === 'Cancelado').length;
  document.querySelector('#historyStats').innerHTML = [
    ['Registros', records.length], ['Presenças', present], ['Faltas', absent], ['Cancelamentos', cancelled]
  ].map(([l,n]) => `<div class="stat"><span>${l}</span><div class="num">${n}</div></div>`).join('');

  document.querySelector('#historyTable').innerHTML = records.length ? records.map(r => `<tr><td>${new Intl.DateTimeFormat('pt-BR').format(new Date(r.date + 'T12:00:00'))}</td><td>${r.time}</td><td><strong>${r.studentName}</strong><div class="meta">${r.phone}</div></td><td>${r.fight}</td><td><span class="badge ${r.result === 'Presente' ? 'ok' : r.result === 'Falta' ? 'danger' : 'warn'}">${r.result}${r.autoAbsence ? ' • automática' : ''}</span></td><td>${fmtDateTime(r.finishedAt || r.cancelledAt || r.updatedAt)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">Nenhum registro encontrado.</td></tr>';
}

function renderAll() {
  processAutomaticAbsences();
  renderDashboard();
  renderAgenda();
  renderStudents();
  renderClasses();
  renderAttendance();
  renderHistory();
}

const modal = document.querySelector('#modal'), modalTitle = document.querySelector('#modalTitle'), modalBody = document.querySelector('#modalBody'), modalForm = document.querySelector('#modalForm');
let modalMode = '', editingId = null;

function openModal(mode, id = null) {
  modalMode = mode; editingId = id;
  if (mode === 'booking') {
    modalTitle.textContent = 'Definir sala do aluno';
    modalBody.innerHTML = `<div class="modal-grid">
      <label class="full">Aluno<select name="studentId" required>${state.students.filter(s => s.status === 'Ativo' && !isStudentDelinquent(s)).map(s => `<option value="${s.id}">${s.name} • ${s.fight} • LIBERADO</option>`).join('')}</select></label>
      <label class="full">Sala / Horário fixo<select name="classId" required>${state.classes.slice().sort((a,b)=>a.time.localeCompare(b.time)).map(c => `<option value="${c.id}">${c.time} • ${c.name} • ${classModalities(c)} • ${activeEnrollmentsForClass(c.id).length}/10 alunos</option>`).join('')}</select><small class="field-help">O aluno ficará fixo nesta sala e aparecerá automaticamente toda semana nos dias configurados do grupo. Só sai quando o professor remover ou trocar a sala.</small></label>
      <div class="full rule-note"><strong>Pagamento obrigatório:</strong> alunos ficam liberados até a data de vencimento. Depois do vencimento, se o pagamento não tiver sido registrado, o aluno fica inadimplente e bloqueado da agenda/presença até o professor clicar em Marcar pago. <br><strong>Vínculo recorrente:</strong> os alunos permanecem no horário. Cada grupo aceita no máximo 10 alunos. Em cada dia de aula, com ${ABSENCE_AFTER_MINUTES} minutos de atraso sem presença registrada, o sistema gera falta automática.</div>
    </div>`;
  }
  if (mode === 'student') {
    const s = getStudent(id) || { name: '', phone: '', plan: 'Mensal', fight: 'Muay Thai', status: 'Ativo', nextDueDate: todayISO() };
    const currentEnrollment = id ? state.enrollments.find(e => e.studentId === id && e.active !== false) : null;
    const currentClassId = currentEnrollment?.classId || '';
    const classOptions = state.classes.slice().sort((a,b)=>a.time.localeCompare(b.time)).map(c => {
      const count = activeEnrollmentsForClass(c.id).length;
      const isCurrent = c.id === currentClassId;
      const full = count >= 10 && !isCurrent;
      return `<option value="${c.id}" ${isCurrent ? 'selected' : ''} ${full ? 'disabled' : ''}>${c.time} • ${c.name} • ${classModalities(c)} • ${count}/10${full ? ' • LOTADO' : ''}</option>`;
    }).join('');
    modalTitle.textContent = id ? 'Editar aluno' : 'Novo aluno';
    modalBody.innerHTML = `<div class="modal-grid"><label class="full">Nome<input name="name" value="${s.name}" required></label><label>Telefone<input name="phone" value="${s.phone}" required></label><label>Modalidade<select name="fight" required>${fightOptions(s.fight)}</select></label><label class="full">Horário fixo / Sala<select name="classId" ${id ? '' : 'required'}><option value="" ${currentClassId ? '' : 'selected'}>${id ? 'Sem sala / definir depois' : 'Selecione o horário do aluno'}</option>${classOptions}</select><small class="field-help">No primeiro cadastro, escolha a sala fixa. O aluno aparecerá automaticamente toda semana nos dias do grupo. Se o professor removê-lo da sala, ele continua cadastrado como “Sem horário” até receber uma nova sala.</small></label><label>Plano<select name="plan"><option ${s.plan === 'Mensal' ? 'selected' : ''}>Mensal</option><option ${s.plan === 'Trimestral' ? 'selected' : ''}>Trimestral</option><option ${s.plan === 'Semestral' ? 'selected' : ''}>Semestral</option></select></label><label>Valor mensal (R$)<input name="monthlyFee" type="number" min="0" step="0.01" value="${Number(s.monthlyFee||0).toFixed(2)}" required><small class="field-help">Base mensal do plano. Mensal: 10% de 1 mês • Trimestral: 10% de 3 meses • Semestral: 10% de 6 meses.</small></label><label>Próximo vencimento<input name="nextDueDate" type="date" value="${s.nextDueDate || todayISO()}" required><small class="field-help">Após esta data, se o pagamento não for registrado, o aluno fica inadimplente e bloqueado automaticamente. Ao marcar pago, o vencimento avança conforme o plano: 1, 3 ou 6 meses.</small></label><label>Status<select name="status"><option ${s.status === 'Ativo' ? 'selected' : ''}>Ativo</option><option ${s.status === 'Inativo' ? 'selected' : ''}>Inativo</option></select></label></div>`;
  }
  if (mode === 'class') {
    const agendaDate = document.querySelector('#agendaDate')?.value || todayISO();
    const defaultDay = new Date(agendaDate + 'T12:00:00').getDay();
    const c = getClass(id) || { name: '', modalities: ['Muay Thai'], time: '18:00', capacity: 10, coach: 'Professor Alberto', days: [defaultDay] };
    modalTitle.textContent = id ? 'Editar grupo de aula' : 'Novo grupo de aula';
    modalBody.innerHTML = `<div class="modal-grid">
      <label class="full">Nome do grupo<input name="name" value="${c.name || ''}" placeholder="Ex.: Grupo Iniciante, Turma A" required></label>
      <label class="full">Modalidades da aula<input name="modalities" value="${classModalities(c).replaceAll(' + ', ', ')}" placeholder="Ex.: Jiu-Jitsu, Muay Thai, Boxe" required><small class="field-help">Pode colocar uma ou várias modalidades separadas por vírgula.</small></label>
      <label>Horário<input name="time" type="time" value="${c.time}" required></label>
      <label>Limite de alunos<input name="capacity" type="number" value="10" readonly><small class="field-help">Limite fixo de 10 alunos por horário.</small></label>
      <label class="full">Professor<input name="coach" value="${c.coach}" required></label>
      <div class="full"><div class="field-label">Dias da semana</div><label class="all-days-toggle"><input type="checkbox" id="allDaysToggle"><span>Todos os dias</span></label><div class="day-selector">${[0,1,2,3,4,5,6].map(d => `<label class="day-option"><input type="checkbox" name="days" value="${d}" ${c.days.includes(d) ? 'checked' : ''}><span>${dayName(d)}</span></label>`).join('')}</div><small class="field-help left-help">Selecione todos os dias em que este mesmo grupo terá aula. Novo grupo já começa marcado para o dia atualmente aberto na agenda.</small></div>
      <div class="full rule-note"><strong>Grupos independentes:</strong> você pode criar vários grupos no mesmo horário, cada um com modalidades, professor e quantidade de vagas diferentes.</div>
    </div>`;
  }
  const whatsappSaveBtn = document.querySelector('#saveWhatsAppStudent');
  if (whatsappSaveBtn) whatsappSaveBtn.classList.toggle('hidden', mode !== 'student');
  if (mode === 'class') {
    const allToggle = modalBody.querySelector('#allDaysToggle');
    const dayChecks = [...modalBody.querySelectorAll('[name=days]')];
    const syncAll = () => { if (allToggle) allToggle.checked = dayChecks.length > 0 && dayChecks.every(x => x.checked); };
    if (allToggle) allToggle.addEventListener('change', () => { dayChecks.forEach(x => x.checked = allToggle.checked); });
    dayChecks.forEach(x => x.addEventListener('change', syncAll));
    syncAll();
  }
  modal.showModal();
}

modalForm.addEventListener('submit', e => {
  e.preventDefault();
  const shouldSendWhatsApp = e.submitter?.id === 'saveWhatsAppStudent';
  let whatsappStudentId = null;
  const fd = new FormData(modalForm);
  if (modalMode === 'booking') {
    const classId = fd.get('classId'), studentId = fd.get('studentId'), c = getClass(classId);
    if (!c) return toast('Selecione uma sala válida.');
    if (isStudentDelinquent(studentId)) return toast('Aluno inadimplente. Registre o pagamento antes de colocá-lo na sala.');
    const currentEnrollment = state.enrollments.find(e => e.studentId === studentId && e.active !== false);
    if (currentEnrollment?.classId === classId) return toast('Este aluno já está nesta sala.');
    if (activeEnrollmentsForClass(classId).length >= 10) return toast('Esta sala já atingiu o limite de 10 alunos.');
    // Um aluno possui apenas uma sala fixa. Ao definir outra, o vínculo anterior é encerrado.
    state.enrollments.forEach(en => { if (en.studentId === studentId && en.active !== false) en.active = false; });
    state.enrollments.push({ id: uid(), studentId, classId, active: true, createdAt: new Date().toISOString() });
    const today = todayISO();
    state.bookings = state.bookings.filter(b => !(b.studentId === studentId && b.status === 'Confirmado' && b.date >= today && b.classId !== classId));
    toast(currentEnrollment ? 'Aluno transferido para a nova sala!' : 'Sala definida para o aluno!');
  }
  if (modalMode === 'student') {
    const classId = String(fd.get('classId') || '');
    const selectedClass = classId ? getClass(classId) : null;
    if (!editingId && !selectedClass) return toast('No cadastro inicial, selecione a sala fixa do aluno.');
    const currentEnrollment = editingId ? state.enrollments.find(e => e.studentId === editingId && e.active !== false) : null;
    const movingToAnotherClass = selectedClass && (!currentEnrollment || currentEnrollment.classId !== classId);
    if (movingToAnotherClass && activeEnrollmentsForClass(classId).length >= 10) return toast('Esta sala já atingiu o limite de 10 alunos.');
    const studentId = editingId || uid();
    const obj = { id: studentId, name: fd.get('name'), phone: fd.get('phone'), fight: fd.get('fight'), plan: fd.get('plan'), monthlyFee: Number(fd.get('monthlyFee') || 0), nextDueDate: String(fd.get('nextDueDate') || todayISO()), status: fd.get('status') };
    if (editingId) Object.assign(getStudent(editingId), obj); else state.students.push(obj);
    // Um aluno possui uma única sala fixa. Sem sala, permanece apenas no cadastro.
    state.enrollments.forEach(en => { if (en.studentId === studentId && en.active !== false && (!selectedClass || en.classId !== classId)) en.active = false; });
    if (selectedClass && !getEnrollment(studentId, classId)) state.enrollments.push({ id: uid(), studentId, classId, active: true, createdAt: new Date().toISOString() });
    whatsappStudentId = studentId;
    const today = todayISO();
    state.bookings = state.bookings.filter(b => !(b.studentId === studentId && b.status === 'Confirmado' && b.date >= today && (!selectedClass || b.classId !== classId)));
    toast(selectedClass ? (editingId ? 'Aluno e sala atualizados!' : 'Aluno cadastrado na sala!') : 'Aluno atualizado e mantido sem sala.');
  }
  if (modalMode === 'class') {
    const days = [...modalForm.querySelectorAll('[name=days]:checked')].map(o => +o.value);
    if (!days.length) return toast('Escolha pelo menos um dia da semana.');
    const modalities = String(fd.get('modalities') || '').split(',').map(m => m.trim()).filter(Boolean);
    if (!modalities.length) return toast('Informe pelo menos uma modalidade.');
    const obj = { id: editingId || uid(), name: String(fd.get('name') || '').trim(), modalities, time: fd.get('time'), capacity: 10, coach: fd.get('coach'), days };
    if (editingId) Object.assign(getClass(editingId), obj); else state.classes.push(obj);
    toast('Horário salvo!');
  }
  save(); modal.close(); renderAll();
  if (shouldSendWhatsApp && modalMode === 'student' && whatsappStudentId) {
    window.sendScheduleWhatsApp(whatsappStudentId);
  }
});

document.querySelector('#cancelModal').onclick = () => modal.close();
window.cancelBooking = id => {
  const b = state.bookings.find(x => x.id === id);
  if (b) {
    const s = getStudent(b.studentId), c = getClass(b.classId);
    b.studentName = s?.name || '';
    b.className = c ? classTitle(c) : '';
    b.status = 'Cancelado';
    b.cancelledAt = new Date().toISOString();
    state.attendance[id] = 'Cancelado';
    save(); renderAll(); toast('Agendamento cancelado e enviado ao histórico.');
  }
};
window.setAttendance = (id, val) => {
  const b = state.bookings.find(x => x.id === id);
  if (!b) return;
  const s = getStudent(b.studentId), c = getClass(b.classId);
  b.studentName = s?.name || '';
  b.className = c ? classTitle(c) : '';
  state.attendance[id] = val;
  b.status = val === 'Cancelado' ? 'Cancelado' : 'Finalizado';
  b.finishedAt = new Date().toISOString();
  if (val !== 'Falta') b.autoAbsence = false;
  save(); renderAll(); toast(`${val} registrada e movida para o histórico.`);
};
window.removeStudentFromClass = (studentId, classId) => { if (confirm('Remover este aluno desta sala fixa? Ele continuará cadastrado, mas ficará sem sala até o professor definir outro horário.')) removeEnrollment(studentId, classId); };
window.markQuick = (id, val) => { setAttendance(id, val); go('history'); };
window.editStudent = id => openModal('student', id);
window.editClass = id => openModal('class', id);
window.showStudentHistory = id => {
  go('history');
  document.querySelector('#historyStudent').value = id;
  renderHistory();
};
window.deleteClass = id => {
  if (confirm('Excluir este horário? Agendamentos já finalizados permanecerão no histórico.')) {
    state.enrollments.forEach(e => { if (e.classId === id) e.active = false; });
    state.classes = state.classes.filter(c => c.id !== id);
    state.bookings = state.bookings.filter(b => b.classId !== id || b.status !== 'Confirmado');
    save(); renderAll(); toast('Horário excluído.');
  }
};

document.querySelectorAll('.nav-item[data-view]').forEach(b => b.onclick = () => go(b.dataset.view));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
document.querySelector('#quickBookBtn').onclick = () => openModal('booking');
document.querySelector('#newBookingBtn').onclick = () => openModal('booking');
document.querySelector('#newStudentBtn').onclick = () => openModal('student');
document.querySelector('#newClassBtn').onclick = () => openModal('class');
document.querySelector('#agendaDate').onchange = renderAgenda;
document.querySelector('#agendaSearch').oninput = renderAgenda;
document.querySelector('#studentSearch').oninput = renderStudents;
document.querySelector('#attendanceDate').onchange = renderAttendance;
document.querySelector('#historySearch').oninput = renderHistory;
document.querySelector('#historyStudent').onchange = renderHistory;
document.querySelector('#menuBtn').onclick = () => document.querySelector('.sidebar').classList.toggle('open');
document.querySelector('#todayLabel').textContent = fmtDate(todayISO());
document.querySelector('#agendaDate').value = todayISO();
document.querySelector('#attendanceDate').value = todayISO();

purgeUnpaidActiveBookings();
save();
processAutomaticAbsences();
renderAll();
setInterval(() => {
  if (processAutomaticAbsences()) renderAll();
}, 30 * 1000);

// Login local provisório com dois perfis. Depois pode ser substituído pelo Supabase.
window.currentRole = null;
function logoutSystem(){ window.currentRole=null; document.querySelector('#commissionAdmin')?.classList.add('hidden'); document.querySelector('#app')?.classList.remove('hidden'); document.querySelector('#loginScreen')?.classList.remove('is-hidden'); document.querySelector('#loginForm')?.reset(); }
(() => {
  const screen = document.querySelector('#loginScreen');
  const form = document.querySelector('#loginForm');
  const error = document.querySelector('#loginError');
  const app = document.querySelector('#app');
  const adminPanel = document.querySelector('#commissionAdmin');
  if (!screen || !form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.querySelector('#loginUser').value.trim().toLowerCase();
    const pass = document.querySelector('#loginPass').value;
    if (user === 'professor' && pass === '1234') {
      window.currentRole='professor'; error.textContent=''; screen.classList.add('is-hidden'); app.classList.remove('hidden'); adminPanel?.classList.add('hidden'); renderAll();
    } else if (user === 'admin' && pass === '1234') {
      window.currentRole='admin'; error.textContent=''; screen.classList.add('is-hidden'); app.classList.add('hidden'); adminPanel?.classList.remove('hidden'); renderCommissions();
    } else error.textContent='Usuário ou senha incorretos.';
  });
})();
document.querySelector('#logoutBtn')?.addEventListener('click', logoutSystem);
document.querySelector('#adminLogoutBtn')?.addEventListener('click', logoutSystem);
document.querySelector('#settleAllBtn')?.addEventListener('click', () => {
  if(window.currentRole!=='admin') return;
  const pending=state.commissionPayments.filter(x=>!x.settledAt);
  if(!pending.length) return toast('Não há comissões pendentes.');
  const total=pending.reduce((a,x)=>a+Number(x.commission||0),0);
  if(!confirm(`Zerar todas as ${pending.length} comissões pendentes, totalizando ${money(total)}?`)) return;
  const now=new Date().toISOString(); pending.forEach(x=>x.settledAt=now); save(); renderCommissions(); toast('Todas as comissões foram zeradas.');
});
