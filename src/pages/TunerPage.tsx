import { Link } from 'react-router-dom';
import Tuner from '@/components/Tuner';

export default function TunerPage() {
  return <div className="page tuner-page">
    <div className="tool-page-heading"><div><p className="eyebrow">YOUR INSTRUMENT · IN TUNE</p><h1>Guitar tuner</h1><p className="lead">A quiet moment before you play. Pluck a string and follow the needle.</p></div><Link to="/metronome" className="btn btn-sm">Open metronome →</Link></div>
    <Tuner />
    <p className="tool-footnote">For the clearest reading, mute the other strings and tune in small steps. A negative number is flat; a positive number is sharp.</p>
  </div>;
}
