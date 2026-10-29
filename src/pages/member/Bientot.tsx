import { Logo } from '../../components/Logo'

const PLAN = [
  { title: 'Messages', detail: 'Privé et grand groupe AEGB', when: 'Prochaine mise à jour', next: true },
  { title: 'Cotisation', detail: 'Paiement par carte, HelloAsso', when: 'Ensuite' },
  { title: 'Votes', detail: 'Élections du bureau dans l’appli', when: 'Ensuite' },
  { title: 'Événements et documents', detail: 'Soirées, ateliers, statuts', when: 'Ensuite' },
]

const PAGES = {
  messages: { title: 'Messages', heading: 'Les messages arrivent bientôt', text: 'Tu pourras écrire aux membres en privé et discuter dans le grand groupe AEGB.' },
  cotisation: { title: 'Cotisation', heading: 'La cotisation arrive bientôt', text: 'Tu pourras payer ta cotisation par carte avec HelloAsso et suivre tes paiements.' },
  votes: { title: 'Votes', heading: 'Les votes arrivent bientôt', text: "Tu pourras t'inscrire sur la liste électorale et voter pour le bureau, dans l'appli." },
  evenements: { title: 'Événements', heading: 'Les événements arrivent bientôt', text: "Tu verras les soirées et les ateliers de l'AEGB, et tu pourras dire que tu participes." },
  documents: { title: 'Documents', heading: 'Les documents arrivent bientôt', text: "Tu trouveras ici les statuts, le règlement et les guides de l'association." },
}

/** Onglets visibles mais pas encore ouverts : ils arrivent aux lots suivants. */
export function Bientot({ page }: { page: keyof typeof PAGES }) {
  const { title, heading, text } = PAGES[page]
  return (
    <div className="flex flex-1 flex-col bg-surface lg:bg-page lg:px-10 lg:py-8">
      <header className="sticky top-0 z-10 flex h-[60px] items-center gap-3 border-b border-line-soft bg-surface px-5 pt-[env(safe-area-inset-top)] lg:hidden">
        <Logo size={30} />
        <h1 className="titre m-0 text-[22px]">{title}</h1>
      </header>
      <h1 className="titre m-0 hidden text-[34px] lg:block">{title}</h1>
      <div className="flex flex-1 flex-col px-5 py-8 lg:mt-6 lg:max-w-[640px] lg:flex-none lg:rounded-[22px] lg:bg-surface lg:px-8">
        <div className="relative mx-auto w-full max-w-[300px] rotate-[-3deg] rounded-[22px] border border-line-soft bg-surface p-4 shadow-lg" aria-hidden="true">
          <span className="absolute -top-3 -right-3 rotate-[8deg] rounded-full bg-safran px-3 py-1 text-xs font-extrabold text-nuit">Bientôt</span>
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-full bg-ok-soft text-xs font-bold text-ok">AE</span>
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="h-2 w-3/4 rounded-full bg-line-soft" />
              <span className="h-2 w-1/2 rounded-full bg-line-soft" />
            </div>
          </div>
          <div className="bg-tisse mt-3.5 h-20 rounded-xl" />
          <div className="mt-3 flex gap-2">
            <span className="h-2 w-1/4 rounded-full bg-danger-soft" />
            <span className="h-2 w-2/5 rounded-full bg-line-soft" />
          </div>
        </div>
        <h2 className="titre mt-10 mb-0 text-[26px]">{heading}</h2>
        <p className="mt-2 mb-0 text-[16px] leading-[1.5] text-muted">{text} En attendant, le fil d'actu est ouvert.</p>
        <ul className="m-0 mt-7 flex list-none flex-col rounded-2xl border border-line-soft p-0">
          {PLAN.map((item, i) => (
            <li key={item.title} className={`flex items-center gap-3 px-4 py-3.5 ${i ? 'border-t border-line-soft' : ''}`}>
              <span className={`size-2 shrink-0 rounded-full ${item.next ? 'bg-safran' : 'bg-line'}`} />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[15px] font-bold">{item.title}</p>
                <p className="m-0 text-[13px] text-muted">{item.detail}</p>
              </div>
              <span className="text-xs font-semibold text-muted">{item.when}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
