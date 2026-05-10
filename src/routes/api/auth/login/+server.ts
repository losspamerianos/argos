import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

export const POST: RequestHandler = async () => {
  // Skeleton stub. End-to-end wiring (password verification with argon2id,
  // refresh-token issuance, cookie set) lands in a follow-up step.
  throw error(501, 'login not implemented in skeleton');
};
