// A stand-in for POST /api/search, for the phone scripts (route interception: no key, no network). The response shapes are `SearchData` (src/lib/search.ts).
//  'results'  a careful pass with five ideas, the first four above the 30% bar; the quick pass lists the same ones
//  'nothing'  the gate says nothing fits ("Nothing here fits that closely.")
//  'no_key'   the server is not connected ("Search is not connected yet.")
import type { Page } from 'playwright';

export type SearchMock = 'results' | 'nothing' | 'no_key';
/** Concepts the 'results' mock lists, best first. */
export const MOCK_IDS = ['commander-intent', 'position-contracts', 'trip-wires', 'fix-flex', 'what-why-how'];
const P = [0.86, 0.71, 0.55, 0.41, 0.22];

export async function mockSearch(page: Page, mode: SearchMock) {
  await page.route('**/api/search', async (route) => {
    if (mode === 'no_key') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'no_key' }) });
    const stage = (route.request().postDataJSON() as { stage: string }).stage;
    if (mode === 'nothing') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ gate: 0.05, ranked: [] }) });
    const scored = MOCK_IDS.map((id, i) => ({ id, p: P[i]! }));
    const body = stage === 'full' ? { gate: 0.9, ranked: scored, results: scored } : { gate: 0.9, ranked: scored };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
