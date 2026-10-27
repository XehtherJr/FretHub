import { useEffect, useState } from 'react';
import { getCompletedLessons, markLessonComplete, LIBRARY_CHANGE_EVENT } from '@core/storage';
import { LESSON_CHALLENGES } from '@/data/challenges';

export default function LessonChallenge({ lessonId }: { lessonId: string }) {
  const challenge = LESSON_CHALLENGES[lessonId];
  const [completed, setCompleted] = useState(() => getCompletedLessons().includes(lessonId));
  const [choice, setChoice] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => setCompleted(getCompletedLessons().includes(lessonId));
    window.addEventListener(LIBRARY_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(LIBRARY_CHANGE_EVENT, refresh);
  }, [lessonId]);
  if (!challenge) return null;
  const correct = choice === challenge.answer;
  const answer = (index: number) => {
    setChoice(index);
    if (index === challenge.answer) { markLessonComplete(lessonId); setCompleted(true); }
  };
  return <section className="lesson-challenge" aria-labelledby="challenge-heading">
    <div className="lesson-challenge-head"><div><p className="eyebrow">QUICK CHALLENGE</p><h2 id="challenge-heading">Check your understanding</h2></div><span className="pill">{completed ? 'Completed' : '1 question'}</span></div>
    <p>{challenge.prompt}</p>
    <div className="challenge-choices">{challenge.choices.map((option, index) => <button type="button" key={option} className="btn" aria-pressed={choice === index} onClick={() => answer(index)}>{option}</button>)}</div>
    {choice !== null && <p className={`challenge-feedback ${correct ? 'correct' : ''}`} role="status">{correct ? `You got it. ${challenge.explanation}` : `Not quite yet. ${challenge.hint ?? 'Revisit the example above and try again.'}`}</p>}
    {choice === null && completed && <p className="small muted">You completed this challenge. You can try it again any time.</p>}
  </section>;
}
