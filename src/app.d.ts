import type { AccessClaims } from '$lib/server/auth/jwt';

declare global {
  namespace App {
    interface Locals {
      user: AccessClaims | null;
      locale: string;
      requestId: string;
    }
  }
}

export {};
