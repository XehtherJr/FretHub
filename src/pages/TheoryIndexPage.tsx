import { Link } from 'react-router-dom';
import { LESSONS, LEVEL_LABELS, LessonLevel } from '@/data/lessons';
import { lessonPath } from '@/lib/urls';

const ORDER: LessonLevel[] = ['beginner', 'intermediate', 'advanced'];

export default function TheoryIndexPage() {
  return (
    <div className="page">
      <p className="eyebrow">Music theory curriculum</p>
      <h1>Theory, built for guitarists</h1>
      <p className="lead">
        A structured path from the first twelve notes to jazz reharmonization. Every lesson explains
        the concept, shows the interval math behind it, and links directly to playable chord and
        fretboard examples — nothing is presented as an unexplained fact.
      </p>

      {ORDER.map((level) => {
        const lessons = LESSONS.filter((l) => l.level === level);
        return (
          <section key={level} style={{ marginBottom: '2rem' }}>
            <h2 className="section-title">
              {LEVEL_LABELS[level]} <span className="faint small">· {lessons.length} lessons</span>
            </h2>
            <div className="grid grid-2">
              {lessons.map((lesson, i) => (
                <Link key={lesson.id} to={lessonPath(lesson.id)} className="card feature-card">
                  <div className="spread">
                    <span className="pill">{LEVEL_LABELS[lesson.level]}</span>
                    <span className="small faint">~{lesson.minutes} min</span>
                  </div>
                  <h3 style={{ marginTop: '0.7rem' }}>
                    {String(i + 1).padStart(2, '0')} · {lesson.title}
                  </h3>
                  <p className="muted small" style={{ marginBottom: 0 }}>{lesson.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
