/**
 * Academic structure rules for an affiliated university.
 *
 * Modelled on the University of Mumbai: a four-year BE/B.Tech runs eight semesters,
 * a three-year Diploma (Polytechnic) runs six. Students admitted through Direct Second
 * Year Entry (DSE / lateral entry) skip semesters 1 and 2 and begin at semester 3, so
 * they complete six semesters while still earning the four-year degree.
 */

export const ProgramType = {
  BE: 'BE',
  Diploma: 'Diploma',
} as const;

export type ProgramType = (typeof ProgramType)[keyof typeof ProgramType];

export const EntryType = {
  /** Admitted into semester 1. */
  Regular: 'regular',
  /** Direct Second Year Entry (DSE) — admitted into semester 3. */
  Lateral: 'lateral',
} as const;

export type EntryType = (typeof EntryType)[keyof typeof EntryType];

/** Total semesters in each programme. */
export const TOTAL_SEMESTERS: Record<ProgramType, number> = {
  BE: 8,
  Diploma: 6,
};

/**
 * The first semester a student can be enrolled in.
 *
 * Lateral entry is only meaningful for a degree programme: a Diploma is itself the
 * qualification that grants lateral entry, so a lateral Diploma student is not a real
 * case and is treated as starting at semester 1.
 */
export function firstSemesterFor(program: ProgramType, entry: EntryType): number {
  if (program === ProgramType.BE && entry === EntryType.Lateral) return 3;
  return 1;
}

/** The inclusive range of semesters a student may legitimately occupy. */
export function semesterRangeFor(
  program: ProgramType,
  entry: EntryType,
): { min: number; max: number } {
  return { min: firstSemesterFor(program, entry), max: TOTAL_SEMESTERS[program] };
}

export function isValidSemester(
  semester: number,
  program: ProgramType,
  entry: EntryType,
): boolean {
  const { min, max } = semesterRangeFor(program, entry);
  return Number.isInteger(semester) && semester >= min && semester <= max;
}

/** Semesters 1 and 2 are First Year, 3 and 4 Second Year, and so on. */
export function yearForSemester(semester: number): number {
  return Math.ceil(semester / 2);
}

export const YEAR_LABELS = [
  'First Year',
  'Second Year',
  'Third Year',
  'Final Year',
] as const;

export function yearLabelFor(semester: number, program: ProgramType): string {
  const year = yearForSemester(semester);
  // A Diploma's third year is its last, so it is the final year there but not for a BE.
  if (program === ProgramType.Diploma && year === 3) return 'Final Year';
  return YEAR_LABELS[year - 1] ?? `Year ${year}`;
}
