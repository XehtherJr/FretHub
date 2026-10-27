import { Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LESSONS, LEVEL_LABELS, LessonBlock } from '@/data/lessons';
import { getLesson } from '@/data/lessons';
import { buildChord } from '@core/chords';
import { chordPath, lessonPath, scalePath } from '@/lib/urls';
import EmptyState from '@/components/EmptyState';
import GlossaryText from '@/components/GlossaryText';
import LessonLab from '@/components/LessonLab';
import LessonChallenge from '@/components/LessonChallenge';

function Block({ block }: { block: LessonBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return <p className="muted">{block.text && <GlossaryText text={block.text} />}</p>;
    case 'callout':
      return (
        <div className="card" style={{ borderLeft: '3px solid var(--brass)' }}>
          <h3 style={{ fontSize: '1rem' }}>{block.title}</h3>
          <p className="small" style={{ marginBottom: 0 }}>{block.text && <GlossaryText text={block.text} />}</p>
        </div>
      );
    case 'formula':
      return (
        <div className="card" style={{ background: 'var(--bg-panel-2)' }}>
          <h3 style={{ fontSize: '1rem' }}>{block.title}</h3>
          <p className="mono" style={{ marginBottom: 0, color: 'var(--brass-bright)' }}>{block.formula}</p>
        </div>
      );
    case 'list':
      return (
        <>
          <h3>{block.title}</h3>
          <ul>
            {block.items?.map((item, i) => <li key={i} className="muted"><GlossaryText text={item} /></li>)}
          </ul>
        </>
      );
    case 'example':
      return (
        <>
          <h3>{block.title}</h3>
          {block.chords && (
            <div className="grid grid-3">
              {block.chords.map((ex) => {
                const chord = buildChord(ex.root, ex.typeId);
                return (
                  <Link key={`${ex.root}-${ex.typeId}`} to={chordPath(ex.root, ex.typeId)} className="card feature-card">
                    <h3 style={{ marginBottom: '0.3rem' }}>{chord.shortName}</h3>
                    <p className="small faint" style={{ marginBottom: '0.4rem' }}>
                      {chord.tones.map((t) => t.name).join(' · ')}
                    </p>
                    <p className="small muted" style={{ marginBottom: 0 }}>{ex.caption}</p>
                  </Link>
                );
              })}
            </div>
          )}
          {block.scales && (
            <div className="grid grid-3">
              {block.scales.map((ex) => (
                <Link
                  key={`${ex.root}-${ex.scaleId}`}
                  to={scalePath(ex.scaleId, ex.root)}
                  className="card feature-card"
                >
                  <h3 style={{ marginBottom: '0.3rem' }}>
                    {ex.root} {ex.scaleId.replace(/-/g, ' ')}
                  </h3>
                  <p className="small muted" style={{ marginBottom: 0 }}>{ex.caption}</p>
                </Link>
              ))}
            </div>
          )}
        </>
      );
    default:
      return null;
  }
}

export default function TheoryLessonPage() {
  const { lessonId } = useParams();
  const lesson = getLesson(decodeURIComponent(lessonId ?? ''));

  if (!lesson) {
    return (
      <div className="page page-narrow">
        <EmptyState
          icon="📚"
          title="Lesson not found"
          action={<Link to="/theory" className="btn btn-primary">Back to the curriculum</Link>}
        >
          The lesson “{lessonId}” doesn’t exist in the current curriculum.
        </EmptyState>
      </div>
    );
  }

  const index = LESSONS.findIndex((l) => l.id === lesson.id);
  const prev = LESSONS[index - 1];
  const next = LESSONS[index + 1];

  return (
    <div className="page page-narrow">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link> <span>/</span>{' '}
        <Link to="/theory">Theory</Link> <span>/</span>{' '}
        <span>{lesson.title}</span>
      </nav>

      <p className="eyebrow">{LEVEL_LABELS[lesson.level]} · ~{lesson.minutes} min read</p>
      <h1>{lesson.title}</h1>
      <p className="lead"><GlossaryText text={lesson.summary} /></p>
      <p className="lesson-glossary-hint">New word? Select a <span> dotted term </span> for a plain-language explanation.</p>

      <div className="stack lesson-content">
        {lesson.blocks.map((block, i) => <Fragment key={i}><Block block={block} />{i === 1 && <LessonLab key={lesson.id} lessonId={lesson.id} />}</Fragment>)}
      </div>

      <LessonChallenge key={lesson.id} lessonId={lesson.id} />
      <hr />
      <nav className="spread" aria-label="Lesson navigation">
        {prev ? (
          <Link to={lessonPath(prev.id)} className="btn">← {prev.title}</Link>
        ) : <span />}
        <Link to="/theory" className="btn btn-ghost">All lessons</Link>
        {next ? (
          <Link to={lessonPath(next.id)} className="btn btn-primary">{next.title} →</Link>
        ) : <span />}
      </nav>
    </div>
  );
}
