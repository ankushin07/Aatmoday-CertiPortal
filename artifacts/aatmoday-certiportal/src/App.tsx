import { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import Papa from 'papaparse';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  CloudUpload,
  Code2,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  KeyRound,
  LockKeyhole,
  Menu,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Table2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import { type RefObject } from 'react';

type Participant = {
  name: string;
  email: string;
  college: string;
  date: string;
  uniqueId?: string;
  cleaned?: boolean;
};

type Step = 'import' | 'review' | 'clean' | 'publish';

const STORAGE_KEY = 'aatmoday-certiportal-records';
const CLEANER_PROMPT =
  "You are a data cleaner. Fix capitalization to Title Case, remove exact duplicate rows based on email, flag missing data as 'N/A', and return ONLY a valid JSON array.";

const MOCK_DATA: Participant[] = [
  { name: 'rAhUL shArma', email: 'rahul.sharma@csjmu.ac.in', college: 'CSJMU', date: '2026-02-28' },
  { name: 'Meera IYER', email: 'meera.iyer@akgec.ac.in', college: 'Ajay Kumar Garg Engineering College', date: '2026-02-28' },
  { name: 'Rahul Sharma', email: 'rahul.sharma@csjmu.ac.in', college: 'CSJMU', date: '2026-02-28' },
  { name: 'devansh singh', email: 'devansh.singh@ietlucknow.ac.in', college: '', date: '2026-02-28' },
  { name: 'Aanya Kapoor', email: 'aanya.kapoor@jssate.ac.in', college: '', date: '2026-02-28' },
];

const steps: { id: Step; number: string; label: string; caption: string }[] = [
  { id: 'import', number: '01', label: 'Import', caption: 'Bring in your roster' },
  { id: 'review', number: '02', label: 'Review', caption: 'See every raw record' },
  { id: 'clean', number: '03', label: 'Clean', caption: 'Resolve issues before print' },
  { id: 'publish', number: '04', label: 'Publish', caption: 'Issue trusted certificates' },
];

function titleCase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackClean(records: Participant[]) {
  const seen = new Set<string>();
  return records.reduce<Participant[]>((result, record) => {
    const email = record.email.trim().toLowerCase();
    if (email && seen.has(email)) return result;
    if (email) seen.add(email);
    result.push({
      name: record.name ? titleCase(record.name) : 'N/A',
      email: record.email?.trim() || 'N/A',
      college: record.college?.trim() ? titleCase(record.college) : 'N/A',
      date: record.date?.trim() || 'N/A',
      cleaned: true,
    });
    return result;
  }, []);
}

function normalizeRecord(record: Record<string, unknown>): Participant {
  const get = (...keys: string[]) => {
    const key = Object.keys(record).find((candidate) =>
      keys.includes(candidate.toLowerCase().replace(/[\s_-]/g, '')),
    );
    return key ? String(record[key] ?? '') : '';
  };
  return {
    name: get('name', 'participantname', 'fullname'),
    email: get('email', 'emailaddress'),
    college: get('college', 'collegename', 'institution'),
    date: get('date', 'eventdate'),
  };
}

function formatDate(date: string) {
  if (!date || date === 'N/A') return date || 'N/A';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CV';
}

function fileSafeName(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'certificate';
}

function App() {
  const verifyId = new URLSearchParams(window.location.search).get('verify');
  return verifyId ? <VerificationPage id={verifyId} /> : <Dashboard />;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" data-testid="brand-aatmoday">
      <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--primary))] shadow-[0_5px_16px_hsl(43_72%_56%_/_0.2)]">
        <Code2 size={21} strokeWidth={2.5} />
        <span className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-[hsl(var(--sidebar))] bg-[hsl(153_42%_45%)]" />
      </div>
      {!compact && (
        <div>
          <p className="font-serif text-[17px] font-bold leading-none tracking-tight text-[hsl(var(--sidebar-foreground))]">Aatmoday</p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">CertiPortal</p>
        </div>
      )}
    </div>
  );
}

