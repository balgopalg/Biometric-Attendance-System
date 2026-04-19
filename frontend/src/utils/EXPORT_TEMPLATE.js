/* eslint-disable */
/**
 * EXPORT IMPLEMENTATION TEMPLATE
 * Copy this template to implement export functionality on any admin page
 */

// ============================================================================
// STEP 1: ADD IMPORTS
// ============================================================================
import { exportToExcel, exportToCSV, EXPORT_COLUMN_PRESETS } from '../../utils/excelExport';

// ============================================================================
// STEP 2: ADD STATE IN COMPONENT
// ============================================================================
export default function YourAdminPage() {
  // ... your existing state ...
  const [exporting, setExporting] = useState(false);

  // ============================================================================
  // STEP 3: CREATE HANDLER FUNCTION
  // ============================================================================
  const handleExportData = async () => {
    // ✅ IMPORTANT: Use 'filtered' or 'filteredData' - the data currently shown
    // ❌ DON'T use 'allData' - it would bypass filters
    
    if (filteredData.length === 0) {
      toast.error('No data to export');
      return;
    }

    setExporting(true);
    try {
      // Try Excel export first
      try {
        await exportToExcel({
          data: filteredData,  // <-- Use filtered data only
          columns: EXPORT_COLUMN_PRESETS.STUDENTS,  // or your custom columns
          fileName: 'PageName',  // Base name (will become PageName_Export_2026-04-19.xlsx)
          sheetName: 'PageName',  // Excel sheet name
        });
        toast.success(`Exported ${filteredData.length} records to Excel`);
      } catch (xlsxError) {
        // Fallback to CSV if xlsx not installed
        if (xlsxError.message.includes('xlsx')) {
          exportToCSV({
            data: filteredData,
            columns: EXPORT_COLUMN_PRESETS.STUDENTS,
            fileName: 'PageName',
          });
          toast.success(`Exported to CSV (install xlsx for Excel format)`);
        } else {
          throw xlsxError;
        }
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error(err.message || 'Failed to export');
    } finally {
      setExporting(false);
    }
  };

  // ============================================================================
  // STEP 4A: ADD TO DESKTOP TOOLBAR
  // ============================================================================
  return (
    <div className="admin-page">
      {/* Desktop button */}
      <div className="toolbar" style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn-secondary"
          onClick={handleExportData}
          disabled={filteredData.length === 0 || exporting}
          title="Export filtered data to Excel"
        >
          <HiOutlineDownload size={16} />
          {exporting ? 'Exporting...' : `Export (${filteredData.length})`}
        </button>
      </div>

      {/* ========================================================================
          STEP 4B: ADD TO MOBILE OPERATIONS MODAL (if applicable)
          ======================================================================== */}
      <Modal isOpen={showMobileOps} onClose={() => setShowMobileOps(false)} title="Operations">
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Other buttons */}
          
          {/* Export button for mobile */}
          <button
            className="btn-secondary"
            onClick={() => {
              setShowMobileOps(false);  // Close modal
              handleExportData();         // Trigger export
            }}
            disabled={filteredData.length === 0 || exporting}
          >
            <HiOutlineDownload size={16} />
            {exporting ? 'Exporting...' : `Export (${filteredData.length})`}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================================
// CUSTOM COLUMNS EXAMPLE
// ============================================================================
// If you don't have a preset, define custom columns:

const CUSTOM_COLUMNS = [
  { key: 'field1', header: 'Display Header 1' },
  { key: 'field2', header: 'Display Header 2' },
  { key: 'field3', header: 'Display Header 3' },
];

// Usage:
// const transformedData = filteredData.map(item => ({
//   ...item,
//   // Add any computed/transformed fields
//   department_name: departments.find(d => d._id === item.department_id)?.name,
// }));
// await exportToExcel({
//   data: transformedData,
//   columns: CUSTOM_COLUMNS,
//   fileName: 'Export',
// });

// ============================================================================
// DATA TRANSFORMATION EXAMPLE
// ============================================================================
// If your data needs transformation before export:

const handleExportWithTransform = async () => {
  const transformedData = filteredData.map(item => ({
    ...item,
    // Transform nested fields
    department_name: departments.find(d => d._id === item.department_id)?.name,
    course_name: courses.find(c => c._id === item.course_id)?.name,
    // Format dates
    created_at: new Date(item.created_at).toLocaleDateString(),
    // Custom computed fields
    status_label: item.is_active ? 'Active' : 'Inactive',
  }));

  await exportToExcel({
    data: transformedData,
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'email', header: 'Email' },
      { key: 'department_name', header: 'Department' },
      { key: 'course_name', header: 'Course' },
      { key: 'status_label', header: 'Status' },
    ],
    fileName: 'CustomExport',
  });
};

// ============================================================================
// COMPLETE MINIMAL EXAMPLE (ManageLecturers style)
// ============================================================================

function ManageLecturesExample() {
  const [lecturers, setLecturers] = useState([]);
  const [filteredLecturers, setFilteredLecturers] = useState([]);
  const [exporting, setExporting] = useState(false);

  const handleExportLecturers = async () => {
    if (filteredLecturers.length === 0) {
      toast.error('No lecturers to export');
      return;
    }

    setExporting(true);
    try {
      try {
        await exportToExcel({
          data: filteredLecturers,
          columns: EXPORT_COLUMN_PRESETS.LECTURERS,
          fileName: 'Lecturers',
          sheetName: 'Lecturers',
        });
        toast.success(`Exported ${filteredLecturers.length} lecturers`);
      } catch (xlsxError) {
        if (xlsxError.message.includes('xlsx')) {
          exportToCSV({
            data: filteredLecturers,
            columns: EXPORT_COLUMN_PRESETS.LECTURERS,
            fileName: 'Lecturers',
          });
          toast.success('Exported to CSV');
        } else {
          throw xlsxError;
        }
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="admin-page">
      <button
        onClick={handleExportLecturers}
        disabled={filteredLecturers.length === 0 || exporting}
        className="btn-secondary"
      >
        <HiOutlineDownload size={16} />
        {exporting ? 'Exporting...' : `Export (${filteredLecturers.length})`}
      </button>
    </div>
  );
}

// ============================================================================
// CHECKLIST FOR IMPLEMENTATION
// ============================================================================
/*
 * [ ] Step 1: Import excelExport functions and HiOutlineDownload icon
 * [ ] Step 2: Add exporting state with useState(false)
 * [ ] Step 3: Create handleExport function (copy from template)
 * [ ] Step 4A: Add export button to desktop toolbar
 * [ ] Step 4B: Add export button to mobile operations modal (if exists)
 * [ ] Step 5: Test with filters applied
 * [ ] Step 6: Verify exported file contains only filtered data
 * [ ] Step 7: Check filename includes date
 * [ ] Step 8: Test CSV fallback (remove xlsx, try export)
 */

// ============================================================================
// ICON IMPORT REQUIRED
// ============================================================================
// Don't forget to import the download icon:
// import { HiOutlineDownload } from 'react-icons/hi';

// If not already imported, add to existing icon import:
// import {
//   HiOutlineDownload,  // <-- Add this
//   HiOutlineFilter,
//   // ... other icons
// } from 'react-icons/hi';
