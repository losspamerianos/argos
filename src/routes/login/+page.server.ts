import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { safeNext } from '$lib/server/util/safe-next';

export const load: PageServerLoad = async ({ locals, url }) => {
  const next = safeNext(url.searchParams.get('next'));
  if (locals.user) {
    throw redirect(303, next);
  }
  // Pass the server-validated `next` so the client form does not have to
  // re-implement the open-redirect guard. Returning the validated value also
  // means the value the user sees is the value the server will accept.
  return { next };
};
