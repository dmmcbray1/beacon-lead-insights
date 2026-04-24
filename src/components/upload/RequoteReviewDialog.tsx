import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { RicochetMatch } from '@/lib/importRicochet';

export type RicochetDecision = 'requote' | 'overwrite';

export interface RequoteReviewDialogProps {
  open: boolean;
  matches: RicochetMatch[];
  onConfirm: (decisions: Map<string, RicochetDecision>) => void;
  onCancel: () => void;
}

export default function RequoteReviewDialog({
  open,
  matches,
  onConfirm,
  onCancel,
}: RequoteReviewDialogProps) {
  const [decisions, setDecisions] = useState<Record<string, RicochetDecision>>(() =>
    Object.fromEntries(
      matches.map((m) => [m.incoming.phoneNormalized, 'requote' as RicochetDecision]),
    ),
  );

  const count = matches.length;

  const setOne = (phone: string, d: RicochetDecision) =>
    setDecisions((prev) => ({ ...prev, [phone]: d }));

  const setAll = (d: RicochetDecision) =>
    setDecisions(Object.fromEntries(matches.map((m) => [m.incoming.phoneNormalized, d])));

  const confirm = () => {
    const map = new Map<string, RicochetDecision>(Object.entries(decisions));
    onConfirm(map);
  };

  const formatPhone = (p: string) =>
    p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Phone Matches Found — Review Before Import</DialogTitle>
          <DialogDescription>
            {count} incoming{' '}
            {count === 1 ? 'lead matches an existing lead' : 'leads match existing leads'}{' '}
            by phone. Choose how to handle each, or use the bulk actions below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 py-2">
          <Button variant="outline" size="sm" onClick={() => setAll('requote')}>
            Mark all as requote
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAll('overwrite')}>
            Overwrite all
          </Button>
        </div>

        <ScrollArea className="max-h-[50vh] rounded-md border">
          <div className="divide-y">
            {matches.map((m) => {
              const d = decisions[m.incoming.phoneNormalized] ?? 'requote';
              return (
                <MatchCard
                  key={m.incoming.phoneNormalized}
                  phone={formatPhone(m.incoming.phoneNormalized)}
                  match={m}
                  decision={d}
                  onChange={(next) => setOne(m.incoming.phoneNormalized, next)}
                />
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="destructive" onClick={onCancel}>
            Cancel Import
          </Button>
          <Button onClick={confirm}>Confirm &amp; Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MatchCard({
  phone,
  match,
  decision,
  onChange,
}: {
  phone: string;
  match: RicochetMatch;
  decision: RicochetDecision;
  onChange: (d: RicochetDecision) => void;
}) {
  const { incoming, existing } = match;

  useMemo(() => {
    // Reserved for future visual affordance: show a diff when overwrite
    // would actually change a field. Blank incoming values preserve
    // existing per spec, so no field is ever actually "wiped".
    return new Set<string>();
  }, [decision]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm">{phone}</span>
        <Select value={decision} onValueChange={(v) => onChange(v as RicochetDecision)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="requote">Requote</SelectItem>
            <SelectItem value="overwrite">Overwrite</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="text-muted-foreground font-semibold mb-1">Existing (keep)</div>
          <div>
            {[existing.firstName, existing.lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div>
            {[existing.streetAddress, existing.city, existing.state]
              .filter(Boolean)
              .join(', ') || '—'}
          </div>
          <div>Campaign: {existing.campaign ?? '—'}</div>
          <div className="text-muted-foreground">
            Added {new Date(existing.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div
          className={
            decision === 'overwrite'
              ? 'bg-amber-50 dark:bg-amber-950/30 rounded p-2 -m-2'
              : ''
          }
        >
          <div className="text-muted-foreground font-semibold mb-1">Incoming (Ricochet)</div>
          <div>
            {[incoming.firstName, incoming.lastName].filter(Boolean).join(' ') || '—'}
          </div>
          <div>
            {[incoming.streetAddress, incoming.city, incoming.state]
              .filter(Boolean)
              .join(', ') || '—'}
          </div>
          <div>Campaign: {incoming.campaign ?? '—'}</div>
          <div className="text-muted-foreground">Lead date {incoming.leadDate}</div>
        </div>
      </div>
    </div>
  );
}
