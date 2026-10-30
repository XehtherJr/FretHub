import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCompletedLessons, LIBRARY_CHANGE_EVENT } from '@core/storage';
import { LESSONS, LEVEL_LABELS, LessonLevel } from '@/data/lessons';
import { lessonPath, triadStudyPath } from '@/lib/urls';
import Icon from '@/components/Icon';

const ORDER: LessonLevel[] = ['beginner', 'intermediate', 'advanced'];
const CONNECTIONS = [
  { id: 'notes-pitch-enharmonics', title: 'Notes on the neck', detail: 'Pitch, frets and octaves' },
  { id: 'intervals', title: 'Distances', detail: 'How notes relate' },
  { id: 'triads', title: 'Chord tones', detail: 'Intervals become chords' },
  { id: 'diatonic-harmony', title: 'Scales & harmony', detail: 'Chords inside a key' },
  { id: 'progressions-function', title: 'Playing through changes', detail: 'Use those tones in music' },
];

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
      <p className="lead">Learn by trying: hear real guitar examples, connect the ideas, and put them to work on your instrument.</p>
      <section className="theory-connections" aria-labelledby="connections-heading">
        <div className="theory-connections-intro"><div><p className="eyebrow">THE BIG PICTURE</p><h2 id="connections-heading">One idea leads to another</h2></div><p>Follow a path from individual notes to making music. Start anywhere; come back whenever a connection clicks.</p></div>
        <ol>{CONNECTIONS.map((item, index) => <li key={item.id}><Link to={lessonPath(item.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong><small>{item.detail}</small></Link></li>)}</ol>
        <div className="theory-study-link"><div><strong>See the connections for yourself</strong><span>Take a familiar chord from its notes to the neck, a scale and a new key.</span></div><Link to={triadStudyPath()} className="btn btn-primary btn-sm">Explore a triad →</Link></div>
      </section>
      <section className="theory-practice-path" aria-labelledby="practice-path-heading">
        <h2 id="practice-path-heading">Try a complete practice loop</h2>
        <p>New to guitar? <Link to={lessonPath('meet-your-guitar')}>Meet your guitar</Link> first. If you know a few open chords, start here:</p>
        <ol>
          <li><strong>Learn:</strong> Read about <Link to={lessonPath('triads')}>the three tones of a triad</Link>.</li>
          <li><strong>Explore:</strong> <Link to={triadStudyPath()}>Start the triad study</Link>; hear the tones and find them on the neck.</li>
          <li><strong>Apply:</strong> Use the <Link to={`${triadStudyPath()}#transfer-heading`}>two-key challenge</Link>, with guidance if you need it.</li>
          <li><strong>Return and transfer:</strong> Later, try the challenge without the guide, explain the third in your own words, and repeat with another root. Then check your answer.</li>
        </ol>
        <p className="small muted">There is no automatic reminder; a completed check records an attempt, not lasting recall.</p>
      </section>
      <div className="theory-progress"><div><strong>Your lesson checks</strong><span>{completedCount} of {LESSONS.length} challenges completed</span></div><progress value={completedCount} max={LESSONS.length} aria-label="Lesson challenges completed" /><small>These record completed checks, not mastery. Progress is saved on this device; an account is optional.</small></div>

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
