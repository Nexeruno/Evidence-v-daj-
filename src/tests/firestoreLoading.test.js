import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearSessionCache } from '../hooks/useFirestoreSync';

describe('Firestore data loading (useFirestoreSync)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('clearSessionCache removes cached vydaje', () => {
    const uid = 'test-uid';
    const cacheKey = `evd-vydaje-${uid}`;
    sessionStorage.setItem(cacheKey, JSON.stringify([{ id: '1', castka: 100 }]));

    expect(sessionStorage.getItem(cacheKey)).toBeTruthy();

    clearSessionCache(uid);

    expect(sessionStorage.getItem(cacheKey)).toBeNull();
  });

  it('clearSessionCache removes cached prijmy', () => {
    const uid = 'test-uid';
    const cacheKey = `evd-prijmy-${uid}`;
    sessionStorage.setItem(cacheKey, JSON.stringify([{ id: '1', castka: 2000 }]));

    expect(sessionStorage.getItem(cacheKey)).toBeTruthy();

    clearSessionCache(uid);

    expect(sessionStorage.getItem(cacheKey)).toBeNull();
  });

  it('clearSessionCache removes both caches when called', () => {
    const uid = 'test-uid';
    const vydajeKey = `evd-vydaje-${uid}`;
    const prijmyKey = `evd-prijmy-${uid}`;

    sessionStorage.setItem(vydajeKey, JSON.stringify([{ id: '1' }]));
    sessionStorage.setItem(prijmyKey, JSON.stringify([{ id: '2' }]));

    clearSessionCache(uid);

    expect(sessionStorage.getItem(vydajeKey)).toBeNull();
    expect(sessionStorage.getItem(prijmyKey)).toBeNull();
  });

  it('clearSessionCache handles non-existent cache gracefully', () => {
    const uid = 'non-existent';

    // Should not throw
    expect(() => clearSessionCache(uid)).not.toThrow();
  });

  it('sessionStorage data persists correctly', () => {
    const uid = 'test-uid';
    const testData = [
      { id: '1', castka: 100, kategorie: 'food' },
      { id: '2', castka: 200, kategorie: 'transport' },
    ];

    sessionStorage.setItem(`evd-vydaje-${uid}`, JSON.stringify(testData));

    const retrieved = JSON.parse(sessionStorage.getItem(`evd-vydaje-${uid}`));
    expect(retrieved).toEqual(testData);
  });
});
