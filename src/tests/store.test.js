import { describe, it, expect, afterEach, vi } from 'vitest';
import { useAppStore } from '../utils/store';

vi.mock('../utils/firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn() },
}));

describe('AppStore initialization', () => {
  afterEach(() => useAppStore.getState().resetStore());

  it('has correct initial state', () => {
    const state = useAppStore.getState();
    expect(state.vydaje).toEqual([]);
    expect(state.prijmy).toEqual([]);
    expect(state.vydajeReady).toBe(false);
    expect(state.prijmyReady).toBe(false);
    expect(state.filtryPrijem).toEqual({
      kategorie: 'vse-prijem',
      mesic: 'vse-mesic',
    });
    expect(state.filtrVydaj).toEqual({
      kategorie: 'vse',
      mesic: 'vse-mesic',
    });
  });

  it('setVydaje updates state and sets vydajeReady', () => {
    const items = [
      { id: '1', castka: 100, kategorie: 'jidlo' },
      { id: '2', castka: 50, kategorie: 'doprava' },
    ];
    useAppStore.getState().setVydaje(items);
    const { vydaje, vydajeReady } = useAppStore.getState();
    expect(vydaje).toEqual(items);
    expect(vydajeReady).toBe(true);
  });

  it('setPrijmy updates state and sets prijmyReady', () => {
    const items = [
      { id: '1', castka: 1000, kategorie: 'salary' },
    ];
    useAppStore.getState().setPrijmy(items);
    const { prijmy, prijmyReady } = useAppStore.getState();
    expect(prijmy).toEqual(items);
    expect(prijmyReady).toBe(true);
  });

  it('resetStore clears all state', () => {
    useAppStore.getState().setVydaje([{ id: '1', castka: 100 }]);
    useAppStore.getState().setPrijmy([{ id: '2', castka: 1000 }]);
    useAppStore.getState().resetStore();
    const state = useAppStore.getState();
    expect(state.vydaje).toEqual([]);
    expect(state.prijmy).toEqual([]);
    expect(state.vydajeReady).toBe(false);
    expect(state.prijmyReady).toBe(false);
  });

  it('setFiltrVydaj merges filter updates', () => {
    useAppStore.getState().setFiltrVydaj({ kategorie: 'jidlo' });
    const { filtrVydaj } = useAppStore.getState();
    expect(filtrVydaj.kategorie).toBe('jidlo');
    expect(filtrVydaj.mesic).toBe('vse-mesic');
  });

  it('setFiltrPrijem merges filter updates', () => {
    useAppStore.getState().setFiltrPrijem({ mesic: '2025-01' });
    const { filtryPrijem } = useAppStore.getState();
    expect(filtryPrijem.kategorie).toBe('vse-prijem');
    expect(filtryPrijem.mesic).toBe('2025-01');
  });
});
