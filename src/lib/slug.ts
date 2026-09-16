/**
 * Generate a URL-friendly slug from a string
 * Handles accents, spaces, special characters, and collisions
 */

export function generateSlug(input: string): string {
  if (!input) {
    return '';
  }

  // Convert to lowercase
  let slug = input.toLowerCase();

  // Remove accents
  slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Replace spaces and special characters with hyphens
  slug = slug.replace(/[^a-z0-9\s-]/g, '');
  slug = slug.replace(/\s+/g, '-');

  // Remove leading/trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  // Remove multiple consecutive hyphens
  slug = slug.replace(/-+/g, '-');

  // Ensure slug is not empty
  if (!slug) {
    return 'organization';
  }

  return slug;
}

/**
 * Generate a unique slug by appending a number if the slug already exists
 */
export async function generateUniqueSlug(
  baseSlug: string,
  checkExists: (slug: string) => Promise<boolean>
): Promise<string> {
  let slug = generateSlug(baseSlug);
  let counter = 1;

  while (await checkExists(slug)) {
    slug = `${generateSlug(baseSlug)}-${counter}`;
    counter++;
  }

  return slug;
}
