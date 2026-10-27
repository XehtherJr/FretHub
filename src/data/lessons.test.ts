import { describe, expect, it } from 'vitest';
import { LESSONS, getLesson } from './lessons';
import { LESSON_CHALLENGES } from './challenges';

describe('theory curriculum', () => {
  it('has an answerable challenge for every unique lesson', () => {
    expect(new Set(LESSONS.map((lesson) => lesson.id)).size).toBe(LESSONS.length);
    for (const lesson of LESSONS) {
      const challenge = LESSON_CHALLENGES[lesson.id];
      expect(challenge, lesson.id).toBeDefined();
      expect(challenge.answer).toBeGreaterThanOrEqual(0);
      expect(challenge.answer).toBeLessThan(challenge.choices.length);
      for (const related of lesson.related ?? []) expect(getLesson(related), related).toBeDefined();
    }
  });
  it('gives the correct secondary dominant examples in C major', () => {
    const lesson = getLesson('voice-leading');
    const formula = lesson?.blocks.find((block) => block.title === 'Secondary dominants in C major')?.formula;
    expect(formula).toContain('V/vi = E7 → Am');
    expect(formula).toContain('V/ii = A7 → Dm');
  });
});
