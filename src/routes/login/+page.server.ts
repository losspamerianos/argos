import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { safeNext } from '$lib/server/util/safe-next';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.user) {
    throw redirect(303, safeNext(url.searchParams.get('next')));
  }
  return {};
};
