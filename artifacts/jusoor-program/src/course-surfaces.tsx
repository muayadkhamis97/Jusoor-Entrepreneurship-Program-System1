import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCourseManagementQueryKey, getGetParticipantCoursesQueryKey,
  useCreateCourseMaterial, useCreateCourseModule, useDeleteCourseMaterial,
  useDeleteCourseModule, useGetCourseManagement, useRequestCourseUploadUrl,
  useUpdateCourseMaterial, useUpdateCourseModule,
} from '@workspace/api-client-react';
import type { CourseMaterial, CourseMaterialInput, CourseMaterialKind, CourseMaterialRole, CourseModule, CourseModuleInput } from '@workspace/api-client-react';
import './course-learning.css';
import {
  ArrowDownToLine, ArrowUpRight, BookOpen, CalendarClock, Check, CircleAlert,
  ClipboardList, FileAudio, FileText, Film, Link2, Pencil, Plus, Presentation,
  ShieldCheck, Trash2, UploadCloud, X,
} from 'lucide-react';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const roles: CourseMaterialRole[] = ['participant', 'trainer', 'coordinator'];
const dateLabel = (date?: string | null) => date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No release date';
const sizeLabel = (size?: number | null) => {
  if (!size) return '';
  return size > 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
};
const kindLabel = (kind: CourseMaterialKind) => ({ video: 'Video', document: 'Document', slides: 'Slides', audio: 'Audio', link: 'External link' })[kind];
const kindIcon = (kind: CourseMaterialKind) => ({ video: Film, document: FileText, slides: Presentation, audio: FileAudio, link: Link2 })[kind];
const toLocalDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

function CourseModal({ title, children, onClose, testId }: { title: string; children: React.ReactNode; onClose: () => void; testId: string }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
      <div className="modal-head"><div><div className="eyebrow">JUSOOR LEARNING / COURSE CONTENT</div><h2 className="app-title">{title}</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose} data-testid="button-close-course-dialog"><X size={17} /></button></div>
      {children}
    </section>
  </div>;
}

