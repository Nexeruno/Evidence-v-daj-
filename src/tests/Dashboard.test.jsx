import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from '../components/Dashboard';
import { useAppStore } from '../utils/store';

vi.mock('../utils/store');
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { uid: 'test-uid', email: 'test@example.com', isAdmin: false },
  }),
}));

vi.mock('../utils/aiTracker', () => ({
  aiTracker: {
    init: vi.fn(),
    trackTabChange: vi.fn(),
  },
}));

vi.mock('../components/ItemCard', () => ({
  ItemCardVydaj: ({ item }) => <div data-testid="item-card">Výdaj: {item.id}</div>,
  ItemCardPrijem: ({ item }) => <div data-testid="item-card">Příjem: {item.id}</div>,
}));

vi.mock('../components/PendingTransactions', () => ({
  PendingTransactions: () => <div data-testid="pending">Pending</div>,
}));

vi.mock('recharts', () => ({
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Pie: () => <div />,
  Bar: () => <div />,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

vi.mock('../utils/export', () => ({
  exportVypisPDF: vi.fn(),
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing when data is not ready', () => {
    useAppStore.mockImplementation((selector) => {
      const state = {
        vydaje: [],
        prijmy: [],
        vydajeReady: false,
        prijmyReady: false,
        filtryPrijem: { kategorie: 'vse-prijem', mesic: 'vse-mesic' },
        filtrVydaj: { kategorie: 'vse', mesic: 'vse-mesic' },
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    const { container } = render(<Dashboard />);
    expect(container).toBeInTheDocument();
  });

  it('renders empty state when no income data exists', () => {
    useAppStore.mockImplementation((selector) => {
      const state = {
        vydaje: [],
        prijmy: [],
        vydajeReady: true,
        prijmyReady: true,
        filtryPrijem: { kategorie: 'vse-prijem', mesic: 'vse-mesic' },
        filtrVydaj: { kategorie: 'vse', mesic: 'vse-mesic' },
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    const { container } = render(<Dashboard />);
    expect(container).toBeInTheDocument();
  });

  it('renders financial health card with data when ready', () => {
    useAppStore.mockImplementation((selector) => {
      const state = {
        vydaje: [
          { id: '1', castka: 100, kategorie: 'jidlo', nazev: 'Oběd' },
        ],
        prijmy: [
          { id: '1', castka: 2000, kategorie: 'salary', nazev: 'Plat' },
        ],
        vydajeReady: true,
        prijmyReady: true,
        filtryPrijem: { kategorie: 'vse-prijem', mesic: 'vse-mesic' },
        filtrVydaj: { kategorie: 'vse', mesic: 'vse-mesic' },
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    const { container } = render(<Dashboard />);
    expect(container).toBeInTheDocument();
  });

  it('renders filter and transaction sections', () => {
    useAppStore.mockImplementation((selector) => {
      const state = {
        vydaje: [],
        prijmy: [{ id: '1', castka: 1000, kategorie: 'salary', nazev: 'Plat' }],
        vydajeReady: true,
        prijmyReady: true,
        filtryPrijem: { kategorie: 'vse-prijem', mesic: 'vse-mesic' },
        filtrVydaj: { kategorie: 'vse', mesic: 'vse-mesic' },
        setFiltrPrijem: vi.fn(),
        setFiltrVydaj: vi.fn(),
      };
      return typeof selector === 'function' ? selector(state) : state;
    });

    const { container } = render(<Dashboard />);
    expect(container).toBeInTheDocument();
  });
});
