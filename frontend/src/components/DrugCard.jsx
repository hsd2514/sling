export default function DrugCard({ drug }) {
  return (
    <article
      className="rounded-2xl border p-4"
      style={{ borderColor: 'var(--line)', background: 'white' }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
          {drug.name}
        </h3>
        {drug.cid && (
          <a
            href={drug.pubchem_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border px-2 py-1 text-xs font-semibold"
            style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)' }}
          >
            PubChem
          </a>
        )}
      </div>

      {drug.formula && (
        <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
          Formula {drug.formula} • MW {drug.molecular_weight} g/mol
        </p>
      )}

      {drug.reasoning && (
        <p
          className="mt-3 rounded-xl px-3 py-2 text-sm leading-relaxed"
          style={{ background: 'var(--accent-soft)', color: 'var(--ink)' }}
        >
          {drug.reasoning}
        </p>
      )}

      {drug.error && (
        <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--danger)' }}>
          {drug.error}
        </p>
      )}
    </article>
  )
}
