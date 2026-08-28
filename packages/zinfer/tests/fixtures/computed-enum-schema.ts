import { z } from "zod";

// A real (not `declare`d) function, and a numeric rather than string enum:
// this fixture is dynamically imported by the description-extraction sweep,
// so its initializer has to actually run - and a computed member is only
// valid TypeScript in an enum with no string-valued members.
function randomFlag(): number {
  return Date.now() % 2;
}

/**
 * Enum with a member whose value isn't a compile-time constant (it comes
 * from a function call), so ts-morph's getMembers()[n].getValue() can't
 * resolve it. Expanding this to a literal union must give up on the whole
 * enum rather than silently drop the unresolvable member, which would print
 * a union narrower than the enum itself. Deliberately not exported: the
 * point of expanding a same-file enum at all is to stand alone without one.
 */
enum Status {
  Active = 0,
  Pending = randomFlag(),
  Closed = 2,
}

export const StatusSchema = z.nativeEnum(Status);
