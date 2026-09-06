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
  const [metadata, setMetadata] = useState({});
  const exportContainerRef = useRef(null);

  const loadTimetable = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/timetable/lecturer/my');
      setSlots(Array.isArray(res.data?.items) ? res.data.items : []);
      setMetadata(res.data?.metadata || {});
    } catch (err) {
      setSlots([]);
      setMetadata({});
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
      const [{ toPng }, { jsPDF }] = await Promise.all([
        import('html-to-image'),
        import('jspdf'),
      ]);

      // Temporarily force overflow to visible to capture full table width
      const scrollWrapper = exportContainerRef.current.querySelector('.timetable-grid-scroll');
      const originalOverflow = scrollWrapper ? scrollWrapper.style.overflow : '';
      if (scrollWrapper) scrollWrapper.style.overflow = 'visible';

      const imgData = await toPng(exportContainerRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      
      if (scrollWrapper) scrollWrapper.style.overflow = originalOverflow;

      // Load the image to get its natural dimensions for PDF scaling
      const img = new Image();
      img.src = imgData;
      await new Promise((resolve) => { img.onload = resolve; });

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / img.naturalWidth, pageHeight / img.naturalHeight);
      const imgWidth = img.naturalWidth * ratio;
      const imgHeight = img.naturalHeight * ratio;
      const x = (pageWidth - imgWidth) / 2;
      const y = 12;

      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
      pdf.save('Lecturer_Timetable.pdf');
      toast.success('Timetable PDF downloaded');
    } catch (err) {
      const popup = window.open('', '_blank', 'width=1280,height=900');
      if (popup) {
        popup.document.open();
        popup.document.write('<!doctype html><html><head><title>Lecturer Timetable</title><style>body { font-family: Arial, sans-serif; padding: 20px; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ddd; padding: 8px; text-align: center; } th { background: #f2f2f2; }</style></head><body></body></html>');
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
          <div ref={exportContainerRef} className="glass-card tt-card-container">
            <div className="tt-card-content">
              <WeeklyTimetableGrid
                slots={slots}
                title="My Teaching Timetable"
                emptyMessage="No active timetable slots are assigned to you yet."
                classStartTime={metadata.class_start_time || "09:00"}
                classEndTime={metadata.class_end_time || "17:00"}
                classDurationMinutes={metadata.class_duration_minutes || 60}
                recessStartTime={metadata.recess_start_time || "12:00"}
                recessEndTime={metadata.recess_end_time || "13:00"}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
