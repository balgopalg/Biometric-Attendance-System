# Excel Export Utility Guide

## Overview

The Excel export utility (`excelExport.js`) provides a reusable solution for exporting filtered data from any table in the application. It automatically respects the current UI state (filters, search, pagination) and generates nicely formatted Excel files with dynamic naming.

## Features

✅ **Dynamic Filtering**: Only exports the currently visible/filtered data  
✅ **Respects UI State**: Includes search, filters, date ranges, etc.  
✅ **Excel Format**: Generates `.xlsx` files with proper formatting  
✅ **CSV Fallback**: Automatic fallback to CSV if xlsx library not installed  
✅ **Dynamic Filenames**: Auto-generated with date (e.g., `Students_Export_2026-04-19.xlsx`)  
✅ **Column Presets**: Pre-configured column templates for common tables  
✅ **Auto-sizing**: Columns automatically sized based on content  

## Installation

Before using, install the `xlsx` library:

```bash
npm install xlsx
```

The utility has graceful fallback to CSV if xlsx is not installed, but Excel format is recommended.

## Basic Usage

### 1. Import the utility

```javascript
import { exportToExcel, exportToCSV, EXPORT_COLUMN_PRESETS } from '../../utils/excelExport';
```

### 2. Define columns

Either use a preset or create a custom column configuration:

```javascript
// Option A: Use preset
const columns = EXPORT_COLUMN_PRESETS.STUDENTS;

// Option B: Custom columns
const columns = [
  { key: 'reg_number', header: 'Registration Number' },
  { key: 'name', header: 'Full Name' },
  { key: 'email', header: 'Email Address' },
  { key: 'mobile_no', header: 'Mobile' },
  { key: 'current_semester', header: 'Current Semester' },
];
```

### 3. Create export handler

```javascript
const handleExportData = async () => {
  if (filteredData.length === 0) {
    toast.error('No data to export');
    return;
  }

  setExporting(true);
  try {
    // Try Excel export first, fallback to CSV if needed
    try {
      await exportToExcel({
        data: filteredData,           // Your filtered data array
        columns: EXPORT_COLUMN_PRESETS.STUDENTS,
        fileName: 'Students',         // Base name (without extension)
        sheetName: 'Students',        // Excel sheet name
      });
      toast.success(`Exported ${filteredData.length} records`);
    } catch (xlsxError) {
      if (xlsxError.message.includes('xlsx')) {
        // Fallback to CSV
        exportToCSV({
          data: filteredData,
          columns: EXPORT_COLUMN_PRESETS.STUDENTS,
          fileName: 'Students',
        });
        toast.success(`Exported to CSV (install xlsx for Excel format)`);
      } else {
        throw xlsxError;
      }
    }
  } catch (err) {
    toast.error('Export failed: ' + err.message);
  } finally {
    setExporting(false);
  }
};
```

### 4. Add export button

```jsx
<button
  onClick={handleExportData}
  disabled={filteredData.length === 0 || exporting}
  className="btn-secondary"
  title="Export filtered data to Excel"
>
  <HiOutlineDownload size={16} />
  {exporting ? 'Exporting...' : `Export (${filteredData.length})`}
</button>
```

## Implementation Examples

### Example 1: Manage Lecturers Page

```javascript
// 1. Import
import { exportToExcel, EXPORT_COLUMN_PRESETS } from '../../utils/excelExport';

// 2. Add state
const [exportingLecturers, setExportingLecturers] = useState(false);

// 3. Create handler
const handleExportLecturers = async () => {
  if (filteredLecturers.length === 0) {
    toast.error('No lecturers to export');
    return;
  }

  setExportingLecturers(true);
  try {
    try {
      await exportToExcel({
        data: filteredLecturers,
        columns: EXPORT_COLUMN_PRESETS.LECTURERS,
        fileName: 'Lecturers',
      });
      toast.success(`Exported ${filteredLecturers.length} lecturers`);
    } catch (xlsxError) {
      if (xlsxError.message.includes('xlsx')) {
        exportToCSV({
          data: filteredLecturers,
          columns: EXPORT_COLUMN_PRESETS.LECTURERS,
          fileName: 'Lecturers',
        });
        toast.success(`Exported to CSV`);
      } else {
        throw xlsxError;
      }
    }
  } catch (err) {
    toast.error(err.message);
  } finally {
    setExportingLecturers(false);
  }
};

// 4. Add button (desktop)
<button
  onClick={handleExportLecturers}
  disabled={filteredLecturers.length === 0 || exportingLecturers}
  className="btn-secondary"
>
  <HiOutlineDownload size={16} />
  {exportingLecturers ? 'Exporting...' : `Export (${filteredLecturers.length})`}
</button>

// 5. Add to mobile operations modal
<button
  className="btn-secondary"
  onClick={() => { setShowMobileOps(false); handleExportLecturers(); }}
  disabled={filteredLecturers.length === 0 || exportingLecturers}
>
  <HiOutlineDownload size={16} />
  {exportingLecturers ? 'Exporting...' : `Export (${filteredLecturers.length})`}
</button>
```

### Example 2: Custom Table with Attendance Data

