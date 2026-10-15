/** Plain text fields must not contain model control tokens or runaway output. */
export function isCleanModelText(value: string) {
  return !(
    /```|<\|[^>]*\|>|<\/?(?:think|analysis)>/iu.test(value) ||
    /\b([a-z_]{3,20})(?:\s*\1){2,}\b/iu.test(value) ||
    /(.{8,48}?)\1{2,}/u.test(value)
  );
}

export function hasCleanModelFields(value: unknown): boolean {
  if (typeof value === "string") return isCleanModelText(value);
  if (Array.isArray(value)) return value.every(hasCleanModelFields);
  if (value && typeof value === "object")
    return Object.values(value).every(hasCleanModelFields);
  return true;
}

// Restrict reasons to a single prose line; reject JSON/code delimiters in a string.
export const REASON_TEXT_PATTERN = /^[^`{}\[\]<>\r\n\u0000-\u001f]+$/u;

export function isCleanRecommendationReason(value: string) {
  return (
    value.trim().length > 0 &&
    value.length <= 120 &&
    REASON_TEXT_PATTERN.test(value) &&
    /[ぁ-んァ-ヶ一-龯]/u.test(value) &&
    !/\b(?:console\.[a-z]+|(?:def|class|import|function)\s+\w+)/iu.test(
      value,
    ) &&
    isCleanModelText(value)
  );
}
