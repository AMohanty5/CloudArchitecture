/** The catalog version published/served at runtime (single version for now). */
export const CATALOG_VERSION = 'dev';

/** Redis key holding the full published service list (palette + search source). */
export const CATALOG_INDEX_KEY = `catalog:${CATALOG_VERSION}:index`;
