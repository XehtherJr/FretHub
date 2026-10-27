import { Link } from 'react-router-dom';
import Metronome from '@/components/Metronome';

export default function MetronomePage() {
  return <div className="page metronome-page">
    <div className="tool-page-heading"><div><p className="eyebrow">MAKE ROOM FOR THE BEAT</p><h1>Metronome</h1><p className="lead">Find a pulse, practise your timing, and learn to keep it when the click drops away.</p></div><Link to="/tuner" className="btn btn-sm">Open tuner →</Link></div>
    <Metronome />
    <p className="tool-footnote">Keep this tab in the foreground for the most reliable timing. The coach works best with headphones and a quiet room.</p>
  </div>;
}
