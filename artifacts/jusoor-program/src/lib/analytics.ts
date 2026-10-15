type AnalyticsData = Record<string, string | number | boolean>;

type ZoomFailureEvent =
  | {
      name: 'zoom_connection_failure';
      stage: 'authorization_start' | 'authorization_callback' | 'disconnect';
    }
  | {
      name: 'zoom_meeting_save_failure';
      action: 'created' | 'updated';
    }
  | {
      name: 'zoom_recording_alert_retry_failure';
    };

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackZoomFailure(event: ZoomFailureEvent): void {
  const { name, ...data } = event;
  trackEvent(name, data);
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === 'undefined') return;

  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never break the app.
  }
}