```javascript
// Custom columns for attendance
const attendanceColumns = [
  { key: 'student_name', header: 'Student Name' },
  { key: 'date', header: 'Date' },
  { key: 'status', header: 'Status' },
  { key: 'remarks', header: 'Remarks' },
];

const handleExportAttendance = async () => {
  if (attendanceRecords.length === 0) {
    toast.error('No attendance records to export');
    return;
  }

  setExporting(true);
  try {
    try {
      await exportToExcel({
        data: attendanceRecords,
        columns: attendanceColumns,
        fileName: 'Attendance',
        sheetName: 'Attendance',
      });
      toast.success(`Exported ${attendanceRecords.length} records`);
    } catch (xlsxError) {
      if (xlsxError.message.includes('xlsx')) {
        exportToCSV({
          data: attendanceRecords,
          columns: attendanceColumns,
          fileName: 'Attendance',
        });
        toast.success(`Exported to CSV`);
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
```

## Available Column Presets

```javascript
// Students
EXPORT_COLUMN_PRESETS.STUDENTS
// Fields: reg_number, name, email, mobile_no, current_semester, course_id

// Lecturers
EXPORT_COLUMN_PRESETS.LECTURERS
// Fields: name, email, department, paper_count

// Courses
EXPORT_COLUMN_PRESETS.COURSES
// Fields: name, code, department, status

// Papers
EXPORT_COLUMN_PRESETS.PAPERS
// Fields: name, code, semester, lecturer_id
```

## Key Points

### Data Filtering Behavior

```javascript
// ✅ RESPECTS current filters/search
// Only exports what's currently visible/filtered
const handleExport = async () => {
  // Use 'filtered' or 'filteredStudents' - the data currently shown in table
  await exportToExcel({
    data: filtered,  // This is the key - use filtered data, not raw data
    columns,
    fileName: 'Export',
  });
};

// ❌ DON'T export raw data bypassing filters
// This would include everything, ignoring user's filters
await exportToExcel({
  data: allStudents,  // WRONG - this ignores current filters
  columns,
  fileName: 'Export',
});
```

### Filename Format

Files are automatically named with the pattern:
```
{fileName}_Export_{YYYY-MM-DD}.xlsx
```

Examples:
- `Students_Export_2026-04-19.xlsx`
- `Lecturers_Export_2026-04-19.xlsx`
- `Attendance_Export_2026-04-19.csv`

### Error Handling

The utility handles missing data gracefully:

```javascript
try {
  await exportToExcel({
    data: filteredData,
    columns,
    fileName: 'MyData',
  });
} catch (err) {
  // If xlsx not installed, error message will indicate to install it
  if (err.message.includes('xlsx')) {
    // User can:
    // 1. Install xlsx: npm install xlsx
    // 2. Use CSV fallback instead
  } else {
    // Other errors
    console.error('Export error:', err);
  }
}
```

## Real-World Usage on ManageStudents

The export feature is already implemented on the Manage Students page:

1. **Desktop Export Button**: Located in the top toolbar
   - Shows count of filtered students
   - Disables when no data available
   - Label updates during export

2. **Mobile Export**: In the "Student Operations" modal
   - Same functionality as desktop version
   - Respects mobile UX pattern

3. **Filter Respect**: Exports only:
   - Searched students (by name, email, reg number)
   - Department-filtered students
   - Course-filtered students
   - Semester-filtered students
   - Paper-filtered students
   - Pagination state (exports visible page or all if needed)

## Testing the Export

1. **On Manage Students page**:
   - Apply filters (department, course, semester)
   - Enter search query
   - Click "Export" button
   - Verify downloaded file contains only filtered data

2. **Data Verification**:
   - Check that columns match configuration
   - Verify all filtered records are present
   - Confirm dynamic filename with date

3. **Edge Cases**:
   - Empty filter (no data): Button disabled, shows message
   - Single record: Still exports correctly
   - Special characters in data: Properly escaped in CSV/Excel

## Adding to Other Pages

Follow this 5-step pattern for any new page:

```javascript
// Step 1: Import
import { exportToExcel, EXPORT_COLUMN_PRESETS } from '../../utils/excelExport';

// Step 2: State
const [exporting, setExporting] = useState(false);

// Step 3: Handler
const handleExport = async () => {
  if (filteredData.length === 0) return;
  setExporting(true);
  try {
    // Try Excel, fallback to CSV
    try {
      await exportToExcel({
        data: filteredData,
        columns: YOUR_COLUMNS,
        fileName: 'PageName',
      });
    } catch (e) {
      if (e.message.includes('xlsx')) {
        exportToCSV({ data: filteredData, columns: YOUR_COLUMNS, fileName: 'PageName' });
      } else throw e;
    }
  } catch (e) {
    toast.error(e.message);
  } finally {
    setExporting(false);
  }
};

// Step 4: Add button
<button onClick={handleExport} disabled={filteredData.length === 0 || exporting}>
  Export ({filteredData.length})
</button>

// Step 5: Add to mobile modal if applicable
<button onClick={() => { setShowMobileOps(false); handleExport(); }} ... />
```

## Performance Considerations

- **Typical sizes**: 1-10MB for 10,000+ records is common
- **Processing time**: < 1 second for 1,000 records
- **Memory**: Safe for frontend processing up to ~50,000 records
- **For larger exports**: Consider backend-generated files via API

## Future Enhancements

Possible improvements:
- Multi-sheet exports (e.g., Students + Courses)
- Custom formatting (colors, fonts, borders)
- Formula exports (summing, counting)
- Scheduled exports via email
- Template-based exports with logos/headers

