/** Public API of the iac module. Import only from here (eslint-boundaries). */
export { IacModule } from './iac.module';
export { generateTerraform } from './terraform';
export type { TerraformBundle } from './terraform';
export { zipFiles } from './zip';
