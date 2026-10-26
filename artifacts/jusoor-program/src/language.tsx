import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type AppLanguage = 'en' | 'ar';
let activeLanguage: AppLanguage = 'en';

export const currentLanguage = () => activeLanguage;

let arabic: Record<string, string> | null = null;
let arabicTranslationsPromise: Promise<Record<string, string>> | null = null;

export function loadArabicTranslations(): Promise<void> {
  if (!arabicTranslationsPromise) {
    arabicTranslationsPromise = import('./arabic-translations')
      .then(module => {
        arabic = module.arabicTranslations;
        return arabic;
      })
      .catch(error => {
        arabicTranslationsPromise = null;
        throw error;
      });
  }
  return arabicTranslationsPromise.then(() => undefined);
}

export function translate(text: string, language: AppLanguage): string {
  return language === 'ar' ? (arabic?.[text] ?? text) : text;
}

export function hasArabicTranslation(text: string): boolean {
  return Object.prototype.hasOwnProperty.call(arabic ?? {}, text);
}

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
  toggleLanguage: () => Promise<void>;
  t: (text: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function initialLanguage(): AppLanguage {
  try {
    return window.localStorage.getItem('jusoor-language') === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => {
    const language = initialLanguage();
    return { language, ready: language === 'en' };
  });
  const languageRequest = useRef(0);
  activeLanguage = state.language;

  const setLanguage = useCallback(async (language: AppLanguage) => {
    const request = ++languageRequest.current;
    if (language === 'ar') await loadArabicTranslations();
    if (request !== languageRequest.current) return;
    activeLanguage = language;
    setState({ language, ready: true });
  }, []);

  useEffect(() => {
    if (state.language !== 'ar' || state.ready) return;
    const request = ++languageRequest.current;
    void loadArabicTranslations().then(() => {
      if (request !== languageRequest.current) return;
      activeLanguage = 'ar';
      setState({ language: 'ar', ready: true });
    }).catch(error => {
      console.error('Arabic translations could not be loaded.', error);
    });
  }, [state.language, state.ready]);

  useLayoutEffect(() => {
    document.documentElement.lang = state.language;
    document.documentElement.dir = state.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dataset.language = state.language;
    try {
      window.localStorage.setItem('jusoor-language', state.language);
    } catch {
      // Keep language switching available when browser storage is disabled.
    }
  }, [state.language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language: state.language,
    setLanguage,
    toggleLanguage: () => setLanguage(state.language === 'en' ? 'ar' : 'en'),
    t: text => translate(text, state.language),
  }), [state.language, setLanguage]);
  return <LanguageContext.Provider value={value}>{state.ready ? children : null}</LanguageContext.Provider>;
}

export function useAppLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useAppLanguage must be used inside LanguageProvider.');
  return value;
}

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { language, toggleLanguage, t } = useAppLanguage();
  return <button
    type="button"
    className={`language-toggle ${className}`.trim()}
    onClick={toggleLanguage}
    aria-label={language === 'ar' ? 'Switch language to English' : 'تغيير اللغة إلى العربية'}
    title={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
    data-testid="button-language-toggle"
  >
    <span aria-hidden="true">文</span>
    {language === 'ar' ? 'English' : 'العربية'}
  </button>;
}

export function t(text: string): string {
  return translate(text, activeLanguage);
}

export function brandedAdminRoleLabel(
  brandName: string | null | undefined,
  language: AppLanguage = activeLanguage,
): string {
  const brand = getDisplayBrandName(brandName);
  return language === 'ar'
    ? `${translate('Admin', language)} ${brand}`
    : `${brand} admin`;
}

/** Avoid reviving the retired identity from an old saved branding record. */
export function getDisplayBrandName(brandName?: string | null): string {
  const configured = brandName?.trim();
  return configured && !/(jusoor|جسور)/i.test(configured) ? configured : 'Program Hub';
}

/** The fallback name already reads "Program Hub", so repeating it as a caption looks like a mistake. */
export function shouldShowBrandCaption(displayBrandName: string): boolean {
  return displayBrandName.trim().toLowerCase() !== 'program hub';
}

export function isAllowedDisplayBrandName(brandName: string): boolean {
  return !/(jusoor|جسور)/i.test(brandName);
}
