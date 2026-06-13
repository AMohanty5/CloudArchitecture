/** DI token for the loaded, validated catalog (blueprint doc 14). Kept in its own
 * dependency-free module so providers and the module can both import it without a
 * circular import (which would break DI metadata). */
export const CATALOG = Symbol('CATALOG');
