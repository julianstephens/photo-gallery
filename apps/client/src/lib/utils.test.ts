import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPIRY_WARNING_THRESHOLD_DAYS,
  getDaysUntilExpiry,
  getExpirationStatus,
} from "./utils";

describe("getDaysUntilExpiry", () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  it("should return positive days for future expiration", () => {
    const now = Date.now();
    const expiresAt = now + 5 * ONE_DAY_MS;
    expect(getDaysUntilExpiry(expiresAt, now)).toBe(5);
  });

  it("should return 1 for expiration tomorrow", () => {
    const now = Date.now();
    const expiresAt = now + ONE_DAY_MS;
    expect(getDaysUntilExpiry(expiresAt, now)).toBe(1);
  });

  it("should return 0 for expiration today", () => {
    const now = Date.now();
    const expiresAt = now; // Same time
    expect(getDaysUntilExpiry(expiresAt, now)).toBe(0);
  });

  it("should return negative days for past expiration", () => {
    const now = Date.now();
    const expiresAt = now - 2 * ONE_DAY_MS;
    expect(getDaysUntilExpiry(expiresAt, now)).toBe(-2);
  });

  it("should round up partial days", () => {
    const now = Date.now();
    // 1.5 days in the future should round up to 2
    const expiresAt = now + 1.5 * ONE_DAY_MS;
    expect(getDaysUntilExpiry(expiresAt, now)).toBe(2);
  });
});

describe("getExpirationStatus", () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  it("should return isExpired=true for past expiration dates", () => {
    const now = Date.now();
    const expiresAt = now - ONE_DAY_MS;
    const status = getExpirationStatus(expiresAt, 7, now);

    expect(status.isExpired).toBe(true);
    expect(status.isExpiringSoon).toBe(false);
    expect(status.message).toBe("Expired");
  });

  it("should return isExpired=true when expiration is exactly now", () => {
    const now = Date.now();
    const status = getExpirationStatus(now, 7, now);

    expect(status.isExpired).toBe(true);
    expect(status.isExpiringSoon).toBe(false);
  });

  it("should return isExpiringSoon=true for dates within threshold", () => {
    const now = Date.now();
    const expiresAt = now + 3 * ONE_DAY_MS;
    const status = getExpirationStatus(expiresAt, 7, now);

    expect(status.isExpired).toBe(false);
    expect(status.isExpiringSoon).toBe(true);
    expect(status.daysUntilExpiry).toBe(3);
    expect(status.message).toBe("Expires in 3 days");
  });

  it("should return isExpiringSoon=false for dates beyond threshold", () => {
    const now = Date.now();
    const expiresAt = now + 10 * ONE_DAY_MS;
    const status = getExpirationStatus(expiresAt, 7, now);

    expect(status.isExpired).toBe(false);
    expect(status.isExpiringSoon).toBe(false);
    expect(status.daysUntilExpiry).toBe(10);
  });

  it("should return 'Expires tomorrow' for 1 day until expiry", () => {
    const now = Date.now();
    const expiresAt = now + ONE_DAY_MS;
    const status = getExpirationStatus(expiresAt, 7, now);

    expect(status.isExpiringSoon).toBe(true);
    expect(status.daysUntilExpiry).toBe(1);
    expect(status.message).toBe("Expires tomorrow");
  });

  it("should use custom threshold", () => {
    const now = Date.now();
    const expiresAt = now + 5 * ONE_DAY_MS;

    // With threshold of 3, should not be expiring soon
    const status3 = getExpirationStatus(expiresAt, 3, now);
    expect(status3.isExpiringSoon).toBe(false);

    // With threshold of 7, should be expiring soon
    const status7 = getExpirationStatus(expiresAt, 7, now);
    expect(status7.isExpiringSoon).toBe(true);
  });

  it("should use default threshold when not specified", () => {
    const now = Date.now();
    const expiresAt = now + (DEFAULT_EXPIRY_WARNING_THRESHOLD_DAYS - 1) * ONE_DAY_MS;
    const status = getExpirationStatus(expiresAt, undefined, now);

    expect(status.isExpiringSoon).toBe(true);
  });
});
