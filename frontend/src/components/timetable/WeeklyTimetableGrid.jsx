import { Fragment, useMemo } from 'react';
import { HiOutlinePencil } from 'react-icons/hi';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Palette of distinct accent colors that cycle per unique paper
const SUBJECT_PALETTE = [
  { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.25)' },
  { bg: 'rgba(34,211,238,0.10)', color: '#22d3ee', border: 'rgba(34,211,238,0.25)' },
  { bg: 'rgba(16,185,129,0.10)', color: '#34d399', border: 'rgba(16,185,129,0.25)' },
  { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.25)' },
  { bg: 'rgba(244,63,94,0.10)', color: '#fb7185', border: 'rgba(244,63,94,0.25)' },
  { bg: 'rgba(59,130,246,0.10)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  { bg: 'rgba(236,72,153,0.10)', color: '#f472b6', border: 'rgba(236,72,153,0.25)' },
  { bg: 'rgba(20,184,166,0.10)', color: '#2dd4bf', border: 'rgba(20,184,166,0.25)' },
];

const TODAY_INDEX = (new Date().getDay() + 6) % 7; // Mon=0 … Sat=5

function toMinutes(value) {
  const text = String(value || '').trim();
  if (!text.includes(':')) return Number.NaN;
  const [hh, mm] = text.split(':');
  const hours = Number(hh);
  const mins = Number(mm);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return Number.NaN;
  return (hours * 60) + mins;
}

function toHhmm(totalMinutes) {
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function to12h(hhmm) {
  const [hh, mm] = String(hhmm).split(':');
  const h = Number(hh);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${suffix}`;
}

function overlaps(start, end, blockStart, blockEnd) {
  return start < blockEnd && end > blockStart;
}

function slotLabel(slot) {
  const paperCode = slot.paper_code ? `${slot.paper_code} - ` : '';
  const paperName = slot.paper_name || 'No Classes';
  const lecturer = slot.lecturer_name ? `\n${slot.lecturer_name}` : '';
  const location = slot.location ? `\n${slot.location}` : '';
  return `${paperCode}${paperName}${lecturer}${location}`;
}

export default function WeeklyTimetableGrid({
  slots = [],
  title = 'Weekly Timetable',
  emptyMessage = 'No timetable slots available.',
  recessStartTime = '',
  recessEndTime = '',
  editable = false,
  onEditSlot,
  classDurationMinutes,
  classStartTime,
  classEndTime,
}) {
  const recessText = recessStartTime && recessEndTime
    ? `${to12h(recessStartTime)} – ${to12h(recessEndTime)}`
    : 'Not Set';

  const recessRange = useMemo(() => {
    const start = toMinutes(recessStartTime);
    const end = toMinutes(recessEndTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return { start, end };
  }, [recessStartTime, recessEndTime]);

  const normalized = useMemo(() => {
    return (Array.isArray(slots) ? slots : []).map((slot) => ({
      ...slot,
      day: String(slot.day || '').trim(),
      start_time: String(slot.start_time || ''),
      end_time: String(slot.end_time || ''),
      start_minutes: Number.isFinite(Number(slot.start_minutes))
        ? Number(slot.start_minutes)
        : toMinutes(slot.start_time),
    }));
  }, [slots]);

  const daySet = useMemo(() => {
    const available = new Set(normalized.map((slot) => slot.day).filter(Boolean));
    const known = WEEKDAYS.filter((day) => available.has(day));
    const extra = [...available].filter((day) => !WEEKDAYS.includes(day)).sort();
    if (!available.size) return WEEKDAYS;
    if (!known.length && extra.length) return extra;
    return [...known, ...extra];
  }, [normalized]);

  // Build a color map: paper_id → palette entry
  const paperColorMap = useMemo(() => {
    const ids = [...new Set(normalized.map(s => s.paper_id).filter(Boolean))];
    const map = new Map();
    ids.forEach((id, i) => map.set(id, SUBJECT_PALETTE[i % SUBJECT_PALETTE.length]));
    return map;
  }, [normalized]);

  const timeRows = useMemo(() => {
    const duration = Number(classDurationMinutes);
    const start = toMinutes(classStartTime);
    const end = toMinutes(classEndTime);

    if (Number.isFinite(duration) && duration > 0 && Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const rows = [];
      let pointer = start;
      while (pointer + duration <= end) {
        const slotStart = pointer;
        const slotEnd = pointer + duration;
        if (recessRange && overlaps(slotStart, slotEnd, recessRange.start, recessRange.end)) {
          pointer = Math.max(pointer + 1, recessRange.end);
          continue;
        }
        rows.push({
          key: `${toHhmm(slotStart)}-${toHhmm(slotEnd)}`,
          start_time: toHhmm(slotStart),
          end_time: toHhmm(slotEnd),
          start_minutes: slotStart,
        });
        pointer += duration;
      }
      if (rows.length) return rows;
    }

    const unique = new Map();
    normalized.forEach((slot) => {
      const key = `${slot.start_time}-${slot.end_time}`;
      if (!unique.has(key)) {
        unique.set(key, {
          key,
          start_time: slot.start_time,
          end_time: slot.end_time,
          start_minutes: Number.isFinite(slot.start_minutes) ? slot.start_minutes : Number.MAX_SAFE_INTEGER,
        });
      }
    });
    return [...unique.values()].sort((a, b) => a.start_minutes - b.start_minutes);
  }, [normalized, classDurationMinutes, classStartTime, classEndTime, recessRange]);

  const slotMap = useMemo(() => {
    const map = new Map();
    normalized.forEach((slot) => {
      const rowKey = `${slot.start_time}-${slot.end_time}`;
      const key = `${slot.day}|${rowKey}`;
      map.set(key, slot);
    });
    return map;
  }, [normalized]);

  const recessInsertIndex = useMemo(() => {
    if (!recessRange) return -1;
    const idx = timeRows.findIndex((row) => Number.isFinite(row.start_minutes) && row.start_minutes >= recessRange.end);
    return idx === -1 ? timeRows.length : idx;
  }, [timeRows, recessRange]);

  const hasRecessColumn = recessInsertIndex >= 0;

  if (timeRows.length === 0) {
    return (
      <div className="glass-card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8 }}>{title}</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }}>
      {/* Header bar */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>{title}</h3>
        {recessStartTime && recessEndTime && (
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-amber)', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', padding: '3px 10px', borderRadius: 999 }}>
            ☕ Recess {recessText}
          </span>
        )}
      </div>

      <div className="timetable-grid-scroll" style={{ borderRadius: 0 }}>
        <table className="data-table timetable-grid-table timetable-sketch-table">
          <thead>
            <tr>
              <th style={{ minWidth: 100 }}>Day</th>
              {timeRows.map((row, idx) => (
                <Fragment key={row.key}>
                  {hasRecessColumn && idx === recessInsertIndex ? (
                    <th className="timetable-recess-header">☕ Break</th>
                  ) : null}
                  <th style={{ whiteSpace: 'nowrap', minWidth: 110 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700 }}>{to12h(row.start_time)}</div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 400, color: 'var(--text-muted)', marginTop: 1 }}>to {to12h(row.end_time)}</div>
                  </th>
                </Fragment>
              ))}
              {hasRecessColumn && recessInsertIndex === timeRows.length ? (
                <th className="timetable-recess-header">☕ Break</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {daySet.map((day, dayIdx) => {
              const todayName = WEEKDAYS[TODAY_INDEX];
              const isToday = day === todayName;
              return (
                <tr key={day}>
                  <td
                    className="timetable-day-cell"
                    style={{
                      color: isToday ? 'var(--accent-purple)' : undefined,
                      background: isToday ? 'rgba(139,92,246,0.06)' : undefined,
                    }}
                  >
                    {day.slice(0, 3).toUpperCase()}
                    {isToday && (
                      <span style={{ display: 'block', fontSize: '0.58rem', fontWeight: 500, color: 'var(--accent-purple)', marginTop: 2, letterSpacing: '0.04em' }}>TODAY</span>
                    )}
                  </td>
                  {(() => {
                    const rendered = [];
                    let idx = 0;
                    while (idx < timeRows.length) {
                      if (hasRecessColumn && idx === recessInsertIndex && dayIdx === 0) {
                        rendered.push(
                          <td key={`${day}-recess`} className="timetable-recess-cell" rowSpan={daySet.length}>
                            <span>Recess</span>
                            <small>{recessText}</small>
                          </td>
                        );
                      }

                      const row = timeRows[idx];
                      const slot = slotMap.get(`${day}|${row.key}`);
                      let span = 1;
                      const currentKey = slot?.paper_id ? `paper:${slot.paper_id}` : 'no-class';

                      while (idx + span < timeRows.length) {
                        if (hasRecessColumn && idx + span === recessInsertIndex) break;
                        const next = slotMap.get(`${day}|${timeRows[idx + span].key}`);
                        const nextKey = next?.paper_id ? `paper:${next.paper_id}` : 'no-class';
                        if (nextKey !== currentKey) break;
                        span += 1;
                      }

                      const mergedOptions = Array.from({ length: span }, (_, offset) => {
                        const optionRow = timeRows[idx + offset];
                        const optionSlot = slotMap.get(`${day}|${optionRow.key}`);
                        return optionSlot || {
                          day, day_index: optionSlot?.day_index ?? dayIdx,
                          start_time: optionRow.start_time, end_time: optionRow.end_time,
                          start_minutes: optionRow.start_minutes,
                          end_minutes: toMinutes(optionRow.end_time),
                          paper_id: '', paper_name: 'No Classes', paper_code: '',
                        };
                      });

                      const editPayload = { ...(mergedOptions[0] || {}), mergedOptions };
                      const palette = slot?.paper_id ? (paperColorMap.get(slot.paper_id) || SUBJECT_PALETTE[0]) : null;

                      rendered.push(
                        <td
                          key={`${day}-${row.key}`}
                          colSpan={span}
                          style={{
                            background: isToday ? 'rgba(139,92,246,0.03)' : undefined,
                            borderBottom: isToday ? '1px solid rgba(139,92,246,0.15)' : undefined,
                          }}
                        >
                          <div
                            className="timetable-slot-chip"
                            title={slot ? slotLabel(slot) : 'No Classes'}
                            style={palette ? {
                              background: palette.bg,
                              borderLeft: `3px solid ${palette.color}`,
                            } : {
                              background: 'transparent',
                              borderLeft: '3px solid transparent',
                            }}
                          >
                            {slot?.paper_id ? (
                              <>
                                <span
                                  className="tt-subject-chip"
                                  style={{ background: palette?.bg, color: palette?.color, border: `1px solid ${palette?.border}` }}
                                >
                                  {slot.paper_code || 'N/A'}
                                </span>
                                <p style={{ fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.3, marginBottom: 3 }}>{slot.paper_name || 'No Classes'}</p>
                                {slot.lecturer_name && (
                                  <p style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginBottom: 1 }}>👤 {slot.lecturer_name}</p>
                                )}
                                {slot.location && (
                                  <p style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>📍 {slot.location}</p>
                                )}
                              </>
                            ) : (
                              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>—</p>
                            )}
                            {editable && (
                              <button
                                type="button"
                                className="timetable-cell-edit-btn"
                                title="Edit slot"
                                aria-label="Edit slot"
                                onClick={() => onEditSlot?.(editPayload)}
                              >
                                <HiOutlinePencil size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      );

                      idx += span;
                    }

                    if (hasRecessColumn && recessInsertIndex === timeRows.length && dayIdx === 0) {
                      rendered.push(
                        <td key={`${day}-recess-end`} className="timetable-recess-cell" rowSpan={daySet.length}>
                          <span>Recess</span>
                          <small>{recessText}</small>
                        </td>
                      );
                    }

                    return rendered;
                  })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
