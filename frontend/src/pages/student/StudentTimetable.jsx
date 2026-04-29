import { useEffect, useRef, useState } from 'react';
import { HiOutlineDownload } from 'react-icons/hi';
import toast from 'react-hot-toast';

import api from '../../api/axios';
import StatePanel from '../../components/ui/StatePanel';
import WeeklyTimetableGrid from '../../components/timetable/WeeklyTimetableGrid';

export default function StudentTimetable() {
  const [slots, setSlots] = useState([]);
  const [metadata, setMetadata] = useState({
    semester: '',
    course_id: '',
    course_code: '',
    course_name: '',
    academic_session: '',
    class_duration_minutes: '',
    class_start_time: '',
    class_end_time: '',
    recess_start_time: '',
    recess_end_time: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const exportContainerRef = useRef(null);

  const loadTimetable = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/timetable/student/my');
      const timetable = res.data?.timetable || {};
      setSlots(Array.isArray(res.data?.items) ? res.data.items : []);
      setMetadata({
        semester: res.data?.semester || timetable.semester || '',
        course_id: res.data?.course_id || timetable.course_id || '',
        course_code: timetable.course_code || '',
        course_name: timetable.course_name || '',
        academic_session: res.data?.academic_session || timetable.academic_session || '',
        class_duration_minutes: timetable.class_duration_minutes || '',
        class_start_time: timetable.class_start_time || '',
        class_end_time: timetable.class_end_time || '',
        recess_start_time: timetable.recess_start_time || '',
        recess_end_time: timetable.recess_end_time || '',
      });
    } catch (err) {
      setSlots([]);
      setMetadata({
        semester: '',
        course_id: '',
        course_code: '',
        course_name: '',
        academic_session: '',
        class_duration_minutes: '',
        class_start_time: '',
        class_end_time: '',
        recess_start_time: '',
        recess_end_time: '',
      });
      setError(err.response?.data?.error || 'Failed to load student timetable.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!exportContainerRef.current) {
      toast.error('No timetable available to export');
      return;
    }

    setExportingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(exportContainerRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      const x = (pageWidth - imgWidth) / 2;
      const y = 12;

      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
      const semesterLabel = metadata.semester || 'NA';
      const sessionLabel = metadata.academic_session || 'NA';
      pdf.save(`Student_Timetable_S${semesterLabel}_${sessionLabel}.pdf`);
      toast.success('Timetable PDF downloaded');
    } catch (err) {
      // Fallback: print dialog allows Save as PDF in all modern browsers.
      const popup = window.open('', '_blank', 'width=1280,height=900');
      if (popup) {
        popup.document.open();
        popup.document.write('<!doctype html><html><head><title>Student Timetable</title><style>body { font-family: Arial, sans-serif; padding: 20px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ddd; padding: 8px; text-align: center; } th { background: #f2f2f2; }</style></head><body></body></html>');
        popup.document.close();
        
        const clone = exportContainerRef.current.cloneNode(true);
        popup.document.body.appendChild(clone);
        popup.focus();
        popup.print();
      }
      toast.success('Opened print preview. Use Save as PDF to download.');
    } finally {
      setExportingPdf(false);
    }
  };

  useEffect(() => {
    loadTimetable();
  }, []);

  const timetableTitle = `${metadata.course_code || metadata.course_name || 'Course'}-Semester ${metadata.semester || 'N/A'}`;

  if (!loading && error) {
    return (
      <div className="student-page">
        <StatePanel variant="error" title="Unable to load timetable" description={error} actionLabel="Retry" onAction={loadTimetable} compact />
      </div>
    );
  }

  return (
    <div className="student-page">
      {loading ? <StatePanel variant="loading" title="Loading timetable" description="Fetching your course and semester schedule." compact /> : null}
      {!loading ? (
        <>
          <div className="glass-card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Course: <strong>{metadata.course_name || 'N/A'}</strong>
              </p>
              <button className="btn-secondary" onClick={handleExportPdf} disabled={slots.length === 0 || exportingPdf}>
                <HiOutlineDownload size={15} /> {exportingPdf ? 'Exporting...' : 'Export PDF'}
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Semester: <strong>{metadata.semester || 'N/A'}</strong>
              {' · '}
              Academic Session: <strong>{metadata.academic_session || 'N/A'}</strong>
            </p>
          </div>
          <div ref={exportContainerRef}>
            <WeeklyTimetableGrid
              slots={slots}
              title={timetableTitle}
              emptyMessage="No active timetable is available for your course and semester."
              recessStartTime={metadata.recess_start_time}
              recessEndTime={metadata.recess_end_time}
              classDurationMinutes={metadata.class_duration_minutes}
              classStartTime={metadata.class_start_time}
              classEndTime={metadata.class_end_time}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
