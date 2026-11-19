/** The letter that ties an item's photo to its copy: A, B, C… in page order. */
export function letterFor(index: number): string {
  if (index < 0 || index > 25) throw new Error(`No item letter for position ${index}`);
  return String.fromCharCode(65 + index);
}
