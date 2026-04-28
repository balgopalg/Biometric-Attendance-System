import { useEffect, useRef, useState } from 'react';
import { HiOutlineDownload } from 'react-icons/hi';
import toast from 'react-hot-toast';

import api from '../../api/axios';
import StatePanel from '../../components/ui/StatePanel';
import WeeklyTimetableGrid from '../../components/timetable/WeeklyTimetableGrid';

export default function LecturerTimetable() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const exportContainerRef = useRef(null);

  const loadTimetable = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/timetable/lecturer/my');
      setSlots(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      setSlots([]);
      setError(err.response?.data?.error || 'Failed to load lecturer timetable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimetable();
  }, []);

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
      pdf.save('Lecturer_Timetable.pdf');
      toast.success('Timetable PDF downloaded');
    } catch (err) {
      const popup = window.open('', '_blank', 'width=1280,height=900');
      const html = exportContainerRef.current.innerHTML;
      if (popup) {
        popup.document.write(`
          <html>
            <head>
              <title>Lecturer Timetable</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
                th { background: #f2f2f2; }
              </style>
            </head>
            <body>${html}</body>
          </html>
        `);
        popup.document.close();
        popup.focus();
        popup.print();
      }
      toast.success('Opened print preview. Use Save as PDF to download.');
    } finally {
      setExportingPdf(false);
    }
  };

  if (!loading && error) {
    return (
      <div className="lecturer-page">
        <StatePanel variant="error" title="Unable to load timetable" description={error} actionLabel="Retry" onAction={loadTimetable} compact />
      </div>
    );
  }

  return (
    <div className="lecturer-page">
      {loading ? <StatePanel variant="loading" title="Loading timetable" description="Fetching your assigned class schedule." compact /> : null}
      {!loading ? (
        <>
          <div className="glass-card" style={{ padding: 12, marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={handleExportPdf} disabled={slots.length === 0 || exportingPdf}>
              <HiOutlineDownload size={15} /> {exportingPdf ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
          <div ref={exportContainerRef}>
            <WeeklyTimetableGrid
              slots={slots}
              title="My Teaching Timetable"
              emptyMessage="No active timetable slots are assigned to you yet."
              classStartTime="09:00"
              classEndTime="17:00"
              classDurationMinutes={60}
              recessStartTime="12:00"
              recessEndTime="13:00"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
