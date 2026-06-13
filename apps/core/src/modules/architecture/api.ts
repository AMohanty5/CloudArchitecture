/**
 * Public API of the Architecture module. Other modules (and the app root) import
 * ONLY from here — never module internals (enforced by eslint-boundaries).
 */
export { ArchitectureModule } from './architecture.module';
export { seedDatabase } from './seed';
export type { SeededArchitecture, SeededCommit } from './seed';
