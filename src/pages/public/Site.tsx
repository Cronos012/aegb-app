import { Link } from 'react-router'
import { useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CreditCard,
  Download,
  FileText,
  MapPin,
  Flag,
  House,
  MessageSquare,
  Music,
  Search,
  SquareCheckBig,
  Trophy,
  User,
  Users,
  Vote,
} from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { Brand, Logo } from '../../components/Logo'
import { docKind, downloadDocument, sizeLabel, usePublicDocuments, type Doc } from '../../lib/documents'
import { badgeParts, usePublicEvents, whenLong, type PublicEvent } from '../../lib/events'
import { usePhotoUrl } from '../../lib/photos'
import { usePublicBureau } from '../../lib/queries'

function academicYear(now = new Date()) {
  const y = now.getFullYear()
  return now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

function Kicker({ children, light = false }: { children: string; light?: boolean }) {
  return <p className={`m-0 text-xs font-extrabold tracking-[0.14em] uppercase ${light ? 'text-safran' : 'text-[#A67000]'}`}>{children}</p>
}

/** Petit téléphone dessiné, pour montrer l'appli sur le site. Toujours en clair, comme une capture. */
function PhoneMock({ screen }: { screen: 'fil' | 'messages' }) {
  return (
    <div className="relative w-[280px] shrink-0 rounded-[40px] bg-[#0B0F26] p-2.5 shadow-2xl" aria-hidden="true">
      <div className="h-[540px] overflow-hidden rounded-[32px] bg-[#F3F4F8] text-[#12162B]">
        {screen === 'fil' ? (
          <>
            <div className="flex items-center justify-between bg-white px-4 pt-5 pb-3">
              <span className="flex items-center gap-2">
                <Logo size={24} />
                <span className="titre text-[17px]">Fil d'actu</span>
              </span>
              <span className="grid size-7 place-items-center rounded-full bg-[#F3F4F8] text-sm">+</span>
            </div>
            <div className="flex flex-col gap-2.5 p-2.5">
              <div className="rounded-2xl bg-white p-3">
                <p className="m-0 mb-2 inline-flex rounded-full bg-[#FFF3C4] px-2 py-0.5 text-[10px] font-bold text-[#6B4A00]">Info du bureau, épinglée</p>
                <div className="flex items-center gap-2">
                  <span className="bg-anneau rounded-full p-[2px]">
                    <Logo size={26} />
                  </span>
                  <span>
                    <span className="block text-[12px] font-bold">Bureau AEGB</span>
                    <span className="block text-[10px] text-[#5A6075]">il y a 2 h</span>
                  </span>
                </div>
                <p className="m-0 mt-2 text-[12px] leading-[1.35]">Les inscriptions sont ouvertes : parlez de l'AEGB autour de vous !</p>
                <p className="m-0 mt-2 text-[10px] text-[#5A6075]">❤️ 👍 42 réactions · 12 commentaires</p>
              </div>
              <div className="rounded-2xl bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-[26px] place-items-center rounded-full bg-[#E3F4EC] text-[10px] font-bold text-[#0B6B43]">KC</span>
                  <span className="block text-[12px] font-bold">Kadiatou</span>
                </div>
                <p className="m-0 mt-2 text-[12px]">Après-midi foot au parc, merci à tous !</p>
                <div className="mt-2 h-[120px] rounded-xl" style={{ background: 'repeating-linear-gradient(90deg, #1E8E4E 0 28px, #22A058 28px 56px)' }}>
                  <div className="grid h-full place-items-center">
                    <span className="size-12 rounded-full border-2 border-white/80" />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white px-4 pt-5 pb-3">
              <span className="titre text-[17px]">Messages</span>
              <div className="mt-2.5 flex h-8 items-center gap-1.5 rounded-xl bg-[#F3F4F8] px-2.5 text-[11px] text-[#5A6075]">
                <Search className="size-3.5" /> Rechercher
              </div>
            </div>
            <ul className="m-0 list-none bg-white p-0">
              {[
                ['Grand groupe AEGB', 'Bienvenue aux nouveaux !', 'logo', '3'],
                ['Assistant AEGB', 'Bienvenue ! Voici comment…', 'BOT', ''],
                ['Kadiatou', 'Merci pour le cours !', 'KC', ''],
                ['Ousmane', 'On se retrouve à la BU ?', 'OD', '1'],
                ['Mamadou', 'Tu peux m’envoyer le lien ?', 'MB', ''],
                ['Foot du dimanche', 'Rendez-vous à 10 h', 'FD', ''],
              ].map(([name, text, avatar, badge]) => (
                <li key={name} className="flex items-center gap-2.5 border-b border-[#EEF0F5] px-3.5 py-2.5">
                  {avatar === 'logo' ? (
                    <span className="bg-anneau rounded-full p-[2px]">
                      <Logo size={30} />
                    </span>
                  ) : (
                    <span className={`grid size-[34px] place-items-center rounded-full text-[10px] font-bold ${avatar === 'BOT' ? 'bg-[#F5B800] text-[#12183D]' : 'bg-[#E7EAFB] text-[#253070]'}`}>{avatar}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold">{name}</span>
                    <span className="block truncate text-[11px] text-[#5A6075]">{text}</span>
                  </span>
                  {badge ? <span className="grid size-4 place-items-center rounded-full bg-[#1A2352] text-[9px] font-bold text-white">{badge}</span> : null}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="absolute inset-x-2.5 bottom-2.5 grid grid-cols-4 rounded-b-[32px] border-t border-[#EEF0F5] bg-white py-2.5 text-center text-[9px] text-[#5A6075]">
          {[
            ['Fil', House],
            ['Messages', MessageSquare],
            ['Cotisation', CreditCard],
            ['Profil', User],
          ].map(([label, Icon]) => {
            const I = Icon as typeof House
            const active = (screen === 'fil' && label === 'Fil') || (screen === 'messages' && label === 'Messages')
            return (
              <span key={label as string} className={`flex flex-col items-center gap-0.5 ${active ? 'font-bold text-[#1A2352]' : ''}`}>
                <I className="size-4" />
                {label as string}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Un événement que le bureau a choisi de montrer : titre, date, lieu et photo. */
function SiteEvent({ e }: { e: PublicEvent }) {
  const photo = usePhotoUrl(e.photo_path, 'publications')
  const { day, month } = badgeParts(e.starts_at)
  return (
    <li className="flex flex-col overflow-hidden rounded-[22px] border border-[#E8EAF1] bg-white">
      <div className="bg-tisse relative h-[150px]">
        {photo ? <img src={photo} alt="" className="absolute inset-0 size-full object-cover" /> : null}
        <span className="absolute top-3.5 left-3.5 flex h-[54px] w-[50px] flex-col items-center justify-center rounded-[14px] bg-white shadow-[0_2px_8px_rgba(18,22,43,0.18)]" aria-hidden="true">
          <span className="titre text-[21px] leading-none text-[#12162B]">{day}</span>
          <span className="text-[11px] font-extrabold tracking-[0.4px] text-[#CE1126]">{month}</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <h3 className="titre m-0 text-[20px] leading-tight">{e.title}</h3>
        <p className="m-0 flex items-start gap-2 text-[14px] text-[#3D4357]">
          <Calendar className="mt-0.5 size-4 shrink-0 text-[#1A2352]" /> {whenLong(e)}
        </p>
        <p className="m-0 flex items-start gap-2 text-[14px] text-[#3D4357]">
          <MapPin className="mt-0.5 size-4 shrink-0 text-[#1A2352]" /> {e.online ? 'En ligne' : e.place}
        </p>
      </div>
    </li>
  )
}

const KIND_SITE_TONES: Record<string, string> = {
  PDF: 'bg-[#FDE7EA] text-[#8A0C20]',
  DOC: 'bg-[#E7F1FB] text-[#1D4F86]',
  XLS: 'bg-[#E3F4EC] text-[#075C2C]',
  PPT: 'bg-[#FFF1C2] text-[#6B5200]',
  IMG: 'bg-[#EFEDFF] text-[#3C2E8F]',
  TXT: 'bg-[#F5F6FB] text-[#5A6075]',
}

/** Un document public (statuts, règlement…), téléchargeable sans compte. */
function SiteDocument({ d }: { d: Doc }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const kind = docKind(d.file)
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setFailed(false)
          downloadDocument(d)
            .catch(() => setFailed(true))
            .finally(() => setBusy(false))
        }}
        className="flex w-full items-center gap-3.5 rounded-[18px] border border-[#E8EAF1] bg-white px-4 py-3 text-left text-[#12162B] hover:bg-[#F5F6FB] disabled:opacity-70"
      >
        <span className={`grid h-[46px] w-[38px] shrink-0 place-items-center rounded-[7px] text-[10px] font-extrabold ${KIND_SITE_TONES[kind]}`} aria-hidden="true">
          {kind}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{d.title}</span>
          <span className={`block text-[13px] ${failed ? 'text-[#B3122A]' : 'text-[#5A6075]'}`}>
            {failed ? 'Le téléchargement n’a pas marché, réessaie.' : [d.category, d.file ? sizeLabel(d.file.size_bytes) : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        <Download className="size-5 shrink-0 text-[#1A2352]" />
      </button>
    </li>
  )
}

const PILLARS = [
  { icon: House, title: 'Accueillir', text: 'Logement, démarches, premiers jours : un parrain ou une marraine t’accompagne dès ton arrivée.', tone: 'bg-[#FDE7EA] text-[#B3122A]' },
  { icon: BookOpen, title: 'Accompagner', text: 'Entraide pour les cours, conseils pour les stages et l’emploi, partage d’expérience avec les anciens.', tone: 'bg-[#FFF1C2] text-[#7A5200]' },
  { icon: Users, title: 'Rassembler', text: 'Fête de l’indépendance, soirées, sport et sorties : on fait vivre la culture guinéenne en Bretagne.', tone: 'bg-[#E3F4EC] text-[#0B6B43]' },
]

const STATS = [
  { value: '150+', label: 'membres', color: '#CE1126' },
  { value: '20', label: 'événements par an', color: '#FCD116' },
  { value: '7', label: 'membres au bureau', color: '#009460' },
  { value: '1', label: 'grande famille', color: '#1A2352' },
]

const FEATURES = [
  { icon: House, title: "Le fil d'actu", text: 'Photos, vidéos et annonces du bureau, avec réactions et commentaires.' },
  { icon: MessageSquare, title: 'Les messages', text: 'Discute en privé ou dans le grand groupe de l’association.' },
  { icon: CreditCard, title: 'La cotisation', text: 'Paie par carte avec HelloAsso et vois tout de suite si tu es à jour.' },
  { icon: Vote, title: 'Les votes', text: 'Vote en ligne quand le bureau ouvre une élection.' },
]

const WHO = [
  { title: 'Étudiant', text: 'Tu es étudiant guinéen dans la région brestoise.', color: '#CE1126' },
  { title: 'Alumni', text: 'Tu as fini tes études et tu veux garder le lien.', color: '#FCD116' },
  { title: 'Sympathisant', text: 'Tu soutiens l’association et sa communauté.', color: '#009460' },
]

const NAV = [
  ['#asso', "L'association"],
  ['#actions', 'Nos actions'],
  ['#bureau', 'Le bureau'],
  ['#appli', "L'appli"],
  ['#adherer', 'Adhérer'],
]

export default function Site() {
  const bureau = usePublicBureau()
  const events = usePublicEvents().data ?? []
  const docs = usePublicDocuments().data ?? []

  return (
    <div className="bg-[#FFFFFF] text-[#12162B] [color-scheme:light]">
      {/* En-tête et accroche */}
      <section className="bg-tisse text-white">
        <header className="mx-auto flex max-w-[1200px] items-center gap-6 px-5 py-5 lg:px-10">
          <Link to="/" className="text-white no-underline">
            <Brand size={38} />
          </Link>
          <nav className="ml-6 hidden gap-7 text-[14px] font-semibold lg:flex" aria-label="Sections du site">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className="text-white/85 no-underline hover:text-white">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <ButtonLink to="/connexion" variant="light" size="sm" className="h-10 px-4">
              Se connecter
            </ButtonLink>
            <ButtonLink to="/inscription" variant="accent" size="sm" className="hidden h-10 px-4 sm:inline-flex">
              Créer mon compte
            </ButtonLink>
          </div>
        </header>
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-10 lg:pt-14 lg:pb-24">
          <div>
            <Kicker light>Association des Étudiants Guinéens de Brest</Kicker>
            <h1 className="titre mt-5 mb-0 text-[44px] leading-[1.02] lg:text-[64px]">
              La famille guinéenne de Brest, <span className="text-safran">réunie.</span>
            </h1>
            <p className="mt-6 mb-0 max-w-[560px] text-[17px] leading-[1.55] text-white/85">
              On accueille les nouveaux, on s'entraide pendant les études et on fait vivre la culture guinéenne en Bretagne. Étudiants, anciens ou amis de l'asso : chacun a sa place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/inscription" variant="accent" size="md" className="h-12 px-5">
                Rejoindre l'AEGB <ArrowRight className="size-4" />
              </ButtonLink>
              <a href="#asso" className="inline-flex h-12 items-center rounded-xl border-[1.5px] border-white/45 px-5 text-[15px] font-bold text-white no-underline hover:bg-white/10">
                Découvrir l'asso
              </a>
            </div>
            <div className="mt-8 flex items-center gap-3 text-[13px] text-white/75">
              <span className="flex">
                {['IS', 'KC', 'MB', 'AD'].map((i, k) => (
                  <span key={i} className={`grid size-8 place-items-center rounded-full border-2 border-leppi text-[11px] font-bold ${['bg-[#FFF1C2] text-[#7A5200]', 'bg-[#E3F4EC] text-[#0B6B43]', 'bg-[#FDE7EA] text-[#A3132A]', 'bg-[#E7EAFB] text-[#253070]'][k]} ${k ? '-ml-2' : ''}`}>
                    {i}
                  </span>
                ))}
              </span>
              Étudiants, anciens et sympathisants, tous au même endroit
            </div>
          </div>
          <div className="relative hidden justify-center lg:flex">
            <PhoneMock screen="fil" />
            <div className="absolute top-[52%] -left-24 w-[230px] rotate-[-5deg] rounded-2xl border border-white/15 bg-[#2A3470] px-3.5 py-3 shadow-2xl">
              <div className="flex items-start gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-safran text-[10px] font-extrabold text-nuit">BOT</span>
                <p className="m-0 text-[12px] leading-[1.35]">
                  <span className="block text-white/70">Assistant AEGB</span>
                  Bienvenue ! Je t'explique comment ça marche ici.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="barre-tricolore h-2" aria-hidden="true" />
      </section>

      {/* Qui sommes-nous */}
      <section id="asso" className="mx-auto max-w-[1200px] scroll-mt-4 px-5 py-20 lg:px-10 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div>
            <Kicker>L'association</Kicker>
            <h2 className="titre mt-3 mb-0 text-[36px] leading-tight lg:text-[44px]">Qui sommes-nous ?</h2>
            <p className="mt-5 mb-0 text-[16px] leading-[1.6] text-[#3D4357]">
              L'AEGB rassemble les étudiants guinéens de la région brestoise, les anciens qui sont passés par là et tous ceux qui veulent soutenir la communauté.
            </p>
            <p className="mt-4 mb-0 text-[16px] leading-[1.6] text-[#3D4357]">
              Notre idée est simple : personne ne doit arriver seul à Brest. On aide à s'installer, on se serre les coudes pendant les études et on garde le lien avec la Guinée.
            </p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {PILLARS.map(({ icon: Icon, title, text, tone }) => (
              <li key={title} className="flex items-start gap-4 rounded-[22px] bg-[#F5F6FB] p-5">
                <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tone}`}>
                  <Icon className="size-6" />
                </span>
                <div>
                  <h3 className="titre m-0 text-[20px]">{title}</h3>
                  <p className="mt-1 mb-0 text-[15px] leading-[1.5] text-[#5A6075]">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <dl className="m-0 mt-16 grid grid-cols-2 gap-6 border-t border-[#E8EAF1] pt-10 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="border-l-4 pl-4" style={{ borderColor: s.color }}>
              <dt className="sr-only">{s.label}</dt>
              <dd className="m-0">
                <span className="titre block text-[40px] leading-none">{s.value}</span>
                <span className="mt-1.5 block text-[14px] text-[#5A6075]">{s.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Nos actions */}
      <section id="actions" className="mx-auto max-w-[1200px] scroll-mt-4 px-5 pb-20 lg:px-10 lg:pb-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Kicker>Nos actions</Kicker>
            <h2 className="titre mt-3 mb-0 text-[36px] leading-tight lg:text-[44px]">Une année avec l'AEGB</h2>
          </div>
          <p className="m-0 max-w-[340px] text-[15px] leading-[1.5] text-[#5A6075]">Le programme complet et les inscriptions sont dans l'appli, réservés aux membres.</p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr] lg:grid-rows-[220px_220px]">
          <article className="bg-tisse relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-[26px] p-7 text-white lg:row-span-2">
            <div
              className="bg-anneau absolute -top-16 -right-16 size-[230px] rounded-full opacity-90 lg:-top-20 lg:-right-20 lg:size-[300px]"
              style={{ mask: 'radial-gradient(farthest-side, transparent calc(100% - 16px), #000 calc(100% - 15px))' }}
              aria-hidden="true"
            />
            <span className="absolute top-7 left-7 text-safran">
              <Flag className="size-9" />
            </span>
            <span className="absolute top-7 right-7 rounded-full bg-safran px-3 py-1 text-xs font-extrabold text-nuit">2 octobre</span>
            <h3 className="titre m-0 text-[30px]">Fête de l'indépendance</h3>
            <p className="mt-2 mb-0 max-w-[420px] text-[15px] leading-[1.5] text-white/85">Le grand rendez-vous de l'année : repas, musique, tenues traditionnelles et toute la communauté réunie.</p>
          </article>
          {[
            { title: 'Accueil des nouveaux', text: 'Parrainage, visite de la ville et aide pour les premières démarches.', when: 'Septembre', icon: House, cls: 'bg-[#CE1126] text-white' },
            { title: 'Tournoi de foot', text: 'Matchs entre membres et rencontres avec les autres associations.', when: 'Printemps', icon: Trophy, cls: 'bg-[#009460] text-white' },
            { title: 'Soirées et sorties', text: "Soirées d'intégration, repas partagés, sorties à la mer.", when: "Toute l'année", icon: Music, cls: 'bg-[#FCD116] text-[#12162B]' },
            { title: 'Aide aux démarches', text: 'Titre de séjour, CAF, banque : on partage ce qui marche.', when: "Toute l'année", icon: FileText, cls: 'border border-[#E8EAF1] bg-[#F5F6FB] text-[#12162B]' },
          ].map(({ title, text, when, icon: Icon, cls }) => (
            <article key={title} className={`relative flex min-h-[200px] flex-col justify-end rounded-[26px] p-6 ${cls}`}>
              <Icon className="absolute top-6 left-6 size-7" />
              <span className="absolute top-6 right-6 text-xs font-bold opacity-85">{when}</span>
              <h3 className="titre m-0 text-[21px]">{title}</h3>
              <p className="mt-1.5 mb-0 text-[14px] leading-[1.45] opacity-85">{text}</p>
            </article>
          ))}
        </div>
        {events.length ? (
          <div className="mt-14">
            <h3 className="titre m-0 text-[24px]">Prochains rendez-vous</h3>
            <ul className="m-0 mt-5 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {events.slice(0, 6).map((e) => (
                <SiteEvent key={e.id} e={e} />
              ))}
            </ul>
            <p className="mt-4 mb-0 text-[14px] text-[#5A6075]">
              Les inscriptions se font dans l'appli.{' '}
              <Link to="/connexion" className="font-bold text-[#1A2352]">
                Se connecter
              </Link>
            </p>
          </div>
        ) : null}
      </section>

      {/* Le bureau */}
      <section id="bureau" className="scroll-mt-4 bg-[#F5F6FB]">
        <div className="mx-auto max-w-[1200px] px-5 py-20 lg:px-10 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Kicker>Ceux qui font tourner l'asso</Kicker>
              <h2 className="titre mt-3 mb-0 text-[36px] leading-tight lg:text-[44px]">Le bureau {academicYear()}</h2>
            </div>
            <p className="m-0 max-w-[380px] text-[15px] leading-[1.5] text-[#5A6075]">Élu par les membres. Les annonces officielles passent par la communication et sont épinglées en haut du fil.</p>
          </div>
          <ul className="m-0 mt-10 grid list-none grid-cols-2 gap-4 p-0 lg:grid-cols-4">
            {(bureau.data ?? []).map((r) => (
              <li key={r.code} className="flex flex-col gap-4 rounded-[22px] bg-white p-5">
                <span className="bg-anneau w-fit rounded-full p-[3px]">
                  <span className="grid size-12 place-items-center rounded-full bg-[#F5F6FB] text-[#5A6075]">
                    <User className="size-5" />
                  </span>
                </span>
                <span>
                  <span className="titre block text-[17px] leading-tight">{r.label}</span>
                  <span className="mt-1 block text-[14px] text-[#5A6075]">{r.first_name ? `${r.first_name} ${r.last_name}` : 'À venir'}</span>
                </span>
              </li>
            ))}
            <li className="flex flex-col justify-between gap-4 rounded-[22px] bg-leppi p-5 text-white">
              <span className="grid size-10 place-items-center rounded-xl bg-safran text-nuit">
                <SquareCheckBig className="size-5" />
              </span>
              <span>
                <span className="titre block text-[17px] leading-tight">Les élections se votent dans l'appli</span>
                <span className="mt-1 block text-[13px] text-white/80">Un membre, une voix, sans papier.</span>
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* L'appli */}
      <section id="appli" className="bg-tisse scroll-mt-4 text-white">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-10 lg:py-24">
          <div>
            <Kicker light>L'appli des membres</Kicker>
            <h2 className="titre mt-3 mb-0 text-[36px] leading-tight lg:text-[44px]">Tout l'AEGB dans ta poche.</h2>
            <ul className="m-0 mt-10 grid list-none gap-7 p-0 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <span className="grid size-10 place-items-center rounded-xl bg-safran text-nuit">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-3 mb-0 text-[16px] font-bold">{title}</h3>
                  <p className="mt-1 mb-0 text-[14px] leading-[1.5] text-white/80">{text}</p>
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-wrap gap-3">
              <ButtonLink to="/connexion" variant="accent" size="md" className="h-12 px-5">
                Ouvrir l'appli <ArrowRight className="size-4" />
              </ButtonLink>
              <span className="inline-flex h-12 items-center rounded-xl border-[1.5px] border-white/30 px-5 text-[14px] font-semibold text-white/75">Android et iPhone : bientôt</span>
            </div>
            <p className="mt-4 mb-0 max-w-[520px] text-[13px] leading-[1.5] text-white/70">
              L'appli marche déjà dans le navigateur, sur téléphone comme sur ordinateur. Elle arrivera ensuite sur le Play Store, et s'installera sur iPhone depuis Safari.
            </p>
          </div>
          <div className="hidden justify-center lg:flex">
            <PhoneMock screen="messages" />
          </div>
        </div>
      </section>

      {/* Adhérer */}
      <section id="adherer" className="mx-auto max-w-[1200px] scroll-mt-4 px-5 py-20 lg:px-10 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <Kicker>Adhérer</Kicker>
            <h2 className="titre mt-3 mb-0 text-[36px] leading-tight lg:text-[44px]">
              Nous rejoindre
              <br />
              en 3 étapes
            </h2>
            <ol className="m-0 mt-8 flex list-none flex-col gap-6 p-0">
              {[
                ['Crée ton compte', 'Ton nom, ton email, ton téléphone et ton profil.'],
                ['Le bureau valide', 'On vérifie que tu fais partie de la communauté, puis tu entres dans l’appli.'],
                ['Règle ta cotisation', 'Par carte, directement dans l’appli, avec HelloAsso.'],
              ].map(([title, text], i) => (
                <li key={title} className="flex items-start gap-4">
                  <span className="titre grid size-10 shrink-0 place-items-center rounded-full bg-leppi text-[17px] text-white">{i + 1}</span>
                  <span>
                    <span className="block text-[17px] font-bold">{title}</span>
                    <span className="mt-0.5 block text-[15px] leading-[1.5] text-[#5A6075]">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <ButtonLink to="/inscription" size="md" className="mt-9 h-12 bg-leppi px-5 text-white">
              Créer mon compte <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
          <div>
            <h3 className="m-0 text-[15px] font-bold">Qui peut adhérer ?</h3>
            <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
              {WHO.map((w) => (
                <li key={w.title} className="rounded-[18px] border border-[#E8EAF1] border-l-4 px-5 py-4" style={{ borderLeftColor: w.color }}>
                  <span className="titre block text-[20px]">{w.title}</span>
                  <span className="mt-1 block text-[15px] text-[#5A6075]">{w.text}</span>
                </li>
              ))}
            </ul>
            {docs.length ? (
              <>
                <h3 className="mt-9 mb-0 text-[15px] font-bold">À lire avant d'adhérer</h3>
                <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
                  {docs.map((d) => (
                    <SiteDocument key={d.id} d={d} />
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {/* Pied de page */}
      <footer className="bg-nuit text-white">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-10">
          <div>
            <Brand size={36} />
            <p className="mt-4 mb-0 max-w-[320px] text-[14px] leading-[1.6] text-white/70">Association des Étudiants Guinéens de Brest. Accueillir, accompagner, rassembler.</p>
          </div>
          <nav aria-label="L'association">
            <p className="m-0 text-[13px] font-bold text-safran">L'asso</p>
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0 text-[14px]">
              <li><a href="#asso" className="text-white/75 no-underline hover:text-white">Qui sommes-nous</a></li>
              <li><a href="#actions" className="text-white/75 no-underline hover:text-white">Nos actions</a></li>
              <li><a href="#bureau" className="text-white/75 no-underline hover:text-white">Le bureau</a></li>
            </ul>
          </nav>
          <nav aria-label="Espace membres">
            <p className="m-0 text-[13px] font-bold text-safran">Membres</p>
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0 text-[14px]">
              <li><Link to="/connexion" className="text-white/75 no-underline hover:text-white">Se connecter</Link></li>
              <li><Link to="/inscription" className="text-white/75 no-underline hover:text-white">Créer un compte</Link></li>
              <li><Link to="/charte" className="text-white/75 no-underline hover:text-white">Charte des membres</Link></li>
            </ul>
          </nav>
        </div>
        <div className="mx-auto flex max-w-[1200px] justify-between gap-4 border-t border-white/10 px-5 py-5 text-[12px] text-white/55 lg:px-10">
          <span>© {new Date().getFullYear()} AEGB</span>
          <span>Fait par et pour les membres</span>
        </div>
        <div className="barre-tricolore h-1.5" aria-hidden="true" />
      </footer>
    </div>
  )
}
