// Server-only auth configuration and password check.
import "server-only";
import { createHash, timingSafeEqual } from "crypto";

export const ADMIN_PASSWORD = "ILEOJA4321@";

export function checkPassword(input: string): boolean {
  // Hash both sides so timingSafeEqual always gets equal-length buffers.
  const a = createHash("sha256").update(input ?? "", "utf8").digest();
  const b = createHash("sha256").update(ADMIN_PASSWORD, "utf8").digest();
  return timingSafeEqual(a, b);
}
