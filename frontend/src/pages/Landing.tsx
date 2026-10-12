import { motion } from 'framer-motion'
import {
  Activity,
  ArrowRight,
  Brain,
  ClipboardCheck,
  HeartPulse,
  Languages,
  LockKeyhole,
  Mic,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Wifi,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { EASE } from '../components/ui'

const FLOW_STEPS = [
  { label: 'Capture', icon: Mic },
  { label: 'Verify', icon: ClipboardCheck },
  { label: 'Prioritize', icon: Activity },
  { label: 'Refer', icon: Stethoscope },
]

const CAPABILITIES = [
  { title: 'Human-in-loop AI', copy: 'AI drafts structured notes while clinicians stay in control.', icon: Brain },
  { title: 'Multilingual intake', copy: 'Built for frontline teams working across Hindi, Odia and English.', icon: Languages },
  { title: 'Privacy first', copy: 'Consent, redaction, retention and audit trails stay visible.', icon: LockKeyhole },
]

function PulseOrb({ delay, className }: { delay: number; className: string }) {
  return (
    <motion.span
      className={className}
      animate={{ scale: [1, 1.18, 1], opacity: [0.42, 0.9, 0.42] }}
      transition={{ duration: 3.8, repeat: Infinity, delay, ease: 'easeInOut' }}
    />
  )
}

function LandingScene() {
  return (
    <div className="landing-scene" aria-hidden="true">
      <div className="landing-grid-floor" />
      <motion.div
        className="landing-core"
        animate={{ rotateY: [0, 12, -10, 0], rotateX: [4, -3, 5, 4] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="landing-core-ring landing-core-ring-a" />
        <div className="landing-core-ring landing-core-ring-b" />
        <div className="landing-core-ring landing-core-ring-c" />
        <div className="landing-core-heart">
          <HeartPulse size={64} strokeWidth={1.8} />
        </div>
      </motion.div>

      <motion.div
        className="landing-panel landing-panel-left"
        initial={{ opacity: 0, x: -36, y: 20 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.8, delay: 0.35, ease: EASE }}
      >
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-lime-300/20 text-lime-200">
          <Languages size={18} />
        </div>
        <span>Multilingual intake</span>
        <strong>Speak in any language</strong>
        <small>Hindi · Odia · English</small>
      </motion.div>

      <motion.div
        className="landing-panel landing-panel-right"
        initial={{ opacity: 0, x: 36, y: -16 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.8, delay: 0.55, ease: EASE }}
      >
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-sky-300/20 text-sky-200">
          <ShieldCheck size={18} />
        </div>
        <span>Clinician oversight</span>
        <strong>AI suggests, you decide</strong>
        <small>No diagnosis, ever</small>
      </motion.div>

      <motion.div
        className="landing-wave"
        animate={{ opacity: [0.35, 1, 0.35] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      <PulseOrb delay={0.2} className="landing-pulse landing-pulse-one" />
      <PulseOrb delay={1.1} className="landing-pulse landing-pulse-two" />
      <PulseOrb delay={1.8} className="landing-pulse landing-pulse-three" />
    </div>
  )
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#071015] text-white">
      <section className="relative min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_76%_18%,rgba(72,179,156,0.32),transparent_68%),radial-gradient(700px_460px_at_6%_80%,rgba(163,230,53,0.16),transparent_62%),linear-gradient(135deg,#071015_0%,#10202a_48%,#061311_100%)]" />
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:54px_54px]" />

        <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lime-300 text-ink-900 shadow-lg shadow-lime-300/20">
              <HeartPulse size={23} strokeWidth={2.4} />
            </span>
            <span className="text-[20px] font-black tracking-tight sm:text-[22px]">आरोग्य Sathi</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-full border border-white/12 px-4 py-2 text-[12px] font-bold text-white/78 transition-colors hover:border-white/28 hover:text-white"
            >
              Sign in
            </Link>
            <Link
              to="/login"
              className="hidden items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12px] font-extrabold text-ink-900 shadow-xl shadow-black/20 transition-transform hover:-translate-y-0.5 sm:inline-flex"
            >
              Open app <ArrowRight size={14} />
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-82px)] max-w-7xl items-center gap-10 px-5 pb-10 sm:px-8 lg:grid-cols-[0.96fr_1.04fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="max-w-3xl py-8"
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-lime-200 backdrop-blur">
              <Sparkles size={13} /> Non-diagnostic clinical workflow AI
            </div>
            <h1 className="max-w-[12ch] text-[52px] font-black leading-[0.95] tracking-normal text-white sm:text-[76px] lg:text-[88px]">
              Every case, seen sooner.
            </h1>
            <p className="mt-6 max-w-[58ch] text-[15px] leading-7 text-white/68 sm:text-[17px]">
              आरोग्य Sathi helps frontline health teams capture symptoms, structure reports, prioritize queues,
              refer cases and follow up with patients while keeping every clinical decision human-led.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-full bg-lime-300 px-5 py-3 text-[13px] font-extrabold text-ink-900 shadow-2xl shadow-lime-300/20 transition-transform hover:-translate-y-0.5"
              >
                Start triage <ArrowRight size={16} />
              </Link>
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/8 px-5 py-3 text-[13px] font-bold text-white/82 backdrop-blur transition-colors hover:border-white/30 hover:text-white"
              >
                See workflow
              </a>
            </div>

            <div className="mt-9 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
              {FLOW_STEPS.map((step, index) => (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.46, delay: 0.18 + index * 0.07, ease: EASE }}
                  className="rounded-2xl border border-white/10 bg-white/8 p-3 backdrop-blur"
                >
                  <step.icon size={18} className="mb-3 text-lime-200" />
                  <p className="text-[12px] font-extrabold text-white">{step.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
            className="relative min-h-[500px] lg:min-h-[660px]"
          >
            <LandingScene />
          </motion.div>
        </div>
      </section>

      <section id="workflow" className="relative border-t border-white/10 bg-[#f5f7fa] px-5 py-16 text-ink-900 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="sf-eyebrow">Built for real clinical handoffs</p>
            <h2 className="mt-3 max-w-[12ch] text-[34px] font-black leading-tight tracking-normal sm:text-[48px]">
              Fast where it should be. Careful where it matters.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <div key={item.title} className="rounded-2xl border border-ink-200 bg-white p-5 shadow-card">
                <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-900 text-white">
                  <item.icon size={20} />
                </span>
                <h3 className="text-[15px] font-extrabold text-ink-900">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-ink-500">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-8 grid max-w-7xl gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-ink-900 p-5 text-white">
            <ShieldCheck size={20} className="mb-4 text-lime-300" />
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/44">Safety stance</p>
            <p className="mt-2 text-[20px] font-black leading-tight">AI assistance only, never diagnosis.</p>
          </div>
          <div className="rounded-2xl bg-brand-600 p-5 text-white">
            <Wifi size={20} className="mb-4 text-lime-200" />
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/56">Field ready</p>
            <p className="mt-2 text-[20px] font-black leading-tight">Offline-aware queues for camp workflows.</p>
          </div>
          <div className="rounded-2xl bg-lime-300 p-5 text-ink-900">
            <Activity size={20} className="mb-4" />
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-600">Priority engine</p>
            <p className="mt-2 text-[20px] font-black leading-tight">Transparent rationale before review.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
