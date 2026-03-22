import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [checkingLink, setCheckingLink] = useState(true);
  const [isRecoveryLink, setIsRecoveryLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const verifyRecoveryState = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const type = hashParams.get('type');

      if (type === 'recovery') {
        setIsRecoveryLink(true);
        setCheckingLink(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      setIsRecoveryLink(Boolean(data.session?.user));
      setCheckingLink(false);
    };

    verifyRecoveryState();
  }, []);

  if (!loading && user && !checkingLink && !isRecoveryLink) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setSuccess('Password updated successfully. Redirecting to login...');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Phone className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
              Beacon Call
            </h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Dashboard</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-1 text-center">Reset password</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Create a new password to continue.
          </p>

          {checkingLink ? (
            <div className="text-sm text-muted-foreground text-center">Checking reset link...</div>
          ) : !isRecoveryLink ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                This reset link is invalid or expired.
              </div>
              <Button className="w-full" onClick={() => navigate('/login')}>
                Back to login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">New password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 text-sm bg-background border rounded-lg outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 text-sm bg-background border rounded-lg outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 text-sm text-success bg-success/10 px-3 py-2 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {success}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Updating password...' : 'Update password'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
