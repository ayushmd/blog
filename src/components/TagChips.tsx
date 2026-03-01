interface TagChipsProps {
  tags: string[];
}

export function TagChips({ tags }: TagChipsProps) {
  if (!tags.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag}>
          <span className="inline-block rounded-full bg-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)]">
            {tag}
          </span>
        </li>
      ))}
    </ul>
  );
}
