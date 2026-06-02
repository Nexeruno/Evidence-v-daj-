import { useState, useEffect } from 'react';
import { Trash2, Printer, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { db, auth } from '../../utils/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

export const AILearningPanel = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [token, setToken] = useState(null);

  // Get auth token
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const userToken = await user.getIdToken();
        setToken(userToken);
      }
    });
    return () => unsubAuth();
  }, []);

  // Load reports from Firestore
  useEffect(() => {
    try {
      const q = query(
        collection(db, 'aiLearningReports'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        console.log('Reports loaded:', data.length);
        setReports(data);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      console.error('Firestore error:', err);
      setLoading(false);
    }
  }, []);

  const handleDelete = async (reportId) => {
    if (!token) {
      alert('Není autentifikace');
      return;
    }

    if (!window.confirm('Smazat tento report?')) return;

    try {
      const response = await fetch(
        'https://europe-west1-evidence-vydaju.cloudfunctions.net/aiDeleteLearningReport',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reportId }),
        }
      );

      if (!response.ok) throw new Error('Delete failed');
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err) {
      console.error('Delete error:', err);
      alert('Chyba: ' + err.message);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    const date = timestamp.toDate?.() || new Date(timestamp);
    return date.toLocaleDateString('cs-CZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">
          Žádné reporty. Spusť analýzu v sekci 'Kontrola'.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="px-4 py-3 text-left font-semibold">Vytvořeno</th>
              <th className="px-4 py-3 text-left font-semibold">Spuštěno</th>
              <th className="px-4 py-3 text-right font-semibold">Aktivní (24h)</th>
              <th className="px-4 py-3 text-right font-semibold">Výdaje (24h)</th>
              <th className="px-4 py-3 text-right font-semibold">Příjmy (24h)</th>
              <th className="px-4 py-3 text-center font-semibold">Akce</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tbody key={report.id}>
                {/* Main row */}
                <tr
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() =>
                    setExpandedId(expandedId === report.id ? null : report.id)
                  }
                >
                  <td className="px-4 py-3">{formatDate(report.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-3 py-1 rounded text-xs font-semibold ${
                        report.triggeredBy === 'manual'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {report.triggeredBy === 'manual' ? '🖱️ Ručně' : '⏰ Auto'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {report.timeWindows?.['24h']?.usersActive || 0}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600 font-semibold">
                    {report.timeWindows?.['24h']?.vydaje || 0}
                  </td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">
                    {report.timeWindows?.['24h']?.prijmy || 0}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.print();
                        }}
                        className="p-1 hover:bg-blue-100 rounded"
                        title="Tisk"
                      >
                        <Printer size={16} className="text-blue-600" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(report.id);
                        }}
                        className="p-1 hover:bg-red-100 rounded"
                        title="Smazat"
                      >
                        <Trash2 size={16} className="text-red-600" />
                      </button>
                      {expandedId === report.id ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded detail */}
                {expandedId === report.id && (
                  <tr className="bg-blue-50">
                    <td colSpan="6" className="px-4 py-4">
                      <ReportDetail report={report} />
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {reports.map((report) => (
          <div key={report.id} className="bg-white rounded-lg border">
            {/* Card header */}
            <div
              className="p-4 cursor-pointer hover:bg-gray-50"
              onClick={() =>
                setExpandedId(expandedId === report.id ? null : report.id)
              }
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatDate(report.createdAt)}
                  </p>
                  <span
                    className={`inline-block mt-1 px-2 py-1 rounded text-xs font-semibold ${
                      report.triggeredBy === 'manual'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {report.triggeredBy === 'manual' ? '🖱️ Ručně' : '⏰ Auto'}
                  </span>
                </div>
                {expandedId === report.id ? (
                  <ChevronUp size={20} className="text-gray-500" />
                ) : (
                  <ChevronDown size={20} className="text-gray-500" />
                )}
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="text-center">
                  <p className="text-xs text-gray-600">Aktivní (24h)</p>
                  <p className="text-lg font-bold text-gray-900">
                    {report.timeWindows?.['24h']?.usersActive || 0}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">Výdaje (24h)</p>
                  <p className="text-lg font-bold text-red-600">
                    {report.timeWindows?.['24h']?.vydaje || 0}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">Příjmy (24h)</p>
                  <p className="text-lg font-bold text-green-600">
                    {report.timeWindows?.['24h']?.prijmy || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Expanded detail */}
            {expandedId === report.id && (
              <div className="border-t px-4 py-4 bg-blue-50">
                <ReportDetail report={report} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const ReportDetail = ({ report }) => {
  const windows = ['5min', '30min', '1h', '2h', '4h', '6h', '8h', '12h', '24h'];

  return (
    <div className="space-y-4">
      <h4 className="font-bold text-lg text-gray-900">Časová okna</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="px-3 py-2 text-left font-semibold">Okno</th>
              <th className="px-3 py-2 text-right font-semibold">Už.</th>
              <th className="px-3 py-2 text-right font-semibold">Sez.</th>
              <th className="px-3 py-2 text-right font-semibold">Výd.</th>
              <th className="px-3 py-2 text-right font-semibold">Příj.</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((label) => {
              const w = report.timeWindows?.[label] || {};
              return (
                <tr key={label} className="border-b hover:bg-gray-50">
                  <td className="px-3 py-2 font-semibold">{label}</td>
                  <td className="px-3 py-2 text-right">{w.usersActive || 0}</td>
                  <td className="px-3 py-2 text-right">{w.sessions || 0}</td>
                  <td className="px-3 py-2 text-right text-red-600 font-semibold">
                    {w.vydaje || 0}
                  </td>
                  <td className="px-3 py-2 text-right text-green-600 font-semibold">
                    {w.prijmy || 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
