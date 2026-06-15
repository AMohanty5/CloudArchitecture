/** Public API of the validation module. Import only from here (eslint-boundaries). */
export { ValidationModule } from './validation.module';
export { validateModel } from './validate';
export type { Finding, Severity, Category, ValidationReport } from './engine';
