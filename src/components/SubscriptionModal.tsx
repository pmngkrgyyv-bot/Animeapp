import { useEffect, useRef, useState } from 'react';
import {
  X,
  Crown,
  CheckCircle2,
  Loader2,
  Sparkles,
  Download,
  ShieldCheck,
  Clock,
  ArrowLeft,
  DollarSign,
  QrCode,
  ImageIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { useLang } from '@/lib/useLang';
import { appText } from '@/lib/appTranslations';

const LOGO_URL = '/assets/images/logo-transparent.png';

type PlanKey = '1m' | '2m' | '6m' | '1y';

const PLANS: {
  key: PlanKey;
  months: number;
  price: number;
  labelKey: 'sub1Month' | 'sub2Months' | 'sub6Months' | 'sub12Months';
  labelKm: string;
  tagKey?: 'subPopular' | 'subBestValue';
  tagKm?: string;
}[] = [
  { key: '1m', months: 1, price: 2, labelKey: 'sub1Month', labelKm: '១ ខែ' },
  { key: '2m', months: 2, price: 4, labelKey: 'sub2Months', labelKm: '២ ខែ' },
  { key: '6m', months: 6, price: 7, labelKey: 'sub6Months', labelKm: '៦ ខែ', tagKey: 'subPopular', tagKm: 'ពេញនិយម' },
  { key: '1y', months: 12, price: 28, labelKey: 'sub12Months', labelKm: '១២ ខែ', tagKey: 'subBestValue', tagKm: 'ល្អបំផុត' },
];

const PLAN_QR: Record<PlanKey, string> = {
  '1m': '/assets/images/subscription-1m.png',
  '2m': '/assets/images/subscription-2m.png',
  '6m': '/assets/images/subscription-6m.png',
  '1y': '/assets/images/subscription-1y.png',
};

const KHQR_MERCHANT_NAME = 'PANG SOK HENG S2_Nint.Ani';

const COUNTDOWN_SECONDS = 120;
const POLL_INTERVAL_MS = 3000;

interface Props {
  onClose: () => void;
}

type Step = 'summary' | 'qr' | 'success' | 'timeout';

export default function SubscriptionModal({ onClose }: Props) {
  const { lang } = useLang();
  const t = appText[lang];
  const km = lang === 'km';

  const [selected, setSelected] = useState<PlanKey>('6m');
  const [step, setStep] = useState<Step>('summary');
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [paying, setPaying] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedPlan = PLANS.find((p) => p.key === selected)!;

  const stopTimers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  useEffect(() => () => stopTimers(), []);

  useEffect(() => {
    setQrLoaded(false);
    setQrFailed(false);
  }, [selected]);

  const saveQr = async () => {
    try {
      const res = await fetch(PLAN_QR[selected]);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nint-anime-qr-${selected}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement('a');
      a.href = PLAN_QR[selected];
      a.download = `nint-anime-qr-${selected}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const startListening = (requestId: string) => {
    setSecondsLeft(COUNTDOWN_SECONDS);
    setStep('qr');
    let remaining = COUNTDOWN_SECONDS;
    stopTimers();
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) { stopTimers(); setStep('timeout'); }
    }, 1000);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('subscription_requests')
        .select('status')
        .eq('id', requestId)
        .maybeSingle();
      if (data?.status === 'confirmed') { stopTimers(); setStep('success'); }
    }, POLL_INTERVAL_MS);
  };

  const doCreateRequest = async (isRetry: boolean) => {
    setError('');
    setPaying(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setError(t.subNotSignedIn); return; }
      const { data, error: insertError } = await supabase
        .from('subscription_requests')
        .insert({
          user_id: userData.user.id,
          plan: selectedPlan.key,
          amount: selectedPlan.price,
          discount: 0,
          description: isRetry ? 'Awaiting Telegram auto-confirm (retry)' : 'Awaiting Telegram auto-confirm',
        })
        .select('id')
        .single();
      if (insertError || !data) { setError(insertError?.message || t.subQrGenericError); return; }
      startListening(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.subQrGenericError);
    } finally {
      setPaying(false);
    }
  };

  const urgent = secondsLeft <= 10;
  const progress = secondsLeft / COUNTDOWN_SECONDS;
  const circumference = 2 * Math.PI * 14;

  const planLabel = (p: typeof PLANS[number]) =>
    km ? p.labelKm : t[p.labelKey];

  const tagLabel = (p: typeof PLANS[number]) =>
    p.tagKey ? (km ? p.tagKm! : t[p.tagKey]) : '';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center overflow-hidden sm:items-center sm:p-4"
      style={{ backgroundColor: 'rgba(4,4,10,0.92)', backdropFilter: 'blur(12px)' }}
      onClick={step !== 'qr' ? onClose : undefined}
    >
      {/* Atmospheric silhouette backdrop — large dim watermark + amber glow, no click target */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={LOGO_URL}
          alt=""
          aria-hidden="true"
          className="absolute left-1/2 top-[38%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 select-none object-contain opacity-[0.05] blur-[2px]"
        />
        <div
          className="absolute left-1/2 top-1/2 h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle,rgba(232,169,74,0.10) 0%,rgba(232,169,74,0) 65%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 100%,rgba(0,0,0,0.5) 0%,rgba(0,0,0,0) 55%)' }}
        />
      </div>

      <div
        className="relative w-full overflow-hidden text-white"
        style={{
          maxWidth: 372,
          background: 'linear-gradient(175deg,#1c1a2b 0%,#0c0b14 100%)',
          border: '1px solid rgba(232,169,74,0.14)',
          borderRadius: 28,
          boxShadow: '0 -8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03), 0 30px 80px -20px rgba(232,169,74,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ═══════════════ PLAN SELECTION ═══════════════ */}
        {(step === 'summary' || step === 'timeout') && (
          <div className="flex max-h-[92vh] flex-col overflow-hidden">
            {/* Header */}
            <div className="relative px-4 pb-2 pt-5 text-center">
              <button
                onClick={onClose}
                className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
              >
                <X size={15} />
              </button>

              {/* Logo — large, centered, no background plate */}
              <div className="mx-auto mb-2 h-24 w-24 drop-shadow-[0_4px_20px_rgba(232,169,74,0.25)]">
                <img
                  src={LOGO_URL}
                  alt="NINT ANIME"
                  className="h-full w-full object-contain"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>

              <h2 className="flex items-center justify-center gap-1.5 text-[18px] font-extrabold tracking-tight text-white">
                <Crown size={17} fill="#E8A94A" strokeWidth={0} />
                {km ? 'ក្លាយជាសមាជិក VIP' : t.subGoPremium}
              </h2>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-[10.5px] font-medium text-white/40">
                <Sparkles size={9} className="text-[#E8A94A]" />
                {km ? 'មើលគ្មានដែនកំណត់ · គ្មានពាណិជ្ជកម្ម · ដោះសោភ្លាមៗ' : t.subTagline}
              </p>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto px-3.5 pb-4 pt-2" style={{ scrollbarWidth: 'none' }}>

              {/* Timeout notice */}
              {step === 'timeout' && (
                <div
                  className="mb-3 flex items-start gap-2 rounded-xl px-3 py-2.5"
                  style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)' }}
                >
                  <Clock size={12} className="mt-0.5 shrink-0 text-[#EF4444]" />
                  <p className="text-[10px] leading-relaxed text-[#EF4444]/80">{t.subTimeoutDesc}</p>
                </div>
              )}

              {/* Plan grid 2×2 */}
              <div className="grid grid-cols-2 gap-2">
                {PLANS.map((p) => {
                  const isSel = selected === p.key;
                  return (
                    <button
                      key={p.key}
                      onClick={() => setSelected(p.key)}
                      className="relative rounded-2xl pb-3 pt-5 text-left transition-all duration-150 active:scale-[0.97]"
                      style={{
                        border: isSel ? '1.5px solid #E8A94A' : '1.5px solid rgba(255,255,255,0.06)',
                        background: isSel
                          ? 'linear-gradient(150deg,rgba(40,30,8,1) 0%,rgba(24,18,4,1) 100%)'
                          : 'rgba(255,255,255,0.025)',
                        boxShadow: isSel ? '0 0 0 3px rgba(232,169,74,0.12)' : 'none',
                        padding: '20px 12px 12px',
                      }}
                    >
                      {/* Badge — centered top edge */}
                      {p.tagKey && (
                        <span
                          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 top-0 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-black"
                          style={{ background: 'linear-gradient(90deg,#E8A94A,#D4821E)' }}
                        >
                          <Sparkles size={6} />
                          {tagLabel(p)}
                        </span>
                      )}

                      <p className="text-[10px] font-medium text-white/40">{planLabel(p)}</p>
                      <p
                        className="mt-0.5 text-[30px] font-black leading-none tracking-tight"
                        style={{ color: isSel ? '#E8A94A' : '#3FAE8A' }}
                      >
                        ${p.price}
                      </p>
                      <p className="mt-1 text-[9px] text-white/30">
                        ${(p.price / p.months).toFixed(2)}/{km ? 'ខែ' : 'mo'}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Total row */}
              <div
                className="mt-2.5 flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
                style={{
                  border: '1px solid rgba(63,174,138,0.15)',
                  background: 'rgba(63,174,138,0.06)',
                }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: 'linear-gradient(135deg,#0F8F72,#0B6E58)' }}
                >
                  <DollarSign size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-white/70">
                    {km ? 'សរុបប្រើប្រាស់' : 'Total due'}
                  </p>
                  <p className="text-[9.5px] text-white/35">{planLabel(selectedPlan)}</p>
                </div>
                <p className="text-[26px] font-black text-white leading-none">
                  ${selectedPlan.price}
                </p>
              </div>

              {/* Info box */}
              <div
                className="mt-2 rounded-2xl px-3 py-3"
                style={{
                  border: '1px solid rgba(255,255,255,0.05)',
                  background: 'rgba(255,255,255,0.025)',
                }}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
                  <QrCode size={12} className="text-[#3FAE8A]" />
                  {km ? 'ស្វែងតាមមជ្ឈមណ្ឌលធនាគារតាមបស់ម្ចូរជើឡូច្ចាត់' : 'Scan to pay via KHQR banking app'}
                </p>
                <p className="mt-1 text-[9.5px] leading-relaxed text-white/35">
                  {km
                    ? 'ស្វែង QR តាមមជ្ឈមណ្ឌល យកចំណូលជូន ចូលប្រើ ABA Mobile ឬ App ធនាគារណាដែលគាំទ្រ KHQR — ប្រព័ន្ធនឹងបើសសិទ្ធិ VIP ដោយស្វ័យប្រវត្តិ'
                    : 'Scan QR with ABA Mobile or any KHQR-supported banking app — VIP access unlocks automatically'}
                </p>
              </div>

              {error && (
                <p className="mt-2 rounded-xl bg-[#EF4444]/10 px-3 py-2 text-[10.5px] text-[#EF4444]">{error}</p>
              )}

              {/* Pay button */}
              <button
                onClick={() => doCreateRequest(step === 'timeout')}
                disabled={paying}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-bold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#0FAE88 0%,#0A7D62 100%)' }}
              >
                {paying ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <DollarSign size={16} />
                )}
                {km ? (step === 'timeout' ? 'ចាប់ផ្ដើមម្ដងទៀត' : 'ទូទាត់') : (step === 'timeout' ? 'Try Again' : 'Pay Now')}
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-1.5 border-t border-white/[0.04] py-2.5">
              <ShieldCheck size={9} className="text-white/25" />
              <p className="text-[8.5px] text-white/25">
                {km ? 'ការទូទាត់មានសុវត្ថិភាព · ដំណើរការដោយ ABA PayWay KHQR' : t.subSecFooter ?? 'Secured checkout · Powered by ABA PayWay KHQR'}
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════ QR PAYMENT STEP ═══════════════ */}
        {step === 'qr' && (
          <div className="flex flex-col overflow-hidden">
            {/* Top bar */}
            <div className="flex items-center justify-between px-3.5 pb-2 pt-4">
              <button
                onClick={() => { stopTimers(); setStep('summary'); }}
                className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-medium text-white/60 transition hover:bg-white/08 hover:text-white"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}
              >
                <ArrowLeft size={13} />
                {km ? 'ថយក្រោយ' : 'Back'}
              </button>

              {/* Circular countdown */}
              <div className="flex flex-col items-center">
                <div className="relative flex h-12 w-12 items-center justify-center">
                  <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
                    <circle
                      cx="18" cy="18" r="14"
                      fill="none"
                      stroke={urgent ? '#EF4444' : '#E8A94A'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${circumference}`}
                      strokeDashoffset={`${circumference * (1 - progress)}`}
                      style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
                    />
                  </svg>
                  <span
                    className="relative text-[13px] font-black tabular-nums"
                    style={{ color: urgent ? '#EF4444' : '#E8A94A' }}
                  >
                    {secondsLeft}
                  </span>
                </div>
                <p className="text-[8px] text-white/30">{km ? 'វិនាទី' : 'sec'}</p>
              </div>

              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Scan instruction */}
            <div className="flex flex-col items-center gap-1 px-4 pb-3 text-center">
              <p className="flex items-center gap-1.5 text-[14px] font-bold text-white">
                <ImageIcon size={14} className="text-[#E8A94A]" />
                {km ? 'ស្កេន និងរក្សាទុក QR' : 'Scan & Save QR'}
              </p>
              <p className="max-w-[280px] text-[10.5px] leading-relaxed text-white/40">
                {km
                  ? 'ស្កេនតាមកម្មវិធីធនាគារ KHQR ណាមួយ ឬថតរក្សាទុក ហើយបើកពីវិចិត្រសាល (gallery) របស់អ្នក'
                  : 'Scan with any KHQR banking app, or save the QR and upload it from your gallery'}
              </p>
            </div>

            {/* KHQR card — compact styled payment card with the real QR embedded */}
            <div className="px-6 pb-2">
              <div
                className="mx-auto overflow-hidden"
                style={{
                  maxWidth: 240,
                  borderRadius: 20,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.35), 0 0 0 1px rgba(232,169,74,0.15)',
                  background: '#fff',
                }}
              >
                {/* Red KHQR header */}
                <div
                  className="flex items-center justify-center gap-1.5 py-2"
                  style={{ background: 'linear-gradient(135deg,#E8232A,#C4141C)' }}
                >
                  <span className="text-[14px] font-black tracking-[0.2em] text-white">KHQR</span>
                </div>

                {/* Merchant + price — no background plate, just clean type on white */}
                <div className="px-4 pt-3">
                  <p className="truncate text-[10.5px] font-bold text-gray-700">{KHQR_MERCHANT_NAME}</p>
                  <p className="mt-1 text-[22px] font-black leading-none text-gray-900">
                    $ {selectedPlan.price}.00
                  </p>
                </div>

                <div className="mx-4 my-2.5" style={{ borderTop: '1.5px dashed #e2e5e9' }} />

                {/* Actual QR image — compact square, centered */}
                <div className="px-4 pb-4">
                  <div
                    className="relative mx-auto flex items-center justify-center overflow-hidden rounded-xl bg-gray-50"
                    style={{ width: '100%', aspectRatio: '1 / 1', maxWidth: 168, border: '1px solid #f0f1f3' }}
                  >
                    {!qrLoaded && !qrFailed && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#D0191C]" />
                      </div>
                    )}
                    {qrFailed ? (
                      <div className="text-center">
                        <QrCode size={36} className="mx-auto mb-1.5 text-gray-300" />
                        <p className="text-[9px] text-gray-400">
                          {km ? 'មិនអាចផ្ទុក QR បានទេ' : 'QR not available'}
                        </p>
                      </div>
                    ) : (
                      <img
                        src={PLAN_QR[selected]}
                        alt={`KHQR $${selectedPlan.price}`}
                        className="h-full w-full object-contain p-1.5"
                        style={{ display: qrLoaded ? 'block' : 'none' }}
                        onLoad={() => setQrLoaded(true)}
                        onError={() => { setQrFailed(true); setQrLoaded(true); }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Save button */}
            <div className="px-4 pb-2 pt-0.5">
              <button
                onClick={saveQr}
                className="mx-auto flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-[11.5px] font-semibold transition hover:brightness-110 active:scale-[0.98]"
                style={{
                  border: '1.5px solid rgba(232,169,74,0.25)',
                  background: 'rgba(232,169,74,0.08)',
                  color: '#E8A94A',
                }}
              >
                <Download size={13} />
                {km ? 'រក្សាទុក QR' : 'Save QR'}
              </button>
            </div>

            {/* Waiting indicator */}
            <div
              className="mx-4 mb-2 flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{
                border: '1px solid rgba(15,143,114,0.2)',
                background: 'rgba(15,143,114,0.07)',
              }}
            >
              <Loader2 size={13} className="animate-spin shrink-0 text-[#0F8F72]" />
              <div>
                <p className="text-[11px] font-semibold text-white/70">
                  {km ? 'កំពុងរង់ចាំការទូទាត់…' : 'Waiting for payment…'}
                </p>
                <p className="text-[9px] text-white/35">
                  {km ? 'ដោះសោ VIP ស្វ័យប្រវត្តិពេល ABA បញ្ជាក់' : 'Auto-unlocks when ABA confirms'}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-1.5 border-t border-white/[0.04] py-2.5">
              <ShieldCheck size={9} className="text-white/25" />
              <p className="text-[8.5px] text-white/25">
                {km ? 'ការទូទាត់មានសុវត្ថិភាព · ដំណើរការដោយ ABA PayWay KHQR' : t.subSecFooter ?? 'Secured · Powered by ABA PayWay KHQR'}
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════ SUCCESS ═══════════════ */}
        {step === 'success' && (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <div
              className="mb-5 flex h-20 w-20 items-center justify-center rounded-full"
              style={{ background: 'radial-gradient(circle,rgba(34,197,94,0.2),rgba(34,197,94,0.04))' }}
            >
              <CheckCircle2 size={42} className="text-[#22C55E]" />
            </div>
            <p className="flex items-center gap-1.5 text-[16px] font-bold text-white">
              <Crown size={15} fill="#E8A94A" strokeWidth={0} />
              {km ? 'អ្នកគឺជាសមាជិក VIP ហើយ!' : t.subYourePremium}
            </p>
            <p className="mx-auto mt-2 max-w-[240px] text-[10.5px] leading-relaxed text-white/50">
              {km ? 'ការទូទាត់ត្រូវបានផ្ទៀងផ្ទាត់ ការទស្សនា VIP ត្រូវបានដោះសោ' : t.subConfirmedDesc}
            </p>
            <button
              onClick={onClose}
              className="mt-6 rounded-2xl px-8 py-3 text-[13px] font-bold text-white transition hover:brightness-110 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#0FAE88 0%,#0A7D62 100%)' }}
            >
              {km ? 'ចាប់ផ្ដើមមើល' : t.subStartWatching}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
