import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ChordsPage from './pages/ChordsPage';
import ChordDetailPage from './pages/ChordDetailPage';
import FretboardPage from './pages/FretboardPage';
import TheoryIndexPage from './pages/TheoryIndexPage';
import TheoryLessonPage from './pages/TheoryLessonPage';
import ScalesPage from './pages/ScalesPage';
import ProgressionsPage from './pages/ProgressionsPage';
import PracticePage from './pages/PracticePage';
import TunerPage from './pages/TunerPage';
import MetronomePage from './pages/MetronomePage';
import LibraryPage from './pages/LibraryPage';
import NotFoundPage from './pages/NotFoundPage';

function ScrollToTop() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="chords" element={<ChordsPage />} />
          <Route path="chords/:root/:type" element={<ChordDetailPage />} />
          <Route path="fretboard" element={<FretboardPage />} />
          <Route path="theory" element={<TheoryIndexPage />} />
          <Route path="theory/:lessonId" element={<TheoryLessonPage />} />
          <Route path="scales" element={<ScalesPage />} />
          <Route path="scales/:scaleId" element={<ScalesPage />} />
          <Route path="progressions" element={<ProgressionsPage />} />
          <Route path="practice" element={<PracticePage />} />
          <Route path="tuner" element={<TunerPage />} />
          <Route path="metronome" element={<MetronomePage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
