/**
 * Joins the parts of a person's name, skipping a missing middle name.
 *
 * Lives here rather than as a Mongoose virtual on the User schema. A virtual would have
 * to be declared on the document type, and `Model.create()` does not return that type —
 * so every mapper ended up computing the name by hand anyway, in four separate places.
 * A full name is a property of the response shape, not of the stored document.
 */
export function formatFullName(parts: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName].filter(Boolean).join(' ');
}
