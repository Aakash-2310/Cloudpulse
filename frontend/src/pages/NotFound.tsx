import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import EmptyState from '../components/EmptyState';

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState
        icon={<Compass size={20} />}
        title="Page not found"
        description="The page you’re looking for doesn’t exist or has moved."
        action={
          <Link to="/dashboard" className="btn btn-primary btn-sm">
            Back to overview
          </Link>
        }
      />
    </div>
  );
}
