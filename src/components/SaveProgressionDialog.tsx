import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { DIFFICULTY_LEVELS, type ProgressionDifficulty } from '@core/userProgressions';

export type GradeChoice = 'auto' | ProgressionDifficulty;
interface Props {
  name: string;
  grade: GradeChoice;
  estimate: { level: ProgressionDifficulty; reasons: string[] };
  onSave: (name: string, grade: GradeChoice) => string | null;
  onClose: () => void;
}

const titleCase = (level: string) => level[0].toUpperCase() + level.slice(1);

/** Native modal provides focus containment, an inert background and Escape support. */
export default function SaveProgressionDialog({ name, grade, estimate, onSave, onClose }: Props) {
  const [draftName, setDraftName] = useState(name);
  const [draftGrade, setDraftGrade] = useState<GradeChoice>(grade);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    if (element && typeof element.showModal === 'function') element.showModal();
    else element?.setAttribute('open', ''); // DOM test environments may not implement showModal.
    nameInput.current?.focus();
    return () => { if (element?.open && typeof element.close === 'function') element.close(); previous?.focus(); };
  }, []);

  const keepFocusInside = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab' || !dialog.current) return;
    const controls = [...dialog.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    if (!controls.length) return;
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = onSave(draftName, draftGrade);
    if (result) setError(result);
    else onClose();
  };

  return (
    <dialog ref={dialog} className="save-progression-dialog" aria-labelledby="save-progression-heading" onKeyDown={keepFocusInside} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <form onSubmit={submit}>
        <h2 id="save-progression-heading">Save progression</h2>
        <p className="small muted">Name your sequence and choose a difficulty. You can change both later.</p>
        <div className="field"><label htmlFor="progression-title">Progression name</label><input ref={nameInput} id="progression-title" maxLength={100} required value={draftName} onChange={(event) => setDraftName(event.target.value)} /></div>
        <div className="field"><label htmlFor="progression-grade">Difficulty</label><select id="progression-grade" value={draftGrade} onChange={(event) => setDraftGrade(event.target.value as GradeChoice)}><option value="auto">Automatic estimate</option>{DIFFICULTY_LEVELS.map((level) => <option key={level} value={level}>{titleCase(level)}</option>)}</select></div>
        <p className="small muted">{draftGrade === 'auto' ? 'Estimated' : 'Your label'}: <strong>{titleCase(draftGrade === 'auto' ? estimate.level : draftGrade)}</strong>. The estimate considers fingering, position changes and tempo ({estimate.reasons.join('; ')}); it is not a guarantee of playability.</p>
        {error && <p role="alert" className="small">{error}</p>}
        <div className="save-progression-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary">Save progression</button></div>
      </form>
    </dialog>
  );
}
