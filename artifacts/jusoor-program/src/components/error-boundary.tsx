import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { isModuleLoadError, recoverFromRenderError } from '../module-load-recovery';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

const FALLBACK_COPY = {
  en: {
    title: 'Something went wrong',
    body: 'This part of the app hit an error. The rest of the app is still running.',
    help: 'If this keeps happening, contact the program team and tell them what you were doing.',
    retry: 'Try again',
    moduleTitle: 'This page could not finish loading',
    moduleBody: 'A required page file could not be downloaded. Reload the page to try again.',
    reload: 'Reload page',
    home: 'Back to home',
  },
  ar: {
    title: 'حدث خطأ ما',
    body: 'واجه هذا الجزء من التطبيق خطأً. بقية التطبيق ما زالت تعمل.',
    help: 'إذا تكرر ذلك، تواصل مع فريق البرنامج وأخبرهم بما كنت تفعله.',
    retry: 'حاول مرة أخرى',
    moduleTitle: 'تعذّر إكمال تحميل هذه الصفحة',
    moduleBody: 'تعذّر تنزيل ملف مطلوب للصفحة. أعد تحميل الصفحة للمحاولة مرة أخرى.',
    reload: 'إعادة تحميل الصفحة',
    home: 'العودة إلى الرئيسية',
  },
} as const;

/**
 * This boundary sits outside the language provider, and an error can happen before
 * the provider has set the page language, so check the saved choice first.
 */
function prefersArabic(): boolean {
  try {
    if (window.localStorage.getItem('jusoor-language') === 'ar') return true;
  } catch {
    // Storage can be unavailable (private mode); fall back to the page language.
  }
  return typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('ar');
}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  const isArabic = prefersArabic();
  const copy = isArabic ? FALLBACK_COPY.ar : FALLBACK_COPY.en;
  const moduleFailed = isModuleLoadError(error);
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6"
      lang={isArabic ? 'ar' : 'en'}
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      <div className="max-w-lg w-full text-center" role="alert">
        <h1 className="text-xl font-semibold text-gray-900">{moduleFailed ? copy.moduleTitle : copy.title}</h1>
        <p className="mt-2 text-sm text-gray-600">{moduleFailed ? copy.moduleBody : copy.body}</p>
        <p className="mt-1 text-sm text-gray-600">{copy.help}</p>
        {/* Dev only: messages can carry API responses and other internals. */}
        {import.meta.env.DEV ? (
          <pre className="mt-4 overflow-x-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-800" dir="ltr">
            {error.message || String(error)}
          </pre>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={resetError}
            className="min-h-11 rounded bg-gray-900 px-5 py-2 text-sm text-white hover:bg-gray-700"
          >
            {moduleFailed ? copy.reload : copy.retry}
          </button>
          <a
            href={import.meta.env.BASE_URL || '/'}
            className="inline-flex min-h-11 items-center rounded border border-gray-300 px-5 py-2 text-sm text-gray-900 hover:bg-gray-100"
          >
            {copy.home}
          </a>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      'ErrorBoundary caught an error:',
      import.meta.env.DEV ? toError(error).message : toError(error).name,
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  resetError = (): void => {
    recoverFromRenderError(this.state.error, {
      reload: () => window.location.reload(),
      reset: () => this.setState({ error: null }),
    });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
