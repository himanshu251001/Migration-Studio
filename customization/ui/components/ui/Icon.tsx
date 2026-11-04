/** A Material Symbols (outlined) glyph; the font is bundled locally. */
export function Icon({ name, className = '' }: { name: string; className?: string }) {
	return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{name}</span>;
}
