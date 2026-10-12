import { ExternalLink } from 'lucide-react';

function safeHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function getGoogleDrivePreviewUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const url = safeHttpUrl(value);
  if (!url || url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'drive.google.com') return null;

  const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) return null;
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
}

export function SessionRecordingPlayer({ url, title }: { url: string | null | undefined; title: string }) {
  if (!url) return null;

  const previewUrl = getGoogleDrivePreviewUrl(url);
  if (!previewUrl) return null;

  return <div className="session-recording-player" data-testid="session-recording-player">
    <iframe
      src={previewUrl}
      title={`Session recording: ${title}`}
      loading="lazy"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
    <a href={url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open in Google Drive</a>
  </div>;
}
