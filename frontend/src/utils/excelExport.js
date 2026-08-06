/**
 * Reusable Excel export utility for tables across the application.
 * Respects current UI state (filters, search, pagination).
 *
 * Installation: npm install xlsx
 *
 * Usage:
 *   const result = exportToExcel({
 *     data: filteredStudents,
 *     columns: [
 *       { key: 'reg_number', header: 'Reg No' },
 *       { key: 'name', header: 'Name' },
 *       { key: 'email', header: 'Email' },
 *     ],
 *     fileName: 'Students',
 *     sheetName: 'Students'
 *   });
 */

/**
 * Export data to Excel (.xlsx)
 * @param {Object} config - Configuration object
 * @param {Array} config.data - Array of data objects to export
 * @param {Array} config.columns - Array of column definitions
 *   Each column: { key: 'fieldName', header: 'Display Header' }
 * @param {string} config.fileName - Base name (without extension)
 * @param {string} [config.sheetName='Sheet1'] - Excel sheet name
 * @param {boolean} [config.formatCells=true] - Format cells for readability
 * @returns {boolean} - True if successful, false otherwise
 */
export async function exportToExcel({
  data = [],
  columns = [],
  fileName = 'Export',
  sheetName = 'Sheet1',
  formatCells = true,
}) {
  try {
    // Import xlsx (installed via: npm install xlsx)
    let XLSX;
    try {
      XLSX = await import('xlsx');
    } catch (importError) {
      throw new Error(
        'Excel export library not found. Install it with: npm install xlsx'
      );
    }
    
    const wb = XLSX.utils.book_new();

    // Transform data: extract only specified columns
    const transformedData = data.map((row) =>
      columns.reduce((acc, col) => {
        acc[col.header] = row[col.key] ?? '';
        return acc;
      }, {})
    );

    // Create worksheet from data
    const ws = XLSX.utils.json_to_sheet(transformedData);

    // Optional: Auto-size columns based on content
    if (formatCells && transformedData.length > 0) {
      const colWidths = columns.map((col) => ({
        wch: Math.max(
          col.header.length,
          transformedData.reduce(
            (max, row) => Math.max(max, String(row[col.header] || '').length),
            10
          )
        ),
      }));
      ws['!cols'] = colWidths;
    }

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Generate dynamic filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const finalFileName = `${fileName}_Export_${timestamp}.xlsx`;

    // Write file
    XLSX.writeFile(wb, finalFileName);

    return true;
  } catch (error) {
    console.error('Export failed:', error);
    if (error.message.includes('xlsx')) {
      throw new Error(
        'Excel export library not found. Please install it: npm install xlsx'
      );
    }
    throw error;
  }
}

/**
 * Fallback CSV export (Excel-compatible, no external dependency)
 * @param {Object} config - Same as exportToExcel config
 * @returns {boolean} - True if successful
 */
export function exportToCSV({
  data = [],
  columns = [],
  fileName = 'Export',
}) {
  try {
    if (data.length === 0 || columns.length === 0) {
      throw new Error('No data or columns provided');
    }

    // Build CSV header
    const headers = columns.map((col) => `"${col.header}"`).join(',');

    // Build CSV rows
    const rows = data.map((row) =>
      columns
        .map((col) => {
          const value = row[col.key] ?? '';
          // Escape quotes and wrap in quotes if contains comma or newline
          const escaped = String(value).replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    );

    // Combine CSV content
    const csvContent = [headers, ...rows].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const timestamp = new Date().toISOString().split('T')[0];
    const finalFileName = `${fileName}_Export_${timestamp}.csv`;

    if (typeof window !== 'undefined' && document) {
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', finalFileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    return true;
  } catch (error) {
    console.error('CSV export failed:', error);
    throw error;
  }
}

/**
 * Build a standardized columns array for common admin tables
 *
 * NOTE: Data should be transformed before export to include computed fields.
 * For example, replace course_id with course_name before exporting.
 */
export const EXPORT_COLUMN_PRESETS = {
  STUDENTS: [
    { key: 'reg_number', header: 'Reg No' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'mobile_no', header: 'Mobile' },
    { key: 'current_semester', header: 'Semester' },
    { key: 'course_name', header: 'Course' },
  ],
  LECTURERS: [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'department', header: 'Department' },
    { key: 'paper_count', header: 'Papers' },
  ],
  COURSES: [
    { key: 'name', header: 'Course Name' },
    { key: 'code', header: 'Code' },
    { key: 'department', header: 'Department' },
    { key: 'status', header: 'Status' },
  ],
  PAPERS: [
    { key: 'name', header: 'Paper Name' },
    { key: 'code', header: 'Code' },
    { key: 'semester', header: 'Semester' },
    { key: 'lecturer_name', header: 'Lecturer' },
  ],
};
