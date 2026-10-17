import { Alert } from '../ui/Alert';

export interface SimilarCustomer {
  id: string;
  name: string;
  phone: string | null;
  code: string;
  reason: 'phone' | 'name';
}

interface Props {
  matches: SimilarCustomer[];
  /** When given, each row gets a button to carry on with that existing customer. */
  onUse?: (match: SimilarCustomer) => void;
}

/** Shown when create-customer finds the same phone or a very alike name. */
export function DuplicateCustomerWarning({ matches, onUse }: Props) {
  return (
    <Alert variant="warning" title="This customer may already exist">
      <ul className="mt-1 space-y-1.5">
        {matches.map(m => (
          <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{m.name}</span>
              <span className="block text-xs opacity-80">
                {m.code}{m.phone ? ` · ${m.phone}` : ''} · {m.reason === 'phone' ? 'same phone number' : 'similar name'}
              </span>
            </span>
            {onUse && (
              <button
                type="button"
                onClick={() => onUse(m)}
                className="shrink-0 rounded-md border border-current px-2 py-1 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
              >
                Use this one
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">If this is a different person, press Create anyway.</p>
    </Alert>
  );
}
