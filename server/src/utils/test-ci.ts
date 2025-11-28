/**
 * Test utilities for CI/CD environment handling.
 * Provides helpers to skip integration tests in CI environments.
 */

import { isCI } from "../utils/ci.ts";

/**
 * Skip test if running in CI/CD environment.
 * Use this for integration tests that require specific test data or resources.
 *
 * @example
 * ```ts
 * it.skipIf(isCI(), 'should work with large files', async () => {
 *   // Integration test that only runs locally
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function skipIfCI<T extends (...args: any[]) => any>(fn: T): T | undefined {
  return isCI() ? undefined : fn;
}

/**
 * Mark a test to be skipped if in CI environment.
 * Use with vitest's `it.skipIf()` for cleaner syntax.
 */
export const skipInCI = isCI();