function SideRail({ step, setStep, recordCount, mobileOpen, close }: { step: Step; setStep: (step: Step) => void; recordCount: number; mobileOpen: boolean; close: () => void }) {
  return (
    <>
      {mobileOpen && <button aria-label="Close navigation" data-testid="button-close-navigation" onClick={close} className="fixed inset-0 z-30 bg-[hsl(221_45%_12%_/_0.45)] md:hidden" />}
      <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 flex w-[278px] flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-5 py-6 text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 md:relative md:z-auto md:translate-x-0`} data-testid="navigation-sidebar">
        <div className="px-2"><BrandMark /></div>
        <div className="mt-14 px-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--sidebar-foreground)_/_0.48)]">Workflow</p>
          <nav className="mt-4 space-y-1" aria-label="Workflow steps">
            {steps.map((item, index) => {
              const enabled = index === 0 || recordCount > 0;
              const active = step === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!enabled}
                  onClick={() => { if (enabled) { setStep(item.id); close(); } }}
                  data-testid={`button-step-${item.id}`}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${active ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]' : 'text-[hsl(var(--sidebar-foreground)_/_0.62)] hover:bg-[hsl(var(--sidebar-accent)_/_0.7)] hover:text-[hsl(var(--sidebar-foreground))]'} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span className={`flex size-8 items-center justify-center rounded-lg font-mono text-[10px] ${active ? 'bg-[hsl(var(--accent))] font-bold text-[hsl(var(--accent-foreground))]' : 'bg-[hsl(var(--sidebar-foreground)_/_0.08)]'}`}>{item.number}</span>
                  <span className="min-w-0"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block truncate text-[11px] opacity-55">{item.caption}</span></span>
                  {active && <ChevronRight size={15} className="ml-auto text-[hsl(var(--accent))]" />}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto space-y-4">
          <div className="rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-foreground)_/_0.04)] p-4">
            <div className="flex items-center gap-2 text-[hsl(var(--accent))]"><ShieldCheck size={16} /><span className="text-[11px] font-bold uppercase tracking-[0.13em]">Local-first desk</span></div>
            <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--sidebar-foreground)_/_0.52)]">Your participant records stay in this browser until you choose to publish.</p>
          </div>
          <div className="flex items-center gap-3 px-2 text-xs text-[hsl(var(--sidebar-foreground)_/_0.5)]"><div className="flex size-8 items-center justify-center rounded-full bg-[hsl(var(--accent)_/_0.16)] font-mono text-[10px] text-[hsl(var(--accent))]">CV</div><span>Code Vidya<br /><span className="text-[10px] opacity-70">Hack Days · 2026</span></span></div>
        </div>
      </aside>
    </>
  );
}

function TopBar({ step, setMobileOpen, onReset }: { step: Step; setMobileOpen: (open: boolean) => void; onReset: () => void }) {
  const current = steps.find((item) => item.id === step) || steps[0];
  return (
    <header className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background)_/_0.88)] px-5 py-4 backdrop-blur-md md:px-10">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setMobileOpen(true)} data-testid="button-open-navigation" className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] md:hidden"><Menu size={20} /></button>
        <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Code Vidya / operations</p><h1 className="mt-1 font-serif text-xl font-bold tracking-tight text-[hsl(var(--foreground))] md:text-2xl">{current.label} participant records</h1></div>
      </div>
      <button type="button" onClick={onReset} data-testid="button-reset-workflow" className="hidden items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] sm:flex"><RotateCcw size={14} /> Start over</button>
    </header>
  );
}

function Dashboard() {
  const [step, setStep] = useState<Step>('import');
  const [raw, setRaw] = useState<Participant[]>([]);
  const [cleaned, setCleaned] = useState<Participant[]>([]);
  const [finalized, setFinalized] = useState<Participant[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanSource, setCleanSource] = useState<'AI' | 'local' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      setFinalized(stored);
      if (Array.isArray(stored) && stored.length) setStep('publish');
    } catch { setFinalized([]); }
  }, []);

  const reset = () => {
    setStep('import'); setRaw([]); setCleaned([]); setFinalized([]); setCleanSource(null); setError(''); setNotice('');
    localStorage.removeItem(STORAGE_KEY);
  };

  const loadMock = () => {
    setRaw(MOCK_DATA); setCleaned([]); setFinalized([]); setError(''); setNotice('5 raw records loaded. A few issues are waiting for review.'); setStep('review');
  };

  const upload = (file: File) => {
    setError('');
    Papa.parse<Record<string, unknown>>(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const records = results.data.map(normalizeRecord).filter((item) => item.name || item.email || item.college);
        if (!records.length) { setError('No participant rows were found. Check that your CSV has a header row.'); return; }
        setRaw(records); setCleaned([]); setFinalized([]); setNotice(`${records.length} records loaded from ${file.name}.`); setStep('review');
      },
      error: () => setError('That file could not be read. Please try a standard CSV export.'),
    });
  };

  const cleanData = async () => {
    if (!raw.length) return;
    setIsCleaning(true); setError(''); setNotice('');
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (key) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: CLEANER_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(raw) }] }] }),
        });
        if (!response.ok) throw new Error('Gemini request failed');
        const payload = await response.json();
        const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('Unexpected AI response');
        setCleaned(parsed.map((item) => ({ ...normalizeRecord(item), cleaned: true }))); setCleanSource('AI'); setNotice('Gemini returned a cleaned roster. Review the changes before publishing.'); setIsCleaning(false); setStep('clean'); return;
      } catch { setNotice('Gemini was unavailable, so CertiPortal used its reliable local cleaning rules.'); }
    }
    await new Promise((resolve) => setTimeout(resolve, 520));
    setCleaned(fallbackClean(raw)); setCleanSource('local'); setIsCleaning(false); setStep('clean');
  };

  const finalize = () => {
    if (!cleaned.length) return;
    const issued = cleaned.map((record, index) => ({ ...record, uniqueId: `CSJMU-2026-${String(index + 1).padStart(3, '0')}`, date: record.date === 'N/A' ? '2026-02-28' : record.date }));
    setFinalized(issued); localStorage.setItem(STORAGE_KEY, JSON.stringify(issued)); setNotice(`${issued.length} certificates are ready to generate.`); setStep('publish');
  };

  return (
    <div className="dashboard-grid flex min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <SideRail step={step} setStep={setStep} recordCount={raw.length} mobileOpen={mobileOpen} close={() => setMobileOpen(false)} />
      <main className="min-w-0 flex-1">
        <TopBar step={step} setMobileOpen={setMobileOpen} onReset={reset} />
        <div className="mx-auto max-w-[1320px] px-5 py-7 md:px-10 md:py-10">
          {notice && <div className="mb-6 flex items-start gap-3 rounded-xl border border-[hsl(153_42%_38%_/_0.22)] bg-[hsl(153_42%_38%_/_0.08)] px-4 py-3 text-sm text-[hsl(153_42%_30%)] animate-sweep-in" role="status" data-testid="status-success"><CheckCircle2 size={18} className="mt-0.5 shrink-0" />{notice}<button onClick={() => setNotice('')} data-testid="button-dismiss-notice" className="ml-auto opacity-60 hover:opacity-100"><X size={16} /></button></div>}
          {error && <div className="mb-6 flex items-start gap-3 rounded-xl border border-[hsl(var(--destructive)_/_0.25)] bg-[hsl(var(--destructive)_/_0.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))]" role="alert" data-testid="status-error"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}<button onClick={() => setError('')} data-testid="button-dismiss-error" className="ml-auto opacity-60 hover:opacity-100"><X size={16} /></button></div>}
          {step === 'import' && <ImportStep onMock={loadMock} onFile={upload} fileRef={fileRef} hasSaved={finalized.length > 0} />}
          {step === 'review' && <ReviewStep records={raw} onClean={cleanData} onBack={() => setStep('import')} isCleaning={isCleaning} />}
          {step === 'clean' && <CleanStep records={cleaned} source={cleanSource} onBack={() => setStep('review')} onFinalize={finalize} />}
          {step === 'publish' && <PublishStep records={finalized} onBack={() => setStep('clean')} />}
        </div>
      </main>
    </div>
  );
}

function SectionIntro({ eyebrow, title, description, icon: Icon }: { eyebrow: string; title: string; description: string; icon: typeof Database }) {
  return <div className="max-w-2xl animate-rise-in"><div className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--accent-foreground))]"><span className="flex size-6 items-center justify-center rounded-md bg-[hsl(var(--accent))] text-[hsl(var(--primary))]"><Icon size={13} /></span>{eyebrow}</div><h2 className="font-serif text-4xl font-bold leading-[1.05] tracking-[-0.035em] text-[hsl(var(--foreground))] md:text-5xl">{title}</h2><p className="mt-4 max-w-xl text-[15px] leading-7 text-[hsl(var(--muted-foreground))]">{description}</p></div>;
}

function ImportStep({ onMock, onFile, fileRef, hasSaved }: { onMock: () => void; onFile: (file: File) => void; fileRef: RefObject<HTMLInputElement | null>; hasSaved: boolean }) {
  return <div className="space-y-9"><SectionIntro eyebrow="Step 01 / Import" title="Start with the roster." description="Bring the event team’s participant list into one clear workspace. We’ll show the raw truth before anything gets changed." icon={CloudUpload} />
    <div className="grid max-w-5xl gap-5 lg:grid-cols-[1.3fr_0.7fr]">
      <button type="button" onClick={() => fileRef.current?.click()} data-testid="button-upload-csv" className="group relative min-h-[286px] overflow-hidden rounded-2xl border border-dashed border-[hsl(var(--primary)_/_0.3)] bg-[hsl(var(--card))] p-7 text-left shadow-[0_12px_35px_hsl(221_45%_17%_/_0.06)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--accent))] hover:shadow-[0_16px_45px_hsl(221_45%_17%_/_0.11)] md:p-9">
        <div className="absolute -right-8 -top-10 size-40 rounded-full border-[20px] border-[hsl(var(--accent)_/_0.12)] transition group-hover:scale-110" /><div className="absolute right-7 top-8 font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">CSV / UTF-8</div>
         <div className="flex size-14 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--accent))]"><Upload size={23} /></div><h3 className="mt-8 font-serif text-2xl font-bold">Upload CSV</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">Drop in your export with name, email, college, and date columns. Headers are matched automatically.</p><span className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--primary))]">Choose file <ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
      </button>
       <div className="flex min-h-[286px] flex-col justify-between rounded-2xl bg-[hsl(var(--primary))] p-7 text-[hsl(var(--primary-foreground))] shadow-[0_12px_35px_hsl(221_45%_17%_/_0.14)] md:p-8"><div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.17em] text-[hsl(var(--accent))]"><Sparkles size={14} /> Ready-to-test</div><h3 className="mt-5 font-serif text-2xl font-bold">See the workflow in motion.</h3><p className="mt-2 text-sm leading-6 text-[hsl(var(--primary-foreground)_/_0.64)]">Load five intentionally messy records to preview review, cleaning, and certificate generation.</p></div><button type="button" onClick={onMock} data-testid="button-load-mock-data" className="mt-8 flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--accent))] px-4 py-3 text-sm font-bold text-[hsl(var(--accent-foreground))] transition hover:brightness-105 active:scale-[.98]">Use Mock Data <ArrowRight size={16} /></button></div>
    </div>
    <input ref={fileRef} className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }} data-testid="input-csv-file" />
    {hasSaved && <div className="flex max-w-5xl items-center gap-3 rounded-xl border border-[hsl(var(--accent)_/_0.4)] bg-[hsl(var(--accent)_/_0.12)] px-4 py-3 text-sm"><LockKeyhole size={16} className="text-[hsl(var(--accent-foreground))]" /><span><strong>Local archive found.</strong> Your last published roster is stored in this browser and can be viewed by continuing to Publish.</span></div>}
    <TrustStrip />
  </div>;
}

function TrustStrip() {
  return <div className="flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 border-t border-[hsl(var(--border))] pt-6 text-xs text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-2"><LockKeyhole size={14} /> Local-first storage</span><span className="flex items-center gap-2"><FileCheck2 size={14} /> No original rows overwritten</span><span className="flex items-center gap-2"><BadgeCheck size={14} /> QR-verifiable output</span></div>;
}

function ReviewStep({ records, onClean, onBack, isCleaning }: { records: Participant[]; onClean: () => void; onBack: () => void; isCleaning: boolean }) {
  return <div className="space-y-7"><SectionIntro eyebrow="Step 02 / Review" title="Look at the raw truth." description="Nothing is hidden or silently corrected. This is your audit trail: the exact participant data that came from the source file." icon={Table2} />
    <div className="flex flex-wrap items-center gap-3"><Stat label="Rows imported" value={String(records.length).padStart(2, '0')} /><Stat label="Fields observed" value="04" /><Stat label="Ready for cleaning" value="YES" accent /></div>
    <DataTable records={records} raw />
     <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-6"><button type="button" onClick={onBack} data-testid="button-back-import" className="rounded-lg px-3 py-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">Back to import</button><button type="button" onClick={onClean} disabled={isCleaning} data-testid="button-clean-data" className="flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-[0_8px_20px_hsl(221_45%_17%_/_0.15)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70">{isCleaning ? <><span className="size-4 animate-pulse rounded-full bg-current opacity-70" /> Cleaning roster...</> : <><WandSparkles size={17} className="text-[hsl(var(--accent))]" /> Clean Data with AI <ArrowRight size={16} /></>}</button></div>
  </div>;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{label}</p><p className={`mt-1 font-mono text-lg font-bold ${accent ? 'text-[hsl(153_42%_35%)]' : 'text-[hsl(var(--foreground))]'}`}>{value}</p></div>;
}

function DataTable({ records, raw = false }: { records: Participant[]; raw?: boolean }) {
  if (!records.length) return <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] text-center"><Database size={25} className="text-[hsl(var(--muted-foreground))]" /><p className="mt-3 text-sm font-semibold">No records to display</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Import a CSV or load the mock roster to continue.</p></div>;
  return <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[0_10px_28px_hsl(221_45%_17%_/_0.045)]"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><div className="flex items-center gap-2 text-sm font-bold"><FileSpreadsheet size={17} className="text-[hsl(var(--accent-foreground))]" />{raw ? 'Source records' : 'Cleaned records'}</div><span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{records.length} {records.length === 1 ? 'record' : 'records'}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-[hsl(var(--muted)_/_0.65)] font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]"><tr><th className="px-5 py-3 font-medium">Participant</th><th className="px-5 py-3 font-medium">Email</th><th className="px-5 py-3 font-medium">College</th><th className="px-5 py-3 font-medium">Event date</th>{!raw && <th className="px-5 py-3 font-medium">Status</th>}</tr></thead><tbody className="divide-y divide-[hsl(var(--border))]">{records.map((record, index) => <tr key={`${record.email}-${index}`} className="transition hover:bg-[hsl(var(--muted)_/_0.38)]" data-testid={`row-participant-${index}`}><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-[hsl(var(--primary)_/_0.08)] font-mono text-[10px] font-bold text-[hsl(var(--primary))]">{initials(record.name)}</span><span className="text-sm font-semibold">{record.name || <span className="text-[hsl(var(--muted-foreground))]">Missing</span>}</span></div></td><td className="px-5 py-4 font-mono text-xs text-[hsl(var(--muted-foreground))]">{record.email || <span className="text-[hsl(var(--destructive))]">Missing</span>}</td><td className={`px-5 py-4 text-sm ${!record.college ? 'font-semibold text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{record.college || 'Missing'}</td><td className="px-5 py-4 font-mono text-xs text-[hsl(var(--muted-foreground))]">{formatDate(record.date)}</td>{!raw && <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(153_42%_38%_/_0.1)] px-2.5 py-1 text-[11px] font-bold text-[hsl(153_42%_30%)]"><Check size={12} /> Cleaned</span></td>}</tr>)}</tbody></table></div></div>;
}

function CleanStep({ records, source, onBack, onFinalize }: { records: Participant[]; source: 'AI' | 'local' | null; onBack: () => void; onFinalize: () => void }) {
  const missing = records.filter((record) => Object.values(record).some((value) => value === 'N/A')).length;
  return <div className="space-y-7"><SectionIntro eyebrow="Step 03 / Clean" title="Make the roster publishable." description="Capitalization is consistent, exact email duplicates are removed, and missing values are clearly marked so the team can approve with confidence." icon={Sparkles} />
    <div className="flex flex-wrap items-center gap-3"><Stat label="After deduplication" value={String(records.length).padStart(2, '0')} accent /><Stat label="Missing fields marked" value={String(missing).padStart(2, '0')} /><span className="flex items-center gap-2 rounded-xl border border-[hsl(var(--accent)_/_0.35)] bg-[hsl(var(--accent)_/_0.12)] px-4 py-3 text-xs font-semibold text-[hsl(var(--accent-foreground))]"><Sparkles size={15} /> {source === 'AI' ? 'Gemini assisted' : 'Local rules applied'}</span></div>
    <DataTable records={records} />
    <div className="rounded-2xl border border-[hsl(var(--accent)_/_0.3)] bg-[hsl(var(--accent)_/_0.1)] p-5"><div className="flex gap-3"><CircleHelp size={18} className="mt-0.5 shrink-0 text-[hsl(var(--accent-foreground))]" /><div><p className="text-sm font-bold">A quick note before issuing</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Review the cleaned values above. “N/A” is intentional and can be edited in your source CSV if a detail needs to appear on the certificate.</p></div></div></div>
     <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-6"><button type="button" onClick={onBack} data-testid="button-back-review" className="rounded-lg px-3 py-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">Back to review</button><button type="button" onClick={onFinalize} data-testid="button-finalize-generate" className="flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-[0_8px_20px_hsl(221_45%_17%_/_0.15)] transition hover:-translate-y-0.5"><ClipboardCheck size={17} className="text-[hsl(var(--accent))]" /> Finalize &amp; Generate <ArrowRight size={16} /></button></div>
  </div>;
}

function PublishStep({ records, onBack }: { records: Participant[]; onBack: () => void }) {
  const [showAll, setShowAll] = useState(false);
  return <div className="space-y-8"><div className="flex flex-wrap items-end justify-between gap-5"><SectionIntro eyebrow="Step 04 / Publish" title="Ready for the stage." description="Every record now has a durable certificate ID. Preview certificates individually, or bring the full batch into view for a final visual check." icon={BadgeCheck} /><button type="button" onClick={() => setShowAll((value) => !value)} data-testid="button-generate-all" className="flex items-center gap-2 rounded-xl bg-[hsl(var(--accent))] px-5 py-3 text-sm font-bold text-[hsl(var(--accent-foreground))] shadow-[0_8px_20px_hsl(43_72%_56%_/_0.2)] transition hover:brightness-105">{showAll ? 'Show roster' : 'Generate all'} <ArrowRight size={16} /></button></div>
    <div className="flex flex-wrap gap-3"><Stat label="Issued" value={String(records.length).padStart(2, '0')} accent /><Stat label="Certificate series" value="CSJMU-26" /><span className="flex items-center gap-2 rounded-xl border border-[hsl(153_42%_38%_/_0.2)] bg-[hsl(153_42%_38%_/_0.08)] px-4 py-3 text-xs font-bold text-[hsl(153_42%_30%)]"><CheckCircle2 size={15} /> Saved to this browser</span></div>
    {records.length ? showAll ? <div className="grid gap-7 xl:grid-cols-2">{records.map((record) => <CertificateCard key={record.uniqueId} record={record} />)}</div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{records.map((record, index) => <CertificateTile key={record.uniqueId} record={record} index={index} onOpen={() => setShowAll(true)} />)}</div> : <EmptyPublish onBack={onBack} />}
    <div className="flex items-center justify-between border-t border-[hsl(var(--border))] pt-5"><button type="button" onClick={onBack} data-testid="button-back-clean" className="rounded-lg px-3 py-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">Back to cleaned data</button><p className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><ScanLine size={14} /> Anyone with an ID can verify at this portal</p></div>
  </div>;
}

function CertificateTile({ record, index, onOpen }: { record: Participant; index: number; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} data-testid={`button-preview-certificate-${index}`} className="group overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-left shadow-[0_10px_28px_hsl(221_45%_17%_/_0.05)] transition hover:-translate-y-1 hover:border-[hsl(var(--accent))]"><div className="relative h-3 bg-[hsl(var(--primary))]"><span className="absolute left-5 top-0 h-1 w-12 bg-[hsl(var(--accent))]" /></div><div className="p-5"><div className="flex items-start justify-between"><div className="flex size-10 items-center justify-center rounded-xl bg-[hsl(var(--primary))] font-mono text-xs font-bold text-[hsl(var(--accent))]">{initials(record.name)}</div><span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">#{String(index + 1).padStart(3, '0')}</span></div><p className="mt-6 font-serif text-xl font-bold">{record.name}</p><p className="mt-1 truncate font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{record.uniqueId}</p><div className="mt-6 flex items-center justify-between border-t border-[hsl(var(--border))] pt-4 text-xs text-[hsl(var(--muted-foreground))]"><span>{formatDate(record.date)}</span><span className="flex items-center gap-1 font-bold text-[hsl(var(--primary))]">Preview <ChevronRight size={14} className="transition group-hover:translate-x-1" /></span></div></div></button>;
}

function CertificateCard({ record }: { record: Participant }) {
  const value = `${window.location.origin}?verify=${record.uniqueId}`;
  const certificateRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState<'png' | 'pdf' | null>(null);
  const [downloadError, setDownloadError] = useState('');

  const downloadCertificate = async (format: 'png' | 'pdf') => {
    if (!certificateRef.current) return;
    setDownloading(format);
    setDownloadError('');
    try {
      const image = await toPng(certificateRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#f7f2e7',
      });
      const baseName = `code-vidya-${fileSafeName(record.uniqueId || record.name)}`;
      if (format === 'png') {
        const link = document.createElement('a');
        link.download = `${baseName}.png`;
        link.href = image;
        link.click();
      } else {
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        pdf.addImage(image, 'PNG', 15, 15, 267, 180);
        pdf.save(`${baseName}.pdf`);
      }
    } catch {
      setDownloadError('This certificate could not be exported. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <article className="overflow-hidden rounded-[20px] border-[5px] border-[hsl(var(--primary))] bg-[hsl(var(--card))] shadow-[0_16px_45px_hsl(221_45%_17%_/_0.14)]">
      <div ref={certificateRef} className="certificate-paper relative m-3 overflow-hidden rounded-[10px] border border-[hsl(var(--primary)_/_0.5)]">
        <div className="certificate-ornament relative flex min-h-[420px] flex-col items-center justify-between px-6 py-9 text-center sm:px-12">
          <div className="absolute left-5 top-5 size-11 border-l border-t border-[hsl(var(--accent-foreground)_/_0.45)]" />
          <div className="absolute bottom-5 right-5 size-11 border-b border-r border-[hsl(var(--accent-foreground)_/_0.45)]" />
          <div>
            <div className="flex items-center justify-center gap-2 text-[hsl(var(--primary))]">
              <span className="flex size-8 items-center justify-center rounded-lg bg-[hsl(var(--accent))]"><Code2 size={18} /></span>
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em]">Code Vidya</span>
            </div>
            <p className="mt-7 font-mono text-[10px] font-bold uppercase tracking-[0.36em] text-[hsl(var(--accent-foreground))]">Certificate of participation</p>
          </div>
          <div>
            <h3 className="font-serif text-4xl font-bold tracking-tight text-[hsl(var(--primary))] sm:text-5xl">{record.name}</h3>
            <p className="mx-auto mt-3 max-w-md text-sm text-[hsl(var(--primary)_/_0.72)]">for participating in</p>
            <p className="mt-2 font-serif text-2xl font-bold text-[hsl(var(--primary))]">Code Vidya Hack Days</p>
          </div>
          <div className="flex w-full max-w-md items-end justify-between gap-5">
            <div className="text-left">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--primary)_/_0.55)]">Issued on</p>
              <p className="mt-1 text-sm font-semibold text-[hsl(var(--primary))]">{formatDate(record.date)}</p>
              <div className="mt-3 h-px w-28 bg-[hsl(var(--primary)_/_0.3)]" />
            </div>
            <div className="rounded-xl bg-[hsl(var(--card)_/_0.7)] p-2">
              <QRCodeSVG value={value} size={72} bgColor="#f7f2e7" fgColor="#192b4a" level="M" />
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--primary)_/_0.55)]">Certificate ID</p>
              <p className="mt-1 font-mono text-xs font-bold text-[hsl(var(--primary))]">{record.uniqueId}</p>
              <div className="mt-3 ml-auto h-px w-28 bg-[hsl(var(--primary)_/_0.3)]" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] px-4 py-3">
        <div>
          <p className="text-xs font-bold text-[hsl(var(--foreground))]">Download certificate</p>
          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">Print-ready PNG or PDF</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void downloadCertificate('png')} disabled={downloading !== null} data-testid={`button-download-png-${record.uniqueId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-bold text-[hsl(var(--foreground))] transition hover:border-[hsl(var(--accent))] hover:bg-[hsl(var(--muted))] disabled:cursor-wait disabled:opacity-60">
            <Download size={14} /> {downloading === 'png' ? 'Preparing…' : 'Download PNG'}
          </button>
          <button type="button" onClick={() => void downloadCertificate('pdf')} disabled={downloading !== null} data-testid={`button-download-pdf-${record.uniqueId}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60">
            <Download size={14} className="text-[hsl(var(--accent))]" /> {downloading === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>
      {downloadError && <p className="border-t border-[hsl(var(--destructive)_/_0.2)] bg-[hsl(var(--destructive)_/_0.06)] px-4 py-2 text-xs text-[hsl(var(--destructive))]" role="alert">{downloadError}</p>}
    </article>
  );
}

function EmptyPublish({ onBack }: { onBack: () => void }) {
  return <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-12 text-center"><FileCheck2 size={30} className="mx-auto text-[hsl(var(--muted-foreground))]" /><h3 className="mt-4 font-serif text-2xl font-bold">Nothing issued yet</h3><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Finish cleaning your participant roster to generate certificates.</p><button type="button" onClick={onBack} data-testid="button-empty-publish-back" className="mt-6 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-bold text-[hsl(var(--primary-foreground))]">Return to clean</button></div>;
}

function VerificationPage({ id }: { id: string }) {
  const [records, setRecords] = useState<Participant[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { try { setRecords(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); } catch { setRecords([]); } setLoaded(true); }, []);
  const record = useMemo(() => records.find((item) => item.uniqueId?.toLowerCase() === id.toLowerCase()), [records, id]);
  if (!loaded) return <div className="flex min-h-[100dvh] items-center justify-center gap-2 bg-[hsl(var(--primary))]"><span className="size-2 animate-pulse rounded-full bg-[hsl(var(--accent))]" /><span className="size-2 animate-pulse rounded-full bg-[hsl(var(--accent))] delay-1" /><span className="size-2 animate-pulse rounded-full bg-[hsl(var(--accent))] delay-2" /></div>;
  return <div className="min-h-[100dvh] bg-[hsl(var(--primary))] px-5 py-8 text-[hsl(var(--primary-foreground))] md:px-10 md:py-12"><div className="mx-auto max-w-3xl"><div className="flex items-center justify-between"><BrandMark compact /><span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--primary-foreground)_/_0.5)]"><LockKeyhole size={13} /> Public verification</span></div><div className={`mt-16 overflow-hidden rounded-[28px] border ${record ? 'border-[hsl(153_42%_48%_/_0.4)]' : 'border-[hsl(var(--destructive)_/_0.45)]'} bg-[hsl(var(--primary-foreground)_/_0.06)] shadow-[0_25px_70px_hsl(221_45%_8%_/_0.25)] md:mt-24`}><div className={`h-2 ${record ? 'bg-[hsl(153_42%_48%)]' : 'bg-[hsl(var(--destructive))]'}`} /><div className="p-7 md:p-14">{record ? <><div className="flex size-16 items-center justify-center rounded-2xl bg-[hsl(153_42%_48%_/_0.17)] text-[hsl(153_60%_64%)]"><BadgeCheck size={34} /></div><p className="mt-8 font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-[hsl(153_60%_64%)]">Certificate authenticated</p><h1 className="mt-3 font-serif text-5xl font-bold tracking-[-0.04em] md:text-7xl" data-testid="status-verified">Verified</h1><p className="mt-5 max-w-xl text-base leading-7 text-[hsl(var(--primary-foreground)_/_0.66)]">This certificate is a valid record in the Code Vidya Hack Days registry. The details below match the issued record.</p><div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[hsl(var(--primary-foreground)_/_0.12)] bg-[hsl(var(--primary-foreground)_/_0.12)] sm:grid-cols-2"><VerifyDetail label="Participant name" value={record.name} testId="text-verified-name" /><VerifyDetail label="Programme" value="Code Vidya Hack Days" testId="text-verified-programme" /><VerifyDetail label="Issued date" value={formatDate(record.date)} testId="text-verified-date" /><VerifyDetail label="Certificate ID" value={record.uniqueId || ''} testId="text-verified-id" /></div></> : <><div className="flex size-16 items-center justify-center rounded-2xl bg-[hsl(var(--destructive)_/_0.16)] text-[hsl(2_80%_70%)]"><AlertCircle size={34} /></div><p className="mt-8 font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-[hsl(2_80%_70%)]">Registry lookup failed</p><h1 className="mt-3 font-serif text-5xl font-bold tracking-[-0.04em] md:text-7xl" data-testid="status-invalid">Invalid certificate</h1><p className="mt-5 max-w-xl text-base leading-7 text-[hsl(var(--primary-foreground)_/_0.66)]">We couldn’t find a published certificate with this ID. Check the link or ask the event team for a new verification URL.</p><div className="mt-10 rounded-2xl border border-[hsl(var(--primary-foreground)_/_0.12)] bg-[hsl(var(--primary-foreground)_/_0.05)] p-5"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--primary-foreground)_/_0.45)]">Searched ID</p><p className="mt-2 break-all font-mono text-sm text-[hsl(var(--primary-foreground)_/_0.82)]" data-testid="text-invalid-id">{id}</p></div></>}</div></div><p className="mt-8 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--primary-foreground)_/_0.35)]">Aatmoday CertiPortal · Code Vidya Hack Days 2026</p></div></div>;
}

function VerifyDetail({ label, value, testId }: { label: string; value: string; testId: string }) {
  return <div className="bg-[hsl(var(--primary))] p-5"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--primary-foreground)_/_0.4)]">{label}</p><p className="mt-2 text-sm font-semibold text-[hsl(var(--primary-foreground)_/_0.9)]" data-testid={testId}>{value}</p></div>;
}

export default App;
