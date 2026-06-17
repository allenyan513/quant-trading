"use client";

/**
 * Better Auth browser client — used by the sign-in/sign-up forms and the
 * sign-out button. Same-origin: talks to /api/auth/* on the web app itself.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const { signIn, signUp, signOut, useSession } = authClient;
