/**
 * Public API of the Architecture module. Other modules (and the app root) import
 * ONLY from here — never module internals (enforced by eslint-boundaries).
 */
export { ArchitectureModule } from './architecture.module';
export { ArchitectureService } from './architecture.service';
export { seedDatabase } from './seed';
export type { SeededArchitecture, SeededCommit } from './seed';
