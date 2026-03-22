import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Clock, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, approvalStatus, isAdmin, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Admins always pass through
  if (isAdmin) {
    return <>{children}</>;
  }

  // Pending approval
  if (approvalStatus === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-warning" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Account Pending Approval</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Your account has been created and is awaiting administrator approval.
            You'll receive access once your account has been reviewed and assigned to your agency.
          </p>
          <Button variant="outline" onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  // Rejected
  if (approvalStatus === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <ShieldX className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Your account request has been denied. Please contact the administrator for more information.
          </p>
          <Button variant="outline" onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
