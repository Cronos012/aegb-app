import { Heart } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { Brand } from '../../components/Logo'
import { useCharter } from '../../lib/queries'
import { RULE_ICONS } from '../../lib/charter'

export function Charte() {
  const charter = useCharter()
  return (
    <div className="min-h-dvh bg-page">
      <header className="bg-tisse px-5 pt-[max(env(safe-area-inset-top),20px)] pb-12 text-white">
        <div className="mx-auto max-w-[720px]">
          <Link to="/association" className="text-white no-underline">
            <Brand size={36} />
          </Link>
          <h1 className="titre mt-10 mb-0 text-[36px] leading-tight">La charte des membres</h1>
          <p className="mt-2 mb-0 text-white/85">Chaque membre l'accepte en créant son compte.</p>
        </div>
      </header>
      <main className="mx-auto -mt-6 max-w-[720px] px-3 pb-12">
        <div className="rounded-[26px] bg-surface px-5 py-7 lg:px-10">
          {charter.isPending ? <PageLoader /> : null}
          <ErrorNote error={charter.error} />
          {charter.data ? (
            <>
              <ol className="m-0 flex list-none flex-col gap-6 p-0">
                {charter.data.rules.map((rule, i) => {
                  const Icon = RULE_ICONS[rule.icon] ?? Heart
                  return (
                    <li key={rule.title} className="flex items-start gap-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-select text-ink">
                        <Icon className="size-5" />
                      </span>
                      <div>
                        <h2 className="m-0 text-[17px] font-bold">
                          {i + 1}. {rule.title}
                        </h2>
                        <p className="mt-1 mb-0 text-[15px] leading-[1.5] text-muted">{rule.text}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
              <p className="mt-8 mb-0 border-t border-line-soft pt-5 text-[13px] text-muted">
                Version {charter.data.version}. Le texte définitif est rédigé par le bureau de l'AEGB. Si la charte change, chaque membre l'accepte à nouveau à sa prochaine connexion.
              </p>
            </>
          ) : null}
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          <Link to="/">Retour à l'accueil</Link>
        </p>
      </main>
    </div>
  )
}

