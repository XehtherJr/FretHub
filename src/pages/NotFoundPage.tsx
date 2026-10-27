import { Link } from 'react-router-dom';
import EmptyState from '@/components/EmptyState';

export default function NotFoundPage() {
  return (
    <div className="page page-narrow">
      <EmptyState
        icon="🎸"
        title="That page has gone off the fretboard"
        action={<Link to="/" className="btn btn-primary">Back to home</Link>}
      >
        The route you requested doesn’t exist. Try the chord encyclopedia or the interactive fretboard instead.
      </EmptyState>
    </div>
  );
}
