import React, { useState, useCallback, useMemo } from 'react';
import type { Language } from '../i18n/translations';
import { getTranslation } from '../i18n/translations';
import { LanguageContext } from './language.context';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('restorify_lang');
    return (saved as Language) || 'es';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('restorify_lang', lang);
  }, []);

  const t = useCallback(
    (key: string) => getTranslation(language, key),
    [language]
  );

  // Memoised: without it every consumer of `t()` re-renders on any provider
  // render, and this provider sits above the whole app.
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
