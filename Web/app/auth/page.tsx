"use client";

import { Mail, Loader2, ArrowRight, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase";

type AuthStep = "idle" | "email-entry" | "otp-sent" | "loading";

export default function AuthPage() {
  const supabase = createClient();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [step, setStep] = useState<AuthStep>("idle");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (profile && !profile.onboarding_complete) {
      router.replace("/onboarding");
      return;
    }
    router.replace("/discover");
  }, [loading, profile, router, user]);

  async function signInWithGoogle() {
    setError("");
    setSubmitting(true);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
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
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
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
    <main className='auth-page-shell'>
      <div className='morph-bg' />
      <div className='grain' />

      <div className='auth-card reveal'>
        {/* Logo / Wordmark */}
        <div className='auth-logo'>
          <span className='auth-logo-dot' />
          <span className='auth-logo-text'>streamn</span>
        </div>

        <h1 className='auth-headline'>
          {step === "otp-sent"
            ? "Check your email"
            : "Your next binge starts here."}
        </h1>
        <p className='auth-subtext'>
          {step === "otp-sent"
            ? `We sent a 6-digit code to ${email}. Enter it below.`
            : "Sign in to access your Library, likes, and watchlists."}
        </p>

        {error ? (
          <div className='auth-error' role='alert'>
            {error}
          </div>
        ) : null}

        {/* ── OTP Verify ───────────────────────────── */}
        {step === "otp-sent" ? (
          <form onSubmit={verifyOtp} className='auth-form'>
            <input
              autoFocus
              className='auth-input tracking-[0.35em] text-center font-mono text-xl'
              inputMode='numeric'
              maxLength={6}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder='000000'
              value={otp}
            />
            <button
              className='auth-cta-button'
              disabled={otp.length < 6 || submitting}
              type='submit'
            >
              Verify Code
              <ArrowRight className='size-5' />
            </button>
            <button
              className='auth-link-button'
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
          <form onSubmit={sendOtp} className='auth-form'>
            <div className='auth-input-wrap'>
              <Mail className='auth-input-icon' />
              <input
                autoComplete='email'
                autoFocus
                className='auth-input auth-input-icon-pad'
                onChange={(e) => setEmail(e.target.value)}
                placeholder='you@example.com'
                type='email'
                value={email}
              />
            </div>
            <button
              className='auth-cta-button'
              disabled={!email.trim() || submitting}
              type='submit'
            >
              {submitting ? (
                <Loader2 className='size-5 animate-spin' />
              ) : (
                <>
                  Continue with Email
                  <ArrowRight className='size-5' />
                </>
              )}
            </button>
            <button
              className='auth-link-button'
              onClick={() => setStep("idle")}
              type='button'
            >
              ← Back
            </button>
          </form>
        ) : (
          /* ── Initial ─────────────────────────────── */
          <div className='auth-form'>
            <button
              className='auth-provider-button'
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

            <div className='auth-divider'>
              <span>or</span>
            </div>

            <button
              className='auth-email-button'
              onClick={() => setStep("email-entry")}
              type='button'
              id='auth-email-btn'
            >
              <Mail className='size-5' />
              Continue with Email
            </button>

            <p className='auth-terms'>
              By continuing you agree to Streamn&apos;s{" "}
              <span className='text-white/60'>Terms of Service</span> and{" "}
              <span className='text-white/60'>Privacy Policy</span>.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
