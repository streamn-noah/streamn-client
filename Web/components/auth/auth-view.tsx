"use client";

import { Mail, Loader2, ArrowRight, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase";

type AuthStep = "idle" | "email-entry" | "otp-sent" | "loading";

export function AuthView({ returnTo = "/discover", isModal = false }: { returnTo?: string; isModal?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const { user, profile, loading, setAuthModalOpen } = useAuth();
  const [step, setStep] = useState<AuthStep>("idle");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (profile && !profile.onboarding_complete) {
      if (isModal) {
        setAuthModalOpen?.(false);
      }
      router.push("/onboarding");
      return;
    }
    
    if (isModal) {
      setAuthModalOpen?.(false);
    } else {
      router.replace(returnTo);
    }
  }, [loading, profile, router, user, isModal, returnTo, setAuthModalOpen]);

  async function signInWithGoogle() {
    setError("");
    setSubmitting(true);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`,
      },
    });
    if (authError) {
      setError(authError.message);
      setSubmitting(false);
    }
  }

  async function sendOtp(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setError("");
    setSubmitting(true);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`,
        shouldCreateUser: true,
      },
    });

    if (authError) {
      setError(authError.message);
      setStep("email-entry");
    } else {
      setStep("otp-sent");
    }
    setSubmitting(false);
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    if (!otp.trim()) return;
    setError("");
    setSubmitting(true);

    const { error: authError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "email",
    });

    if (authError) {
      setError(authError.message);
      setStep("otp-sent");
    }
    setSubmitting(false);
  }

  return (
    <div className='auth-card w-full h-full min-h-[500px] flex flex-col justify-center relative p-8 md:p-12'>
      {!isModal && (
        <>
          <div className='morph-bg' />
          <div className='grain' />
        </>
      )}

      {/* Logo / Wordmark */}
      <div className='auth-logo mb-8'>
        <span className='auth-logo-dot' />
        <span className='auth-logo-text'>streamn</span>
      </div>

      <h1 className='auth-headline'>
        {step === "otp-sent"
          ? "Check your email"
          : "Your next binge starts here."}
      </h1>
      <p className='auth-subtext mb-8'>
        {step === "otp-sent"
          ? `We sent a 6-digit code to ${email}. Enter it below.`
          : "Sign in to access your Library, likes, and watchlists."}
      </p>

      {error ? (
        <div className='auth-error mb-6' role='alert'>
          {error}
        </div>
      ) : null}

      {/* ── OTP Verify ───────────────────────────── */}
      {step === "otp-sent" ? (
        <form onSubmit={verifyOtp} className='auth-form w-full flex flex-col gap-4'>
          <input
            autoFocus
            className='auth-input tracking-[0.35em] text-center font-mono text-xl w-full'
            inputMode='numeric'
            maxLength={6}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder='000000'
            value={otp}
          />
          <button
            className='auth-cta-button w-full'
            disabled={otp.length < 6 || submitting}
            type='submit'
          >
            Verify Code
            <ArrowRight className='size-5 ml-2 inline' />
          </button>
          <button
            className='auth-link-button mt-2 text-center text-white/60 hover:text-white transition'
            onClick={() => {
              setStep("email-entry");
              setOtp("");
            }}
            type='button'
          >
            Use a different email
          </button>
        </form>
      ) : step === "email-entry" ? (
        /* ── Email Entry ─────────────────────────── */
        <form onSubmit={sendOtp} className='auth-form w-full flex flex-col gap-4'>
          <div className='auth-input-wrap relative w-full'>
            <Mail className='auth-input-icon absolute left-4 top-1/2 -translate-y-1/2 text-white/40' />
            <input
              autoComplete='email'
              autoFocus
              className='auth-input auth-input-icon-pad w-full pl-12'
              onChange={(e) => setEmail(e.target.value)}
              placeholder='you@example.com'
              type='email'
              value={email}
            />
          </div>
          <button
            className='auth-cta-button w-full'
            disabled={!email.trim() || submitting}
            type='submit'
          >
            {submitting ? (
              <Loader2 className='size-5 animate-spin mx-auto' />
            ) : (
              <>
                Continue with Email
                <ArrowRight className='size-5 ml-2 inline' />
              </>
            )}
          </button>
          <button
            className='auth-link-button mt-2 text-center text-white/60 hover:text-white transition'
            onClick={() => setStep("idle")}
            type='button'
          >
            ← Back
          </button>
        </form>
      ) : (
        /* ── Initial ─────────────────────────────── */
        <div className='auth-form w-full flex flex-col gap-4'>
          <button
            className='auth-provider-button w-full flex items-center justify-center gap-3'
            disabled={submitting}
            onClick={signInWithGoogle}
            type='button'
            id='auth-google-btn'
          >
            {submitting ? (
              <Loader2 className='size-5 animate-spin' />
            ) : (
              <Globe className='size-5' />
            )}
            Continue with Google
          </button>

          <div className='auth-divider flex items-center justify-center gap-4 my-2 text-white/40 text-sm font-semibold'>
            <div className="h-px bg-white/10 flex-1" />
            <span>or</span>
            <div className="h-px bg-white/10 flex-1" />
          </div>

          <button
            className='auth-email-button w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 transition rounded-full py-3.5 border border-white/10 font-bold'
            onClick={() => setStep("email-entry")}
            type='button'
            id='auth-email-btn'
          >
            <Mail className='size-5' />
            Continue with Email
          </button>

          <p className='auth-terms text-center text-xs text-white/40 mt-6 max-w-xs mx-auto leading-relaxed'>
            By continuing you agree to Streamn&apos;s{" "}
            <span className='text-white/60 cursor-pointer hover:underline'>Terms of Service</span> and{" "}
            <span className='text-white/60 cursor-pointer hover:underline'>Privacy Policy</span>.
          </p>
        </div>
      )}
    </div>
  );
}
