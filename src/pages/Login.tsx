import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleResetPassword = async () => {
    setError('');
    setSuccess('');

    if (!email.trim()) {
      setError('Enter your email first, then click Forgot password again.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSuccess('Password reset email sent. Check your inbox for the reset link.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to send password reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });

        if (error) {
          if (error.message?.toLowerCase().includes('user already registered')) {
            setIsSignUp(false);
            setSuccess('This email is already registered. Sign in or use Forgot password to reset it.');
            return;
          }
          throw error;
        }

        setSuccess('Account created! After approval, you can sign in and access your dashboard.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        navigate('/', { replace: true });
      }
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'An error occurred';
      if (rawMessage.toLowerCase().includes('invalid login credentials')) {
        setError('Incorrect email or password. If this account already exists, use Forgot password.');
      } else {
        setError(rawMessage);
      }
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
          <h2 className="text-lg font-semibold text-foreground mb-1 text-center">
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            {isSignUp ? 'Sign up to get started' : 'Sign in to your dashboard'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-background border rounded-lg outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
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

            {!isSignUp && (
              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  disabled={submitting}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="text-sm text-success bg-success/10 px-3 py-2 rounded-lg">
                {success}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  {isSignUp ? 'Creating account...' : 'Signing in...'}
                </span>
              ) : (
                isSignUp ? 'Create Account' : 'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccess('');
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
