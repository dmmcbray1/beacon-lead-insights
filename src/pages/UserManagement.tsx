import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, Clock, Building2, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  agency_id: string | null;
  approval_status: string;
  created_at: string;
  agency_name?: string;
}

interface Agency {
  id: string;
  name: string;
}

export default function UserManagement() {
  const { isAdmin, loading } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const fetchData = async () => {
    setLoadingData(true);
    const [profilesRes, agenciesRes] = await Promise.all([
      supabase.from('user_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('agencies').select('*').order('name'),
    ]);

    if (profilesRes.data) {
      // Enrich with agency names
      const agencyMap = new Map((agenciesRes.data || []).map(a => [a.id, a.name]));
      setProfiles(profilesRes.data.map(p => ({
        ...p,
        agency_name: p.agency_id ? agencyMap.get(p.agency_id) || 'Unknown' : undefined,
      })));
    }
    if (agenciesRes.data) {
      setAgencies(agenciesRes.data);
    }
    setLoadingData(false);
  };

  const approveUser = async (profile: UserProfile, agencyId: string) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ approval_status: 'approved', agency_id: agencyId })
      .eq('id', profile.id);

    if (error) {
      toast.error('Failed to approve user: ' + error.message);
      return;
    }

    // Also assign customer role
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({ user_id: profile.user_id, role: 'customer' }, { onConflict: 'user_id,role' });

    if (roleError) {
      toast.error('Failed to assign role: ' + roleError.message);
      return;
    }

    toast.success(`Approved ${profile.email}`);
    fetchData();
  };

  const rejectUser = async (profile: UserProfile) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ approval_status: 'rejected' })
      .eq('id', profile.id);

    if (error) {
      toast.error('Failed to reject user: ' + error.message);
      return;
    }
    toast.success(`Rejected ${profile.email}`);
    fetchData();
  };

  const updateAgency = async (profile: UserProfile, agencyId: string | null) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ agency_id: agencyId })
      .eq('id', profile.id);

    if (error) {
      toast.error('Failed to update agency: ' + error.message);
      return;
    }

    toast.success(`Updated agency for ${profile.email}`);
    fetchData();
  };

  const makeAdmin = async (profile: UserProfile) => {
    const { error } = await supabase
      .from('user_roles')
      .upsert({ user_id: profile.user_id, role: 'admin' }, { onConflict: 'user_id,role' });

    if (error) {
      toast.error('Failed to assign admin role: ' + error.message);
      return;
    }

    // Also approve if pending
    if (profile.approval_status !== 'approved') {
      await supabase
        .from('user_profiles')
        .update({ approval_status: 'approved' })
        .eq('id', profile.id);
    }

    toast.success(`Made ${profile.email} an admin`);
    fetchData();
  };

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const pending = profiles.filter(p => p.approval_status === 'pending');
  const approved = profiles.filter(p => p.approval_status === 'approved');
  const rejected = profiles.filter(p => p.approval_status === 'rejected');

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight" style={{ lineHeight: 1.2 }}>
          User Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Approve users and assign them to agencies</p>
      </div>

      {loadingData ? (
        <div className="space-y-6">
          <Skeleton className="h-6 w-48" />
          <div className="bg-card border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['Email', 'Agency', 'Joined', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-32 rounded" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-8 w-24 rounded-md" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Queue */}
          {pending.length > 0 && (
            <div>
              <h2 className="section-title mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-warning" />
                Pending Approval ({pending.length})
              </h2>
              <div className="space-y-3">
                {pending.map(p => (
                  <PendingUserCard key={p.id} profile={p} agencies={agencies} onApprove={approveUser} onReject={rejectUser} onMakeAdmin={makeAdmin} />
                ))}
              </div>
            </div>
          )}

          {/* Approved Users */}
          <div>
            <h2 className="section-title mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              Approved Users ({approved.length})
            </h2>
            {approved.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved users yet.</p>
            ) : (
              <div className="bg-card border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agency</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Joined</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approved.map(p => (
                      <ApprovedUserRow
                        key={p.id}
                        profile={p}
                        agencies={agencies}
                        onUpdateAgency={updateAgency}
                        onMakeAdmin={makeAdmin}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Rejected */}
          {rejected.length > 0 && (
            <div>
              <h2 className="section-title mb-4 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-destructive" />
                Rejected ({rejected.length})
              </h2>
              <div className="bg-card border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Requested</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejected.map(p => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-4 py-3 text-foreground">{p.email}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <select
                            className="text-xs border rounded px-2 py-1 mr-2 bg-background text-foreground"
                            id={`agency-rejected-${p.id}`}
                          >
                            <option value="">Select agency...</option>
                            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          <Button variant="outline" size="sm" onClick={() => {
                            const sel = document.getElementById(`agency-rejected-${p.id}`) as HTMLSelectElement;
                            if (sel.value) approveUser(p, sel.value);
                          }}>
                            Approve
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PendingUserCard({
  profile,
  agencies,
  onApprove,
  onReject,
  onMakeAdmin,
}: {
  profile: UserProfile;
  agencies: Agency[];
  onApprove: (p: UserProfile, agencyId: string) => void;
  onReject: (p: UserProfile) => void;
  onMakeAdmin: (p: UserProfile) => void;
}) {
  const [selectedAgency, setSelectedAgency] = useState('');

  return (
    <div className="bg-card border rounded-lg p-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">{profile.email}</p>
        <p className="text-xs text-muted-foreground">
          Registered {new Date(profile.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <select
          className="text-xs border rounded px-2 py-1.5 bg-background text-foreground"
          value={selectedAgency}
          onChange={e => setSelectedAgency(e.target.value)}
        >
          <option value="">Select agency...</option>
          {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <Button
          size="sm"
          disabled={!selectedAgency}
          onClick={() => onApprove(profile, selectedAgency)}
        >
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => onMakeAdmin(profile)}>
          <ShieldCheck className="w-3.5 h-3.5 mr-1" />
          Admin
        </Button>
        <Button size="sm" variant="destructive" onClick={() => onReject(profile)}>
          <XCircle className="w-3.5 h-3.5 mr-1" />
          Reject
        </Button>
      </div>
    </div>
  );
}

function ApprovedUserRow({
  profile,
  agencies,
  onUpdateAgency,
  onMakeAdmin,
}: {
  profile: UserProfile;
  agencies: Agency[];
  onUpdateAgency: (p: UserProfile, agencyId: string | null) => void;
  onMakeAdmin: (p: UserProfile) => void;
}) {
  const currentAgency = profile.agency_id ?? '';
  const [selectedAgency, setSelectedAgency] = useState(currentAgency);
  const hasChange = selectedAgency !== currentAgency;

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3 text-foreground">{profile.email}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
          <Building2 className="w-3 h-3" />
          {profile.agency_name || 'No agency'}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {new Date(profile.created_at).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="text-xs border rounded px-2 py-1 bg-background text-foreground"
            value={selectedAgency}
            onChange={e => setSelectedAgency(e.target.value)}
          >
            <option value="">— No agency —</option>
            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasChange}
            onClick={() => onUpdateAgency(profile, selectedAgency || null)}
          >
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onMakeAdmin(profile)}>
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            Make Admin
          </Button>
        </div>
      </td>
    </tr>
  );
}
