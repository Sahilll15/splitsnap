import Link from 'next/link';

const TOOLS = [
  { name: 'Interview Coach', url: 'https://interview-coach-seven-rose.vercel.app', blurb: 'AI mock interview practice' },
  { name: 'Minutes', url: 'https://minutes-sand.vercel.app', blurb: 'meeting minutes from audio' },
  { name: 'AskCSV', url: 'https://askcsv-seven.vercel.app', blurb: 'ask questions about a CSV' },
  { name: 'ShipNotes', url: 'https://shipnotes-mu.vercel.app', blurb: 'release notes from GitHub commits' },
  { name: 'ToneRadar', url: 'https://toneradar.vercel.app', blurb: 'check the tone of a message' },
  { name: 'Headline Arena', url: 'https://headline-arena-gamma.vercel.app', blurb: 'test and rank headlines' },
  { name: 'FinePrint', url: 'https://fineprint-beta.vercel.app', blurb: 'find risky clauses in contracts' },
  { name: 'fallacy finder', url: 'https://fallacy-finder-nine.vercel.app', blurb: 'spot logical fallacies' },
  { name: 'PitchPanel', url: 'https://pitchpanel.vercel.app', blurb: 'startup pitch feedback' },
  { name: 'Ask India', url: 'https://askindia.online', blurb: 'answers from official government sites' },
];

const link = 'font-semibold text-ink-soft underline-offset-2 hover:text-navy hover:underline';

export default function SiteFooter() {
  return (
    <footer className="mx-auto mt-14 max-w-6xl border-t border-line px-4 pt-6 text-[13px] leading-relaxed text-ink-faint sm:px-6">
      <p>
        Receipt photos go to Groq (or OpenAI as a fallback) to be read and are not saved by this app. Your split stays in this browser tab, and a share link carries it inside the link itself.
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/how-it-works" className={link}>
          How it works
        </Link>
        <span>
          Built by{' '}
          <a href="https://sahilchalke.com" className={link}>
            Sahil Chalke
          </a>
        </span>
        <a href="https://github.com/Sahilll15/splitsnap" className={link}>
          Source code
        </a>
      </p>
      <nav aria-label="More tools" className="mt-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">More tools</h2>
        <ul className="mt-1.5 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <li key={t.url}>
              <a href={t.url} className={link}>
                {t.name}
              </a>
              , {t.blurb}
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
