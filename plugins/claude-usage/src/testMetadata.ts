import { isOpenForgePackageMetadata, type OpenForgePackageMetadata } from '@openforge-app/plugin-sdk'
import packageJson from '../package.json'

/**
 * `resolveJsonModule` widens `apiVersion` to `number`, so the imported manifest
 * needs the SDK's own guard before a fake will accept it as host metadata.
 */
function resolveMetadata(value: unknown): OpenForgePackageMetadata {
  if (!isOpenForgePackageMetadata(value)) throw new Error('package.json#openforge is not valid metadata')
  return value
}

export const PACKAGE_METADATA = resolveMetadata(packageJson.openforge)
