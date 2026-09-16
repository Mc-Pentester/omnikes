/**
 * Date validation utilities
 */

const MAX_REPORT_RANGE_DAYS = 365; // Maximum 1 year range for reports

/**
 * Validate a date string and return a Date object
 * Throws error if invalid
 */
export function validateDate(dateString: string, paramName: string): Date {
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ${paramName}: must be a valid date`);
  }
  
  return date;
}

/**
 * Validate date range (start <= end)
 * Throws error if invalid
 */
export function validateDateRange(startDate: Date, endDate: Date, maxRangeDays?: number): void {
  if (startDate > endDate) {
    throw new Error('Invalid date range: start date must be before or equal to end date');
  }
  
  if (maxRangeDays) {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > maxRangeDays) {
      throw new Error(`Date range too large: maximum ${maxRangeDays} days allowed`);
    }
  }
}

/**
 * Parse and validate date range from query parameters
 * Returns validated dates or undefined if not provided
 */
export function parseDateRange(
  startDateString: string | null,
  endDateString: string | null,
  maxRangeDays: number = MAX_REPORT_RANGE_DAYS
): { startDate?: Date; endDate?: Date } {
  const result: { startDate?: Date; endDate?: Date } = {};
  
  if (startDateString) {
    result.startDate = validateDate(startDateString, 'startDate');
  }
  
  if (endDateString) {
    result.endDate = validateDate(endDateString, 'endDate');
  }
  
  // Validate range if both dates are provided
  if (result.startDate && result.endDate) {
    validateDateRange(result.startDate, result.endDate, maxRangeDays);
  }
  
  return result;
}
