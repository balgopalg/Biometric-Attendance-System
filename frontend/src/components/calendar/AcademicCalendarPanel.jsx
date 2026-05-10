import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import StatePanel from '../ui/StatePanel';
import WeeklyTimetableGrid from '../timetable/WeeklyTimetableGrid';
import { useAuth } from '../../hooks/useAuth';
import { 
  HiOutlineClock, HiOutlineCalendar, HiOutlineClipboardList, 
  HiOutlineSparkles, HiOutlineChevronLeft, HiOutlineChevronRight, 
  HiOutlineDownload, HiOutlinePencil, HiOutlinePlus, HiOutlineTrash, 
  HiOutlineCheck, HiOutlineArrowUp, HiOutlineArrowDown 
} from 'react-icons/hi';
import { useRef } from 'react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function toMinutes(value) {
  const text = String(value || '').trim();
  if (!text.includes(':')) return Number.NaN;
  const [hoursText, minutesText] = text.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN;
  return (hours * 60) + minutes;
}

function normalizeWeekday(value) {
  const text = String(value || '').trim().toLowerCase();
  const match = WEEKDAY_NAMES.find((day) => day.toLowerCase() === text);
  return match || '';
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value) {
  const text = String(value || '').trim().slice(0, 10);
  if (!text) return null;

  let year, month, day;
  if (text.includes('-')) {
    const parts = text.split('-');
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      [year, month, day] = parts.map(Number);
    } else {
      // DD-MM-YYYY
      [day, month, year] = parts.map(Number);
    }
  } else if (text.includes('/')) {
    const parts = text.split('/');
    if (parts[0].length === 4) {
      [year, month, day] = parts.map(Number);
    } else {
      [day, month, year] = parts.map(Number);
    }
  } else {
    return null;
  }

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function formatLocalDate(date) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatLocalTime(date) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function getMonthDays(year, month) {
  const firstOfMonth = new Date(year, month, 1, 12, 0, 0, 0);
  const nextMonth = new Date(year, month + 1, 1, 12, 0, 0, 0);
  const totalDays = Math.round((nextMonth - firstOfMonth) / 86400000);
  const startOffset = firstOfMonth.getDay();
  const cells = [];

  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(year, month, day, 12, 0, 0, 0));
  }

  return cells;
}

function normalizeTimetableItems(payload) {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => Array.isArray(item?.slots) && item.slots.length ? item.slots : (item?.items || [])).filter(Boolean);
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.slots)) {
    return payload.slots;
  }

  return [];
}

function buildCalendarLookup(calendar) {
  const holidayMap = new Map();
  const optionalMap = new Map();

  const normalize = (val) => {
    const date = parseDateKey(val);
    return date ? formatDateKey(date) : null;
  };

  const sundaySet = new Set(
    (calendar?.sundays || [])
      .map(normalize)
      .filter(Boolean)
  );

  (calendar?.holidays || []).forEach((holiday) => {
    const key = normalize(holiday?.date);
    if (key) holidayMap.set(key, holiday);
  });

  (calendar?.optional_holidays || []).forEach((holiday) => {
    const key = normalize(holiday?.date);
    if (key) optionalMap.set(key, holiday);
  });

  return { holidayMap, optionalMap, sundaySet };
}

function getDaySlots(slots, weekday) {
  const normalized = normalizeWeekday(weekday);
  if (!normalized) return [];
  return (slots || [])
    .filter((slot) => normalizeWeekday(slot?.day) === normalized)
    .sort((left, right) => {
      const leftStart = toMinutes(left?.start_time);
      const rightStart = toMinutes(right?.start_time);
      return (Number.isFinite(leftStart) ? leftStart : 0) - (Number.isFinite(rightStart) ? rightStart : 0);
    });
}

function getUpcomingSlots(slots, now) {
  const validSlots = (slots || []).filter(s => s.paper_name && s.paper_name.toLowerCase() !== 'no classes');
  const currentDay = WEEKDAY_NAMES[now.getDay()];
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  
  const upcoming = [];
  
  const todaySlots = getDaySlots(validSlots, currentDay);
  const upcomingToday = todaySlots.filter((slot) => {
    const startMinutes = toMinutes(slot?.start_time);
    return Number.isFinite(startMinutes) && startMinutes >= currentMinutes;
  });
  
  upcoming.push(...upcomingToday.map(slot => ({ ...slot, day_label: currentDay, is_today: true })));
  
  for (let offset = 1; offset <= 7; offset += 1) {
    if (upcoming.length >= 3) break;
    const day = WEEKDAY_NAMES[(now.getDay() + offset) % 7];
    const daySlots = getDaySlots(validSlots, day);
    upcoming.push(...daySlots.map(slot => ({ ...slot, day_label: day, is_today: false })));
  }
  
  return upcoming.slice(0, 3);
}

const TODAY_KEY = formatDateKey(new Date());

