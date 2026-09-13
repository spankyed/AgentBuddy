/**
 * Represents a segment in a truncated path
 */
export interface PathSegment {
  name: string;
  isEllipsis: boolean;
}

/**
 * Truncates a file system path by keeping the first and last segments
 * and replacing middle segments with an ellipsis indicator
 *
 * @param path - The full file system path to truncate
 * @param maxSegments - Maximum number of segments to show before truncating (default: 4)
 * @returns Array of path segments with ellipsis indicator for hidden segments
 *
 * @example
 * truncatePath('/Users/john/Development/Projects/MyApp/src/components')
 * // Returns: [
 * //   { name: 'Users', isEllipsis: false },
 * //   { name: 'john', isEllipsis: false },
 * //   { name: '...', isEllipsis: true },
 * //   { name: 'src', isEllipsis: false },
 * //   { name: 'components', isEllipsis: false }
 * // ]
 */
export function truncatePath(path: string, maxSegments: number = 4): PathSegment[] {
  if (!path) return [];

  // Normalize path - remove trailing slash if present
  const normalizedPath = path.endsWith('/') && path.length > 1
    ? path.slice(0, -1)
    : path;

  // Split into segments and filter out empty strings
  const allSegments = normalizedPath.split('/').filter(Boolean);

  // If path length is within limit, return all segments
  if (allSegments.length <= maxSegments) {
    return allSegments.map(name => ({ name, isEllipsis: false }));
  }

  // Truncate: keep first 2 and last 2, show ellipsis in middle
  const result: PathSegment[] = [];
  const firstSegments = allSegments.slice(0, 2);
  const lastSegments = allSegments.slice(-2);

  // Add first segments
  firstSegments.forEach(name => {
    result.push({ name, isEllipsis: false });
  });

  // Add ellipsis indicator
  result.push({ name: '...', isEllipsis: true });

  // Add last segments
  lastSegments.forEach(name => {
    result.push({ name, isEllipsis: false });
  });

  return result;
}
