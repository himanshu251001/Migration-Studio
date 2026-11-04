import { Button, Icon } from '@/components/ui';
import { WELCOME_CARDS, WELCOME_TAGLINE, type WelcomeCard } from './welcomeContent';

/** Intro page for a folder without a migration project: what the studio does, and a New Project button. */
export function Welcome({ onNewProject }: { onNewProject: () => void }) {
	return (
		<div className="px-space-xl py-space-xl flex flex-col min-h-full">
			<div className="w-full flex flex-col gap-space-xl">
				<header className="flex flex-col items-start gap-space-md">
					<div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-container-high text-tertiary">
						<span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
						<span className="text-label-sm font-label-sm tracking-wider uppercase">Enterprise modernization engine</span>
					</div>
					<div className="flex flex-col md:flex-row md:items-end justify-between w-full gap-space-lg">
						<div className="max-w-2xl space-y-space-sm">
							<h1 className="text-headline-xl font-headline-xl tracking-tight">Migration Studio</h1>
							<p className="text-body-lg font-body-lg text-on-surface-variant">{WELCOME_TAGLINE}</p>
						</div>
						<Button variant="primary" icon="add" onClick={onNewProject} className="px-4 py-2.5 shrink-0">New Project</Button>
					</div>
				</header>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
					{WELCOME_CARDS.map(card => <StageCard key={card.stage} card={card} />)}
				</div>
			</div>
		</div>
	);
}

function StageCard({ card }: { card: WelcomeCard }) {
	return (
		<div className="bg-surface-container-low rounded-xl p-space-lg flex flex-col justify-between gap-space-lg shadow-md hover:bg-surface-container transition-colors">
			<div className="space-y-space-md">
				<div className={`w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center ${card.tone}`}>
					<Icon name={card.icon} className="text-[22px]" />
				</div>
				<div>
					<span className={`text-label-sm font-label-sm tracking-wider uppercase block mb-1 ${card.tone}`}>{card.stage}</span>
					<h3 className="text-headline-sm font-headline-sm">{card.title}</h3>
				</div>
				<p className="text-body-sm font-body-sm text-on-surface-variant leading-relaxed">{card.text}</p>
			</div>
			<div className="flex flex-wrap gap-1.5 bg-surface-container-lowest/40 rounded-lg p-space-sm">
				{card.tags.map(tag => (
					<span key={tag} className="px-2 py-0.5 rounded bg-surface-variant text-on-surface-variant text-label-sm font-label-sm">{tag}</span>
				))}
			</div>
		</div>
	);
}
