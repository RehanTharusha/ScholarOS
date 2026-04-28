/**
 * Limit event items passed into prompts so large collections stay manageable.
 */
export function limitEventItems<T>(items: T[], maxItems = 10): T[] {
  if (items.length <= maxItems) {
    return items;
  }

  return items.slice(0, maxItems);
}
