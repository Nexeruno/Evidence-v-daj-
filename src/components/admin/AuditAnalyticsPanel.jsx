import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { Search, Filter, Download, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export const AuditAnalyticsPanel = () => {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [stats, setStats] = useState({});

  useEffect(() => {
    const loadLogs = async () => {
      try {
        // Fetch audit logs
        const auditSnap = await getDocs(
          query(collection(db, '_auditLog'), orderBy('timestamp', 'desc'), limit(100))
        );
        const auditLogs = auditSnap.docs.map((d) => ({
          id: d.id,
          type: 'audit',
          ...d.data(),
        }));

        // Fetch security events
        const securitySnap = await getDocs(
          query(collection(db, '_securityEvents'), orderBy('timestamp', 'desc'), limit(100))
        );
        const securityLogs = securitySnap.docs.map((d) => ({
          id: d.id,
          type: 'security',
          ...d.data(),
        }));

        // Combine and sort
        const allLogs = [...auditLogs, ...securityLogs].sort(
          (a, b) => (b.timestamp?.toDate?.()?.getTime?.() || 0) - (a.timestamp?.toDate?.()?.getTime?.() || 0)
        );

        setLogs(allLogs);
        setFilteredLogs(allLogs);

        // Calculate stats
        const auditCounts = {};
        const securityCounts = {};
        auditLogs.forEach((log) => {
          auditCounts[log.action] = (auditCounts[log.action] || 0) + 1;
        });
        securityLogs.forEach((log) => {
          securityCounts[log.eventType] = (securityCounts[log.eventType] || 0) + 1;
        });

        setStats({ auditCounts, securityCounts, total: allLogs.length });
      } catch (err) {
        console.error('Error loading logs:', err);
        toast.error('Chyba při načítání logů');
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, []);

  const handleSearch = (term) => {
    setSearchTerm(term);
    filterLogs(term, filterType);
  };

  const handleFilter = (type) => {
    setFilterType(type);
    filterLogs(searchTerm, type);
  };

  const filterLogs = (search, type) => {
    let result = logs;

    if (type !== 'all') {
      result = result.filter((log) => log.type === type);
    }

    if (search) {
      result = result.filter(
        (log) =>
          (log.action || '').toLowerCase().includes(search.toLowerCase()) ||
          (log.eventType || '').toLowerCase().includes(search.toLowerCase()) ||
          (log.adminUid || '').substring(0, 8).includes(search.toLowerCase()) ||
          (log.details?.uid || '').substring(0, 8).includes(search.toLowerCase())
      );
    }

    setFilteredLogs(result);
  };

  const exportLog = () => {
    const csv = [
      ['Čas', 'Typ', 'Akce/Событие', 'UID', 'Detaily'].join(','),
      ...filteredLogs.map((log) =>
        [
          log.timestamp?.toDate?.()?.toLocaleString?.('cs-CZ') || new Date(log.timestamp).toLocaleString('cs-CZ'),
          log.type === 'audit' ? 'AUDIT' : 'SECURITY',
          log.action || log.eventType,
          (log.adminUid || log.details?.uid || 'N/A').substring(0, 8),
          JSON.stringify(log.details || {}).substring(0, 50),
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Log exportován');
  };

  const getIcon = (log) => {
    if (log.type === 'security') {
      if (log.severity === 'high') return <AlertCircle size={16} className="text-red-600" />;
      if (log.severity === 'medium') return <Clock size={16} className="text-yellow-600" />;
    }
    return <CheckCircle size={16} className="text-green-600" />;
  };

  const formatValue = (val) => {
    if (!val) return '—';
    if (typeof val === 'object') return JSON.stringify(val).substring(0, 40) + '...';
    return String(val).substring(0, 40);
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Celkem logů</p>
          <p className="text-2xl font-bold">{stats.total || 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Audit akcí</p>
          <p className="text-2xl font-bold">{Object.keys(stats.auditCounts || {}).length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Security eventů</p>
          <p className="text-2xl font-bold">{Object.keys(stats.securityCounts || {}).length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-light-textMuted dark:text-dark-textMuted">Poslední 100</p>
          <p className="text-2xl font-bold">{filteredLogs.length}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="flex flex-col lg:flex-row gap-3 mb-4">
          <div className="flex-1 flex items-center gap-2 bg-light-bg dark:bg-dark-bg rounded px-3 py-2">
            <Search size={16} className="text-light-textMuted dark:text-dark-textMuted" />
            <input
              type="text"
              placeholder="Hledat UID, akci, event..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="bg-transparent flex-1 text-sm border-0 focus:ring-0"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={(e) => handleFilter(e.target.value)}
              className="select-field"
            >
              <option value="all">Všechno</option>
              <option value="audit">Audit Only</option>
              <option value="security">Security Only</option>
            </select>
            <button
              onClick={exportLog}
              className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center gap-2"
            >
              <Download size={16} />
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-light-border dark:border-dark-border">
              <th className="text-left py-3 px-3">Čas</th>
              <th className="text-left py-3 px-3">Typ</th>
              <th className="text-left py-3 px-3">Akce / Event</th>
              <th className="text-left py-3 px-3">UID (Admin)</th>
              <th className="text-left py-3 px-3">Detaily</th>
              <th className="text-left py-3 px-3">Severity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-light-textMuted dark:text-dark-textMuted">
                  Načítám...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-light-textMuted dark:text-dark-textMuted">
                  Žádné logy nenalezeny
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="border-b border-light-border dark:border-dark-border hover:bg-light-bg dark:hover:bg-dark-card">
                  <td className="py-3 px-3 text-xs text-light-textMuted dark:text-dark-textMuted">
                    {log.timestamp?.toDate?.()?.toLocaleTimeString?.('cs-CZ') || new Date(log.timestamp).toLocaleTimeString('cs-CZ')}
                  </td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      log.type === 'audit'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                        : 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
                    }`}>
                      {log.type === 'audit' ? 'AUDIT' : 'SECURITY'}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-xs font-semibold">{log.action || log.eventType}</td>
                  <td className="py-3 px-3 font-mono text-xs">{(log.adminUid || log.details?.uid || '—').substring(0, 8)}</td>
                  <td className="py-3 px-3 font-mono text-xs text-light-textMuted dark:text-dark-textMuted">
                    {formatValue(log.details || log.reason)}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1">
                      {getIcon(log)}
                      {log.severity && <span className="text-xs">{log.severity}</span>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info */}
      <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          💡 <strong>Tip:</strong> Hledejte anomálie - neobvyklé časy, IPs, či opakující se failury.
          Exportujte si CSV pro detailnější analýzu.
        </p>
      </div>
    </div>
  );
};
