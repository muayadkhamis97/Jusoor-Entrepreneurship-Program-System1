function httpStatusFromError(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  if (typeof candidate.status === 'number') return candidate.status;
  return typeof candidate.response?.status === 'number' ? candidate.response.status : undefined;
}

function serverMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const candidate = error as {
    data?: { error?: unknown };
    response?: { data?: { error?: unknown } };
  };
  const message = candidate.data?.error ?? candidate.response?.data?.error;
  return typeof message === 'string' ? message : '';
}

export function applicationSubmitErrorKey(error: unknown): string {
  const status = httpStatusFromError(error);
  const message = serverMessage(error);
  if (status === 409) {
    return 'An application for this email and program already exists. Sign in with that email to track it, or contact the program team.';
  }
  if (/closed|not accepting|not open/i.test(message)) {
    return 'This program is no longer accepting applications. Explore open programs instead.';
  }
  if (status === 404) {
    return 'This program or application form is no longer available. Explore open programs instead.';
  }
  if (status === 400 || status === 422) {
    return 'Review the required application fields and try submitting again.';
  }
  return 'We couldn’t submit your application. Check your connection and try again.';
}