function CalendarMonth({ year, month, calendarLookup, slots, onSelectDate, selectedDateKey, showHeader = true, todosStore = {} }) {
  const cells = getMonthDays(year, month);
  const monthLabel = MONTH_NAMES[month];

  return (
    <motion.section whileHover={{ y: -2 }} className="glass-card ac-month-card" style={{ padding: 12, minWidth: 0 }}>
      {showHeader ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h4 style={{ fontSize: '0.92rem', fontWeight: 800 }}>{monthLabel}</h4>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{year}</span>
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginBottom: 6, fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <div key={`${day}-${index}`} style={{ textAlign: 'center' }}>{day}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {cells.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} style={{ aspectRatio: '1 / 1', borderRadius: 8, background: 'transparent' }} />;
          }

          const key = formatDateKey(date);
          const isSunday = calendarLookup.sundaySet.has(key);
          const holiday = calendarLookup.holidayMap.get(key);
          const optionalHoliday = calendarLookup.optionalMap.get(key);
          const weekdaySlots = getDaySlots(slots, WEEKDAY_NAMES[date.getDay()]);
          const hasSlots = weekdaySlots.length > 0;
          const isSelected = key === selectedDateKey;
          const dayTodos = todosStore[key] || [];
          const hasPendingTodos = dayTodos.some(t => !t.completed);
          const allTodosCompleted = dayTodos.length > 0 && dayTodos.every(t => t.completed);
          const tooltip = holiday
            ? `Holiday: ${holiday.label}`
            : optionalHoliday
              ? `Optional holiday: ${optionalHoliday.label}`
              : isSunday
                ? 'Sunday'
                : hasSlots
                  ? `${weekdaySlots.length} classes scheduled`
                  : 'No classes scheduled';

          const isToday = key === TODAY_KEY;
          return (
            <button
              key={key}
              type="button"
              title={tooltip}
              onClick={() => onSelectDate(date)}
              className={`ac-day-cell${isToday ? ' ac-day-today' : ''}`}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                borderRadius: 10,
                border: isSelected
                  ? '2px solid var(--accent-cyan)'
                  : isToday
                    ? '2px solid var(--accent-cyan)'
                    : holiday || isSunday
                      ? '1px solid var(--calendar-holiday-border)'
                      : optionalHoliday
                        ? '1px solid var(--calendar-optional-border)'
                        : hasSlots
                          ? '1px solid rgba(34, 211, 238, 0.18)'
                          : '1px solid var(--calendar-day-border-default)',
                background: isSelected
                  ? 'rgba(34, 211, 238, 0.18)'
                  : isToday
                    ? 'rgba(34, 211, 238, 0.12)'
                    : holiday || isSunday
                      ? 'var(--calendar-holiday-bg)'
                      : optionalHoliday
                        ? 'var(--calendar-optional-bg)'
                        : hasSlots
                          ? 'rgba(34, 211, 238, 0.06)'
                          : 'var(--calendar-day-default-bg)',
                color: holiday || isSunday
                  ? 'var(--calendar-holiday-text)'
                  : optionalHoliday
                    ? 'var(--calendar-optional-text)'
                    : isToday
                      ? 'var(--accent-cyan)'
                      : 'var(--text-primary)',
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '0.82rem', fontWeight: isToday ? 900 : 700, lineHeight: 1 }}>{date.getDate()}</span>
              {isToday && <span style={{ fontSize: '0.42rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--accent-cyan)', lineHeight: 1, marginTop: 2 }}>TODAY</span>}
              {hasPendingTodos && <div style={{ position: 'absolute', bottom: 3, right: 3, width: 5, height: 5, borderRadius: '50%', background: '#fbbf24' }} />}
              {allTodosCompleted && <HiOutlineCheck style={{ position: 'absolute', bottom: 2, right: 2, color: '#10b981' }} size={10} strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}

export default function AcademicCalendarPanel({ scopeDepartmentName = '', compact = false }) {
  const { isLecturer, isStudent, departmentName, user, isAnyAdmin } = useAuth();
  const canUseTodos = isLecturer || isStudent || (isAnyAdmin && compact);
  
  const [calendar, setCalendar] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [showModal, setShowModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [showTodos, setShowTodos] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [todosStore, setTodosStore] = useState({});
  const storageUserKey = user?._id || user?.email || 'guest';

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`ac_todos_${storageUserKey}`);
      if (saved) setTodosStore(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [storageUserKey]);

  const saveTodos = (newStore) => {
    setTodosStore(newStore);
    try {
      localStorage.setItem(`ac_todos_${storageUserKey}`, JSON.stringify(newStore));
    } catch { /* ignore */ }
  };

  const resolvedDepartmentName = scopeDepartmentName || departmentName || '';
  const canViewSchedules = isLecturer || isStudent;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    const calendarRequest = api.get('/calendar/current');
    const timetableRequest = isLecturer
      ? api.get('/timetable/lecturer/my')
      : isStudent
        ? api.get('/timetable/student/my')
        : Promise.resolve({ data: { items: [] } });

    Promise.all([calendarRequest, timetableRequest])
      .then(([calendarRes, timetableRes]) => {
        if (!active) return;
        setCalendar(calendarRes.data?.calendar || null);
        setSlots(canViewSchedules ? normalizeTimetableItems(timetableRes.data) : []);
      })
      .catch((err) => {
        if (!active) return;
        setCalendar(null);
        setSlots([]);
        setError(err?.response?.data?.error || 'Unable to load academic calendar.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canViewSchedules, isLecturer, isStudent]);

  const lookup = useMemo(() => buildCalendarLookup(calendar), [calendar]);
  const year = Number(calendar?.year) || now.getFullYear();
  const upcomingSlots = useMemo(() => getUpcomingSlots(slots, now), [slots, now]);
  const selectedWeekday = WEEKDAY_NAMES[selectedDate.getDay()];
  const selectedDaySlots = useMemo(() => getDaySlots(slots, selectedWeekday), [slots, selectedWeekday]);
  const selectedDateKey = formatDateKey(selectedDate);
  const selectedDateKeyData = selectedDateKey;
  const selectedHoliday = lookup.holidayMap.get(selectedDateKeyData);
  const selectedOptionalHoliday = lookup.optionalMap.get(selectedDateKeyData);
  const selectedIsSunday = lookup.sundaySet.has(selectedDateKeyData);
  const selectedMonthLabel = MONTH_NAMES[viewMonth];

  const currentTodos = todosStore[selectedDateKey] || [];

  const handleAddTodo = (e) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;
    const newTodo = { id: Date.now().toString(), text: newTodoText.trim(), completed: false };
    saveTodos({ ...todosStore, [selectedDateKey]: [...currentTodos, newTodo] });
    setNewTodoText('');
  };

  const handleToggleTodo = (id) => {
    const updated = currentTodos.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    saveTodos({ ...todosStore, [selectedDateKey]: updated });
  };

  const handleDeleteTodo = (id) => {
    const updated = currentTodos.filter(t => t.id !== id);
    saveTodos({ ...todosStore, [selectedDateKey]: updated });
  };

  const handleMoveTodo = (id, direction) => {
    const idx = currentTodos.findIndex(t => t.id === id);
    if (idx < 0) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === currentTodos.length - 1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...currentTodos];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    saveTodos({ ...todosStore, [selectedDateKey]: updated });
  };

  const handleUpdateTodoText = (id, newText) => {
    const updated = currentTodos.map(t => t.id === id ? { ...t, text: newText } : t);
    saveTodos({ ...todosStore, [selectedDateKey]: updated });
  };

  const monthEvents = useMemo(() => {
    const rawEvents = [];

    (calendar?.holidays || []).forEach((holiday) => {
      const date = parseDateKey(holiday?.date);
      if (!date || date.getFullYear() !== year || date.getMonth() !== viewMonth) return;
      rawEvents.push({ date, label: holiday?.label || 'Holiday', type: 'regular' });
    });

    (calendar?.optional_holidays || []).forEach((holiday) => {
      const date = parseDateKey(holiday?.date);
      if (!date || date.getFullYear() !== year || date.getMonth() !== viewMonth) return;
      rawEvents.push({ date, label: holiday?.label || 'Optional Holiday', type: 'optional' });
    });

    rawEvents.sort((a, b) => a.date - b.date);

    const grouped = [];
    rawEvents.forEach((event) => {
      const last = grouped[grouped.length - 1];
      if (last && last.label === event.label && last.type === event.type) {
        const nextDay = new Date(last.endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        if (nextDay.toDateString() === event.date.toDateString()) {
          last.endDate = new Date(event.date);
          return;
        }
      }
      grouped.push({
        startDate: new Date(event.date),
        endDate: new Date(event.date),
        label: event.label,
        type: event.type,
      });
    });

    return grouped;
  }, [calendar, year, viewMonth]);

  const calendarExportRef = useRef(null);
  const holidayExportRef = useRef(null);

  const allYearGroupedEvents = useMemo(() => {
    const rawEvents = [];
    (calendar?.holidays || []).forEach((h) => {
      const d = parseDateKey(h.date);
      if (d) rawEvents.push({ date: d, label: h.label || 'Holiday', type: 'regular' });
    });
    (calendar?.optional_holidays || []).forEach((h) => {
      const d = parseDateKey(h.date);
      if (d) rawEvents.push({ date: d, label: h.label || 'Optional', type: 'optional' });
    });
    rawEvents.sort((a, b) => a.date - b.date);

    const grouped = [];
    rawEvents.forEach((event) => {
      const last = grouped[grouped.length - 1];
      if (last && last.label === event.label && last.type === event.type) {
        const nextDay = new Date(last.endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        if (nextDay.toDateString() === event.date.toDateString()) {
          last.endDate = new Date(event.date);
          return;
        }
      }
      grouped.push({
        startDate: new Date(event.date),
        endDate: new Date(event.date),
        label: event.label,
        type: event.type,
      });
    });
    return grouped;
  }, [calendar]);

  const handleExport = async () => {
    if (!calendar) return;
    setExporting(true);
    try {
      const popup = window.open('', '_blank', 'width=1200,height=900');
      if (!popup) { toast.error('Please allow popups to export PDF'); return; }

      const holidays = calendar?.holidays || [];
      const optionalHolidays = calendar?.optional_holidays || [];

      // Build compact month grids
      let monthsHtml = '';
      for (let m = 0; m < 12; m++) {
        const cells = getMonthDays(year, m);
        while (cells.length < 42) cells.push(null);

        let dayCells = '';
        for (const date of cells) {
          if (!date) {
            dayCells += '<div style="height:18px;"></div>';
            continue;
          }
          const key = formatDateKey(date);
          const isSunday = lookup.sundaySet.has(key);
          const holiday = lookup.holidayMap.get(key);
          const optionalH = lookup.optionalMap.get(key);
          let bg = '#f8fafc', border = '#e2e8f0', color = '#1e293b', fw = 400;
          if (holiday || isSunday) { bg = '#fef2f2'; border = '#fca5a5'; color = '#dc2626'; fw = 700; }
          else if (optionalH) { bg = '#fffbeb'; border = '#fcd34d'; color = '#b45309'; fw = 700; }
          else if (date.getDay() === 0) { color = '#dc2626'; }
          dayCells += `<div style="height:18px;display:flex;align-items:center;justify-content:center;border-radius:2px;border:1px solid ${border};background:${bg};font-size:7px;font-weight:${fw};color:${color};">${date.getDate()}</div>`;
        }

        monthsHtml += `<div style="background:#fff;padding:4px 5px;border:1px solid #e2e8f0;">
          <div style="font-size:8px;font-weight:800;color:#1e3a5f;border-bottom:1px solid #1e3a5f;padding-bottom:2px;margin-bottom:2px;">${MONTH_NAMES[m].toUpperCase().slice(0, 3)} ${year}</div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:1px;">
            ${['S','M','T','W','T','F','S'].map((d, i) => `<div style="text-align:center;font-size:6px;font-weight:700;color:${i === 0 ? '#dc2626' : '#94a3b8'};">${d}</div>`).join('')}
          </div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;">${dayCells}</div>
        </div>`;
      }


      // Build holiday list — group consecutive same-label holidays into ranges
      const rawItems = [
        ...holidays.map((h) => ({ ...h, htype: 'Regular' })),
        ...optionalHolidays.map((h) => ({ ...h, htype: 'Optional' })),
      ].map((h) => {
        const d = parseDateKey(h.date);
        return d ? { ...h, _date: d } : null;
      }).filter(Boolean).sort((a, b) => a._date - b._date);

      // Group consecutive days with same label+type
      const grouped = [];
      for (const item of rawItems) {
        const last = grouped[grouped.length - 1];
        if (last && last.label === item.label && last.htype === item.htype) {
          const nextDay = new Date(last.endDate);
          nextDay.setDate(nextDay.getDate() + 1);
          if (nextDay.toDateString() === item._date.toDateString()) {
            last.endDate = new Date(item._date);
            continue;
          }
        }
        grouped.push({
          startDate: new Date(item._date),
          endDate: new Date(item._date),
          label: item.label || 'Holiday',
          htype: item.htype,
        });
      }

      const mid = Math.ceil(grouped.length / 2);
      const col1 = grouped.slice(0, mid);
      const col2 = grouped.slice(mid);

      const fmtDate = (d) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
      const buildColRows = (items) => items.map((h, i) => {
        const isRange = h.startDate.getTime() !== h.endDate.getTime();
        const dateStr = isRange ? `${fmtDate(h.startDate)} - ${fmtDate(h.endDate)}` : fmtDate(h.startDate);
        const isOpt = h.htype === 'Optional';
        return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
          <td style="padding:2px 4px;border:1px solid #e2e8f0;font-size:8px;font-weight:600;white-space:nowrap;">${dateStr}</td>
          <td style="padding:2px 4px;border:1px solid #e2e8f0;font-size:8px;">${h.label}</td>
          <td style="padding:2px 4px;border:1px solid #e2e8f0;font-size:7px;text-align:center;color:${isOpt ? '#b45309' : '#dc2626'};font-weight:700;">${h.htype}</td>
        </tr>`;
      }).join('');

      const colHeader = `<tr><th style="padding:3px 4px;background:#e5e7eb;border:1px solid #d1d5db;font-size:8px;font-weight:700;">Date</th><th style="padding:3px 4px;background:#e5e7eb;border:1px solid #d1d5db;font-size:8px;font-weight:700;">Holiday / Event</th><th style="padding:3px 4px;background:#e5e7eb;border:1px solid #d1d5db;font-size:8px;font-weight:700;text-align:center;">Type</th></tr>`;

      const title = calendar?.title || `Academic Calendar ${year}`;
      const genDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

      const html = `<!doctype html>
<html>
<head>
<title>${title}</title>
<style>
  @page { size: landscape; margin: 6mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; }
  .page { page-break-after: always; padding: 8px 10px; }
  .page:last-child { page-break-after: auto; }
  table { width: 100%; border-collapse: collapse; }
</style>
</head>
<body>
  <!-- Page 1: Calendar Grid -->
  <div class="page">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
      <div>
        <div style="font-size:14px;font-weight:800;">${title}</div>
        <div style="font-size:9px;color:#4b5563;">Holiday Schedule - ${year}</div>
      </div>
      <div style="font-size:8px;color:#94a3b8;">Generated ${genDate}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;">
      ${monthsHtml}
    </div>
    <div style="display:flex;gap:16px;margin-top:4px;font-size:8px;color:#475569;">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#fef2f2;border:1px solid #fca5a5;vertical-align:middle;margin-right:3px;"></span>Holiday</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#fffbeb;border:1px solid #fcd34d;vertical-align:middle;margin-right:3px;"></span>Optional</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f8fafc;border:1px solid #e2e8f0;vertical-align:middle;margin-right:3px;"></span>Working</span>
    </div>
  </div>

  <!-- Page 2: Holiday List (2-column) -->
  <div class="page">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
      <div>
        <div style="font-size:14px;font-weight:800;">${title}</div>
        <div style="font-size:9px;color:#4b5563;">Complete Holiday List - ${year} (${holidays.length} Regular, ${optionalHolidays.length} Optional)</div>
      </div>
      <div style="font-size:8px;color:#94a3b8;">Generated ${genDate}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <table>${colHeader}${buildColRows(col1)}</table>
      <table>${colHeader}${buildColRows(col2)}</table>
    </div>
  </div>
</body>
</html>`;

      popup.document.open();
      popup.document.write(html);
      popup.document.close();

      await new Promise((resolve) => setTimeout(resolve, 200));
      popup.focus();
      popup.print();
      toast.success('Calendar print preview opened');
    } catch (err) {
      console.error('Export failed', err);
      toast.error(err?.message ? `Failed to export PDF: ${err.message}` : 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const summaryCards = [
    { label: 'Published year', value: year, icon: HiOutlineCalendar },
    { label: 'Holidays', value: (calendar?.holidays || []).length, icon: HiOutlineClipboardList },
    { label: 'Optional', value: (calendar?.optional_holidays || []).length, icon: HiOutlineSparkles },
    { label: 'Live time', value: formatLocalTime(now), icon: HiOutlineClock },
  ];

  if (loading && !calendar) {
    return <StatePanel variant="loading" title="Loading academic calendar" description={canViewSchedules ? 'Fetching the published calendar and your timetable.' : 'Fetching the published holiday calendar.'} compact />;
  }

  if (error && !calendar) {
    return <StatePanel variant="error" title="Academic calendar unavailable" description={error} compact />;
  }

  return (
    <section className="glass-card academic-calendar-panel" style={{ padding: compact ? 14 : 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <HiOutlineSparkles size={18} style={{ color: 'var(--accent-cyan)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>{calendar?.title || 'Academic Calendar'}</h3>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {canViewSchedules
              ? (resolvedDepartmentName ? `Scope: ${resolvedDepartmentName}` : 'Personalized academic schedule view')
              : 'Institution-wide academic holiday calendar'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', flexShrink: 0, textAlign: 'right' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            onClick={handleExport}
            disabled={exporting || loading || !calendar}
          >
            <HiOutlineDownload size={16} /> {exporting ? 'Exporting...' : 'Export PDF'}
          </button>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Live clock</p>
            <p style={{ fontSize: '1rem', fontWeight: 800 }}>{formatLocalTime(now)}</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatLocalDate(now)}</p>
          </div>
        </div>
      </div>

      {/* Hidden Export Templates */}
      <div data-export-wrapper style={{ position: 'absolute', left: '-9999px', top: '-9999px', overflow: 'hidden' }}>
        {/* ── PAGE 1: Calendar Grid (A3 landscape @ 96dpi = 1587px) ── */}
        <div ref={calendarExportRef} style={{
          width: 1587,
          background: '#ffffff',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>
          {/* Header bar */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%)',
            padding: '28px 48px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: '26pt', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {calendar?.title || `Academic Calendar ${year}`}
              </div>
              <div style={{ fontSize: '11pt', color: 'rgba(255,255,255,0.7)', marginTop: 4, fontWeight: 400 }}>
                Institution-wide Holiday Schedule — {year}
              </div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 12,
              padding: '10px 20px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '28pt', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>{year}</div>
              <div style={{ fontSize: '8pt', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Academic Year</div>
            </div>
          </div>

          {/* 4×3 month grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 0,
            background: '#e8edf2',
          }}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((m) => {
              const cells = getMonthDays(year, m);
              // Pad to 42 cells (6 rows) for consistent height
              while (cells.length < 42) cells.push(null);
              const CELL_H = 35;

              return (
                <div key={m} style={{
                  background: '#ffffff',
                  margin: 1,
                  padding: '14px 14px 12px',
                  boxSizing: 'border-box',
                }}>
                  {/* Month header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    paddingBottom: 6,
                    borderBottom: '2px solid #1e3a5f',
                  }}>
                    <span style={{ fontSize: '10pt', fontWeight: 800, color: '#1e3a5f', letterSpacing: '0.02em' }}>
                      {MONTH_NAMES[m].toUpperCase()}
                    </span>
                    <span style={{ fontSize: '7.5pt', color: '#94a3b8', fontWeight: 600 }}>{year}</span>
                  </div>

                  {/* Weekday headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 3 }}>
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
                      <div key={`${d}-${i}`} style={{
                        height: 25, // Keep weekday header compact
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        fontSize: '6.5pt',
                        fontWeight: 700,
                        color: i === 0 ? '#dc2626' : '#64748b',
                        letterSpacing: '0.04em',
                      }}>{d}</div>
                    ))}
                  </div>

                  {/* Day cells */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                    {cells.map((date, idx) => {
                      if (!date) {
                        return <div key={`empty-${idx}`} style={{ height: CELL_H, background: 'transparent' }} />;
                      }

                      const key = formatDateKey(date);
                      const isSunday = lookup.sundaySet.has(key);
                      const holiday = lookup.holidayMap.get(key);
                      const optionalHoliday = lookup.optionalMap.get(key);

                      let bg = '#f8fafc';
                      let borderColor = '#e2e8f0';
                      let textColor = date.getDay() === 0 ? '#dc2626' : '#1e293b';
                      let fw = 500;

                      if (holiday || isSunday) {
                        bg = '#fef2f2';
                        borderColor = '#fca5a5';
                        textColor = '#dc2626';
                        fw = 700;
                      } else if (optionalHoliday) {
                        bg = '#fffbeb';
                        borderColor = '#fcd34d';
                        textColor = '#b45309';
                        fw = 700;
                      }

                      return (
                        <div key={key} style={{
                          height: CELL_H,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          borderRadius: 3,
                          border: `1px solid ${borderColor}`,
                          background: bg,
                          overflow: 'hidden',
                          fontSize: '7.5pt',
                          fontWeight: fw,
                          color: textColor,
                          boxSizing: 'border-box',
                        }}>{date.getDate()}</div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '12px 48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
              {[
                { bg: '#fef2f2', border: '#fca5a5', label: 'Regular Holiday' },
                { bg: '#fffbeb', border: '#fcd34d', label: 'Optional Holiday' },
                { bg: '#f8fafc', border: '#e2e8f0', label: 'Working Day' },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: item.bg, border: `1.5px solid ${item.border}`, flexShrink: 0 }} />
                  <span style={{ fontSize: '8pt', fontWeight: 600, color: '#475569' }}>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '7.5pt', color: '#94a3b8' }}>
              Generated on {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* ── PAGE 2: Holiday List ── */}
        <div ref={holidayExportRef} style={{
          width: 1587,
          background: '#ffffff',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>
          {/* Header bar */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%)',
            padding: '28px 48px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: '26pt', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {calendar?.title || `Academic Calendar ${year}`}
              </div>
              <div style={{ fontSize: '11pt', color: 'rgba(255,255,255,0.7)', marginTop: 4, fontWeight: 400 }}>
                Complete Holiday List — {year}
              </div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 12,
              padding: '10px 20px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '22pt', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>
                {allYearGroupedEvents.length}
              </div>
              <div style={{ fontSize: '8pt', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Total Events</div>
            </div>
          </div>

          {/* Holiday table */}
          <div style={{ padding: '24px 48px 32px' }}>
            {/* 3-column split */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 32px' }}>
              {[0, 1, 2].map((col) => {
                const perCol = Math.ceil(allYearGroupedEvents.length / 3);
                const colEvents = allYearGroupedEvents.slice(col * perCol, (col + 1) * perCol);
                return (
                  <div key={col}>
                    {/* Column header */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 68px',
                      gap: '4px 12px',
                      padding: '8px 10px',
                      background: '#1e3a5f',
                      borderRadius: '6px 6px 0 0',
                    }}>
                      {['Date', 'Holiday / Event', 'Type'].map((h, i) => (
                        <span key={h} style={{ fontSize: '7.5pt', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: i === 2 ? 'center' : 'left' }}>{h}</span>
                      ))}
                    </div>
                    {colEvents.map((event, idx) => (
                      <div key={idx} style={{
                        display: 'grid',
                        gridTemplateColumns: '110px 1fr 68px',
                        gap: '4px 12px',
                        alignItems: 'center',
                        padding: '7px 10px',
                        borderBottom: '1px solid #f1f5f9',
                        background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      }}>
                        <span style={{ fontSize: '8.5pt', fontWeight: 700, color: '#1e3a5f' }}>
                          {event.startDate.getDate()} {MONTH_NAMES[event.startDate.getMonth()].slice(0, 3)}
                          {event.startDate.getTime() !== event.endDate.getTime()
                            ? ` – ${event.endDate.getDate()} ${MONTH_NAMES[event.endDate.getMonth()].slice(0, 3)}`
                            : ''}
                        </span>
                        <span style={{ fontSize: '8.5pt', fontWeight: 500, color: '#334155' }}>{event.label}</span>
                        <div style={{
                          height: 30,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '7pt',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: event.type === 'optional' ? '#b45309' : '#dc2626',
                          background: event.type === 'optional' ? '#fffbeb' : '#fef2f2',
                          border: `1px solid ${event.type === 'optional' ? '#fcd34d' : '#fca5a5'}`,
                          borderRadius: 4,
                          padding: '0 8px',
                        }}>
                          {event.type === 'optional' ? 'Optional' : 'Regular'}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '10px 48px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', gap: 24 }}>
              {[
                { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: `Regular Holidays: ${(calendar?.holidays || []).length}` },
                { color: '#b45309', bg: '#fffbeb', border: '#fcd34d', label: `Optional Holidays: ${(calendar?.optional_holidays || []).length}` },
              ].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: item.bg, border: `1.5px solid ${item.border}` }} />
                  <span style={{ fontSize: '8pt', color: item.color, fontWeight: 700 }}>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '7.5pt', color: '#94a3b8' }}>
              Generated on {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      <div className="ac-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {summaryCards.map((item) => (
          <div key={item.label} className="ac-stat-pill">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>{item.label}</p>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(34,211,238,0.08)', display: 'grid', placeItems: 'center' }}>
                <item.icon size={15} style={{ color: 'var(--accent-cyan)' }} />
              </div>
            </div>
            <p style={{ fontSize: '1.05rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="ac-side-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
        {canViewSchedules ? (
          <div className="glass-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(16,185,129,0.1)', display: 'grid', placeItems: 'center' }}>
                <HiOutlineClock size={16} style={{ color: 'var(--accent-emerald)' }} />
              </div>
              <h4 style={{ fontSize: '0.92rem', fontWeight: 800 }}>Upcoming Classes</h4>
            </div>
            {upcomingSlots.filter(s => s.paper_name && s.paper_name.toLowerCase() !== 'no classes').length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 0' }}>No upcoming classes in your schedule.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcomingSlots.filter(s => s.paper_name && s.paper_name.toLowerCase() !== 'no classes').map((slot, index) => (
                  <div key={`${slot.day_label}-${slot.start_time}-${slot.paper_id || index}`} className={`ac-upcoming-chip${slot.is_today ? ' is-today' : ''}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="badge badge-info" style={{ fontSize: '0.62rem' }}>{slot.day_label}</span>
                        {slot.is_today && <span className="badge badge-success" style={{ fontSize: '0.58rem' }}>Today</span>}
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-cyan)', fontVariantNumeric: 'tabular-nums' }}>{slot.start_time} – {slot.end_time}</span>
                    </div>
                    <p style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: 2 }}>{slot.paper_code} · {slot.paper_name}</p>
                    {slot.location && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>📍 {slot.location}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="glass-card ac-calendar-board" style={{ padding: 12 }}>
        <div className="ac-month-nav" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setViewMonth((prev) => (prev === 0 ? 11 : prev - 1))}
            >
              <HiOutlineChevronLeft size={16} /> Previous
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setViewMonth((prev) => (prev === 11 ? 0 : prev + 1))}
            >
              Next <HiOutlineChevronRight size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="calendar-month-select" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Select Month</label>
            <select
              id="calendar-month-select"
              className="input-field"
              style={{ minWidth: 150 }}
              value={String(viewMonth)}
              onChange={(e) => setViewMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={String(index)}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="ac-board-metrics" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
          {[{ label: 'Month', value: selectedMonthLabel }, { label: 'Holiday Days', value: monthEvents.reduce((sum, ev) => sum + Math.round((ev.endDate - ev.startDate) / 86400000) + 1, 0) }, { label: 'Year', value: year }].map(({ label, value }) => (
            <div key={label} style={{ paddingRight: 16, borderRight: '1px solid var(--border-glass)' }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</p>
              <p style={{ fontWeight: 800, fontSize: '0.95rem' }}>{value}</p>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: '0.7rem', color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
            {[{ color: 'var(--calendar-holiday-text)', label: 'Holiday' }, { color: 'var(--calendar-optional-text)', label: 'Optional' }, { color: 'var(--accent-cyan)', label: 'Has Class' }].map(({ color, label }) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="ac-legend-dot" style={{ background: color }} />{label}</span>
            ))}
          </div>
        </div>

        <CalendarMonth
          year={year}
          month={viewMonth}
          calendarLookup={lookup}
          slots={slots}
          showHeader={false}
          todosStore={todosStore}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setShowModal(true);
          }}
          selectedDateKey={selectedDateKey}
        />

        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-glass)', paddingTop: 12 }}>
          <h4 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)' }}>📅 Events in {selectedMonthLabel} {year}</h4>
          {monthEvents.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 0' }}>No holidays published for this month.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {monthEvents.map((event, index) => (
                <div key={`${event.label}-${index}`} className="ac-event-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: event.type === 'optional' ? 'var(--calendar-optional-text)' : 'var(--calendar-holiday-text)', flexShrink: 0 }} />
                  <p style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600 }}>{event.label}</p>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {event.startDate.getDate()} {MONTH_NAMES[event.startDate.getMonth()].slice(0,3)}
                    {event.startDate.getTime() !== event.endDate.getTime() ? ` – ${event.endDate.getDate()} ${MONTH_NAMES[event.endDate.getMonth()].slice(0,3)}` : ''}
                  </p>
                  <span className="badge" style={{ fontSize: '0.6rem', background: event.type === 'optional' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)', color: event.type === 'optional' ? '#f59e0b' : '#ef4444', border: `1px solid ${event.type === 'optional' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                    {event.type === 'optional' ? 'Optional' : 'Holiday'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <Modal 
        isOpen={showModal} 
        onClose={() => { setShowModal(false); setShowTodos(false); }} 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>{formatLocalDate(selectedDate)}</span>
            {canUseTodos && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowTodos(true); }}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-glass)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-glass)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title="Edit To-Do List"
              >
                <HiOutlinePencil size={14} />
              </button>
            )}
          </div>
        } 
        width={960}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span
              className="badge badge-info"
              style={selectedIsSunday ? { background: 'rgba(239, 68, 68, 0.12)', color: '#dc2626', border: '1px solid rgba(239, 68, 68, 0.2)' } : undefined}
            >
              {selectedWeekday}
            </span>
            {selectedHoliday ? <span className="badge badge-danger">Holiday: {selectedHoliday.label}</span> : null}
            {selectedOptionalHoliday ? <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' }}>Optional: {selectedOptionalHoliday.label}</span> : null}
            {!selectedHoliday && !selectedOptionalHoliday && !selectedIsSunday ? <span className="badge badge-success">No Holiday</span> : null}
          </div>

          {canUseTodos && currentTodos.length > 0 && (
            <div className="glass-card" style={{ padding: 16 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                {currentTodos.map((todo) => (
                  <div key={todo.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: todo.completed ? 'transparent' : 'var(--bg-glass)',
                    border: '1px solid var(--border-glass)',
                    opacity: todo.completed ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                  }}>
                    <button
                      type="button"
                      onClick={() => handleToggleTodo(todo.id)}
                      style={{
                        width: 22, height: 22, borderRadius: 6,
                        border: `1.5px solid ${todo.completed ? 'var(--accent-cyan)' : 'var(--text-muted)'}`,
                        background: todo.completed ? 'var(--accent-cyan)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      {todo.completed && <HiOutlineCheck size={14} strokeWidth={3} />}
                    </button>
                    <span style={{
                      fontSize: '0.9rem', fontWeight: 500,
                      textDecoration: todo.completed ? 'line-through' : 'none',
                      color: todo.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                    }}>
                      {todo.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canUseTodos && (
            <Modal 
              isOpen={showTodos} 
              onClose={() => setShowTodos(false)} 
              title="Edit Tasks" 
              width={600}
            >
              <div style={{ display: 'grid', gap: 16 }}>
                <form onSubmit={handleAddTodo} style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="What needs to be done?"
                    value={newTodoText}
                    onChange={(e) => setNewTodoText(e.target.value)}
                    className="input-field"
                    style={{ flex: 1, padding: '10px 14px', fontSize: '0.9rem' }}
                  />
                  <button type="submit" className="btn-primary" style={{ padding: '8px 20px', borderRadius: 8 }} disabled={!newTodoText.trim()}>
                    <HiOutlinePlus size={18} /> Add
                  </button>
                </form>

                {currentTodos.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No tasks for this day.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {currentTodos.map((todo, idx) => (
                      <div key={todo.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px',
                        background: 'var(--bg-glass)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: 8,
                      }}>
                        <input 
                          type="text"
                          value={todo.text}
                          onChange={(e) => handleUpdateTodoText(todo.id, e.target.value)}
                          style={{
                            flex: 1, fontSize: '0.85rem', fontWeight: 500,
                            background: 'transparent', border: 'none', color: 'var(--text-primary)',
                            outline: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button type="button" onClick={() => handleMoveTodo(todo.id, 'up')} disabled={idx === 0} style={{ padding: 6, cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--border-glass)' : 'var(--text-muted)', background: 'transparent', border: 'none' }}>
                            <HiOutlineArrowUp size={16} />
                          </button>
                          <button type="button" onClick={() => handleMoveTodo(todo.id, 'down')} disabled={idx === currentTodos.length - 1} style={{ padding: 6, cursor: idx === currentTodos.length - 1 ? 'default' : 'pointer', color: idx === currentTodos.length - 1 ? 'var(--border-glass)' : 'var(--text-muted)', background: 'transparent', border: 'none' }}>
                            <HiOutlineArrowDown size={16} />
                          </button>
                          <div style={{ width: 1, height: 16, background: 'var(--border-glass)', margin: '0 4px' }} />
                          <button type="button" onClick={() => handleDeleteTodo(todo.id)} style={{ padding: 6, cursor: 'pointer', color: '#ef4444', background: 'transparent', border: 'none' }}>
                            <HiOutlineTrash size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Modal>
          )}

          <div className="glass-card" style={{ padding: 16 }}>
            {canViewSchedules && (
              <>
                {selectedHoliday ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No classes today for {selectedHoliday.label}.</p>
                ) : selectedDaySlots.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No scheduled classes for this weekday.</p>
                ) : (
                  <WeeklyTimetableGrid
                    slots={selectedDaySlots}
                    title={`${selectedWeekday} timetable`}
                    emptyMessage="No scheduled classes for this weekday."
                  />
                )}
              </>
            )}
          </div>
        </div>
      </Modal>
    </section>
  );
}
