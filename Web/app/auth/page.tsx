"use client";

import { AuthView } from "@/components/auth/auth-view";

export default function AuthPage() {
  return (
    <main className='auth-page-shell'>
      <AuthView isModal={false} />
    </main>
  );
}
