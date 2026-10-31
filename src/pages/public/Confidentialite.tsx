import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ButtonLink } from '../../components/Button'
import { Brand } from '../../components/Logo'

/** La date de la dernière mise à jour de cette page. */
const UPDATED = '31 octobre 2026'

const SECTIONS: { id: string; title: string; paragraphs: string[] }[] = [
  {
    id: 'responsable',
    title: 'Qui s’occupe de tes données',
    paragraphs: [
      'L’AEGB, Association des étudiants guinéens de Brest, est responsable des données de l’appli. Pour toute question, écris au compte AEGB dans l’appli : le bureau te répond.',
    ],
  },
  {
    id: 'garde',
    title: 'Ce que l’appli garde',
    paragraphs: [
      'Ton compte (nom, email, téléphone, études), ce que tu publies et envoies (textes, photos, vocaux), tes cotisations (montant et date) et tes appareils, pour les notifications.',
      'Ta carte bancaire n’est jamais vue par l’AEGB : le paiement passe par HelloAsso. Ton vote est secret : on sait que tu as voté, jamais pour qui.',
    ],
  },
  {
    id: 'qui-voit',
    title: 'Qui voit quoi',
    paragraphs: [
      'Les membres voient ton profil et tes publications. Ton numéro reste visible par le bureau seulement, sauf si tu choisis de le montrer. Chaque poste du bureau ne voit que ce qui le concerne. Rien n’est vendu, et il n’y a aucune publicité.',
    ],
  },
  {
    id: 'ou',
    title: 'Où elles sont',
    paragraphs: [
      'Les données sont rangées chez Supabase, sur des serveurs en Europe (Paris). Les notifications passent par le service de ton téléphone ou de ton navigateur (Google, Apple ou Microsoft), qui les transporte sans les garder.',
    ],
  },
  {
    id: 'duree',
    title: 'Combien de temps',
    paragraphs: [
      'Les notifications s’effacent après 30 jours. Un compte supprimé est effacé 30 jours après la demande. Les paiements restent dans les comptes de l’association, sans tes coordonnées, le temps exigé par la loi.',
    ],
  },
  {
    id: 'droits',
    title: 'Tes droits',
    paragraphs: [
      'Tu peux voir, corriger ou récupérer tes données, et supprimer ton compte toi-même dans Réglages, « Supprimer mon compte ». Tu peux aussi saisir la CNIL si une réponse ne te convient pas.',
    ],
  },
]

const NAV = [
  ['/association#asso', 'L’association'],
  ['/association#actions', 'Nos actions'],
  ['/association#bureau', 'Le bureau'],
  ['/association#appli', 'L’appli'],
  ['/association#adherer', 'Adhérer'],
]

/** La section lue en ce moment, pour le sommaire. */
function useCurrent(ids: string[]) {
  const [current, setCurrent] = useState(ids[0])
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setCurrent(visible[0].target.id)
      },
      { rootMargin: '0px 0px -60% 0px' },
    )
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [ids])
  return current
}

const IDS = SECTIONS.map((s) => s.id)

/** La page « Confidentialité » du site, demandée par Google pour le Play Store. */
export default function Confidentialite() {
  const current = useCurrent(IDS)
  const half = Math.ceil(SECTIONS.length / 2)
  const section = (s: (typeof SECTIONS)[number]) => (
    <section key={s.id} id={s.id} className="scroll-mt-6">
      <h2 className="titre m-0 text-[22px] leading-tight">{s.title}</h2>
      {s.paragraphs.map((p) => (
        <p key={p} className="mt-2.5 mb-0 text-[15px] leading-[1.6] text-[#3D4357]">
          {p}
        </p>
      ))}
    </section>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-[#FFFFFF] text-[#12162B] [color-scheme:light]">
      <section className="bg-tisse text-white">
        <header className="mx-auto flex max-w-[1200px] items-center gap-6 px-5 py-5 lg:px-10">
          <Link to="/" className="text-white no-underline">
            <Brand size={38} />
          </Link>
          <nav className="ml-6 hidden gap-7 text-[14px] font-semibold lg:flex" aria-label="Sections du site">
            {NAV.map(([href, label]) => (
              <Link key={href} to={href} className="text-white/85 no-underline hover:text-white">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <ButtonLink to="/connexion" variant="light" size="sm" className="h-10 px-4">
              Se connecter
            </ButtonLink>
            <ButtonLink to="/inscription" variant="onblue" size="sm" className="hidden h-10 px-4 sm:inline-flex">
              Créer mon compte
            </ButtonLink>
          </div>
        </header>
        <div className="mx-auto max-w-[1200px] px-5 pt-6 pb-12 lg:px-10 lg:pt-8">
          <p className="m-0 text-xs font-extrabold tracking-[0.14em] text-ciel uppercase">L’appli AEGB</p>
          <h1 className="titre mt-3 mb-0 text-[40px] leading-[1.05] lg:text-[48px]">Confidentialité</h1>
          <p className="mt-4 mb-0 max-w-[760px] text-[16px] leading-[1.55] text-white/85">
            Ce que l’appli garde sur toi, qui le voit, et comment tout effacer. Mise à jour le {UPDATED}.
          </p>
        </div>
        <div className="barre-tricolore h-1.5" aria-hidden="true" />
      </section>

      <div className="mx-auto grid w-full max-w-[1200px] flex-1 gap-10 px-5 py-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-10 lg:py-12">
        <nav aria-label="Sommaire" className="hidden lg:block">
          <div className="sticky top-8">
            <p className="m-0 px-3 pb-2 text-[12px] font-bold tracking-[0.08em] text-[#5A6075] uppercase">Sommaire</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={`block rounded-xl px-3 py-2.5 text-[14px] font-semibold no-underline ${current === s.id ? 'bg-[#EEF0F8] text-[#12162B]' : 'text-[#3D4357] hover:bg-[#F5F6FA]'}`}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div className="grid gap-9 lg:grid-cols-2 lg:gap-x-12">
          <div className="flex flex-col gap-9">{SECTIONS.slice(0, half).map(section)}</div>
          <div className="flex flex-col gap-9">{SECTIONS.slice(half).map(section)}</div>
        </div>
      </div>

      <footer className="border-t border-[#E8EAF1]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-5 text-[13px] text-[#5A6075] lg:px-10">
          <span>© {new Date().getFullYear()} AEGB · Association des étudiants guinéens de Brest</span>
          <span className="flex gap-6">
            <Link to="/charte" className="text-[#5A6075]">
              Charte
            </Link>
            <Link to="/confidentialite" className="font-bold text-[#12162B]">
              Confidentialité
            </Link>
            <Link to="/installer" className="text-[#5A6075]">
              Installer l’appli
            </Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
