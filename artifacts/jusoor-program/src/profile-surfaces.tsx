import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useClerk } from '@clerk/react';
import {
  getGetOwnProfileQueryKey,
  getListUserProfilesQueryKey,
  useCreateOwnProfilePhotoUploadUrl,
  useCreateUserProfilePhotoUploadUrl,
  useGetOwnProfile,
  useListUserProfiles,
  useUpdateOwnProfile,
  useUpdateUserProfile,
  useGetParticipantProfile,
  useUpdateParticipantProfile,
  useCreateParticipantProfilePhotoUploadUrl,
  getGetParticipantProfileQueryKey,
} from '@workspace/api-client-react';
import type { UserProfile, UserProfileUpdate } from '@workspace/api-client-react';
import { Camera, CircleAlert, LoaderCircle, Search, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'wouter';
import { LanguageToggle, t, useAppLanguage } from './language';
import { ParticipantAccountActions } from './participant-account-actions';
import './profile-surfaces.css';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function OwnProfilePage() {
  useAppLanguage();
  const client = useQueryClient();
  const query = useGetOwnProfile({ query: { queryKey: getGetOwnProfileQueryKey() } });
  const update = useUpdateOwnProfile();
  const upload = useCreateOwnProfilePhotoUploadUrl();

  if (query.isLoading) return <ProfileLoading />;
  if (!query.data) return <ProfileLoadError retry={() => void query.refetch()} />;
  return <ProfileForm
    profile={query.data}
    pageTitle="Your profile"
    pageDescription="Edit profile details. Your sign-in email and access roles are managed separately."
    onUploadPhoto={async file => {
      const signed = await upload.mutateAsync({ data: { contentType: file.type, size: file.size } });
      await putPhoto(signed.uploadUrl, file);
      return signed.objectPath;
    }}
    onSave={async data => {
      await update.mutateAsync({ data });
      await client.invalidateQueries({ queryKey: getGetOwnProfileQueryKey() });
    }}
  />;
}

export function ParticipantProfilePage() {
  useAppLanguage();
  const client = useQueryClient();
  const query = useGetParticipantProfile({ query: { queryKey: getGetParticipantProfileQueryKey() } });
  const update = useUpdateParticipantProfile();
  const upload = useCreateParticipantProfilePhotoUploadUrl();

  if (query.isLoading) return <ParticipantProfileLayout><ProfileLoading /></ParticipantProfileLayout>;
  if (!query.data) return <ParticipantProfileLayout><ProfileLoadError retry={() => void query.refetch()} participant /></ParticipantProfileLayout>;
  return <ParticipantProfileLayout name={query.data.displayName}><ProfileForm
    profile={query.data}
    pageTitle="Your profile"
    pageDescription="Edit profile details. Your sign-in email and program application remain unchanged."
    participant
    onUploadPhoto={async file => {
      const signed = await upload.mutateAsync({ data: { contentType: file.type, size: file.size } });
      await putPhoto(signed.uploadUrl, file);
      return signed.objectPath;
    }}
    onSave={async data => {
      await update.mutateAsync({ data });
      await client.invalidateQueries({ queryKey: getGetParticipantProfileQueryKey() });
    }}
  /></ParticipantProfileLayout>;
}

export function AdminProfilesPage() {
  useAppLanguage();
  const client = useQueryClient();
  const query = useListUserProfiles({ query: { queryKey: getListUserProfilesQueryKey() } });
  const update = useUpdateUserProfile();
  const upload = useCreateUserProfilePhotoUploadUrl();
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const profiles = query.data ?? [];
  const visible = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    if (!normalized) return profiles;
    return profiles.filter(profile =>
      profile.displayName.toLocaleLowerCase().includes(normalized) ||
      profile.email.toLocaleLowerCase().includes(normalized),
    );
  }, [profiles, search]);
  const selected = visible.find(profile => profile.userId === selectedId) ?? visible[0];

  useEffect(() => {
    if (profiles.length && !profiles.some(profile => profile.userId === selectedId)) {
      setSelectedId(profiles[0].userId);
    }
  }, [profiles, selectedId]);

  if (query.isLoading) return <ProfileLoading />;
  if (query.isError) return <ProfileLoadError retry={() => void query.refetch()} admin />;

  return <section className="profile-page page-enter">
    <header className="profile-heading">
      <div><div className="eyebrow">{t('ADMIN / USER ACCESS')}</div><h1>{t('Manage profiles')}</h1><p>{t('Edit staff and participant profile details. Sign-in emails and role assignments stay unchanged.')}</p></div>
      <span className="profile-count">{profiles.length} {t('profiles')}</span>
    </header>
    <section className="profile-admin-layout">
      <aside className="profile-directory panel" aria-label={t('Registered profiles')}>
        <label className="profile-search"><Search size={16} aria-hidden="true" /><span className="sr-only">{t('Search by name or email')}</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('Search by name or email')} /></label>
        {visible.length ? <div className="profile-directory-list">
          {visible.map(profile => <button
            key={profile.userId}
            type="button"
            className={`profile-person ${selected?.userId === profile.userId ? 'is-selected' : ''}`}
            onClick={() => setSelectedId(profile.userId)}
            aria-current={selected?.userId === profile.userId ? 'true' : undefined}
          >
            <ProfileAvatar profile={profile} size="small" />
            <span className="profile-person-copy"><b>{profile.displayName}</b><small>{profile.email}</small><i>{accountTypeLabel(profile.accountType)}</i></span>
          </button>)}
        </div> : <p className="profile-empty-note">{profiles.length ? t('No profiles match this search.') : t('No registered profiles found.')}</p>}
      </aside>
      <div className="profile-editor panel">
        {selected ? <ProfileForm
          key={selected.userId}
          profile={selected}
          pageTitle="Edit profile"
          pageDescription="Changes update this platform profile only. Sign-in email, staff roles, and program assignments are not changed."
          admin
          onUploadPhoto={async file => {
            const signed = await upload.mutateAsync({
              userId: selected.userId,
              data: { contentType: file.type, size: file.size },
            });
            await putPhoto(signed.uploadUrl, file);
            return signed.objectPath;
          }}
          onSave={async data => {
            await update.mutateAsync({ userId: selected.userId, data });
            await client.invalidateQueries({ queryKey: getListUserProfilesQueryKey() });
          }}
        /> : <div className="profile-editor-empty"><UserRound size={24} /><p>{t('Select a profile to edit.')}</p></div>}
      </div>
    </section>
    <Link href="/" className="profile-back-link">{t('Back to the admin workspace')}</Link>
  </section>;
}

