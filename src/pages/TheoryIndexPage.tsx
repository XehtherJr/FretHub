import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCompletedLessons, LIBRARY_CHANGE_EVENT } from '@core/storage';
import { LESSONS, LEVEL_LABELS, LessonLevel } from '@/data/lessons';
import { lessonPath } from '@/lib/urls';
import Icon from '@/components/Icon';

const ORDER: LessonLevel[] = ['beginner', 'intermediate', 'advanced'];

export default function TheoryIndexPage() {
  const [completed, setCompleted] = useState(() => getCompletedLessons());
  useEffect(() => {
    const refresh = () => setCompleted(getCompletedLessons());
    window.addEventListener(LIBRARY_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(LIBRARY_CHANGE_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const completedCount = LESSONS.filter((lesson) => completed.includes(lesson.id)).length;
  return (
    <div className="page theory-index-page">
      <p className="eyebrow">Music theory curriculum</p>
      <h1>Theory, built for guitarists</h1>
      <p className="lead">Learn by trying: hear real guitar examples, explore the ideas, and take a quick challenge in each lesson.</p>
      <div className="theory-progress"><div><strong>Your learning path</strong><span>{completedCount} of {LESSONS.length} challenges completed</span></div><progress value={completedCount} max={LESSONS.length} aria-label="Lesson challenges completed" /><small>Progress is saved on this device. An account is optional.</small></div>

      {ORDER.map((level, levelIndex) => {
        const lessons = LESSONS.filter((lesson) => lesson.level === level);
        return (
          <section key={level} className="theory-level">
            <div className="theory-level-heading"><p className="wb-section-kicker">PART {String(levelIndex + 1).padStart(2, '0')}</p><h2>{LEVEL_LABELS[level]}</h2><span>{lessons.length} lessons</span></div>
            <div className="theory-lesson-list">
              {lessons.map((lesson, index) => (
                <Link key={lesson.id} to={lessonPath(lesson.id)} className="theory-lesson-row">
                  <span className="theory-lesson-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="theory-lesson-copy"><strong>{lesson.title}</strong><small>{lesson.summary}</small></span>
                  <span className="theory-lesson-time">{completed.includes(lesson.id) ? 'COMPLETE' : `${lesson.minutes} MIN`}</span><Icon name="arrow" />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