export function CourseManagementPage() {
  const query = useGetCourseManagement({ query: { queryKey: getGetCourseManagementQueryKey(), refetchOnWindowFocus: true } });
  const client = useQueryClient();
  const createModule = useCreateCourseModule();
  const updateModule = useUpdateCourseModule();
  const deleteModule = useDeleteCourseModule();
  const createMaterial = useCreateCourseMaterial();
  const updateMaterial = useUpdateCourseMaterial();
  const deleteMaterial = useDeleteCourseMaterial();
  const uploadUrl = useRequestCourseUploadUrl();
  const programs = query.data?.programs || [];
  const [programId, setProgramId] = useState<number | null>(null);
  const selectedProgram = programs.find(program => program.id === (programId ?? programs[0]?.id));
  const modules = useMemo(() => [...(selectedProgram?.modules || [])].sort((a, b) => a.position - b.position), [selectedProgram]);
  const [moduleDialog, setModuleDialog] = useState<CourseModule | 'new' | null>(null);
  const [materialDialog, setMaterialDialog] = useState<{ module: CourseModule; material?: CourseMaterial } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'module' | 'material'; id: number; name: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [working, setWorking] = useState(false);
  const invalidate = () => {
    void Promise.all([
      client.invalidateQueries({ queryKey: getGetCourseManagementQueryKey() }),
      client.invalidateQueries({ queryKey: getGetParticipantCoursesQueryKey() }),
    ]);
  };
  const closeForms = () => { setModuleDialog(null); setMaterialDialog(null); setFormError(''); setUploadError(''); };

  const saveModule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProgram) return;
    const values = new FormData(event.currentTarget);
    const title = String(values.get('title') || '').trim();
    const description = String(values.get('description') || '').trim();
    const releaseInput = String(values.get('releaseAt') || '');
    const releaseAt = releaseInput ? new Date(releaseInput).toISOString() : null;
    if (!title) { setFormError('Add a module title before saving.'); return; }
    const done = () => { invalidate(); closeForms(); setSuccess('Module saved to the program.'); };
    if (moduleDialog !== 'new' && moduleDialog) {
      updateModule.mutate({ id: moduleDialog.id, data: { title, description: description || null, releaseAt, position: Number(values.get('position') || 0), isPublished: values.get('isPublished') === 'on' } }, { onSuccess: done, onError: () => setFormError('Module could not be saved. Please try again.') });
    } else {
      const data: CourseModuleInput = { programId: selectedProgram.id, title, description: description || null, releaseAt, position: Number(values.get('position') || modules.length), isPublished: values.get('isPublished') === 'on' };
      createModule.mutate({ data }, { onSuccess: done, onError: () => setFormError('Module could not be created. Please try again.') });
    }
  };

  const saveMaterial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!materialDialog || !selectedProgram) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const title = String(values.get('title') || '').trim();
    const description = String(values.get('description') || '').trim();
    const kind = String(values.get('kind') || 'document') as CourseMaterialKind;
    const externalUrl = String(values.get('externalUrl') || '').trim();
    const allowedRoles = roles.filter(role => values.get(`role-${role}`) === 'on');
    if (!title) { setFormError('Add a title for this learning material.'); return; }
    if (allowedRoles.length === 0) { setFormError('Choose at least one role with access.'); return; }
    setWorking(true); setFormError(''); setUploadError('');
    const done = () => { invalidate(); closeForms(); setWorking(false); setSuccess('Learning material saved.'); };
    if (materialDialog.material) {
      if (kind === 'link' && !/^https?:\/\//i.test(externalUrl)) { setWorking(false); setFormError('Enter a complete link beginning with https://.'); return; }
      const data = { title, description: description || null, kind, allowedRoles, ...(kind === 'link' ? { externalUrl } : {}) };
      updateMaterial.mutate({ id: materialDialog.material.id, data }, { onSuccess: done, onError: () => { setWorking(false); setFormError('Material details could not be saved.'); } });
      return;
    }
    if (kind === 'link' && !/^https?:\/\//i.test(externalUrl)) { setWorking(false); setFormError('Enter a complete link beginning with https://.'); return; }
    let fileDetails: { objectPath?: string; fileName?: string; contentType?: string; fileSize?: number } = {};
    const selectedFile = values.get('file');
    if (kind !== 'link' && selectedFile instanceof File && selectedFile.size > 0) {
      try {
        const signed = await uploadUrl.mutateAsync({ data: { programId: selectedProgram.id, name: selectedFile.name, size: selectedFile.size, contentType: selectedFile.type || 'application/octet-stream' } });
        const result = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' }, body: selectedFile });
        if (!result.ok) throw new Error('Upload failed');
        fileDetails = { objectPath: signed.objectPath, fileName: selectedFile.name, contentType: selectedFile.type || 'application/octet-stream', fileSize: selectedFile.size };
      } catch {
        setWorking(false);
        setUploadError('The file could not be uploaded. Check your connection and try again.');
        return;
      }
    } else if (kind !== 'link') {
      setWorking(false); setFormError('Choose a file to attach to this material.'); return;
    }
    const data: CourseMaterialInput = { title, description: description || null, kind, externalUrl: kind === 'link' ? externalUrl : null, ...fileDetails, allowedRoles, position: materialDialog.module.materials.length };
    createMaterial.mutate({ id: materialDialog.module.id, data }, { onSuccess: done, onError: () => { setWorking(false); setFormError('The upload is complete, but the material record could not be created. Try again.'); } });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const finish = () => { invalidate(); setDeleteTarget(null); setSuccess('Content removed from the program.'); };
    if (deleteTarget.type === 'module') deleteModule.mutate({ id: deleteTarget.id }, { onSuccess: finish });
    else deleteMaterial.mutate({ id: deleteTarget.id }, { onSuccess: finish });
  };
  const pendingDelete = deleteModule.isPending || deleteMaterial.isPending;
  const modulePending = createModule.isPending || updateModule.isPending;
  const materialPending = working || createMaterial.isPending || updateMaterial.isPending;
  const totalMaterials = programs.reduce((sum, program) => sum + program.modules.reduce((count, module) => count + module.materials.length, 0), 0);

  return <div className="course-hub">
    <header className="course-hero" data-testid="course-management-header">
      <div><div className="eyebrow">COHORT DELIVERY / GUIDED LEARNING</div><h1>Learning, in sequence.</h1><p>Shape each cohort’s learning path: release modules when they are ready, give every resource a clear home, and set who can see what.</p></div>
      <div className="course-summary"><div><b>{programs.length}</b><span>PROGRAMS</span></div><div><b>{programs.reduce((sum, item) => sum + item.modules.length, 0)}</b><span>MODULES</span></div><div><b>{totalMaterials}</b><span>RESOURCES</span></div></div>
    </header>
    <div className="page-heading"><div><div className="eyebrow">COURSE MANAGEMENT / PROGRAM CONTENT</div><h1 className="app-title">Program learning</h1><p>Build the path from first workshop to pitch-ready founder.</p></div></div>
    {success && <div className="course-success" role="status" data-testid="status-course-success"><Check size={14} /> {success}</div>}
    {query.isLoading ? <div className="loading-panel" aria-label="Loading course programs" data-testid="loading-course-management"><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /><div className="skeleton skeleton-table" /></div>
    : query.isError ? <div className="empty-panel error-panel"><span className="empty-icon"><CircleAlert size={21} /></span><h3>Learning plans couldn’t load.</h3><p>Your course content is unchanged. Retry to reconnect to program delivery.</p><button className="button button-outline" onClick={() => void query.refetch()} data-testid="button-retry-course-management">Retry connection</button></div>
    : programs.length === 0 ? <div className="panel empty-panel course-empty" data-testid="empty-course-programs"><span className="empty-icon"><BookOpen size={21} /></span><h3>No manageable programs yet.</h3><p>When a program is available to your staff role, its learning path will appear here.</p></div>
    : <>
      <div className="course-controls"><label className="course-select-wrap" htmlFor="course-program-select"><span>PROGRAM</span><select id="course-program-select" className="form-control" value={selectedProgram?.id || ''} onChange={event => setProgramId(Number(event.target.value))} data-testid="select-course-program">{programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label><button className="button button-primary" onClick={() => { setModuleDialog('new'); setSuccess(''); }} data-testid="button-add-course-module"><Plus size={15} /> Add module</button></div>
      <div className="course-layout">
        <section className="course-module-list" aria-label="Program modules" data-testid="course-module-list">
          {modules.length === 0 ? <div className="panel empty-panel course-empty"><span className="empty-icon"><ClipboardList size={20} /></span><h3>Start with the first module.</h3><p>Give participants a clear next step, then add the material that will help them move.</p><button className="button button-primary" onClick={() => setModuleDialog('new')} data-testid="button-create-first-module"><Plus size={15} /> Create first module</button></div>
          : modules.map((module, index) => <article className="course-module-card" key={module.id} data-testid={`card-course-module-${module.id}`}>
            <div className="course-module-head"><span className="course-module-index">{String(index + 1).padStart(2, '0')}</span><div className="course-module-copy"><h2 data-testid={`text-module-title-${module.id}`}>{module.title}</h2>{module.description && <p>{module.description}</p>}<div className="course-meta"><span className={`badge ${module.isPublished ? 'badge-good' : 'badge-neutral'}`} data-testid={`status-module-published-${module.id}`}><span />{module.isPublished ? 'Published' : 'Draft'}</span><span className="course-meta-label"><CalendarClock size={11} /> {dateLabel(module.releaseAt)}</span><span className="course-meta-label">{module.materials.length} {module.materials.length === 1 ? 'resource' : 'resources'}</span></div></div><div className="course-module-actions"><button className="icon-button" type="button" aria-label={`Edit ${module.title}`} onClick={() => { setModuleDialog(module); setSuccess(''); }} data-testid={`button-edit-course-module-${module.id}`}><Pencil size={14} /></button><button className="icon-button icon-danger" type="button" aria-label={`Delete ${module.title}`} onClick={() => setDeleteTarget({ type: 'module', id: module.id, name: module.title })} data-testid={`button-delete-course-module-${module.id}`}><Trash2 size={14} /></button></div></div>
            <div className="course-materials">{module.materials.length === 0 ? <div className="course-material-empty">No materials in this module yet.</div> : module.materials.map(material => {
              const Icon = kindIcon(material.kind);
              const href = material.kind === 'link' ? material.externalUrl || undefined : material.objectPath ? `${basePath}/api/courses/materials/${material.id}/file` : undefined;
              return <div className="course-material" key={material.id} data-testid={`row-course-material-${material.id}`}><span className="course-material-icon"><Icon size={14} /></span><div className="course-material-copy"><b>{material.title}</b><span>{kindLabel(material.kind)}{material.fileName ? ` · ${material.fileName}` : ''}{material.fileSize ? ` · ${sizeLabel(material.fileSize)}` : ''} · {material.allowedRoles.map(role => role[0].toUpperCase() + role.slice(1)).join(', ')}</span></div>{href && <a className="course-material-link" href={href} target={material.kind === 'link' ? '_blank' : undefined} rel={material.kind === 'link' ? 'noreferrer' : undefined} data-testid={`link-course-material-${material.id}`}>{material.kind === 'link' ? <ArrowUpRight size={13} /> : <ArrowDownToLine size={13} />}{material.kind === 'link' ? 'Open' : 'Download'}</a>}<button className="icon-button" type="button" aria-label={`Edit ${material.title}`} onClick={() => setMaterialDialog({ module, material })} data-testid={`button-edit-course-material-${material.id}`}><Pencil size={13} /></button><button className="icon-button icon-danger" type="button" aria-label={`Delete ${material.title}`} onClick={() => setDeleteTarget({ type: 'material', id: material.id, name: material.title })} data-testid={`button-delete-course-material-${material.id}`}><Trash2 size={13} /></button></div>;
            })}<button className="text-link" type="button" onClick={() => { setMaterialDialog({ module }); setSuccess(''); }} data-testid={`button-add-material-${module.id}`}><Plus size={13} /> Add learning material</button></div>
          </article>)}
        </section>
        <aside className="course-aside"><div className="eyebrow">PROGRAM DESIGN</div><h3>A guided path, not a folder.</h3><p>Keep each step focused. A useful module gives founders one practical theme and the resources to make progress on it.</p><div className="course-aside-rule" /><div className="eyebrow">RELEASE CHECKLIST</div><ul><li><span>01</span> Publish when module content is ready.</li><li><span>02</span> Set a release date to control participant visibility.</li><li><span>03</span> Choose roles for every attached resource.</li></ul><div className="course-aside-rule" /><p><ShieldCheck size={13} /> Access is enforced by Jusoor. Participants see only published, released learning for their accepted programs.</p></aside>
      </div>
    </>}
    {moduleDialog && <CourseModal title={moduleDialog === 'new' ? 'Add a learning module' : 'Edit module'} onClose={closeForms} testId="dialog-course-module"><form className="modal-form" onSubmit={saveModule}>
      <div className="course-form-grid"><label className="field field-wide">Module title<input className="form-control" name="title" defaultValue={moduleDialog === 'new' ? '' : moduleDialog.title} required maxLength={180} placeholder="e.g. Find the customer problem" data-testid="input-course-module-title" /></label><label className="field field-wide">Description<textarea className="form-control" name="description" rows={3} maxLength={3000} defaultValue={moduleDialog === 'new' ? '' : moduleDialog.description || ''} placeholder="What should founders understand or be able to do?" data-testid="input-course-module-description" /></label><label className="field">Release date<input className="form-control" type="datetime-local" name="releaseAt" defaultValue={moduleDialog === 'new' ? '' : toLocalDate(moduleDialog.releaseAt)} data-testid="input-course-module-release" /></label><label className="field">Sequence position<input className="form-control" type="number" min="0" name="position" defaultValue={moduleDialog === 'new' ? modules.length : moduleDialog.position} data-testid="input-course-module-position" /></label><label className="field field-wide course-role-options"><span><input type="checkbox" name="isPublished" defaultChecked={moduleDialog === 'new' ? false : moduleDialog.isPublished} data-testid="input-course-module-published" /> Publish this module</span></label></div>
      {formError && <p className="form-error" role="alert" data-testid="error-course-form"><CircleAlert size={14} />{formError}</p>}<div className="modal-actions"><button className="button button-quiet" type="button" onClick={closeForms} data-testid="button-cancel-course-form">Cancel</button><button className="button button-primary" disabled={modulePending} data-testid="button-save-course-module">{modulePending ? 'Saving…' : <><Check size={14} /> Save module</>}</button></div>
    </form></CourseModal>}
    {materialDialog && <CourseModal title={materialDialog.material ? 'Edit learning material' : 'Attach learning material'} onClose={closeForms} testId="dialog-course-material"><form className="modal-form" onSubmit={event => void saveMaterial(event)}>
      <div className="course-form-grid"><label className="field field-wide">Material title<input className="form-control" name="title" required maxLength={180} defaultValue={materialDialog.material?.title || ''} placeholder="e.g. Customer interview guide" data-testid="input-course-material-title" /></label><label className="field field-wide">Description<textarea className="form-control" name="description" rows={2} maxLength={3000} defaultValue={materialDialog.material?.description || ''} placeholder="A short note on how to use this resource" data-testid="input-course-material-description" /></label><label className="field">Resource type<select className="form-control" name="kind" disabled={Boolean(materialDialog.material)} defaultValue={materialDialog.material?.kind || 'document'} data-testid="select-course-material-kind">{(['document', 'slides', 'video', 'audio', 'link'] as CourseMaterialKind[]).map(kind => <option value={kind} key={kind}>{kindLabel(kind)}</option>)}</select>{materialDialog.material && <input type="hidden" name="kind" value={materialDialog.material.kind} />}</label>{!materialDialog.material && <label className="field">File<input className="form-control" type="file" name="file" data-testid="input-course-material-file" /><small>Files up to 250 MB</small></label>}{materialDialog.material?.kind === 'link' || !materialDialog.material ? <label className="field field-wide">External URL<input className="form-control" name="externalUrl" type="url" defaultValue={materialDialog.material?.externalUrl || ''} placeholder="https://" data-testid="input-course-material-url" /></label> : null}<div className="field field-wide"><span>Who can access this material?</span><div className="course-role-options">{roles.map(role => <label key={role}><input type="checkbox" name={`role-${role}`} defaultChecked={materialDialog.material ? materialDialog.material.allowedRoles.includes(role) : true} data-testid={`input-course-material-role-${role}`} />{role[0].toUpperCase() + role.slice(1)}</label>)}</div></div></div>
      {formError && <p className="form-error" role="alert" data-testid="error-course-form"><CircleAlert size={14} />{formError}</p>}{uploadError && <p className="form-error" role="alert" data-testid="error-course-upload"><CircleAlert size={14} />{uploadError}</p>}<div className="modal-actions"><button className="button button-quiet" type="button" onClick={closeForms} data-testid="button-cancel-course-form">Cancel</button><button className="button button-primary" disabled={materialPending || uploadUrl.isPending} data-testid="button-save-course-material">{materialPending ? <><UploadCloud size={14} /> Saving material…</> : <><Check size={14} /> Save material</>}</button></div>
    </form></CourseModal>}
    {deleteTarget && <div className="modal-backdrop" role="presentation"><section className="confirm-card" role="alertdialog" aria-modal="true" data-testid="dialog-delete-course-content"><span className="empty-icon"><Trash2 size={19} /></span><h2 className="app-title">Remove course content?</h2><p><strong>{deleteTarget.name}</strong> will be removed from this program. This action cannot be undone.</p>{(deleteModule.isError || deleteMaterial.isError) && <p className="form-error" role="alert" data-testid="error-delete-course-content">Could not remove content. Please retry.</p>}<div className="modal-actions"><button className="button button-quiet" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete-course">Cancel</button><button className="button button-danger" onClick={confirmDelete} disabled={pendingDelete} data-testid="button-confirm-delete-course">{pendingDelete ? 'Removing…' : 'Remove content'}</button></div></section></div>}
  </div>;
}
