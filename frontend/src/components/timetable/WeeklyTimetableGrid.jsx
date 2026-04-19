import { Fragment, useMemo } from 'react';
import { HiOutlinePencil } from 'react-icons/hi';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
    ? `${recessStartTime} - ${recessEndTime}`
    : 'Not Set';

  const recessRange = useMemo(() => {
    const start = toMinutes(recessStartTime);
    const end = toMinutes(recessEndTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return null;
    }
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
      <div className="glass-card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: '0.94rem', fontWeight: 700, marginBottom: 8 }}>{title}</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: '0.94rem', fontWeight: 700, marginBottom: 10 }}>{title}</h3>
      <div className="timetable-grid-scroll">
        <table className="data-table timetable-grid-table timetable-sketch-table">
          <thead>
            <tr>
              <th style={{ minWidth: 110 }}>Day</th>
              {timeRows.map((row, idx) => (
                <Fragment key={row.key}>
                  {hasRecessColumn && idx === recessInsertIndex ? (
                    <th className="timetable-recess-header">Recess Period</th>
                  ) : null}
                  <th style={{ whiteSpace: 'nowrap' }}>{row.start_time} - {row.end_time}</th>
                </Fragment>
              ))}
              {hasRecessColumn && recessInsertIndex === timeRows.length ? (
                <th className="timetable-recess-header">Recess Period</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {daySet.map((day, dayIdx) => (
              <tr key={day}>
                <td className="timetable-day-cell" style={{ whiteSpace: 'nowrap', fontSize: '0.78rem', fontWeight: 700 }}>
                  {day}
                </td>
                {(() => {
                  const rendered = [];
                  let idx = 0;
                  while (idx < timeRows.length) {
                    if (hasRecessColumn && idx === recessInsertIndex && dayIdx === 0) {
                      rendered.push(
                        <td key={`${day}-recess`} className="timetable-recess-cell" rowSpan={daySet.length}>
                          <span>Recess Period</span>
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
                        day,
                        day_index: optionSlot?.day_index ?? dayIdx,
                        start_time: optionRow.start_time,
                        end_time: optionRow.end_time,
                        start_minutes: optionRow.start_minutes,
                        end_minutes: toMinutes(optionRow.end_time),
                        paper_id: '',
                        paper_name: 'No Classes',
                        paper_code: '',
                      };
                    });

                    const editPayload = {
                      ...(mergedOptions[0] || {}),
                      mergedOptions,
                    };

                    rendered.push(
                      <td key={`${day}-${row.key}`} colSpan={span}>
                        <div className="timetable-slot-chip" title={slot ? slotLabel(slot) : 'No Classes'}>
                          {slot?.paper_id ? (
                            <>
                              <p style={{ fontSize: '0.78rem', fontWeight: 700 }}>{slot.paper_code || 'N/A'}</p>
                              <p style={{ fontSize: '0.74rem' }}>{slot.paper_name || 'No Classes'}</p>
                              {slot.lecturer_name ? (
                                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{slot.lecturer_name}</p>
                              ) : null}
                              {slot.location ? (
                                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{slot.location}</p>
                              ) : null}
                            </>
                          ) : (
                            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>No Classes</p>
                          )}
                          {editable ? (
                            <button
                              type="button"
                              className="timetable-cell-edit-btn"
                              title="Edit slot"
                              aria-label="Edit slot"
                              onClick={() => onEditSlot?.(editPayload)}
                            >
                              <HiOutlinePencil size={14} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    );

                    idx += span;
                  }

                  if (hasRecessColumn && recessInsertIndex === timeRows.length && dayIdx === 0) {
                    rendered.push(
                      <td key={`${day}-recess-end`} className="timetable-recess-cell" rowSpan={daySet.length}>
                        <span>Recess Period</span>
                        <small>{recessText}</small>
                      </td>
                    );
                  }

                  return rendered;
                })()}
                {hasRecessColumn && recessInsertIndex === timeRows.length && dayIdx === 0 ? (
                  null
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
