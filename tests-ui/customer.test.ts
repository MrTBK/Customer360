import { describe, expect, it } from 'vitest';
import { locationLabel, rfmParts, shortId } from '../src/utils/customer';

describe('customer display helpers', () => {
  it('shortens anonymized ids', () => {
    expect(shortId('861eff4711a542e4b93843c6dd7febb0')).toBe('861eff47');
    expect(shortId('')).toBe('—');
  });

  it('labels real city/state', () => {
    expect(locationLabel('sao paulo', 'sp')).toBe('Sao Paulo · SP');
    expect(locationLabel(null, null)).toBe('—');
  });

  it('splits rfm scores into plain parts', () => {
    expect(rfmParts('215')).toEqual(['2', '1', '5']);
    expect(rfmParts(null)).toEqual(['—', '—', '—']);
  });
});