function ProfileForm({
  profile,
  pageTitle,
  pageDescription,
  participant = false,
  admin = false,
  onUploadPhoto,
  onSave,
}: {
  profile: UserProfile;
  pageTitle: string;
  pageDescription: string;
  participant?: boolean;
  admin?: boolean;
  onUploadPhoto: (file: File) => Promise<string>;
  onSave: (values: UserProfileUpdate) => Promise<void>;
}) {
  useAppLanguage();
  const inputId = useId();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [organization, setOrganization] = useState(profile.organization ?? '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!photoFile) {
      setPreview('');
      return;
    }
    const objectUrl = URL.createObjectURL(photoFile);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photoFile]);

  const handlePhotoChange = (file?: File) => {
    setError('');
    setNotice('');
    if (!file) return;
    if (!PHOTO_TYPES.has(file.type) || file.size > MAX_PHOTO_BYTES) {
      setPhotoFile(null);
      setError(t('Choose a JPEG, PNG, or WebP image up to 5 MB.'));
      return;
    }
    setPhotoFile(file);
    setRemovePhoto(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!displayName.trim()) {
      setError(t('Enter a display name.'));
      return;
    }
    setSaving(true);
    try {
      const values: UserProfileUpdate = {
        displayName: displayName.trim(),
        phone: phone.trim() || null,
        bio: bio.trim() || null,
        organization: organization.trim() || null,
      };
      if (photoFile) {
        try {
          values.photoPath = await onUploadPhoto(photoFile);
        } catch {
          setError(t('Profile photo upload failed. Please try again.'));
          return;
        }
      } else if (removePhoto) {
        values.photoPath = null;
      }
      await onSave(values);
      setPhotoFile(null);
      setRemovePhoto(false);
      setNotice(t('Profile updated.'));
    } catch {
      setError(t('Profile could not be saved. Check the details and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const photoUrl = preview || (removePhoto ? '' : profile.photoUrl || '');

  return <section className={`profile-form-content ${participant ? 'is-participant' : ''}`} aria-labelledby={`${inputId}-title`}>
    <header className="profile-form-heading">
      <div><div className="eyebrow">{t(admin ? 'ADMIN / PROFILE DETAILS' : participant ? 'PARTICIPANT / PROFILE' : 'YOUR ACCOUNT')}</div><h2 id={`${inputId}-title`}>{t(pageTitle)}</h2><p>{t(pageDescription)}</p></div>
      {admin && <span className="profile-type-badge">{accountTypeLabel(profile.accountType)}</span>}
    </header>
    <form className="profile-form" onSubmit={event => void submit(event)}>
      <div className="profile-photo-row">
        <ProfileAvatar profile={{ ...profile, photoUrl: photoUrl || null }} size="large" />
        <div className="profile-photo-controls">
          <b>{t('Profile photo')}</b>
          <span>{t('JPEG, PNG, or WebP; maximum 5 MB. Visible only to you and Admin.')}</span>
          <div className="profile-photo-actions">
            <input id={inputId} className="profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => handlePhotoChange(event.target.files?.[0])} />
            <label className="button button-outline" htmlFor={inputId}><Camera size={15} />{t(photoUrl ? 'Change photo' : 'Choose photo')}</label>
            {photoUrl && <button type="button" className="profile-remove-photo" onClick={() => { setRemovePhoto(true); setPhotoFile(null); setNotice(''); }}>{t('Remove photo')}</button>}
          </div>
        </div>
      </div>
      <div className="profile-form-grid">
        <label className="field"><span>{t('Display name')} <i>*</i></span><input className="form-control" required maxLength={120} value={displayName} onChange={event => setDisplayName(event.target.value)} autoComplete="name" /></label>
        <label className="field"><span>{t('Sign-in email')}</span><input className="form-control" value={profile.email} readOnly aria-describedby={`${inputId}-email-note`} /><small id={`${inputId}-email-note`} className="field-hint">{t('Email is managed by the sign-in account.')}</small></label>
        <label className="field"><span>{t('Phone number')}</span><input className="form-control" type="tel" maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" /></label>
        <label className="field"><span>{t('Organization')}</span><input className="form-control" maxLength={160} value={organization} onChange={event => setOrganization(event.target.value)} autoComplete="organization" /></label>
        <label className="field profile-field-wide"><span>{t('Bio')}</span><textarea className="form-control" rows={4} maxLength={1000} value={bio} onChange={event => setBio(event.target.value)} /></label>
      </div>
      {error && <p className="form-error profile-message" role="alert"><CircleAlert size={15} />{error}</p>}
      {notice && <p className="profile-success" role="status"><ShieldCheck size={15} />{notice}</p>}
      <div className="profile-form-footer">
        <span>{t(admin ? 'Role and program access are not changed here.' : 'Your sign-in email and access roles are not changed here.')}</span>
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving ? <><LoaderCircle size={15} className="profile-spinner" />{t('Saving profile…')}</> : t('Save profile')}
        </button>
      </div>
    </form>
  </section>;
}

function ProfileAvatar({ profile, size }: { profile: Pick<UserProfile, 'displayName' | 'photoUrl'>; size: 'small' | 'large' }) {
  const initials = profile.displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'J';
  return <span className={`profile-avatar-image ${size}`} aria-hidden="true">
    {profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : initials}
  </span>;
}

function ProfileLoading() {
  return <div className="profile-page"><div className="loading-panel" aria-label={t('Loading profile')}><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /></div></div>;
}

function ProfileLoadError({ retry, participant = false, admin = false }: { retry: () => void; participant?: boolean; admin?: boolean }) {
  return <section className="profile-page page-enter">
    <header className="profile-heading"><div><div className="eyebrow">{t(admin ? 'ADMIN / USER ACCESS' : participant ? 'PARTICIPANT / PROFILE' : 'YOUR ACCOUNT')}</div><h1>{t(admin ? 'Manage profiles' : 'Your profile')}</h1><p>{t('Profile could not be loaded.')}</p></div></header>
    <div className="empty-panel error-panel"><span className="empty-icon"><CircleAlert size={20} /></span><h3>{t('Profile details are unavailable right now.')}</h3><p>{t('Check your connection and try again. Your account access and application records are unchanged.')}</p><button type="button" className="button button-outline" onClick={retry}>{t('Retry')}</button></div>
    <Link href={participant ? '/participant' : '/'} className="profile-back-link">{t('Back to the program workspace')}</Link>
  </section>;
}

function ParticipantProfileLayout({ children, name = 'User' }: { children: ReactNode; name?: string }) {
  const { signOut } = useClerk();
  return <div className="intake-page profile-intake">
    <header className="intake-top profile-intake-top">
      <Link href="/participant" className="profile-intake-brand"><b>{t('Program Hub')}</b><small>{t('PROGRAM HUB')}</small></Link>
      <div className="intake-header-actions"><LanguageToggle /><Link className="text-link" href="/participant" data-testid="link-profile-back-participant">{t('Back to your progress')}</Link></div>
    </header>
    <main className="participant-wrap profile-participant-wrap">
      <div className="participant-profile-account"><ParticipantAccountActions signOut={signOut} name={name} /></div>
      {children}
    </main>
    <footer className="intake-footer footer-brandless"><span>{t('YOUR PROGRESS IS PRIVATE TO YOU')}</span></footer>
  </div>;
}

function accountTypeLabel(value: UserProfile['accountType']): string {
  if (value === 'both') return t('Staff and participant');
  if (value === 'participant') return t('Participant');
  return t('Staff');
}

async function putPhoto(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) throw new Error('Profile photo upload failed.');
}
