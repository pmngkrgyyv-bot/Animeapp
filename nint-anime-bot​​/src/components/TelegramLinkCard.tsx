import { useState, useEffect, useRef } from 'react';
import { Send, Copy, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/supabaseClient';

// ដាក់ link username ពិតរបស់ bot អ្នកនៅទីនេះ (ឧ. https://t.me/NintAnimeBot)
const BOT_LINK = 'https://t.me/YOUR_BOT_USERNAME';
const CODE_TTL_SECONDS = 5 * 60; // ត្រូវតែដូចគ្នានឹង generate_telegram_link_code() ក្នុង schema.sql

/**
 * ដាក់ component នេះក្នុង ProfileScreen.tsx នៅចន្លោះ "Telegram support"
 * និង "About us" (មើលឧទាហរណ៍ក្នុង HOW_TO_INTEGRATE.md)
 */
export default function TelegramLinkCard() {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setCopied(false);
    const { data, error } = await supabase.rpc('generate_telegram_link_code');
    setLoading(false);

    if (error || !data) {
      alert('មានបញ្ហា សូមសាកល្បងម្តងទៀត។');
      return;
    }

    setCode(data as string);
    setSecondsLeft(CODE_TTL_SECONDS);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setCode(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#29A9EA]/15">
          <Send className="h-5 w-5 text-[#29A9EA]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">ភ្ជាប់ Telegram Bot</p>
          <p className="text-xs text-white/50">មើលរឿងតាម Telegram ដោយប្រើគណនីដដែល</p>
        </div>
      </div>

      {!code ? (
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-3 w-full rounded-xl bg-[#E8A94A] py-2.5 text-xs font-bold text-black transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          បង្កើតលេខកូដភ្ជាប់
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-[#E8A94A]/30 bg-[#E8A94A]/10 px-4 py-3">
            <span className="text-2xl font-bold tracking-widest text-[#E8A94A]">{code}</span>
            <button onClick={handleCopy} className="text-white/60 hover:text-white">
              {copied ? <Check className="h-5 w-5 text-[#22C55E]" /> : <Copy className="h-5 w-5" />}
            </button>
          </div>
          <p className="text-center text-xs text-white/50">
            ផុតកំណត់ក្នុង {minutes}:{seconds.toString().padStart(2, '0')}
          </p>
          <a
            href={BOT_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-xl bg-[#29A9EA] py-2.5 text-center text-xs font-bold text-white transition hover:opacity-90"
          >
            បើក Bot ហើយវាយ /link {code}
          </a>
        </div>
      )}
    </div>
  );
}
