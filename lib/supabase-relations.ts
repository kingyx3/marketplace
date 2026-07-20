export type SupabaseToOne<T> = T | T[] | null | undefined;

export function toOne<T>(relation: SupabaseToOne<T>): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}
