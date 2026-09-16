/**
 * Pagination validation utilities
 */

export interface PaginationParams {
  skip: number;
  take: number;
}

const DEFAULT_SKIP = 0;
const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;
const MIN_TAKE = 1;

/**
 * Validate and normalize pagination parameters
 * Throws error if parameters are invalid
 */
export function validatePagination(skip?: string | null, take?: string | null): PaginationParams {
  const skipNum = skip !== null && skip !== undefined ? parseInt(skip, 10) : DEFAULT_SKIP;
  const takeNum = take !== null && take !== undefined ? parseInt(take, 10) : DEFAULT_TAKE;

  // Validate skip
  if (isNaN(skipNum) || skipNum < 0 || !Number.isFinite(skipNum)) {
    throw new Error('Invalid skip parameter: must be a non-negative finite number');
  }

  // Validate take
  if (isNaN(takeNum) || takeNum < MIN_TAKE || takeNum > MAX_TAKE || !Number.isFinite(takeNum)) {
    throw new Error(`Invalid take parameter: must be between ${MIN_TAKE} and ${MAX_TAKE}`);
  }

  return {
    skip: skipNum,
    take: takeNum,
  };
}

/**
 * Safe pagination validation with defaults
 * Returns default values if parameters are invalid (for backward compatibility)
 */
export function safePagination(skip?: string | null, take?: string | null): PaginationParams {
  try {
    return validatePagination(skip, take);
  } catch {
    return {
      skip: DEFAULT_SKIP,
      take: DEFAULT_TAKE,
    };
  }
}
