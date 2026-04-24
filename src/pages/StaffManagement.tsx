import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserCog, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStaffMembers } from '@/hooks/useLeadData';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

const KNOWN_STAFF = [
  'Beth Rains',
  'Kaysen Schulte',
  'Paige Miller',
  'Joshua Nazario',
  'Alex Graham',
  'Tessa Nielsen',
];

export default function StaffManagement() {
  const { agencyId } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: staffMembers = [], isLoading } = useStaffMembers();
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || !agencyId) return;

    setIsAdding(true);
    const { error } = await supabase
      .from('staff_members')
      .insert({ name: trimmed, agency_id: agencyId });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Staff member added', description: `${trimmed} has been added.` });
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['staffMembers'] });
    }
    setIsAdding(false);
  }

  async function handleDelete(id: string, name: string) {
    const { error } = await supabase
      .from('staff_members')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Staff member removed', description: `${name} has been removed.` });
      queryClient.invalidateQueries({ queryKey: ['staffMembers'] });
    }
  }

  return (
    <div className="page-container">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <UserCog className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Staff Management</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage McBrayer Agency staff members for call tracking and performance reporting.
        </p>
      </div>

      {/* Add staff form */}
      <div className="bg-card rounded-lg border p-5 mb-6">
        <h2 className="text-base font-semibold mb-3">Add Staff Member</h2>
        <form onSubmit={handleAdd} className="flex gap-3 max-w-md">
          <Input
            placeholder="Full name (e.g. Beth Rains)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={isAdding}
            className="flex-1"
          />
          <Button type="submit" disabled={isAdding || !newName.trim()}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Staff Member
          </Button>
        </form>
        {staffMembers.length === 0 && !isLoading && (
          <div className="mt-4 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
            <p className="font-medium mb-1">Suggested staff to add:</p>
            <ul className="space-y-0.5">
              {KNOWN_STAFF.map((name) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Staff list */}
      <div className="bg-card rounded-lg border">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold">
            Current Staff
            {staffMembers.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({staffMembers.length} member{staffMembers.length !== 1 ? 's' : ''})
              </span>
            )}
          </h2>
        </div>

        {isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Loading staff members…
          </div>
        ) : staffMembers.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No staff members yet. Add your first staff member above.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {staffMembers.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between px-5 py-3 hover:bg-secondary/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-foreground">{member.name}</span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove staff member?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove <strong>{member.name}</strong> from the staff list.
                        Historical call data attributed to this person will not be deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(member.id, member.name)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
