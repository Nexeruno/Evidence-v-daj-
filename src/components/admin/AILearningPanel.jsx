import { CheckCircle, AlertCircle, Target, Zap, TrendingUp, Lightbulb } from 'lucide-react';

export const AILearningPanel = () => {
  const capabilities = [
    { name: 'Sběr chování uživatelů', desc: 'Trackuje čas v sekcích, klikání, zadávání textu bez Login/Logout' },
    { name: 'Časové analýzy', desc: 'Ví, kdy a jak dlouho se uživatelé pohybují v aplikaci' },
    { name: 'Kategorické vzorce', desc: 'Pozoruje, které kategorie se používají a jak často' },
    { name: 'Opakující se chování', desc: 'Detekuje opakující se vzorce v zadávání záznamů' },
    { name: 'Per-user analýzy', desc: 'Každý uživatel má separátní profil a historii' },
    { name: 'Bezpečný sběr dat', desc: 'Nikdy se nesbírají finanční data, pouze chování' },
  ];

  const limitations = [
    { name: 'Bez obsahu transakcí', desc: 'Neví, co konkrétně uživatel zadal (částky, názvy)' },
    { name: 'Bez psychologických dat', desc: 'Nemůže dedukovat proč uživatel něco dělá' },
    { name: 'Bez budoucích prediktů', desc: 'Nemůže předpovědět budoucí chování' },
    { name: 'Bez chatovacího rozhraní', desc: 'Nemůže komunikovat s uživatelem v reálném čase' },
    { name: 'Bez skrytých vlivů', desc: 'Nevidí externí faktory (tržní podmínky, osobní eventos)' },
  ];

  const gaps = [
    {
      title: 'Prediktivní modelování',
      desc: 'AI by mohla předpovědět budoucí chování (např. kdy uživatel přidá další záznam)',
      effort: 'Střední',
      impact: 'Vysoký'
    },
    {
      title: 'Anomálie detekce',
      desc: 'Automaticky detekovat neobvyklé chování (spam, chyby, nezvyklé používání)',
      effort: 'Nízký',
      impact: 'Vysoký'
    },
    {
      title: 'Doporučovací systém',
      desc: 'Navrhovat kategorie nebo optimalizace na základě chování',
      effort: 'Střední',
      impact: 'Střední'
    },
    {
      title: 'Sentiment analýza',
      desc: 'Analyzovat náladu či spokojenost z chování (rychlost zadávání, chyby)',
      effort: 'Vysoký',
      impact: 'Nízký'
    },
    {
      title: 'Skupinové analýzy',
      desc: 'Porovnávat chování mezi skupinami uživatelů a nacházet vzorce',
      effort: 'Střední',
      impact: 'Střední'
    },
  ];

  const improvements = [
    { feature: '🔊 Explainability', desc: 'Vysvětlit proč AI udělala určitý závěr' },
    { feature: '📈 Real-time insights', desc: 'Zobrazovat insights v reálném čase místo každých 10 hodin' },
    { feature: '🎯 Custom alerts', desc: 'Upozornit na anomálie nebo zajímavé vzoce automaticky' },
    { feature: '📊 Exporty', desc: 'Exportovat analýzy do PDF/CSV pro hlubší studium' },
    { feature: '🔄 Feedback loop', desc: 'Učit se z tvé zpětné vazby na správnost analýz' },
  ];

  return (
    <div className="space-y-6">
      {/* Co AI Umí */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle size={24} className="text-green-600" />
          <h3 className="text-lg font-semibold">✅ Co AI Umí Dělat</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {capabilities.map((cap, idx) => (
            <div
              key={idx}
              className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
            >
              <div className="flex items-start gap-2">
                <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-green-900 dark:text-green-200">{cap.name}</p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">{cap.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Co AI Neumí */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle size={24} className="text-yellow-600" />
          <h3 className="text-lg font-semibold">⚠️ Onde AI Má Limity</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {limitations.map((lim, idx) => (
            <div
              key={idx}
              className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
            >
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-yellow-900 dark:text-yellow-200">{lim.name}</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">{lim.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mezery & Příležitosti */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Target size={24} className="text-blue-600" />
          <h3 className="text-lg font-semibold">🎯 Oblasti k Vylepšení</h3>
        </div>

        <div className="space-y-3">
          {gaps.map((gap, idx) => (
            <div
              key={idx}
              className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
            >
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-semibold text-blue-900 dark:text-blue-200">{gap.title}</h4>
                <div className="flex gap-2 text-xs">
                  <span className={`px-2 py-1 rounded font-medium ${
                    gap.effort === 'Nízký' ? 'bg-green-200 dark:bg-green-700 text-green-800 dark:text-green-100' :
                    gap.effort === 'Střední' ? 'bg-yellow-200 dark:bg-yellow-700 text-yellow-800 dark:text-yellow-100' :
                    'bg-red-200 dark:bg-red-700 text-red-800 dark:text-red-100'
                  }`}>
                    Úsilí: {gap.effort}
                  </span>
                  <span className={`px-2 py-1 rounded font-medium ${
                    gap.impact === 'Vysoký' ? 'bg-red-200 dark:bg-red-700 text-red-800 dark:text-red-100' :
                    gap.impact === 'Střední' ? 'bg-yellow-200 dark:bg-yellow-700 text-yellow-800 dark:text-yellow-100' :
                    'bg-green-200 dark:bg-green-700 text-green-800 dark:text-green-100'
                  }`}>
                    Dopad: {gap.impact}
                  </span>
                </div>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-300">{gap.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Návrhy na Vylepšení */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Lightbulb size={24} className="text-orange-600" />
          <h3 className="text-lg font-semibold">💡 Jak Zlepšit AI Schopnosti</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {improvements.map((imp, idx) => (
            <div
              key={idx}
              className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg"
            >
              <div className="flex items-start gap-2">
                <Lightbulb size={16} className="text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-orange-900 dark:text-orange-200">{imp.feature}</p>
                  <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">{imp.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strategie */}
      <div className="card border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-950">
        <div className="flex items-center gap-3 mb-3">
          <TrendingUp size={20} className="text-purple-600" />
          <h4 className="font-semibold text-purple-900 dark:text-purple-200">🚀 Dlouhodobá Strategie</h4>
        </div>
        <ul className="text-sm text-purple-800 dark:text-purple-300 space-y-2">
          <li>• <strong>Fáze 1:</strong> Akumulovat data (sběr bez výstupu) — právě zde jsme</li>
          <li>• <strong>Fáze 2:</strong> Detektovat anomálie a zajímavé vzorce (bez prediktů)</li>
          <li>• <strong>Fáze 3:</strong> Budovat prediktivní modely (co se bude dít)</li>
          <li>• <strong>Fáze 4:</strong> Doporučovací systém (jak se zvýšit produktivita)</li>
          <li>• <strong>Fáze 5:</strong> Autonomní optimalizace (AI se sama sebou zlepšuje)</li>
        </ul>
      </div>
    </div>
  );
};
